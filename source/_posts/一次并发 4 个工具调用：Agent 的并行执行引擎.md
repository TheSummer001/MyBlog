---
title: 一次并发 4 个工具调用：Agent 的并行执行引擎
date: 2026-03-11 22:10:00
updated: 2026-03-11 22:10:00
categories:
  - AI 工程
tags:
  - AI 工程落地
  - Agent
  - Java
keywords: Agent,工具调用,并行执行,ExecutorService,超时取消,LLM,Java
description: Agent CLI 里工具调用原本是串行的，一轮三个只读工具要等六秒。这篇写并行执行器的做法：怎么判断哪些调用能一起跑、批大小怎么定、超时后怎么取消，以及结果怎么回填给模型。
---

## 引言

最早的版本是串行的。模型返回几个 `tool_call`，for 循环挨个执行，结果按顺序拼进 observation。功能能跑，就一直没动。

后来翻一轮长任务的日志，三次只读调用之间各隔了一秒多，而模型生成那一步只花了不到一秒。慢的地方不在模型。

这个执行器是那时候改出来的，前后改了两轮才稳定。

<!-- more -->

## 三个工具跑六秒

三个互不相关的只读工具，每个 1.5 到 2 秒。串行下来就是 4.5 到 6 秒，模型本身生成一次大约 1 秒。用户说的"Agent 太慢"，大半花在排队上。

还有一种情况更难受。第三个工具超时，前两个已经拿到的结果也只能一起等它把超时走完。

串行的副作用也不只延迟。每个结果都立刻进上下文，长任务里 observation 越滚越大，下一轮请求的 token 跟着涨。

## 哪些调用能一起跑

往线程池里丢一批调用很容易，难的是别把有副作用的混进去。两个写操作并发，结果就不可复现，排查成本比省下的几百毫秒高得多。

Anthropic 的并行工具文档把判断标准写得很直接：独立、只读的操作适合并发，带副作用、共享状态或顺序要求的工具，串行更稳妥。上面那张表就是照这个标准分的。

做法上，我让工具自己声明，默认不可并行。

| 工具类型 | 典型例子 | 能否并行 | 判断依据 |
|---|---|---|---|
| 纯只读 | 读文件、检索、查天气 | 可以 | 无副作用，顺序不影响结果 |
| 只读同一资源 | 连续读同一目录下不同文件 | 可以 | 只读且幂等 |
| 写不同资源 | 写两个不相关的文件 | 有条件 | 写入目标不能重叠 |
| 读写同一资源 | 先读配置再改配置 | 不能 | 存在数据依赖 |
| 不可逆操作 | 执行命令、删除文件 | 不能 | 要人工确认或串行审计 |
| 外部限流接口 | 有 QPS 限制的第三方 API | 谨慎 | 并发容易触发限流 |

最早试过按名字判断，带 read 或 get 就当只读。结果一个叫 `getAndUpdate` 的工具被算了进去，两次调用并发之后互相覆盖了状态。改成显式声明以后，这种问题没再出现过。

## 批大小定在 4

调度层做的事不多：切批、限制批内并发、给整批一个截止时间。

批大小和并发上限都取 4。模型一轮通常返回 2 到 5 个调用，4 路并行已经能吃掉大部分收益。再往上加，线程开始跟模型调用抢资源，外部接口也更早撞上限流。

4 这个数没有权威出处，是照着实际调用分布和线程池情况调出来的。Anthropic 那篇讲 agent 模式的文章里，并行化的示例也就是把任务丢进线程池，没有规定并发数。

批与批之间保持串行。第一批结果回来，再提交第二批。这样上下文增长可控，某一批出问题也不会把后面几批一起带下去。

截止时间是整批共享的。每个工具各自超时 30 秒的话，四个工具最坏要等 120 秒；共享一个 deadline，这一批的上限就是固定的。

流程大致是这样：

```text
for each batch of <= 4 calls:
    deadline = now + BATCH_TIMEOUT
    submit every call -> futures
    for future in futures (提交顺序):
        remaining = deadline - now
        if remaining <= 0:
            future.cancel(true)
            result = TIMEOUT
        else:
            result = future.get(remaining)
```

回收按提交顺序走，不按完成顺序。按完成顺序写回上下文，模型拿到的结果和它给出的 `tool_calls` 对不上号，输出很容易配错。

## 超时以后

`Future.cancel(true)` 只是往线程里塞一个中断标记，线程不一定停。

工具自己得能响应中断，比如循环里检查 `Thread.currentThread().isInterrupted()`，或者换支持取消的 I/O。工具池还要和模型调用池分开放，碰上不响应中断的工具，至少不会把模型那条线程占死。HTTP 客户端自己的 read timeout 是最后一道约束，`Future` 超时替代不了它。

超时不该被当成没有结果。执行器对每个调用都得给一个结论，所以结果收敛成四种状态：

| 状态 | 含义 | 回填内容 |
|---|---|---|
| `SUCCESS` | 正常返回 | 完整结果 |
| `TIMEOUT` | 超过批次 deadline 被取消 | 超时事实 + 已拿到的部分输出 |
| `ERROR` | 工具抛出异常 | 异常类型 + 可读原因 |
| `CANCELLED` | 用户中止或上层统一取消 | 取消原因 |

必须回填。什么也不给，或者给个 null，模型不知道信息没拿到，下一轮很可能再调一次同一个工具。

## 结果怎么交回去

顺序按原始 `tool_calls` 走，带上 `tool_call_id`。Anthropic 的并行工具文档对这一点有硬要求：每个 tool_use 都要有一个 tool_result，用 tool_use_id 对回去，而且全部放在同一条消息里。成功、失败、超时再用同一个外壳，模型不用为每种状态写不同解析。长度得截断，一份批里回来四份结果，不截的话下一次请求就直接顶满。

失败信息要能拿来做决定。`timeout after 8000ms, partial output: ...` 比 null 有用，模型能据此换工具、缩小范围，或者直接说没查到。

Java 21 的 sealed interface 适合管这类封闭状态：

```java
public sealed interface ToolResult {
    String callId();

    record Success(String callId, String output) implements ToolResult {}

    record Failure(String callId, String errorType, String message) implements ToolResult {}

    record Timeout(String callId, long elapsedMs, String partialOutput) implements ToolResult {}

    record Cancelled(String callId, String reason) implements ToolResult {}
}
```

## 执行器骨架

去掉日志和参数校验，核心就这些：

```java
public class ParallelToolExecutor {
    private static final int MAX_CONCURRENCY = 4;
    private static final Duration BATCH_TIMEOUT = Duration.ofSeconds(12);

    // 工具池与模型调用池分开
    private final ExecutorService pool = Executors.newFixedThreadPool(MAX_CONCURRENCY);
    private final ToolRegistry registry;

    public List<ToolResult> execute(List<ToolCall> calls, ToolContext ctx) {
        ToolResult[] results = new ToolResult[calls.size()];

        for (int from = 0; from < calls.size(); from += MAX_CONCURRENCY) {
            int to = Math.min(from + MAX_CONCURRENCY, calls.size());
            runBatch(calls.subList(from, to), ctx, results, from);
        }
        return Arrays.asList(results);
    }

    private void runBatch(List<ToolCall> batch, ToolContext ctx, ToolResult[] out, int offset) {
        // 保留提交顺序，回收时按 index 对齐
        Map<Integer, Future<ToolResult>> futures = new LinkedHashMap<>();
        for (int i = 0; i < batch.size(); i++) {
            ToolCall call = batch.get(i);
            Tool tool = registry.get(call.name());
            futures.put(offset + i, pool.submit(() -> tool.invoke(call, ctx)));
        }

        long deadline = System.nanoTime() + BATCH_TIMEOUT.toNanos();
        futures.forEach((index, future) -> {
            long remaining = deadline - System.nanoTime();
            try {
                out[index] = future.get(Math.max(remaining, 0), TimeUnit.NANOSECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);                    // 尽力中断
                out[index] = new ToolResult.Timeout(    // 仍然给一个结论
                        batch.get(index - offset).id(), elapsed(), partialOf(future));
            } catch (ExecutionException e) {
                out[index] = new ToolResult.Failure(
                        batch.get(index - offset).id(), e.getCause().getClass().getSimpleName(),
                        e.getCause().getMessage());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                out[index] = new ToolResult.Cancelled(batch.get(index - offset).id(), "interrupted");
            }
        });
    }
}
```

超时之后仍然构造一个 `Timeout` 结果；所有异常都变成 `ToolResult`，不往上抛。执行器只负责让每个 `tool_call` 都有回声，怎么处理回声是模型和应用层的事。

## 快了多少

并行值不值得，看数据。每轮结束我会记几项：

| 指标 | 记什么 | 用来看什么 |
|---|---|---|
| 批次 wall clock | 每批从提交到全部回收 | 并发度是否合理 |
| 串行估算耗时 | 各工具耗时之和 | 和上一项比出并行收益 |
| 平均并发度 | 同时在执行的工具数 | 长期低于 2 说明并行没开起来 |
| 超时率 / 取消率 | 超时与取消占比 | deadline 是不是太紧 |
| 工具失败率 | 按工具名分组 | 哪个工具经常出问题 |

本地那组三个只读工具的测试，wall clock 从 5.6 秒降到 2.1 秒左右，接近一个工具的耗时加一点调度开销。单工具调用几乎没变化，本来就没有东西可以重叠。机器不同，数字会有出入。

## 踩过的坑

| 问题 | 原因 | 处理 |
|---|---|---|
| 超时后线程还在跑 | 工具没响应中断 | 工具内检查中断标志，HTTP 客户端自带超时 |
| 结果和调用对不上 | 按完成顺序回填 | 用 index 对齐，按提交顺序写回 |
| 两个写操作互相覆盖 | 写操作混进了并发批次 | 写默认串行，显式声明才并行 |
| 一次返回 8 个工具时上下文顶满 | 结果全量回填 | 每个结果截断，超长的做摘要 |
| 并发调外部接口被限流 | 没考虑接口 QPS | 限流工具降为串行，单独控制并发 |

## 总结

1. 工具能不能并行，交给工具自己声明。按名字猜的办法，迟早会踩到 `getAndUpdate` 这种。
2. 批大小 4、批间串行、整批共享截止时间，这三件事决定了最坏耗时是有界的。
3. 超时的调用也要有结论并回填，否则模型不知道信息没拿到，会重复调同一个工具。
4. 结果按提交顺序对齐，失败信息写成能拿来做决定的格式。

这套设计对写操作为主的工具集收益很小，因为写本来就得串行。以后工具形态变了，这块大概率要重做，"最多 4 路"这个数也得重新测。

## 参考资料

- [Parallel tool use | Anthropic Docs](https://docs.claude.com/en/docs/agents-and-tools/tool-use/parallel-tool-use)
- [Function calling | OpenAI API](https://platform.openai.com/docs/guides/function-calling)
- [Building effective agents | Anthropic](https://www.anthropic.com/engineering/building-effective-agents)

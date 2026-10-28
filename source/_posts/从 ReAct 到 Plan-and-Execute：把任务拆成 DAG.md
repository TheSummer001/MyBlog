---
title: 从 ReAct 到 Plan-and-Execute：把任务拆成 DAG
date: 2026-04-25 11:20:00
updated: 2026-04-25 11:20:00
categories:
  - AI 工程
tags:
  - AI 工程落地
  - Agent
  - LLM
keywords: Agent,ReAct,Plan-and-Execute,DAG,任务分解,多 Agent,Reviewer
description: ReAct 在长任务上反复试错，也预判不了要跑几轮。这篇写换到 Plan-and-Execute 的过程：Planner 的 DAG 怎么定契约和校验、Worker 怎么并行汇总、Reviewer 什么时候判重来。
---

同一个任务跑两遍，第一遍 23 步，第二遍 41 步。第二遍跑到中途还在同一个文件上打转，读过的内容又读了一遍。

这是 ReAct 跑到十几轮之后的样子。每一步都要重新看一遍历史，历史越长判断越飘，飘了就走回头路。

换成 Plan-and-Execute 之后，单个节点内部仍然会飘。区别在于飘的范围被关在节点里，整条流程的骨架是固定的：能并发，能局部重跑，也能事先估个成本。

这个切换不是一步到位的。先做的是把计划打印出来，发现它经常写得像愿望清单。

<!-- more -->

## ReAct 的结构性问题

短任务里 ReAct 挺好用。任务一长，卡住的地方就固定下来了。

- 第 20 步的决策，靠的是包含前 19 步的一整份历史。同一份历史里既有有用的证据，也有走错路的痕迹，模型分不清哪个是哪个
- 步数不可预期。本地同批五个任务，18 到 41 步，跑之前估不出来
- 中间哪一步错了，能重来的地方只有开头。没有可以单独重跑的单元

第二条影响最直接。用户问"这个任务要跑多久"，只能答"看情况"。历史只增不减，还会牵出上下文预算问题（[上下文窗口就那么大：Token 预算分配与压缩](https://blog.tooonran.top/2026/03/28/%E4%B8%8A%E4%B8%8B%E6%96%87%E7%AA%97%E5%8F%A3%E5%B0%B1%E9%82%A3%E4%B9%88%E5%A4%A7%EF%BC%9AToken%20%E9%A2%84%E7%AE%97%E5%88%86%E9%85%8D%E4%B8%8E%E5%8E%8B%E7%BC%A9/)：跑到三十轮左右就得停下来压一次，压完信息量还会掉一截。

## 计划的结构与校验

计划不是一段自然语言描述，是一份结构化数据。光靠口头约定不够，得机器能校验。

我的契约大概是这样：

```json
{
  "goal": "把分页查询从 offset 改成 keyset",
  "nodes": [
    {"id": "n1", "goal": "列出所有 offset 分页调用点", "tools": ["grep"], "deps": []},
    {"id": "n2", "goal": "读 PageQuery，确认封装层次", "tools": ["read_file"], "deps": ["n1"]},
    {"id": "n3", "goal": "改 OrderJob 里的分页调用", "tools": ["edit_file"], "deps": ["n2"], "output": "diff"},
    {"id": "n4", "goal": "跑单元测试", "tools": ["shell_run"], "deps": ["n3"], "output": "test_report"}
  ],
  "review": {"criteria": ["编译通过", "对外接口签名未变"], "max_retry": 2}
}
```

几个硬要求，写进 Planner 的提示词，也在校验器里拦：

- `id` 唯一，只允许字母数字和下划线
- `deps` 只引用已声明的 id
- 每个节点能用一句话说清产出，说不清就是拆得不对
- `tools` 必须在注册表里。工具名写错比依赖写错常见得多
- 节点数上限 12，超了要求合并或者拆成两次运行
- 计划里不许出现"视情况再定"这种节点。需要试探的部分交给节点内部的 ReAct 小循环

最后一条有用。Planner 很爱写"然后根据结果调整"，这种节点在执行期没人能判定它算不算完成。

Planner 出错是常态，尤其第一版。让它拿着具体错误重生成一次，比人工去改便宜。拦下来的是这几类：

| 错误 | 例子 | 处理 |
|---|---|---|
| 悬空依赖 | deps 指向 n9，n9 不存在 | 拒绝，回传错误列表 |
| 有环 | n2 → n3 → n2 | 拒绝，同上 |
| 节点数超限 | 15 个节点 | 要求合并或分两次 |
| 缺 goal | 只有 tools 没有产出描述 | 拒绝 |
| 工具不存在 | `read` 不在注册表 | 拒绝，附上可用工具名 |
| 写节点没声明 output | 成功与否判定不了 | 拒绝 |

重生成只给一次机会。两次都不过，就把错误原样报出来。

这时候往往是任务描述本身不清楚，不是 Planner 的能力问题。

校验和分层一起做，Kahn 算法一遍过：

```java
// 剥不动 = 有环。返回的分层结果顺便当拓扑序用
List<List<Node>> layers(List<Node> nodes) {
    Map<String, Integer> indegree = new HashMap<>();
    Map<String, List<Node>> next = new HashMap<>();
    for (Node n : nodes) indegree.put(n.id(), n.deps().size());
    for (Node n : nodes) {
        for (String dep : n.deps()) {
            next.computeIfAbsent(dep, k -> new ArrayList<>()).add(n);
        }
    }

    List<Node> ready = nodes.stream().filter(n -> indegree.get(n.id()) == 0).toList();
    List<List<Node>> out = new ArrayList<>();
    int visited = 0;

    while (!ready.isEmpty()) {
        out.add(ready);
        List<Node> nextLayer = new ArrayList<>();
        for (Node n : ready) {
            visited++;
            for (Node child : next.getOrDefault(n.id(), List.of())) {
                if (indegree.merge(child.id(), -1, Integer::sum) == 0) nextLayer.add(child);
            }
        }
        ready = nextLayer;
    }

    if (visited != nodes.size()) throw new IllegalStateException("计划里有环");
    return out;
}
```

## 分层执行与节点调度

分层之后调度就简单了：一层跑完再下一层，层内并发。并发上限还是 4，和之前那套并行执行器一致（[一次并发 4 个工具调用：Agent 的并行执行引擎](https://blog.tooonran.top/2026/03/11/%E4%B8%80%E6%AC%A1%E5%B9%B6%E5%8F%91%204%20%E4%B8%AA%E5%B7%A5%E5%85%B7%E8%B0%83%E7%94%A8%EF%BC%9AAgent%20%E7%9A%84%E5%B9%B6%E8%A1%8C%E6%89%A7%E8%A1%8C%E5%BC%95%E6%93%8E/)。层内节点多的时候，四个一批提交，批间等结果。

额外有一条限制：写节点即使同层也不能并发。两个 `edit_file` 撞到同一个文件，最后谁覆盖谁看运气。做法是层内分两遍，只读节点先并发，写节点排队。

同一层里挂了一个节点呢？它下游全部标 SKIPPED，这一层其余节点照常跑完再往下传。跳过本身不花时间，但它会把这条链上所有的下游检查一起带走。

节点之间不传全文，传引用。产物落在 run 目录里，按节点分文件夹：

```text
runs/<runId>/
  plan.json
  n1/result.md      # 一句话结论 + 关键数据
  n2/result.md
  n3/change.patch   # 写节点产出 diff，不是整份文件
  n4/test_report.txt
```

Worker 的输入拼装起来就四段：本节点目标一句话，上游产物路径，要产出什么，不许做什么。

上游那份 4k token 的原始输出不进上下文，只留 200 字摘要加路径。需要细节的时候模型自己去读，路径在它手里。

节点越多，全量传递越贵。二十个节点跑到最后一层，光是上游产物就能把窗口顶满。这条对写节点尤其重要，写节点拿到的是 diff 和路径，不是别人改完的整份文件，它才不会顺手把别人的改动也重写一遍。

## 审核、失败与重试

Reviewer 属于 evaluator 那一类角色，它的价值全在判定标准上。标准不可判定，它就只会编理由。"编译通过"能判定，跑一次 build 就有结论。"代码质量不错"判定不了，写进 criteria 只会让 Reviewer 输出一串形容词。

所以 criteria 我拆成两栏：可自动检查的（编译、测试、静态检查、schema 校验），需要人看的（设计取舍、命名、日志格式）。Reviewer 只看第一栏，第二栏整理成待确认清单给人。它的输出只有三种：

- `PASS`，进下一步
- `RETRY`，带上要重来的节点 id 和原因
- `REPLAN`，说明原计划的哪条假设崩了

重试上限 2 次。第三次还不过就降级：失败节点标 `unfinished`，产出和原因一起交给人。硬撑着重试只会烧 token，问题一般出在计划本身，再跑一遍还是同样的错。

单个节点失败之后的默认处理是跳过，不重规划。重规划会把已经跑完的节点作废，从一个失败的 grep 上面推翻整份计划，代价远大于收益。跳过至少保住了前面那部分。

三类失败才值得重规划：

| 失败类型 | 例子 | 处理 |
|---|---|---|
| 前提不成立 | 计划假设"索引已存在"，实际没有 | 重规划 |
| 工具不可用 | 命令执行环境挂了 | 重试一次，还不行就整个任务停 |
| Reviewer 判 REPLAN | 改动波及对外接口 | 重规划 |

其余失败走跳过：文件不存在、命令返回非零、单个测试挂了。

跳过必须落在最终报告里。我踩过一次，报告写"任务完成"，实际上 7 个节点只跑了 4 个，剩下 3 个跳过，下游检查也跟着跳过，整条链路上没一个校验器真正跑过。那次之后加了条规则：只要 skipped 大于 0，报告第一行写 `PARTIAL`，并列出被跳过的节点。

## 三种方案对比

| 维度 | ReAct | Plan-and-Execute | Multi-Agent |
|---|---|---|---|
| 延迟 | 串行决策，步数多时慢 | 层内并发，骨架固定 | 最高，多一轮通信与汇总 |
| 可控性 | 低，走到哪算哪 | 高，计划可审可拦 | 中，取决于编排层 |
| 实现成本 | 最低，一个循环 | 中，契约 + 校验 + 调度 | 高，上下文隔离、消息、失败处理 |
| 失败恢复 | 只能从头 | 单节点可重跑 | 单 Agent 可重跑，汇总要重来 |
| 上下文增长 | 线性，最快顶满 | 按节点隔离，可控 | 每个 Agent 独立，汇总处会堆 |
| 适用场景 | 短任务、边查边定 | 步骤能事先想清楚的工程活 | 真正可并行的独立子任务 |

Multi-Agent 不值的地方在于通信成本。任务本身有强依赖时，多出来的 Agent 只是把串行摊成了"串行加通信开销"，延迟还涨了。

我这边只有一个条件会开多 Agent：子任务之间确实独立，比如同时查三份互不相关的文档。这种场景下并行的收益能盖过汇总的麻烦。

## 总结

1. ReAct 的问题在于步数和成本都不可预算，长任务上迟早要换结构。
2. Planner 的输出必须是可校验的结构化数据。悬空依赖、环、节点数、工具名，这四类拦在最前面，比事后 debug 便宜一个量级。
3. 分层执行加层内限流，写节点永远串行。规则和并行执行器是同一套，别为了"同层"破例。
4. 节点之间传引用不传全文，产物落盘，Worker 自己去读细节。
5. 失败默认跳过，不做重规划；但 skipped 必须出现在报告里，否则"完成"是假的。

## 参考资料

- [Building effective agents | Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- [Understanding JSON Schema](https://json-schema.org/understanding-json-schema/)

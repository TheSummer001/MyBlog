---
title: Kafka 文档异步处理：上传、解析、切块、向量化怎么解耦
date: 2026-05-12 21:35:00
updated: 2026-05-12 21:35:00
categories:
  - AI 工程
tags:
  - AI 工程落地
  - RAG
  - Kafka
  - Java
keywords: Kafka,RAG,文档处理,异步,幂等消费,重试,死信队列
description: 文档上传之后要解析、切块、向量化，串在上传接口里会把响应时间拖死。这篇写用 Kafka 把四步拆开：Topic 怎么划、消息体要不要带内容、幂等消费怎么做、失败怎么重试和兜底。
---

上传接口原来在一个方法里做完四件事：收文件、解析、切块、调 embedding 服务。小文件 200 毫秒，一份 80 页的 PDF 走完要 40 秒。

网关超时 30 秒，超过就断开。前端只看到转圈，不知道卡在哪一步。

后来把这段逻辑丢进线程池，接口响应快了，但服务重启时排队中的任务全丢，下游限流时线程池也跟着堵死。

<!-- more -->

## 同步处理的问题

四个阶段的耗时不是一个量级。测试环境里按 80 页 PDF 统计过一轮：

| 阶段 | 耗时 | 波动来源 | 失败后能不能重试 |
|---|---|---|---|
| 接收与落盘 | 0.3 到 1 秒 | 文件大小 | 能 |
| 解析 | 3 到 25 秒 | 扫描件、表格、字体 | 能，但重复解析成本高 |
| 切块 | 0.2 到 2 秒 | 分块策略、页数 | 能 |
| 向量化 | 20 到 60 秒 | 下游 QPS、批大小 | 能，且必须限流 |

解析耗时不可控。文字版 PDF 三秒能出来，扫描件要走 OCR，页数一多就上二十秒。把这些串在 HTTP 请求里，超时时间只能往大了设，谁都等不起。

上传接口该做的事收缩到五步：校验类型和大小、写对象存储、插入文档记录（状态 PENDING）、发一条 Kafka 消息、返回 docId。响应时间回到几百毫秒，后面的事交给消费者。上传这一步本身也有坑，分片、断点续传和秒传的处理写在[百兆文档上传优化：分片、断点续传与 Redis BitMap](https://blog.tooonran.top/2026/04/15/%E7%99%BE%E5%85%86%E6%96%87%E6%A1%A3%E4%B8%8A%E4%BC%A0%E4%BC%98%E5%8C%96%EF%BC%9A%E5%88%86%E7%89%87%E3%80%81%E6%96%AD%E7%82%B9%E7%BB%AD%E4%BC%A0%E4%B8%8E%20Redis%20BitMap/)里，这里不重复。

## Topic 划分与消息体设计

Topic 可以按类型拆，也可以按阶段拆。按类型拆的诱惑在于每种文件的解析逻辑不同，PDF、Word、扫描件各走一套。代价是每加一种类型要多一套 Topic 和消费者，切块和向量化这两步其实完全一样，却要重复实现。按阶段拆，每个 Topic 对应一种失败模式。解析慢就加解析消费者，向量化被限流就压向量化消费者的并发，互不影响。

| Topic | 生产方 | 消费方 | 分区数 | 说明 |
|---|---|---|---|---|
| doc.parse | 上传接口 | 解析服务 | 6 | 消息只带对象引用 |
| doc.chunk | 解析服务 | 切块服务 | 6 | 带解析结果的对象键 |
| doc.embed | 切块服务 | 向量化服务 | 12 | 一条消息一个批次 |
| doc.parse.retry | 解析消费者 | 解析消费者 | 6 | 延迟重试，按退避级别再分 |
| doc.parse.dlq | 解析消费者 | 人工处理 | 1 | 只进不出，等排查 |

分区数不是拍脑袋定的。6 个分区意味着解析最多 6 个消费者并行；embedding 下游给的是 8 个并发额度，给它 12 个分区留一点突发余量，实际并发靠消费者侧的限流器压住。

每个阶段都有自己的一份 retry 和 dlq。共用一套死信 Topic 的话，解析失败和向量化失败混在一起，排查时还要按 stage 字段过滤。

消息体的另一项选择是带不带文件内容。最直接的做法是把解析出来的全文塞进消息，省一次对象存储读取，也省一次下载。

代价是 Topic 的存储和网络。Kafka 单条消息默认上限在 1MB 上下，80 页 PDF 抽出来的文本经常超；调大 `max.message.bytes` 能让它过，但每条消息都要在 broker 上占那么大的页缓存。

| 维度 | 带内容 | 只带对象引用 |
|---|---|---|
| 消息大小 | 几十 KB 到几 MB | 几百字节 |
| 重复传输 | 每个阶段都要带一遍 | 各阶段自己按需读 |
| 版本一致性 | 消息里的内容是快照 | 读到的是对象存储的当前版本 |
| 重放 | 能直接重放旧内容 | 依赖对象没有被覆盖 |
| 排查 | 消息里就能看到内容 | 要拿 objectKey 去查 |

选只带引用。版本一致性那一行是关键：重放一条三天前的消息，如果内容在消息里，消费到的是三天前的解析结果；如果只有引用，读到的是对象存储里当前的对象。前者看起来更安全，实际会让状态机和实际内容脱节。

消息体长这样：

```json
{
  "docId": "d_8f3a21",
  "version": 4,
  "stage": "PARSE",
  "objectKey": "docs/2026/05/d_8f3a21/v4.pdf",
  "contentType": "application/pdf",
  "attempt": 1,
  "traceId": "c1f0e9b2"
}
```

`version` 每次文档重新上传就加一。它同时是幂等键的一部分和对象键的一部分，旧版本的对象不会被新版本覆盖。

## 幂等消费与进度回报

Kafka 保证的是至少一次投递。同一条消息可能被消费两次：消费者处理完还没来得及提交 offset 就崩了，或者 rebalance 把分区转给了别的实例。幂等键用 `docId + stage + version`，三元组相同就是同一件事，处理第二遍必须没有副作用。

状态机放在数据库里，四个状态够用：

| 状态 | 含义 | 谁能推进到下一步 |
|---|---|---|
| PENDING | 等待处理 | 消费者抢占时改成 RUNNING |
| RUNNING | 处理中 | 成功改 DONE，失败改 FAILED |
| DONE | 已完成 | 发下一条消息，进入下一阶段 |
| FAILED | 失败待重试 | 重试消费者重新抢占 |

抢占用一条带条件的 UPDATE，影响行数为 0 就说明别人已经做过了：

```sql
UPDATE doc_pipeline
SET status = 'RUNNING', attempt = attempt + 1, started_at = NOW()
WHERE doc_id = ? AND stage = ? AND version = ?
  AND status IN ('PENDING', 'FAILED');
```

消费者骨架：

```java
@KafkaListener(topics = "doc.parse", groupId = "doc-parse-worker")
public void onParse(ConsumerRecord<String, String> record, Acknowledgment ack) throws Exception {
    ParseTask task = mapper.readValue(record.value(), ParseTask.class);

    // 抢占失败：重复消息，或别的实例正在处理
    if (!pipelineRepo.tryStart(task.docId(), task.stage(), task.version())) {
        ack.acknowledge();
        return;
    }

    try {
        ParsedDoc parsed = parser.parse(task.objectKey());
        storage.put(parsed.key(), parsed.bytes());
        pipelineRepo.finish(task.docId(), task.stage(), task.version(), parsed.key());
        ack.acknowledge();
    } catch (NonRetryableException e) {
        pipelineRepo.fail(task.docId(), task.stage(), task.version(), e.getMessage());
        dlq.send(record.value(), e);      // 文件本身有问题，重试没有意义
        ack.acknowledge();
    }
    // 可重试异常直接抛出，交给容器的错误处理器
}
```

这里有个漏洞：`finish` 把状态改成 DONE 之后、下一条消息发出之前，进程挂了。状态是 DONE，下一阶段永远收不到消息。补的办法是一个每分钟跑一次的扫描任务，找出 DONE 但下一阶段还是 PENDING 且超过 5 分钟的文档，补发消息。消息本身幂等，补发多次也没关系。Kafka 的事务只能把消费、发消息和提交 offset 放进一个原子提交，数据库状态不在里面；要让状态和消息同时成立，得用 outbox 表，在同一个数据库事务里写一条待发送记录，再由中继任务发出去。先落状态、再做事、失败留痕，这个顺序和[事件驱动的 ASR → LLM → ES 回写：设计拆解与实践](https://blog.tooonran.top/2026/05/08/%E4%BA%8B%E4%BB%B6%E9%A9%B1%E5%8A%A8%E7%9A%84%20ASR%20%E2%86%92%20LLM%20%E2%86%92%20ES%20%E5%9B%9E%E5%86%99%EF%BC%9A%E8%AE%BE%E8%AE%A1%E6%8B%86%E8%A7%A3%E4%B8%8E%E5%AE%9E%E8%B7%B5/)那条链路是同一套。区别在于那边几个阶段跑在同一个进程里，这里被拆到了不同的消费者组。

前端要知道处理到哪了，状态表就够了。四个阶段各有一个状态字段，前端轮询 `GET /docs/{id}`，返回当前 stage 和状态。细粒度百分比是伪需求，解析 80 页的 PDF，能给出的只有"第 37 页"，这个数对用户没有决策价值。需要的是两个信息：现在在哪一步、大概还要多久，后者用该阶段的 P50 耗时估。事件推送留给状态变化大的场景，用 SSE 推 `doc.stage.changed` 事件，前端不用轮询，代价是连接管理和多实例下的消息广播。

## 失败重试与死信

超时、连接被重置、下游返回 429 或 503，这些过一会儿大概率能过。文件损坏、格式不在白名单、对象存储返回 403，重试一百次结果一样。

| 错误类型 | 典型表现 | 处理 |
|---|---|---|
| 下游限流 | HTTP 429、embedding 服务返回 busy | 退避重试，同时压低并发 |
| 网络抖动 | 连接超时、读超时 | 重试 3 次，指数退避 |
| 文件损坏 | PDF 解析器抛异常、校验不通过 | 不重试，直接置失败 |
| 无权限 | 对象存储 403 | 不重试，告警 |
| 代码缺陷 | 空指针、反序列化失败 | 重试一次后进死信 |

重试次数定 3 次，退避用 30 秒、2 分钟、10 分钟。

退避不能靠消费者线程 sleep。sleep 期间分区被占着，`max.poll.interval.ms` 一过就会触发 rebalance，整个消费组跟着抖。做法是把消息投到延迟 Topic，由定时任务在到期后转回主 Topic。Spring Kafka 的 `DefaultErrorHandler` 配 `ExponentialBackOffWithMaxRetries` 能在进程内重试，同样卡着分区，只适合秒级的短退避；要分钟级延迟，得用 `@RetryableTopic` 或者自己写 recoverer 投延迟 Topic。

三次都失败进死信 Topic，同时把状态改成 `FAILED_MANUAL`，触发告警。死信不是终点，是一张待办清单。人工确认文件本身有问题之后，把状态改成 `REJECTED` 并通知上传者。

YAML 配置大概是这样：

```yaml
spring:
  kafka:
    consumer:
      max-poll-records: 5
      fetch-min-size: 1MB
      properties:
        max.poll.interval.ms: 300000
    listener:
      ack-mode: manual_immediate
```

`max-poll-records` 从默认的 500 调到 5，是因为单条消息的处理要几十秒，一次拉 500 条必然超时。`manual_immediate` 保证每条处理完就提交，崩了最多重放一条。

## 顺序性与消费并发

同一个文档的切块消息要不要按顺序消费。切块阶段产出的是一批 chunk，向量化对每个 chunk 独立处理，顺序不影响结果；需要顺序的是"所有 chunk 都向量化完之后，把文档状态改成 READY"这一步。如果按 `docId` 做 partition key，同一个文档的所有消息落到同一个分区，顺序有了，代价是热点：一份 800 页的文档切出 2000 个 chunk，全压在同一个消费者上，其他消费者闲着。

| 阶段 | partition key | 是否需要顺序 | 代价 |
|---|---|---|---|
| 解析 | docId | 是，避免两个实例同时解析 | 热点只在文档级别 |
| 切块 | docId | 不需要 | 无 |
| 向量化 | chunkId | 不需要 | 无 |
| 完成标记 | docId | 需要 | 单文档串行 |

做法是向量化阶段用 `chunkId` 打散，完成标记不放在消息里，改成集合计数：每个 chunk 处理完执行 `SADD doc:chunks:{docId}:{version} chunkId`，再用 `SCARD` 和总数比，相等时把文档改成 READY。`SADD` 本身幂等，重复消费不会把计数抬高，集合加 24 小时过期。分区数变过一次，映射就变了。扩分区之后，同一个 docId 的哈希可能落到新分区，旧分区里还没消费完的消息和新消息会被不同实例处理。扩分区要挑低峰，最好在阶段边界上做。

上传高峰和消费能力对不上是常态。早上九点到十点，上传量是平时的几倍，embedding 服务的额度是固定的。Kafka 在这里只负责缓冲，加速要靠消费端。

| 手段 | 作用 | 注意 |
|---|---|---|
| 加消费者 | 提高并行度 | 不能超过分区数 |
| 扩分区 | 提高并行度上限 | 改 key 映射，要挑时机 |
| 批量拉取 | 减少网络往返 | 单条处理慢时要把 max-poll-records 调小 |
| 下游限流 | 保护 embedding 服务 | 用信号量，别用固定 sleep |
| 监控 lag | 判断是产能不足还是消费卡住 | 看 lag 的增长斜率，不看绝对值 |

embedding 服务的并发额度是 8，向量化消费者就算有 12 个实例，也得用信号量把同时发出的请求压到 8。超出额度的请求要么排队，要么被拒绝后重试，前者占内存，后者浪费一次往返。lag 分两段看，上传高峰带来的 lag 会自己降下去；lag 一直涨说明消费能力不够，或者某个分区卡住了。后一种情况加消费者没用，得先看是不是有毒消息在反复重试。

## 总结

1. 上传接口只负责收文件和发消息，解析与向量化放到消费者里。
2. Topic 按阶段拆，每个阶段一种失败模式、一套并发策略。
3. 消息只带对象引用和版本号，内容从对象存储取；版本号同时进幂等键和对象键。
4. 幂等靠 `docId + stage + version` 加条件更新，至少一次投递下这是唯一可靠的闸门。
5. 重试靠延迟 Topic 投递，不靠线程 sleep；三次不过进死信，死信要有人看。

## 参考资料

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Kafka Design](https://kafka.apache.org/documentation/#design)
- [Kafka Producer Configs](https://kafka.apache.org/documentation/#producerconfigs)

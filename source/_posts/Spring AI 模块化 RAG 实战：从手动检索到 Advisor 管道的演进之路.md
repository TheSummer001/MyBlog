---
title: "Spring AI 模块化 RAG 实战：从手动检索到 Advisor 管道的演进之路"
date: 2026-05-14 20:00:00
updated: 2026-05-14 20:00:00
tags:
  - Spring AI Alibaba
  - RAG
  - Elasticsearch
  - Redis
categories:
  - AI 工程
keywords: Spring AI,Spring AI Alibaba,RAG,Elasticsearch,Redis,混合检索,向量检索,对话记忆,查询重写,Advisor
description: 记录 IntelliRAG 项目从手动构建 RAG 流程到全面采用 Spring AI 模块化 Advisor 架构的演进过程，涵盖混合检索、对话记忆、查询重写等核心模块的实现与踩坑经验。
---

## 引言

IntelliRAG 是一个基于 Spring AI Alibaba 构建的多租户 RAG 知识库平台。在最近的重构中，我们将整个 RAG 问答链路从手工拼接的模式迁移到了 Spring AI 的 Advisor 架构，并在此基础上实现了 ES 混合检索、Redis 对话记忆和查询重写。本文将复盘整个过程，分享架构设计和踩坑心得。

## 背景：重构前的架构痛点

重构前，`RagChatServiceImpl` 的核心逻辑长这样：

```java
// 手动调用 VectorStore 检索
List<Document> documents = vectorStore.similaritySearch(
    SearchRequest.builder().query(userQuery).topK(5).build());

// 手动拼接 Prompt
String context = documents.stream()
    .map(Document::getText)
    .collect(Collectors.joining("\n\n"));

String systemPrompt = "你是知识库助手..." + context;
Prompt prompt = new Prompt(List.of(new SystemMessage(systemPrompt), new UserMessage(userQuery)));

// 手动调用 LLM
ChatResponse response = chatModel.call(prompt);
```

这套代码存在几个问题：

1. **检索和生成耦合在业务代码里**，难以单独替换或测试
2. **没有对话记忆**，每次提问都是"失忆"的
3. **follow-up 问题检索失效**——上一轮问"Obsidian 怎么集成 GitHub Actions？"，下一轮问"它用到了哪个插件？"时，检索词只有一个"它"，向量搜索完全命中不了
4. **参数硬编码**，调整 topK 或阈值要改代码重新部署

## 目标架构：Advisor 管道

Spring AI 提供了 `Advisor` 接口，允许将检索、查询变换、上下文增强等关注点拆分为独立模块，通过 `ChatClient` 串联执行。我们的目标管道：

```
用户提问 → ChatClient.prompt()
  ├── MessageChatMemoryAdvisor      // 从 Redis 加载对话历史
  ├── RetrievalAugmentationAdvisor
  │     ├── CompressionQueryTransformer  // 历史+问题 → 完整搜索词
  │     ├── VectorStoreDocumentRetriever // 向量/混合检索
  │     └── ContextualQueryAugmenter     // 文档+问题 → 增强 Prompt
  └── DeepSeekChatModel.call()
```

## 第一步：引入 ChatMemory 对话记忆

Spring AI 提供了 `ChatMemory` 接口，定义了对历史消息的存取：

```java
public interface ChatMemory {
    void add(String conversationId, List<Message> messages);
    List<Message> get(String conversationId);
    void clear(String conversationId);
}
```

我们实现了 `RedisChatMemory`，底层用 Redis List 存储 JSON 序列化的消息：

```java
public class RedisChatMemory implements ChatMemory {
    public void add(String conversationId, List<Message> messages) {
        String key = "chat:memory:" + conversationId;
        // 序列化为 JSON，RPUSH 入队，trim 到 maxSize，设置 7 天 TTL
        redisTemplate.opsForList().rightPushAll(key, jsonMessages);
        redisTemplate.opsForList().trim(key, -maxSize, -1);
        redisTemplate.expire(key, Duration.ofDays(7));
    }

    public List<Message> get(String conversationId) {
        // LRANGE 获取最近 20 条，反序列化
    }
}
```

**踩坑**：
- 尝试使用 `MessageChatMemoryAdvisor` 时发现构造器是 private 的，且 `AdvisorSpec.param()` 在 Spring AI 1.1.2 中不可用
- 解决方案：放弃 `MessageChatMemoryAdvisor`，直接在 `RagChatServiceImpl` 中手动调用 `chatMemory.get()` / `chatMemory.add()`，将历史消息通过 `.messages()` 传入 ChatClient

**启示**：Advisor 是便利层，但不要为了用 Advisor 而硬套。当 API 版本不匹配时，直接调用底层接口更可靠。

## 第二步：CompressionQueryTransformer 查询重写

这是解决 follow-up 问题检索失效的关键模块。

`CompressionQueryTransformer` 使用一个独立的 `ChatClient`（temperature = 0）将对话历史 + 当前简短查询压缩为语义完整的搜索词：

```
输入：
  history: [USER: "Obsidian 的 GitHub Actions 集成怎么做？", ASSISTANT: "需要配置..."]
  query:   "它用到了哪个插件？"

输出："在 Obsidian 和 GitHub Actions 的集成中，用到了哪个插件？"
```

管道会自动从 `.messages(history + currentQuery)` 中提取历史消息并注入 `CompressionQueryTransformer`，无需手动传递。

**踩坑**：
- `ChatClient.Builder.defaultOptions()` 方法签名在不同版本中差异很大，最终使用 `DeepSeekChatOptions.builder().temperature(0.0)` 确保查询压缩的确定性

## 第三步：ES 混合检索

### 第一次尝试：RRF（失败）

按照 Elasticsearch 8.x 的 `rrf` retriever 语法实现：

```java
SearchRequest.of(s -> s
    .retriever(r -> r.rrf(rrf -> rrf
        .retrievers(
            Retriever.of(rt -> rt.standard(...)),  // BM25
            Retriever.of(rt -> rt.knn(...))        // 向量
        )
        .rankWindowSize(100)
    ))
);
```

运行时报错：

```
elasticsearch: [security_exception] current license is non-compliant
for [Reciprocal Rank Fusion (RRF)]
```

**教训**：RRF 是 Elasticsearch 白金版功能，基础版无法使用。在选型时要先确认目标 ES 环境的功能许可。

### 第二次尝试：bool + knn 加权（成功）

改用基础版完全兼容的方案：

```java
SearchRequest.of(s -> s
    .query(q -> q.bool(b -> b
        .should(s1 -> s1
            .match(m -> m
                .field("content")
                .query(request.getQuery())
                .boost(0.3f)          // BM25 权重
            )
        )
    ))
    .knn(knn -> knn
        .field("vector")
        .queryVector(queryEmbedding)
        .k(topK)
        .numCandidates(topK * 2)
        .boost(0.7f)                  // 向量权重
    )
    .size(topK)
);
```

最终评分 = 向量得分 × 0.7 + BM25 得分 × 0.3，ES 自动加权求和。

### 小坑

- `KnnQuery.queryVector()` 接受 `List<Float>` 而非 `List<Double>`，需要将 `EmbeddingModel.embed()` 返回的 `float[]` 逐元素装箱
- `Document` 类没有 `setScore()` 方法（score 是 `private final`），必须用 `Document.builder().score(hit.score()).build()`

## 第四步：配置驱动

提取 `@ConfigurationProperties("app.rag")`，支持 `application-dev.yml` 动态调整参数：

```yaml
app:
  rag:
    top-k: 8
    similarity-threshold: 0.65
    hybrid-search:
      enabled: true
      vector-weight: 0.7
      text-weight: 0.3
```

配合 `HybridSearchVectorStore`（VectorStore 装饰器），每次检索输出详细日志：

```
╔══════════════════════════════════════════════════════════════╗
║  RAG 检索 [混合模式, topK=8, threshold=0.65]                ║
╠══════════════════════════════════════════════════════════════╣
║ 查询文本 : 在 Obsidian 和 GitHub Actions 的集成中，用到了哪个插件？
╠══════════════════════════════════════════════════════════════╣
║ 检索到 5 条结果 (耗时 52ms):
║ [1/5] score=1.5234 | text=Obsidian 使用 GitHub Actions 插件...
╚══════════════════════════════════════════════════════════════╝

混合检索 Top 3 原始得分:
  [1] score=1.5234, source=Obsidian 使用 GitHub Actions 插件...
  [2] score=1.2103, source=GitHub Actions 安全最佳实践...
  [3] score=0.9876, source=Obsidian 插件开发指南...
```

## 最终架构总览

```
POST /api/ai/rag/chat  { message: "它用到了哪个插件？", conversationId: "uuid" }
  │
  ├─ 1. RedisChatMemory.get(conversationId)          // 加载对话历史
  │
  ├─ 2. ChatClient.prompt()
  │      .advisors(retrievalAugmentationAdvisor)
  │      .messages(history + currentQuery)
  │      .call()
  │      │
  │      ├─ 2a. CompressionQueryTransformer           // 历史压缩 → 完整搜索词
  │      ├─ 2b. HybridSearchVectorStore.similaritySearch()
  │      │       └─ bool(knn×0.7 + match×0.3)        // ES 混合检索
  │      └─ 2c. ContextualQueryAugmenter              // 文档 + 问题 → 增强 Prompt
  │
  ├─ 3. DeepSeekChatModel.generate()                  // LLM 生成回答
  │
  └─ 4. RedisChatMemory.add(conversationId, exchange) // 保存本轮对话
```

## 踩坑清单

| 问题 | 根因 | 解决方案 |
|------|------|----------|
| `MessageChatMemoryAdvisor` 构造器 private | Spring AI 1.1.2 API 版本差异 | 改用直接调用 `ChatMemory` |
| `ChatClient.PromptSpec` 不存在 | 版本 API 差异 | 纯 fluent chaining，不声明中间变量 |
| `AdvisorSpec.param()` 不可用 | 版本 API 差异 | 移除动态 filter，改为预留重载方法 |
| `ChatMemory.get()` 只有单参数 `(String)` | 不同版本接口定义 | 按实际接口签名实现 |
| RRF 触发 `security_exception` | ES 基础版不支持 RRF | 改为 `bool` + `knn` 加权方案 |
| `KnnQuery.queryVector()` 需要 `List<Float>` | API 类型要求 | `float[]` → `List<Float>` 逐元素转换 |
| `Document.setScore()` 不存在 | score 是 `private final` | 使用 `Document.builder().score()` |
| IDE 自动移动文件到 `properties/` 包 | IDE 重构 | 更新 import，保持一致 |

## 总结

1. **Advisor 模式的价值不在"用"而在"可替换"**——当某个 Advisor 的 API 不兼容时，直接调用底层接口往往更快，关键是保持模块边界清晰
2. **查询重写是多轮 RAG 的胜负手**——没有 `CompressionQueryTransformer`，follow-up 问题的检索命中率会断崖式下降
3. **混合检索需要关注许可证**——RRF 虽好，但基础版 ES 只能用 `bool` + `knn`；二者效果差异在中小规模语料上不大
4. **配置驱动 > 硬编码**——`app.rag.*` 让调参变成了改 YAML 重启，效率天壤之别
5. **日志是检索系统最好的调试工具**——`HybridSearchVectorStore` 每次检索输出 Top-3 原始得分，一眼就能判断权重是否合理

## 参考资料

- [检索增强生成（RAG） | Spring AI Alibaba](https://java2ai.com/docs/frameworks/agent-framework/advanced/rag/)

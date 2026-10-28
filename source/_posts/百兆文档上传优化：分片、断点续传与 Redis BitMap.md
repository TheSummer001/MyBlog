---
title: 百兆文档上传优化：分片、断点续传与 Redis BitMap
date: 2026-04-15 21:47:00
updated: 2026-04-15 21:47:00
categories:
  - AI 工程
tags:
  - AI 工程落地
  - Java
  - Redis
keywords: 大文件上传,分片上传,断点续传,Redis BitMap,MinIO,秒传,幂等
description: 一次性传一百多兆的文档要等八秒，失败还得整份重传。这篇写分片上传与断点续传的实现：分片协议怎么定、Redis BitMap 怎么管分片状态、MinIO 怎么合并与秒传，以及耗时从八秒降到两秒的定位过程。
---

测试环境的资料库里有一批一百多兆的 PDF 和扫描件，最大的 180MB。上传接口跑在本地 Tomcat 上，前面挂了一层网关，超时设的 8 秒。

一百二十兆的扫描件传到第 8 秒，网关直接返回 504。换个更大的文件，浏览器等到连接被重置。

加上重试之后问题换了副面孔：传到 90% 断一次，客户端从头再来，链路占用翻倍，失败率比不加还高。

<!-- more -->

## 一次性上传的瓶颈

把整个文件塞进一个请求，代价分三块。内存上，算文件哈希时用了 `file.getBytes()`，一百兆就是一次 100MB 的数组分配；几个用户同时传，Young GC 开始频繁。超时上，从首字节到末字节都挂在同一条连接上，网关超时、链路抖动、浏览器把标签页挂起，任何一环出问题，整次上传作废。

重传最贵。失败之后服务端没有中间状态可查，客户端只能从头来。

| 对比项 | 一次性上传 | 分片上传 |
|---|---|---|
| 内存峰值 | 整个文件进堆，100MB 起 | 单请求体量，5MB 量级 |
| 超时粒度 | 整个文件一条连接 | 单分片一条请求 |
| 失败代价 | 全部重传 | 只补失败的那几片 |
| 进度可观测 | 只有浏览器上传进度 | 服务端知道到了第几片 |
| 实现成本 | 一个接口 | 协议、状态、合并、清理 |

表格末尾那行是分片真正的成本。协议定下来之后，客户端、服务端、存储三边都要跟着改，中途换方案很麻烦。

## 分片协议设计

分片大小、并发数、每片怎么校验。这三个数定了，后面的位图和合并才有意义。

分片大小在 2MB 到 5MB 之间选，这是最常见的两档。但走 S3 分片协议时，除收尾那一片外每片不得小于 5MiB，2MB 在这里直接用不了，除非不用 multipart、自己切片再合并。所以 MinIO 这条路实际定的是 5MiB，下文按习惯写成 5MB。100MB 到 200MB 的文件落在 20 到 40 片之间，离 10000 片的上限还远。

片越小，重传代价越低，请求数越多，握手和鉴权的开销占比跟着上升。10MB 以上在网络差的时候一次失败就是 10MB 白传。本地测试里 5MB 和 8MB 的总耗时差不到 0.2 秒，选大的能少一半请求。并发上传 4 路。单片的 PUT 在测试环境里 0.3 到 0.6 秒，4 路并行能把 20 片压到 3 秒出头。再往上加，瓶颈从网络转到 MinIO 的写盘和网关的连接数限制。

每片校验用 CRC32 或者分片 MD5，服务端收到后自己再算一遍。文件级 MD5 在这一步没有用，S3 分片对象的 ETag 是所有分片 MD5 拼接后再算一次 MD5、加片数后缀，跟整个文件的 MD5 对不上。

| 分片大小 | 100MB 片数 | 单片重传代价 | 请求开销 | 用在什么场景 |
|---|---|---|---|---|
| 2MB | 50 | 低 | 高 | 自建合并，不走 S3 分片 |
| 5MB | 20 | 中 | 中 | MinIO 分片的下限附近，默认 |
| 10MB | 10 | 高 | 低 | 机房内、稳定千兆 |

分片顺序无关。第 7 片先到、第 2 片后到都没关系，服务端按片号存，合并时按片号升序拼接。协议里要写清楚这一点，否则客户端会自己加锁，把并发又退化成串行。

## 分片状态管理

一份 1000 片的文件，服务端要知道哪些片到了。用 Set 存片号是一种做法，用 Redis BitMap 是另一种。

BitMap 一个片号占一位。1000 片就是 1000 位，125 字节，SETBIT 和 GETBIT 都是 O(1)，BITCOUNT 一次给出已收到的片数。

```java
public class PartBitmap {
    private static final Duration TTL = Duration.ofHours(24);

    private final StringRedisTemplate redis;
    private final String key;

    public PartBitmap(StringRedisTemplate redis, String uploadId) {
        this.redis = redis;
        this.key = "upload:parts:" + uploadId;
    }

    // 单片写完调用；重复调用结果一样
    public void markDone(int partIndex) {
        redis.opsForValue().setBit(key, partIndex, true);
        redis.expire(key, TTL);
    }

    public boolean isDone(int partIndex) {
        return Boolean.TRUE.equals(redis.opsForValue().getBit(key, partIndex));
    }

    public long doneCount() {
        Long count = redis.execute((RedisCallback<Long>) conn ->
                conn.bitCount(key.getBytes(StandardCharsets.UTF_8)));
        return count == null ? 0 : count;
    }

    // 断点续传：整张位图一次取回，客户端自己解码
    public byte[] snapshot() {
        return redis.execute((RedisCallback<byte[]>) conn ->
                conn.get(key.getBytes(StandardCharsets.UTF_8)));
    }
}
```

片号从 0 开始，位图偏移量就是片号。这一点要和客户端约定死，差一位会导致断点续传永远少传一片。

内存占用按 1000 片估算：

| 结构 | 存储形式 | 1000 片占用 | 备注 |
|---|---|---|---|
| BitMap | 125 字节的字符串 | 约 125B 加 key 开销 | 偏移量到 1000 位 |
| Set | intset 或哈希表 | 约 40KB 到 70KB | 超过 512 个元素后转哈希表 |
| Hash | field 为片号 | 与 Set 接近 | 每个 field 有额外开销 |
| MySQL 行 | 每片一行 | 1000 行 | 还有索引和事务成本 |

Redis 的 Set 对小整数有 intset 优化，`set-max-intset-entries` 默认 512，1000 片已经越过这条线，编码会换成哈希表。位图在这个规模上优势明显。

位图只回答"这片到了没有"，回答不了"到的是不是对的"。校验和要另存一份，通常是 uploadId 加片号到 ETag 的映射。

## 合并、秒传与断点续传

MinIO 提供的是 S3 兼容接口，三步：CreateMultipartUpload 拿 uploadId，UploadPart 带片号上传，CompleteMultipartUpload 按片号升序带上 ETag 合并。SDK 用 AWS SDK v2 的 `S3Client`，endpoint 指向 MinIO。

```java
public record UploadedPart(int number, String etag) {}

public void complete(String uploadId, String objectKey, List<UploadedPart> parts) {
    List<CompletedPart> completed = parts.stream()
            .sorted(Comparator.comparingInt(UploadedPart::number))    // 必须升序
            .map(p -> CompletedPart.builder()
                    .partNumber(p.number())
                    .eTag(p.etag())
                    .build())
            .toList();

    CompleteMultipartUploadRequest request = CompleteMultipartUploadRequest.builder()
            .bucket(bucket)
            .key(objectKey)
            .uploadId(uploadId)
            .multipartUpload(CompletedMultipartUpload.builder().parts(completed).build())
            .build();

    s3.completeMultipartUpload(request);
}
```

合并本身不慢。MinIO 拿到片号列表和 ETag 后校验一遍，再把分片接成对象，120MB 的文件在测试环境里 0.15 秒上下。慢的是合并之前尾部几片的等待。

秒传在分片之前做。客户端先算整个文件的 SHA-256，带着哈希请求一个 uploadId。服务端按哈希查文档表，命中已完成的记录就直接返回 docId，一个字节都不传。

命中率取决于业务。同一份合同改个名字再传、同一份报告在不同审批流里反复提交，这类重复在资料库里很常见。本地测试把同一批文件重传一遍，第二次全部命中。

断点续传靠位图。客户端拿到 uploadId 后先要一次位图快照，把 125 字节解码成 1000 个布尔值，跳过已完成的片，只传剩下的。

同一片被传两次很常见：客户端超时重试、用户刷新页面、两台设备同时续传。

服务端按覆盖写处理。片号是对象名的一部分，第二次 PUT 覆盖第一次，ETag 换成新的，位图上那一位本来就是一，SETBIT 再写一次没有副作用。

会出问题的是收尾。两个客户端同时调 Complete，一个成功，另一个拿到 NoSuchUpload。

| 场景 | 现象 | 处理 |
|---|---|---|
| 同一片重复上传 | 后到的覆盖先到的 | 片号做对象名，天然幂等 |
| 并发调 Complete | 一个成功，另一个报 NoSuchUpload | 捕获后查 HeadObject，对象在就返回成功 |
| 位图标记成功但 PUT 实际失败 | 续传时跳过了一片 | 顺序反过来：先 PUT 成功，再 SETBIT |
| 分片大小和声明不一致 | Complete 报 InvalidPart | 服务端记录每片大小和 ETag，合并前校验 |

顺序那条是踩过的。最早先 SETBIT 再发响应，客户端收到响应前连接断了，服务端以为这片好了，客户端以为没好，续传时两边对不上。

## 耗时定位与边界

把一次 120MB 上传按阶段打点，一次性版本和分片版本各跑三次取中位数。测试环境，本机 MinIO，同一块 SSD。

| 阶段 | 一次性上传 | 分片上传 | 说明 |
|---|---|---|---|
| 网络接收 | 4.1s | 1.6s | 分片 4 路并行，总字节不变 |
| 临时文件落盘 | 1.2s | 0.3s | 分片直接落对象存储 |
| SHA-256 校验 | 1.6s | 0.2s | 移到异步，响应路径只剩建记录 |
| 元数据、序列化与响应 | 1.3s | 0.1s | 少一次临时文件拷贝 |
| 合计 | 8.2s | 2.2s | 三次的中位数 |

最能说明问题的是网络那一行。总字节一个没少，耗时少了 2.5 秒，原因是 20 片并发走 4 条连接，而不是一个 120MB 的请求体在单连接上排队。校验那一行有争议。哈希没有消失，只是从响应路径挪到了后台任务，用户拿到 200 的时候校验还没做完。如果业务要求"上传完就能确认文件完好"，这一步得留在前面，耗时会回到 3.5 秒左右。

合并耗时单独看是 0.15 秒上下，可以忽略。耗时之外，剩下的边界集中在几条固定限制上。位图过期要提前告诉客户端，TTL 设 24 小时，第二天点继续上传，位图已经没了，服务端只能返回一个新的 uploadId。

| 边界 | 具体限制 | 应对 |
|---|---|---|
| 分片数上限 | S3 协议 10000 片 | 按文件大小动态算片大小；5MiB 的片撑到 48GiB 左右就顶到上限 |
| 位图过期 | TTL 24 小时 | 过期后 uploadId 作废，客户端从头传 |
| 分片大小下限 | 除最后一片外不小于 5MiB | 小于这个值 Complete 直接报错 |
| 并发 Complete | 两个客户端同时收尾 | 幂等处理，对象存在即成功 |
| 位图内存 | 1000 万片约 1.25MB | 单文件片数远低于此，不用管 |

## 总结

1. 分片大小按文件分布定，100MB 到 200MB 用 5MB，20 到 40 片，重传代价和请求开销都还能接受。
2. 位图管"到了没有"，ETag 管"对不对"，两件事分开存。
3. 幂等靠片号做对象名，重复上传覆盖写；Complete 的重复调用要单独处理。
4. 八秒到两秒，省下来的是串行等待和校验的位置，总字节数没变。
5. 这套设计的寿命受 10000 片限制，文件再大要换协议。

## 参考资料

- [SETBIT | Redis Docs](https://redis.io/docs/latest/commands/setbit/)
- [BITCOUNT | Redis Docs](https://redis.io/docs/latest/commands/bitcount/)
- [Uploading objects using multipart upload | Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)

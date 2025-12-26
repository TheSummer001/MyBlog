---
title: Redis 入门指南：从安装到 Spring Boot 集成
date: 2025-12-26 19:45:00
updated: 2025-12-26 19:45:00
tags:
  - Redis
  - NoSQL
  - Java
  - SpringBoot
categories:
  - 后端技术
  - 数据库
keywords: Redis, docker, Spring Data Redis, Jedis
description: Redis 基础概念、Docker 安装教程、常用命令详解以及 Jedis 和 Spring Data Redis 的集成实战。
---

# Redis 入门

Redis 是一种 **[NoSQL](https://blog.csdn.net/zhizhengguan/article/details/120608187)**（Not Only SQL）数据库。

![](Redis%20入门指南：从安装到%20Spring%20Boot%20集成/file-20251226190528309.png)

### 核心特征

- **键值(key-value)型**：Value 支持 String、List、Hash、Set、SortedSet 等多种数据结构。
- **单线程**：每个命令具备原子性，避免了多线程上下文切换带来的损耗。
- **低延迟，速度快**：基于内存存储、采用 IO 多路复用技术、以及良好的底层编码。
- **功能丰富**：支持数据持久化、主从集群、分片集群、发布订阅等。
- **多语言客户端**：支持 Java、Python、Go 等多种语言。

### Docker 启动 Redis

#### 创建配置文件

创建目录并将官方 `redis.conf` 拷贝进来。

```bash
mkdir -p /root/redis/conf
mkdir -p /root/redis/data
# 此时需确保 /root/redis/conf 下有 redis.conf 文件
```

`redis.conf` 官方下载地址：[Redis configuration](https://redis.io/docs/latest/operate/oss_and_stack/management/config/)

#### 修改配置文件 (`redis.conf`)

建议修改以下核心配置：

```Properties
# 注释掉 bind，允许远程访问
# bind 127.0.0.1

# 关闭保护模式，允许远程访问
protected-mode no

# 守护进程模式保持 no，因为 Docker 本身就是守护进程
daemonize no

# 开启 AOF 持久化（推荐）
appendonly yes

# 设置访问密码
requirepass 123456
```

#### 启动容器

```bash
docker run -d \
  -p 6379:6379 \
  --name redis \
  --restart=always \
  -v /root/redis/conf/redis.conf:/etc/redis/redis.conf \
  -v /root/redis/data:/data \
  redis \
  redis-server /etc/redis/redis.conf
```

**参数解析：**

- `-p 6379:6379`：端口映射（主机端口:容器端口）。
    
- `-v`：挂载数据卷，将主机目录映射到容器内部，防止重启后数据丢失。
    
- `redis-server /etc/redis/redis.conf`：指定容器启动时加载挂载的配置文件。
    

### 客户端

1. **命令行客户端 (redis-cli)**
    
    ```Bash
    redis-cli [options] [commands]
    ```
    
    - `-h 127.0.0.1`：指定连接的 IP。
        
    - `-p 6379`：指定端口。
        
    - `-a password`：指定密码。
        
2. **图形化客户端**
    
    - **RedisInsight / RDM**：[GitHub 源码](https://github.com/RedisInsight/RedisDesktopManager)
        
    - **Windows 编译版**：[下载地址](https://github.com/lework/RedisDesktopManager-Windows/releases)
        
3. **Java 客户端**
    
    - **Jedis**：老牌客户端，API 类似 Redis 命令，但在多线程环境下非线程安全（需配合连接池）。
        
    - **Lettuce**：基于 Netty，支持同步、异步和响应式，线程安全（Spring Data Redis 默认底层）。
        

### 常见数据结构

|**类型**|**描述**|**典型场景**|
|---|---|---|
|**String**|字符串，最基础类型|缓存、计数器、Session 共享|
|**Hash**|散列，类似 Java HashMap|存储对象（如用户信息）|
|**List**|双向链表|消息队列、最新动态|
|**Set**|无序集合，自动去重|点赞用户、交集并集（共同好友）|
|**SortedSet**|有序集合 (ZSet)|排行榜|

Key 的结构建议：

Redis 的 Key 允许使用冒号分隔形成层级，例如：项目名:业务名:类型:id。

### 常用命令

可以在控制台通过 `help [命令]` 查看具体用法。

#### 通用命令

|**命令**|**说明**|**注意事项**|
|---|---|---|
|`KEYS pattern`|查找符合模式的 Key|**生产环境禁用**，O(N) 复杂度会导致阻塞|
|`DEL key`|删除 Key||
|`EXISTS key`|判断是否存在||
|`EXPIRE key seconds`|设置过期时间||
|`TTL key`|查看剩余存活时间|-1 永不过期，-2 已过期|

#### String 操作

|**命令**|**说明**|
|---|---|
|`SET key value`|添加或修改|
|`GET key`|获取值|
|`INCR key`|自增 1|
|`SETNX key value`|仅当 key 不存在时设置（用于分布式锁）|
|`SETEX key seconds value`|设置值并指定过期时间|

#### Hash 操作

|**命令**|**说明**|
|---|---|
|`HSET key field value`|设置 Hash 字段值|
|`HGET key field`|获取 Hash 字段值|
|`HGETALL key`|获取所有字段和值|
|`HINCRBY key field increment`|字段值自增|

#### List 操作

|**命令**|**说明**|
|---|---|
|`LPUSH` / `RPUSH`|左侧/右侧推入元素|
|`LPOP` / `RPOP`|左侧/右侧弹出元素|
|`LRANGE key start end`|查看指定范围元素|
|`BLPOP` / `BRPOP`|阻塞式弹出（用于简单的消息队列）|

#### Set 操作

|**命令**|**说明**|
|---|---|
|`SADD`|添加元素|
|`SREM`|移除元素|
|`SINTER` / `SUNION` / `SDIFF`|交集 / 并集 / 差集|

#### SortedSet 操作

默认升序，降序使用 `ZREV` 开头的命令。

|**命令**|**说明**|
|---|---|
|`ZADD key score member`|添加元素及其分数|
|`ZRANK key member`|获取排名（从0开始）|
|`ZRANGE key min max`|按排名范围获取元素|
|`ZRANGEBYSCORE`|按分数范围获取元素|

### Jedis 使用

#### 引入依赖

```XML
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>3.7.0</version>
</dependency>
```

#### 连接池模式（推荐）

Jedis 实例非线程安全，必须使用连接池。

```Java
public class JedisConnectionFactory {
    private static final JedisPool jedisPool;

    static {
        JedisPoolConfig jedisPoolConfig = new JedisPoolConfig();
        jedisPoolConfig.setMaxTotal(8);
        jedisPoolConfig.setMaxIdle(8);
        jedisPoolConfig.setMinIdle(0);
        jedisPoolConfig.setMaxWaitMillis(1000);
        
        jedisPool = new JedisPool(jedisPoolConfig, "192.168.150.101", 6379, 1000, "123456");
    }

    public static Jedis getJedis() {
        return jedisPool.getResource();
    }
}
```

#### 使用与释放

```Java
@Test
void testJedis() {
    // 1. 获取连接
    try (Jedis jedis = JedisConnectionFactory.getJedis()) {
        // 2. 执行命令
        jedis.set("name", "Jack");
        String name = jedis.get("name");
        System.out.println("Name = " + name);
    } // try-with-resources 会自动关闭连接
}
```

### Spring Data Redis

Spring Data Redis 提供了统一的 API (`RedisTemplate`) 来操作 Redis，底层默认使用 Lettuce。

#### 引入依赖

```XML
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-pool2</artifactId>
</dependency>
```

#### 配置 YAML

```YAML
spring:
  redis:
    host: 192.168.150.101
    port: 6379
    password: 123456
    lettuce:
      pool:
        max-active: 8
        max-idle: 8
        min-idle: 0
        max-wait: 100ms
```

#### 自定义 RedisTemplate (JSON 序列化)

默认的 `RedisTemplate` 使用 JDK 序列化，可读性差且占用空间大。推荐使用 JSON 序列化。

```Java
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // 创建 JSON 序列化工具
        GenericJackson2JsonRedisSerializer jsonRedisSerializer = new GenericJackson2JsonRedisSerializer();

        // 设置 Key 的序列化
        template.setKeySerializer(RedisSerializer.string());
        template.setHashKeySerializer(RedisSerializer.string());

        // 设置 Value 的序列化
        template.setValueSerializer(jsonRedisSerializer);
        template.setHashValueSerializer(jsonRedisSerializer);

        return template;
    }
}
```

#### 使用 StringRedisTemplate (手动序列化)

为了节省空间（不存储 `@class` 类型信息），可以使用 `StringRedisTemplate` 并配合 JSON 工具手动处理。

```Java
@Autowired
private StringRedisTemplate stringRedisTemplate;

private static final ObjectMapper mapper = new ObjectMapper();

@Test
void testStringTemplate() throws JsonProcessingException {
    User user = new User("Jack", 18);
    
    // 1. 手动序列化
    String json = mapper.writeValueAsString(user);
    
    // 2. 写入 Redis
    stringRedisTemplate.opsForValue().set("user:200", json);
    
    // 3. 读取数据
    String val = stringRedisTemplate.opsForValue().get("user:200");
    
    // 4. 反序列化
    User userResult = mapper.readValue(val, User.class);
    System.out.println("User = " + userResult);
}
```

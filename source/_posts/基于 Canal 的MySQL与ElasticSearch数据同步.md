---
title: 基于 Canal 的MySQL与ElasticSearch数据同步
date: 2026-01-15 15:16:05
updated: 2026-01-15 15:16:05
tags:
  - MySQL
  - Elasticsearch
categories:
  - 后端技术
  - 数据库
keywords: MySQL,Elasticsearch,Canal
description: 记录 Canal 1.1.8 部署实战：如何配置 deployer 和 adapter，实现 MySQL 到 ES 的数据实时同步，内附完整踩坑与解决记录。
---

## 使用的环境版本

- canal-deployer 1.18
- canal-adapter 1.18
- MySQL 8.4
- ElasticSearch 7.13.2

## 环境准备

ElasticSearch 与 kibana 未安装的可以看这篇,[windows 安装 Elasticsearch_windows安装elasticsearch-CSDN博客](https://blog.csdn.net/qq_41860765/article/details/146364126)

### MySQL

1. 确认开启binlog

windows下找到MySQL的安装目录，修改 `my.cnf`



2. 添加内容

```properties
[mysqld] 
log-bin=mysql-bin
binlog-format=ROW
server-id=102
```

3. 重启MySQL

4. 验证 binlog 是否已开启, Value的值显示未 ON 则表示已开启

```
SHOW VARIABLES LIKE 'log_bin';
```

5. 在MySQL单独为canal建立一个新账户并授权

```sql
CREATE USER canal IDENTIFIED BY 'canal';    
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'canal'@'%';  
-- GRANT ALL PRIVILEGES ON *.* TO 'canal'@'%' ;  
FLUSH PRIVILEGES; 
```



 ### Canal-deployer

1. canal下载地址[Releases · alibaba/canal](https://github.com/alibaba/canal/releases)，canal.deployer 和 canal.adapter 都需要下载

![image-20250723182321075](assets/基于Canal的MySQL与ElasticSearch数据同步/image-20250723182321075.png)

2. 将下载的压缩包解压到目录，

进入canal.deployer-1.1.8\conf\example，打开instance.properties，修改数据库相关配置信息

![image-20250723183009285](./assets/基于Canal的MySQL与ElasticSearch数据同步/image-20250723183009285.png)
3. 在\canal.deployer-1.1.8\bin目录下，输入cmd打开命令提示符

![image-20250723184435306](assets/基于Canal的MySQL与ElasticSearch数据同步/image-20250723184435306.png)
4. 在 cmd 中输入 startup.bat 启动canal-deployer

   注意：一定要在bin目录下执行startup.bat，否则会报错无法创建日志文件

### Canal-adopter

1. 解压文件并进入canal.adapter-1.1.8\conf\bootstrap.yml，将其中的内容全部注释掉，否则提示XX表找不到

![image-20250723185601022](assets/基于Canal的MySQL与ElasticSearch数据同步/image-20250723185601022.png)
2. 再修改canal.adapter-1.1.8\conf\的 application.yml文件，

   canal.properties 是 canal.deployer-1.1.8\conf下的文件

![image-20250723185720624](assets/基于Canal的MySQL与ElasticSearch数据同步/image-20250723185720624.png)
这里的坑，一般是MySQL的账号密码不对，或者给的es链接没有``“http://”``前缀

3. 修改在application.yml中配置的数据源 es7 文件夹的内容，es监听哪个表，创建对应的tablename.yml,并且加入对应的sql映射

![image-20250723190557215](assets/基于Canal的MySQL与ElasticSearch数据同步/image-20250723190557215.png)

```yml
dataSourcekey：defaultDS #源数据源的key，对应上面配置的srcDataSources中的值
destination:example # canal的instance或者MQ的topic
groupId：g1 #对应MQ模式下的groupId，只会同步对应groupId的数据
esMapping:
	_index：article #es的索引l名称
	_id：_id#es 的_id，如果不配置该项必须配置下面的pk项_id则会由es自动分配
sql: "SELECT t.id AS _id,t.id,t.user_id,t.article_type,t.title,t.short_title,t.picture,
		t.summary,t.category_id,t.source,t.source_url,t.offical_stat,t.topping_stat,
		t.cream_stat,t.`status`,t.deleted,t.create_time,t.update_time
		FROM article t"  #sql映射
commitBatch：1   #提交批大小,每次都进行同步
```

4. 在kibana中创建ES的表索引

5. 记事本打开canal.adapter-1.1.8\bin\startup.bat

   将CLASSPATH分号隔开的部分前后交换位置

   ![image-20250723191153226](assets/基于Canal的MySQL与ElasticSearch数据同步/image-20250723191153226.png)

6. 在\canal.adapter-1.1.8\bin目录下，输入cmd打开命令提示符，在 cmd 中输入 startup.bat 启动 canal-adapter





到此为止，就完成了MySQL和ElasticSearch的Canal同步连接打通
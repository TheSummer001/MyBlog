---
title: 排查 MyBatis 分页查询出现完全重复记录的问题
date: 2026-04-29 15:40:00
tags:
  - MyBatis
  - SQL
  - 问题排查
  - PostgreSQL
categories:
  - 后端开发
  - 踩坑记录
description: 记录了一次 MyBatis 分页查询返回重复数据的排查与修复过程。分析由缺失逻辑删除过滤引发的笛卡尔积问题，以及排序字段不稳定带来的分页隐患，并给出了完善状态校验、应用层去重及稳定排序规则的完整解决方案
---

## 背景描述

在测试用户列表的分页查询接口时，发现返回的 `records` 列表中存在两条完全一模一样的数据。

返回的 JSON 结构简化如下：

```json
{
  "data": {
    "records": [
      {
        "userId": "10086...",
        "userName": "UserA",
        "phone": "138****0000",
        "roleId": "65498...",
        "statusCd": "1000",
        ...
      },
      {
        "userId": "10086...",
        "userName": "UserA",
        "phone": "138****0000",
        "roleId": "65498...",
        "statusCd": "1000",
        ...
      }
    ],
    "total": "2"
  }
}
````

针对主键（userId）相同的重复数据，通常的原因是 SQL 在进行多表 `JOIN` 时产生了笛卡尔积。以下是针对该问题的排查与修复过程。

## 原始 SQL 分析

提取了接口对应的 MyBatis Mapper XML，核心逻辑如下（已省略不相关的查询条件）：

```XML
SELECT
    usr.*,
    role_agg.role_id,
    role_agg.role_name
FROM "user" usr
LEFT JOIN (
    -- 角色聚合子查询
    SELECT
        urr.user_id,
        MIN(r.role_id) AS role_id,
        STRING_AGG(DISTINCT r.role_name, ',') AS role_name
    FROM user_role_rel urr
    INNER JOIN role r ON r.role_id = urr.role_id AND r.status_cd = '1000'
    WHERE urr.status_cd = '1000'
    GROUP BY urr.user_id
) role_agg ON role_agg.user_id = usr.user_id
<if test="userCO.tenantId != null and userCO.tenantId != ''">
    LEFT JOIN tenant_user_rel tusr ON tusr.user_id = usr.user_id AND tusr.tenant_id = #{userCO.tenantId}
</if>
WHERE usr.status_cd = '1000'
<if test="userCO.tenantId != null and userCO.tenantId != ''">
    AND tusr.tenant_id = #{userCO.tenantId}
</if>
ORDER BY usr.create_date ASC
```

初步排查了 `role_agg` 子查询，由于内部使用了 `GROUP BY urr.user_id`，保证了每个用户仅输出一行角色聚合数据，因此排除了角色表引起重复的可能。

疑点集中在 `tenant_user_rel`（租户用户关联表）的 `LEFT JOIN` 上。

## 数据排查

在数据库客户端针对异常用户的数据进行排查：

1. **检查主表**：执行 `SELECT * FROM "user" WHERE user_id = '异常ID'`，确认主表中仅有一条记录。
    
2. **检查关联表**：执行 `SELECT * FROM tenant_user_rel WHERE user_id = '异常ID'`，发现该用户在同一租户下存在两条关联记录：
    
    - 一条 `status_cd = '1000'`（有效数据）
        
    - 一条 `status_cd = '2000'`（历史无效/逻辑删除数据）
        

## 问题原因

综合代码与数据状态，定位到问题的根本原因：

1. **缺失有效性过滤**：在 MyBatis XML 中，针对 `tenant_user_rel` 表的关联（不论是 `ON` 还是 `WHERE` 阶段），均漏写了 `status_cd = '1000'` 的状态校验条件。
    
2. **笛卡尔积**：由于该用户刚好存在一条脏数据（`2000` 状态），`LEFT JOIN` 在匹配时将主表的一条记录与关联表的两条记录匹配，最终查出了两条数据。外层主记录字段完全一致，导致接口返回了两条一样的 JSON 对象。
    
3. **潜在隐患（排序不稳定）**：原 SQL 的分页排序仅使用了 `ORDER BY usr.create_date ASC`。在多条数据创建时间一致的情况下，MySQL/PostgreSQL 等数据库的排序是不稳定的，可能导致分页数据出现随机重复或遗漏。
    

## 修复与优化方案

为了彻底解决问题并提升 SQL 的健壮性，进行了以下调整：

1. **修复数据过滤**：补充 `status_cd = '1000'` 条件。
    
2. 在获取到查询结果集后，根据 userId 的唯一性再进行去重兜底


## 总结

1. **注意逻辑删除字段**：在涉及包含软删除设计（`status_cd` / `is_deleted`）的业务表关联时，必须时刻警惕是否在 `JOIN` 条件或查询条件中加上了有效性限制。
    
2. **区分 JOIN 与 EXISTS**：如果仅仅是为了做条件判断（验证关系是否存在），而不提取副表的字段用于结果展示，应优先考虑使用 `EXISTS`，能有效规避一对多关联导致的笛卡尔积风险，且查询计划往往更优。
    
3. **规范分页排序**：只要涉及分页查询（`LIMIT` + `OFFSET`），`ORDER BY` 字段必须具备唯一性（通常用主键兜底）。
# CLAUDE.md

> 本文档为 Claude Code 提供博客仓库的上下文信息，帮助 AI 更好地理解和维护此项目。

## 相关文档

| 文档 | 路径 | 说明 |
|-----|------|-----|
| AGENT.md | `./AGENT.md` | AI Agent 工作规范和行为准则 |
| Memory | `.claude/projects/F--KaiFa-MyBlog/memory/` | 用户偏好、写作风格、项目配置的持久化记忆 |

> **重要**: 新对话时，请先阅读 `MEMORY.md` 索引文件，了解用户画像和写作偏好。

## 项目概述

这是一个基于 **Hexo** 静态博客框架和 **Butterfly** 主题的个人技术博客。

- **站点名称**: TooonRan's Blog
- **作者**: TooonRan
- **主题**: Butterfly
- **语言**: zh-CN
- **部署域名**: https://blog.tooonran.xyz

## 部署架构

```
GitHub 仓库 → Vercel 自动构建 → Cloudflare CDN → 用户访问
```

- **静态托管**: Vercel
- **CDN & 域名**: Cloudflare
- **自动部署**: 推送到 GitHub main 分支自动触发 Vercel 构建

## 常用命令

```bash
# 本地预览
hexo server

# 生成静态文件
hexo generate

# 清理缓存
hexo clean

# 新建文章
hexo new post "文章标题"
```

> **注意**: 部署通过 Git 推送自动触发，无需执行 `hexo deploy`。

## 目录结构

```
MyBlog/
├── source/
│   ├── _posts/          # 文章 Markdown 源文件
│   ├── _data/           # 自定义数据文件
│   ├── css/             # 自定义 CSS
│   ├── js/              # 自定义 JavaScript
│   └── img/             # 图片资源
├── themes/
│   └── butterfly/       # Butterfly 主题
├── _config.yml          # Hexo 主配置
├── _config.butterfly.yml # Butterfly 主题配置
└── package.json
```

## 主题定制要点

### 导航栏配置
位置: `_config.butterfly.yml` 的 `menu` 字段

```yaml
menu:
  首页: / || fas fa-home
  归档: /archives/ || fas fa-archive
  标签: /tags/ || fas fa-tags
  分类: /categories/ || fas fa-folder-open
  关于: /about/ || fas fa-heart
```

### 评论系统
使用 **Giscus** 作为评论系统，基于 GitHub Discussions。

配置位置: `_config.butterfly.yml` 的 `giscus` 字段

```yaml
giscus:
  repo: TheSummer001/MyBlog
  repo_id: R_kgDOQqxFMg
  category_id: DIC_kwDOQqxFMs4Cz9KU
```

### 自定义资源注入
位置: `_config.butterfly.yml` 的 `inject` 字段

**CSS 注入**:
- `/css/custom.css` - 自定义样式
- `/css/universe.css` - 星空背景效果

**JS 注入**:
- `/js/universe.js` - 星空背景动画
- `/js/rightmenu.js` - 自定义右键菜单
- `/js/runtime.js` - 运行时间统计
- `/js/love_time.js` - 恋爱计时

### CDN 配置
```yaml
CDN:
  internal_provider: local
  third_party_provider: jsdelivr
```

### 特色功能
- **深色模式**: 默认开启 (`display_mode: dark`)
- **打字机效果**: 首页副标题打字机动画
- **本地搜索**: 基于 hexo-generator-search
- **字数统计**: 启用 hexo-wordcount
- **不蒜子统计**: 页面访问量统计

## 文章写作规范

### Frontmatter 必填字段

```yaml
---
title: 文章标题
date: YYYY-MM-DD HH:mm:ss
tags:
  - 标签1
  - 标签2
categories:
  - 分类1
  - 分类2
description: 文章描述（用于 SEO 和首页摘要）
---
```

### 可选字段

```yaml
updated: YYYY-MM-DD HH:mm:ss    # 更新时间
keywords: 关键词1, 关键词2       # SEO 关键词
```

### 写作风格指南

1. **结构**: 采用「背景/引言 → 问题分析 → 解决方案 → 总结」的三段式结构
2. **代码块**: 使用带语言标识的代码块，如 \`\`\`java、\`\`\`bash
3. **表格**: 用于对比和总结信息
4. **提示块**: 使用 `> **注意**:` 或 `> **Tips**:` 格式
5. **总结**: 文章末尾应有总结部分，提炼核心要点

## 图片资源管理

- 文章图片存放在 `source/_posts/文章标题/` 目录下
- 全局图片存放在 `source/img/` 目录下
- 使用相对路径引用: `![](图片名.png)`

## Git 提交规范

提交信息必须以以下前缀开头：

| 前缀 | 含义 | 示例 |
|-----|------|-----|
| `fix` | 修复 Bug 或问题 | `fix: 修复文章图片路径错误` |
| `feature` | 新增功能或配置 | `feature: 添加文章目录导航` |
| `publish` | 发布新文章 | `publish: 记一次 Redis 缓存穿透排查` |

**提交流程**:
```bash
git add .
git commit -m "publish: 文章标题"
git push
```

> **注意**: 推送后 Vercel 会自动触发部署，无需手动操作。

## 注意事项

1. **不要直接修改主题源码**: 主题配置通过 `_config.butterfly.yml` 覆盖
2. **自定义 CSS/JS**: 通过 `inject` 配置注入，而非直接修改主题文件
3. **文章描述**: 每篇文章必须填写 `description`，用于 SEO 和首页展示
4. **分类层级**: 支持多级分类，使用列表形式

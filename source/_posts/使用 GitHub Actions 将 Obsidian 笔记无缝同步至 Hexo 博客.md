---
title: 极客工作流：使用 GitHub Actions 将 Obsidian 笔记无缝同步至 Hexo 博客
date: 2026-04-30 15:35:00
tags:
  - Obsidian
  - Hexo
  - 效率工具
  - 博客搭建
categories:
  - 个人知识管理
---
一直以来，我的个人知识管理和博客输出是割裂的。我在私密的纯 Markdown 仓库（配合 Obsidian）里记录日常和技术踩坑，但如果想发布一篇博客，就需要手动把文档复制到 Hexo 仓库的 `source/_posts` 目录下，再走一遍部署流程。

为了贯彻“能自动化就绝不手敲”的开发原则，今天折腾了一套优雅的解决方案：**利用 GitHub Actions 实现从私有笔记仓库到公开 Hexo 博客的单向全自动同步。**

这篇文章，就是在这套全新工作流下测试发布的第一篇文章！🎉

## 1. 架构思路：单向镜像同步

目前的仓库状态：
*   **私有笔记仓库** (`personal-note`)：存放我所有的 Obsidian 笔记、本地配置以及草稿。这是唯一的真相之源。
*   **公开博客仓库** (`MyBlog`)：存放 Hexo 框架源代码，通过 Vercel 自动部署。

**目标**：在 `personal-note` 中划定一个公开目录（例如 `BlogPublic/`），每次在本地更新这个目录里的 Markdown 文件并 Push 后，GitHub Actions 自动提取这些文件，精准推送到 `MyBlog` 的 `source/_posts` 目录下，随后触发 Vercel 构建上线。

## 2. 第一步：整理私有仓库与 Git 忽略

既然要将 Obsidian 仓库推送到云端，首先要保证隐私和仓库体积，不能把本地插件配置全传上去。

我们在 `.gitignore` 中忽略了隐藏文件夹：
```gitignore
.agents/
.claude/
.obsidian/
.playwright/
````

如果这些文件之前已经被追踪过，需要先在终端清除 Git 缓存：

```Bash
git rm -r --cached .obsidian .claude skills-lock.json
```

## 3. 第二步：编写 GitHub Actions 工作流

在私有笔记仓库中，创建文件 `.github/workflows/sync-blog.yml`。

这里使用了一个非常强大的开源 Action 插件 `cpina/github-action-push-to-another-repository`。最核心的配置在于利用 `target-directory` 将文件精准空投到 Hexo 的文章目录下，避免了目录结构不匹配的问题。

```YAML
name: Sync to Hexo Blog

on:
  push:
    branches: [ main ]
    paths:
      - 'PublicBlog/**' # 触发条件：只有公开博客目录变动时才执行

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout personal notes
        uses: actions/checkout@v3
      
      - name: Push to Hexo source/_posts
        uses: cpina/github-action-push-to-another-repository@main
        env:
          API_TOKEN_GITHUB: ${{ secrets.API_TOKEN_GITHUB }}
        with:
          source-directory: 'PublicBlog'
          destination-github-username: 'your_github_name'
          destination-repository-name: 'your_destination_repository_name' #你的目标仓库
          user-email: 'your_email@example.com' 
          target-branch: 'main'
          target-directory: 'source/_posts' # ✨ 重点：直接推送到 Hexo 的文章存放地
```

## 4. 第三步：配置 GitHub PAT 权限

为了让 Action 能够跨仓库提交代码，需要生成一个包含 `repo` 权限的 **Personal Access Token (PAT)**。

在私有仓库的 `Settings -> Secrets and variables -> Actions` 中，新建一个 Secret：

- **Name**: `API_TOKEN_GITHUB`
    
- **Secret**: 填入刚生成的 PAT。


## 5. 测试推送

在 PublicBlog 中新建一篇文章并推送到仓库中，即可触发 GitHub Workflow，自动推送到另一个目标仓库的对应位置，进而触发自动构建

> [!note] 注意
>1. 如果博客的文件夹中有之前发布到文章，在推送 Workflow 之前，提前复制到 PublicBlog 并推送到笔记仓库中一次， 否则可能会造成重复发布的问题
>2. 该 Workflow 只能单向监听，不能实时同步博客仓库中的内容
> 


## 结语

完成上述配置后，现在的博客发布体验简直如丝般顺滑：**在 Obsidian 沉浸式写作 -> 加上 Hexo 的 YAML 表头 -> Git Push -> 关掉电脑喝口水，博客就已经自动上线了。**

这套工作流彻底消除了管理两个仓库的心智负担。如果你也有用 Obsidian 管理个人知识体系，并希望将其与静态博客结合的需求，强烈推荐这套方案！

如果你有更好的方案，欢迎来一起交流！
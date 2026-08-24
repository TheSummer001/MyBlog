# MyBlog

个人博客源码仓库。项目使用 [Hexo](https://hexo.io/) 生成静态站点，以 Butterfly 为主题，并通过 Vercel 构建和发布。

这份 README 主要用于记录日常写作、维护和部署所需的信息，也方便公开仓库的访问者快速了解项目结构。

## 技术栈

- [Hexo](https://hexo.io/)：静态博客生成器
- [Butterfly](https://github.com/jerryc127/hexo-theme-butterfly)：博客主题，本仓库内保留了定制代码
- Node.js 与 npm：依赖管理和本地开发环境
- JavaScript、YAML、Markdown：脚本、配置与文章内容
- Vercel：持续部署与静态站点托管

## 本地运行

先安装 Node.js 和 npm，然后在仓库根目录执行：

```bash
npm install
npx hexo server
```

开发服务器默认运行在 <http://localhost:4000>。修改文章、页面或主题文件后，刷新页面即可查看结果。

生成生产文件：

```bash
npx hexo clean
npx hexo generate
```

生成结果位于 `public/` 目录。

## 目录结构

```text
.
├── _config.yml              # Hexo 站点配置
├── _config.butterfly.yml    # Butterfly 主题配置
├── package.json             # Node.js 依赖与项目脚本
├── scaffolds/               # Hexo 文章和页面模板
├── scripts/                 # 本项目的 Hexo 扩展与构建校验
├── source/
│   ├── _posts/              # 已发布文章
│   ├── _drafts/             # 草稿
│   └── _data/               # 友链等结构化数据
├── test/                    # 自定义脚本测试
├── themes/
│   └── butterfly/           # Butterfly 主题及本地定制
└── public/                  # Hexo 生成的静态站点（构建产物）
```

## 内容维护

### 新建文章

```bash
npx hexo new post "文章标题"
```

新建草稿并在本地预览：

```bash
npx hexo new draft "文章标题"
npx hexo server --draft
```

将草稿发布为文章：

```bash
npx hexo publish "文章标题"
```

### 文章资源

文章图片和附件采用与文章文件名绑定的目录结构。假设文章为：

```text
source/_posts/example.md
```

对应资源应放在：

```text
source/_posts/assets/example/image.png
```

在文章正文以及 `cover`、`top_img` 等 Front Matter 字段中使用：

```markdown
![说明文字](assets/example/image.png)
```

构建时，`scripts/article-assets.js` 会将资源发布到 `/assets/example/`，并执行以下检查：

- 资源目录名必须与文章文件名一致；
- 被引用的文件必须存在且为普通文件；
- 资源路径不能越过当前文章的资源目录，也不能包含符号链接；
- 缺失或非法引用会导致构建失败；
- 未被文章引用的资源会产生警告，且不会发布。

### 友链数据

友链数据位于 `source/_data/friends.yml`。每一项至少需要 `name`、`link` 和 `descr`；主页链接必须使用 HTTPS。`avatar` 可使用站内绝对路径或 HTTPS URL。

## 环境变量

当前博客为静态站点，源码中没有必填的运行时环境变量，本地开发和基础构建无需创建 `.env` 文件。

如果以后接入需要密钥的评论、统计或第三方服务：

- README 只记录变量名、用途、是否必填和占位示例；
- 真实值只保存在本地未提交的环境文件或 Vercel Environment Variables 中；
- 不要把令牌、账号、私钥或部署凭据提交到 Git。

## 部署

项目通过 Vercel 部署。将 GitHub 仓库导入 Vercel 后，使用 Hexo 的标准静态构建方式即可：

- Install Command：`npm install`（也可由 Vercel 自动检测）
- Build Command：`npx hexo generate`
- Output Directory：`public`
- 必填环境变量：无

配置完成后，推送到 Vercel 关联的生产分支会触发新的构建和部署。部署前建议先在本地完成一次干净构建。

## 常用维护命令

| 操作 | 命令 |
| --- | --- |
| 安装依赖 | `npm install` |
| 启动本地服务 | `npx hexo server` |
| 预览草稿 | `npx hexo server --draft` |
| 清理构建缓存 | `npx hexo clean` |
| 生成静态站点 | `npx hexo generate` |
| 新建文章 | `npx hexo new post "文章标题"` |
| 新建草稿 | `npx hexo new draft "文章标题"` |
| 发布草稿 | `npx hexo publish "文章标题"` |
| 运行 Node.js 测试 | `node --test` |

推荐在提交前执行：

```bash
npx hexo clean
node --test
npx hexo generate
```

最后再本地检查首页、文章页、资源链接、搜索和友链页面是否正常。

## 配置入口

- 站点标题、URL、文章路径等 Hexo 配置：`_config.yml`
- 导航、外观、评论、搜索等主题配置：`_config.butterfly.yml`
- 自定义构建逻辑：`scripts/`
- Butterfly 主题定制：`themes/butterfly/`

修改配置后，建议先执行 `npx hexo clean`，再重新启动开发服务器或生成站点，避免旧缓存影响结果。

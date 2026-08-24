# Project Guide

This tracked file is the neutral, cross-machine owner for the repository's shared project rules. The local `AGENTS.md` is only an ignored Agent entrypoint that points here; it is not a source of project policy.

## Project shape

- This is a Hexo 8 + Butterfly technical blog. Site configuration lives in `_config.yml`; Butterfly overrides live in `_config.butterfly.yml`.
- Posts live in `source/_posts/`, standalone pages in `source/about/`, `source/categories/`, and `source/tags/`.
- Custom CSS, JavaScript, and images live in `source/css/`, `source/js/`, and `source/img/`. Theme templates live in `themes/butterfly/layout/`.
- `post_asset_folder` is disabled. Article-owned resources live below an `assets/<post filename>/` directory beside the Markdown file. For example, `source/_posts/Java/docker.md` references `source/_posts/Java/assets/docker/diagram.png` as `assets/docker/diagram.png`. The project-local Hexo resource adapter validates and publishes these paths; do not use the legacy same-name post folder convention.

## Owner selection

Choose the smallest canonical owner before editing:

1. Post/page content and metadata: the relevant file under `source/`.
2. Site-wide Hexo behavior: `_config.yml` and its companion config files.
3. Butterfly behavior or theme options: `_config.butterfly.yml` first.
4. Blog-specific presentation: existing overrides under `source/css/`, `source/js/`, and `source/img/`; preserve `source/css/observatory.css`, `source/js/observatory-theme.js`, and the existing home template where applicable.
5. Theme structure: `themes/butterfly/layout/` only when configuration or `source/` overrides cannot express the change.

Prefer configuration and `source/` overrides over editing Butterfly source. Keep YAML at two-space indentation and follow the existing Pug, Stylus, and JavaScript style. Article front matter keeps `title`, `date`, `updated`, `tags`, `categories`, `keywords`, and `description`; reuse existing tag spellings.

## Commands and commit gate

- Install from the lockfile: `npm ci`.
- Preview locally: `npm run server`.
- Create generated output: `npm run build`.
- Clear generated/cache state: `npm run clean`.
- Create a post: `npx hexo new post "Title"`.
- Before committing any change, run `npm run clean && npm run build` and inspect the result. This project has no automated test suite; do not describe a build as visual or runtime acceptance.

Do not commit `public/`, `db.json`, `node_modules/`, or `.env`. Do not commit local Agent configuration, caches, indexes, or host-specific files, including `AGENTS.md`, `AGENT.md`, `.codex/`, `.claude/`, and `.codegraph/`. Do not copy local absolute paths or secrets into tracked files.

## Frontend handoff and manual visual acceptance

For changes involving `source/css/`, `source/js/`, page templates, theme configuration, or any asset/script that changes page presentation, the handoff must describe the final version after the last edit. The agent may self-review the diff and report the clean/build result, but the author owns browser-based visual acceptance.

Use this handoff contract:

```text
最终变更范围 (Final change scope): <relative path + purpose of each path>
项目构建结果 (Project build result): npm run clean && npm run build — <passed/failed/not run>; <key output or failure reason>
建议人工检查 (Suggested manual checks): viewports <for example 375x812, 768x1024, 1440x900>; theme modes <light/dark; add system-following when relevant>
人工验收状态 (Manual acceptance status): 待作者验证 (Pending author verification)
```

The manual acceptance status has exactly three states, and each update is appended to the task record rather than overwriting the previous handoff:

1. `待作者验证 (Pending author verification)`: the default state after the agent's self-check and project build. A successful build proves only that the site can be generated, not that the visuals are correct. Before an explicit author reply, the agent must not say that visual acceptance is complete, that the visual issue is resolved, or otherwise make a completion declaration.
2. `作者已接受 (Author accepted)`: set only after the author explicitly accepts or confirms the current final change scope. Append the author's confirmation and time; only then may the agent state that visual acceptance for that revision is complete.
3. `作者发现问题需返工 (Author found issues; rework required)`: set when the author reports a problem in any viewport or theme mode. Append the symptom, reproduction viewport/mode, and rework scope. The current revision is not complete; after rework, rerun the build and create a new `待作者验证 (Pending author verification)` handoff instead of jumping directly to acceptance.

Author responses should be recorded like this:

```text
验收状态更新：作者已接受 (Acceptance status update: Author accepted)
Author confirmation: <exact words or accurate brief paraphrase>; time: <time>
```

or:

```text
验收状态更新：作者发现问题需返工 (Acceptance status update: Author found issues; rework required)
Issue: <symptom>; viewport/theme mode: <scope>; rework scope: <file or behavior>
```

Until explicit author confirmation is received, keep the status as `待作者验证 (Pending author verification)`. Do not treat `git diff --check`, a successful build, agent self-review, or the handoff itself as author acceptance. Before the author's confirmation, do not claim that the visual issue has been accepted or visually verified. When replying to the author, report implementation/build status separately from visual acceptance status.

Keep the bright AI-anime technical observatory direction: professional, restrained, airy blue-white hierarchy with limited amber emphasis; avoid generic templates, excessive neon, and cheap glassmorphism. The homepage Hero should express current technical focus rather than repeat the bio. The canonical blog URL is `https://www.tooonran.top/`, and `portal.enable` remains enabled. Other hostnames should permanently redirect to the canonical `www` hostname at the hosting or DNS layer.

## Delivery boundary

Use `type: 简短说明` for commit messages. The project is personal; use native Git commands for repository delivery. The shared guide is the canonical project policy, while local Agent files remain machine-specific and ignored.

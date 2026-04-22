# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Hexo static blog site using the Butterfly theme. Hexo is a fast, simple, and powerful blog framework powered by Node.js.

## Common Commands

### Development
- `npm run server` or `hexo server` - Start local development server (default: http://localhost:4000)
- `hexo server --port 4001` - Start server on custom port

### Building & Deployment
- `npm run build` or `hexo generate` - Generate static files to `public/` directory
- `npm run clean` or `hexo clean` - Clean generated files and cache
- `npm run deploy` or `hexo deploy` - Deploy site (requires deployment configuration in `_config.yml`)

### Content Management
- `hexo new post "Post Title"` - Create a new blog post
- `hexo new page "Page Title"` - Create a new page
- `hexo new draft "Draft Title"` - Create a draft post

## Architecture

### Directory Structure
- `source/_posts/` - Blog posts in Markdown format
- `source/` - Source files (images, CSS, JS, pages)
- `themes/butterfly/` - Butterfly theme files
- `scaffolds/` - Post/page templates
- `public/` - Generated static site (created by `hexo generate`)

### Configuration Files
- `_config.yml` - Main Hexo configuration (site metadata, URL, plugins, deployment)
- `_config.butterfly.yml` - Butterfly theme configuration (UI, features, integrations)
- `package.json` - Dependencies and npm scripts

### Key Features Enabled
- Post asset folders (`post_asset_folder: true`) - Images stored alongside posts
- Search functionality (hexo-generator-search, hexo-generator-searchdb)
- Sitemap generation (hexo-generator-sitemap)
- Word count (hexo-wordcount)
- Syntax highlighting (highlight.js)

### Post Front Matter
Posts use YAML front matter with these common fields:
```yaml
---
title: Post Title
date: YYYY-MM-DD HH:mm:ss
updated: YYYY-MM-DD HH:mm:ss
tags:
  - Tag1
  - Tag2
categories:
  - Category
  - Subcategory
keywords: keyword1, keyword2
description: Post description
---
```

## Theme Configuration

The Butterfly theme is configured in `_config.butterfly.yml`. Key sections:
- Navigation (`nav`, `menu`)
- Code blocks (`code_blocks`)
- Social links (`social`)
- Aside widgets (`aside`)
- Comments system (`comments`)
- Analytics (`baidu_analytics`, `google_analytics`, etc.)
- CDN settings (`CDN`)

## Notes

- The site uses `post_asset_folder: true`, so post images should be placed in a folder with the same name as the post file
- Theme customization can be done via `source/_data/` for data files and `source/css/` for custom CSS
- The Butterfly theme supports multiple comment systems, analytics providers, and third-party integrations

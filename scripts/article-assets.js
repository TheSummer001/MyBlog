'use strict'

const fs = require('fs')
const path = require('path')
const {
  articleNameFromSource,
  transformHtml,
  transformFrontMatterValue,
  validateArticleAssets
} = require('./article-assets-lib')

const rendered = new Map()
let generatedRoutes = []

function sourceInfo (data) {
  const source = String(data.source || '').replace(/\\/g, '/')
  const articleName = articleNameFromSource(source)
  const absoluteSource = data.full_source || path.join(hexo.source_dir, source)
  return {
    source,
    articleName,
    absoluteSource,
    assetRoot: path.join(path.dirname(absoluteSource), 'assets', articleName)
  }
}

function transformPost (data, options = {}) {
  const info = sourceInfo(data)
  const result = transformHtml(data.content, info.articleName, options)
  data.content = result.html

  const references = [...result.references]
  const errors = [...result.errors]
  for (const key of ['cover', 'top_img']) {
    const frontMatter = transformFrontMatterValue(data[key], info.articleName, options)
    data[key] = frontMatter.value
    references.push(...frontMatter.references)
    errors.push(...frontMatter.errors)
  }

  return { ...info, references, errors }
}

function formatIssues (heading, issues) {
  const lines = [`${heading}，共 ${issues.length} 项：`]
  for (const issue of issues) {
    lines.push(`- ${issue.articlePath}`)
    lines.push(`  ${issue.message}：${issue.reference}`)
  }
  return lines.join('\n')
}

hexo.on('generateBefore', () => {
  rendered.clear()
  generatedRoutes = []
})

hexo.extend.filter.register('after_post_render', data => {
  if (!data.source || !/^_(?:posts|drafts)\//.test(String(data.source).replace(/\\/g, '/'))) return data
  const result = transformPost(data, { allowPublished: true })
  rendered.set(result.source, result)
  return data
}, 20)

hexo.extend.filter.register('before_generate', async () => {
  const posts = hexo.locals.get('posts').toArray()
  const errors = []
  const warnings = []
  const routes = []

  for (const post of posts) {
    const source = String(post.source || '').replace(/\\/g, '/')
    let result = rendered.get(source)
    if (!result) result = transformPost(post, { allowPublished: true })

    for (const message of result.errors) {
      errors.push({ articlePath: source, reference: message, message: '资源引用无效' })
    }

    const validation = await validateArticleAssets({
      articleName: result.articleName,
      articlePath: source,
      assetRoot: result.assetRoot,
      references: result.references
    })
    errors.push(...validation.errors)
    warnings.push(...validation.warnings)
    routes.push(...validation.routes)
  }

  if (warnings.length) hexo.log.warn(formatIssues('发现未引用的文章资源', warnings))
  if (errors.length) {
    const message = formatIssues('文章资源校验失败', errors)
    hexo.log.error(message)
    throw new Error(`文章资源校验失败，共 ${errors.length} 项`)
  }

  generatedRoutes = routes
}, 20)

hexo.extend.generator.register('article-assets', () => generatedRoutes.map(route => ({
  path: route.path,
  data: () => fs.createReadStream(route.source)
})))

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  parseManagedReference,
  transformHtml,
  transformFrontMatterValue,
  validateArticleAssets
} = require('../scripts/article-assets-lib')

test('中文文章、中文文件和多级目录会生成稳定的根路径 URL', () => {
  const parsed = parseManagedReference(
    'assets/中文文章/安装/步骤 一.png',
    '中文文章'
  )
  assert.equal(parsed.publicPath, 'assets/中文文章/安装/步骤 一.png')
  assert.equal(parsed.publicUrl, '/assets/%E4%B8%AD%E6%96%87%E6%96%87%E7%AB%A0/%E5%AE%89%E8%A3%85/%E6%AD%A5%E9%AA%A4%20%E4%B8%80.png')
})

test('Markdown 渲染后的图片、附件和原生 HTML 使用同一套改写', () => {
  const input = '<p><img src="assets/docker/架构.png"></p><a href=assets/docker/example.zip>下载</a>'
  const result = transformHtml(input, 'docker')
  assert.equal(result.references.length, 2)
  assert.match(result.html, /src="\/assets\/docker\/%E6%9E%B6%E6%9E%84.png"/)
  assert.match(result.html, /href=\/assets\/docker\/example.zip/)
})

test('外链、根路径和 data URL 不由文章资源脚本处理', () => {
  const input = '<img src="https://example.com/a.png"><img src="/img/a.png"><img src="data:image/png;base64,AA">'
  const result = transformHtml(input, 'docker')
  assert.equal(result.html, input)
  assert.equal(result.references.length, 0)
})

test('Front Matter cover 和 top_img 可复用相同规则', () => {
  const result = transformFrontMatterValue('./assets/docker/封面.png', 'docker')
  assert.equal(result.value, '/assets/docker/%E5%B0%81%E9%9D%A2.png')
  assert.equal(result.references.length, 1)
})

test('拒绝越界路径和其他文章的资源目录', () => {
  assert.match(parseManagedReference('assets/docker/../secret.txt', 'docker').error, /越界/)
  assert.match(parseManagedReference('assets/Redis/a.png', 'docker').error, /不一致/)
})

test('缺失资源一次汇总，孤儿资源只警告，且只生成已引用资源路由', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'article-assets-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const assetRoot = path.join(temp, 'assets', '中文文章')
  await fs.mkdir(path.join(assetRoot, '子目录'), { recursive: true })
  await fs.writeFile(path.join(assetRoot, 'used.png'), 'used')
  await fs.writeFile(path.join(assetRoot, 'orphan.png'), 'orphan')
  await fs.writeFile(path.join(assetRoot, '子目录', '附件.pdf'), 'pdf')

  const references = [
    parseManagedReference('assets/中文文章/used.png', '中文文章'),
    parseManagedReference('assets/中文文章/子目录/附件.pdf', '中文文章'),
    parseManagedReference('assets/中文文章/missing-a.png', '中文文章'),
    parseManagedReference('assets/中文文章/missing-b.png', '中文文章')
  ]
  const result = await validateArticleAssets({
    articleName: '中文文章',
    articlePath: '_posts/中文文章.md',
    assetRoot,
    references
  })

  assert.equal(result.errors.length, 2)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.routes.length, 2)
  assert.deepEqual(result.routes.map(route => route.path).sort(), [
    'assets/中文文章/used.png',
    'assets/中文文章/子目录/附件.pdf'
  ].sort())
})

test('目录引用和符号链接不会发布', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'article-assets-link-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const assetRoot = path.join(temp, 'assets', 'docker')
  await fs.mkdir(path.join(assetRoot, 'directory'), { recursive: true })

  let linkCreated = false
  try {
    await fs.symlink(path.join(assetRoot, 'directory'), path.join(assetRoot, 'link'), 'junction')
    linkCreated = true
  } catch {}

  const references = [parseManagedReference('assets/docker/directory', 'docker')]
  if (linkCreated) references.push(parseManagedReference('assets/docker/link/file.png', 'docker'))
  const result = await validateArticleAssets({
    articleName: 'docker',
    articlePath: '_posts/docker.md',
    assetRoot,
    references
  })

  assert.equal(result.errors.length, linkCreated ? 2 : 1)
  assert.match(result.errors[0].message, /普通文件/)
  if (linkCreated) assert.match(result.errors[1].message, /符号链接/)
})

test('已发布的中文编码 URL 可重复处理且不会丢失引用', () => {
  const articleName = '中文文章'
  const encodedArticle = encodeURIComponent(articleName)
  const input = `<img src="/assets/${encodedArticle}/%E5%B0%81%E9%9D%A2.png">`
  const result = transformHtml(input, articleName, { allowPublished: true })
  assert.equal(result.errors.length, 0)
  assert.equal(result.references.length, 1)
  assert.equal(result.html, input)
})

test('编码后的 Windows 反斜杠不能绕过越界校验', () => {
  const parsed = parseManagedReference('assets/docker/%2e%2e%5csecret.txt', 'docker')
  assert.match(parsed.error, /反斜杠/)
})

test('文章资源根目录本身是符号链接时拒绝发布', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'article-assets-root-link-'))
  t.after(() => fs.rm(temp, { recursive: true, force: true }))
  const realAssets = path.join(temp, 'real-assets')
  await fs.mkdir(path.join(realAssets, 'docker'), { recursive: true })
  await fs.writeFile(path.join(realAssets, 'docker', 'file.txt'), 'content')
  const linkedAssets = path.join(temp, 'assets')
  try {
    await fs.symlink(realAssets, linkedAssets, 'junction')
  } catch {
    t.skip('当前环境不允许创建目录符号链接')
    return
  }
  const reference = parseManagedReference('assets/docker/file.txt', 'docker')
  const result = await validateArticleAssets({
    articleName: 'docker',
    articlePath: '_posts/docker.md',
    assetRoot: path.join(linkedAssets, 'docker'),
    references: [reference]
  })
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0].message, /符号链接/)
})

'use strict'

const fs = require('fs')
const fsp = fs.promises
const path = require('path')

const MANAGED_PREFIX = 'assets/'

function articleNameFromSource (source) {
  return path.posix.basename(String(source || '').replace(/\\/g, '/'), path.posix.extname(String(source || '')))
}

function decodeHtmlAttribute (value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function splitUrlSuffix (value) {
  const index = value.search(/[?#]/)
  return index === -1
    ? { pathname: value, suffix: '' }
    : { pathname: value.slice(0, index), suffix: value.slice(index) }
}

function encodePublicPath (segments) {
  return `/${segments.map(segment => encodeURIComponent(segment)).join('/')}`
}

function parseManagedReference (value, articleName, options = {}) {
  if (typeof value !== 'string') return { managed: false }

  const raw = decodeHtmlAttribute(value.trim()).replace(/\\/g, '/')
  const { pathname, suffix } = splitUrlSuffix(raw)

  let relative
  if (pathname.startsWith(MANAGED_PREFIX)) {
    relative = pathname
  } else if (pathname.startsWith(`./${MANAGED_PREFIX}`)) {
    relative = pathname.slice(2)
  } else if (options.allowPublished && pathname.startsWith('/assets/')) {
    relative = pathname.slice(1)
  } else {
    return { managed: false }
  }

  let decoded
  try {
    decoded = decodeURIComponent(relative)
  } catch {
    return {
      managed: true,
      error: `资源路径包含无效的 URL 编码：${value}`
    }
  }

  if (decoded.includes('\\')) {
    return {
      managed: true,
      error: `资源路径不允许包含反斜杠：${value}`
    }
  }

  const segments = decoded.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    return {
      managed: true,
      error: `资源路径包含空目录或越界片段：${value}`
    }
  }

  const referencedArticle = segments[1]
  if (segments[0] !== 'assets' || !referencedArticle || segments.length < 3) {
    return {
      managed: true,
      error: `资源路径必须采用 assets/<文章文件名>/<文件>：${value}`
    }
  }

  if (referencedArticle !== articleName) {
    return {
      managed: true,
      error: `资源目录与文章文件名不一致：期望 assets/${articleName}/，实际为 assets/${referencedArticle}/`
    }
  }

  const subpathSegments = segments.slice(2)
  const subpath = subpathSegments.join('/')
  return {
    managed: true,
    articleName,
    subpath,
    publicPath: `assets/${articleName}/${subpath}`,
    publicUrl: `${encodePublicPath(['assets', articleName, ...subpathSegments])}${suffix}`
  }
}

function transformHtml (html, articleName, options = {}) {
  const references = []
  const errors = []
  if (typeof html !== 'string' || !html) return { html, references, errors }

  const transformed = html.replace(/<(img|a)\b[^>]*>/gi, tag => {
    const element = /^<(img|a)\b/i.exec(tag)[1].toLowerCase()
    const attribute = element === 'img' ? 'src' : 'href'
    const quoted = new RegExp(`(\\b${attribute}\\s*=\\s*)(["'])(.*?)\\2`, 'i')
    const unquoted = new RegExp(`(\\b${attribute}\\s*=\\s*)([^\\s>]+)`, 'i')
    const match = quoted.exec(tag) || unquoted.exec(tag)
    if (!match) return tag

    const value = match[3] == null ? match[2] : match[3]
    const parsed = parseManagedReference(value, articleName, options)
    if (!parsed.managed) return tag
    if (parsed.error) {
      errors.push(parsed.error)
      return tag
    }

    references.push(parsed)
    const replacement = match[3] == null
      ? `${match[1]}${parsed.publicUrl}`
      : `${match[1]}${match[2]}${parsed.publicUrl}${match[2]}`
    return `${tag.slice(0, match.index)}${replacement}${tag.slice(match.index + match[0].length)}`
  })

  return { html: transformed, references, errors }
}

function transformFrontMatterValue (value, articleName, options = {}) {
  if (typeof value !== 'string') return { value, references: [], errors: [] }
  const parsed = parseManagedReference(value, articleName, options)
  if (!parsed.managed) return { value, references: [], errors: [] }
  if (parsed.error) return { value, references: [], errors: [parsed.error] }
  return { value: parsed.publicUrl, references: [parsed], errors: [] }
}

async function inspectFilePath (assetRoot, subpath) {
  const root = path.resolve(assetRoot)
  const segments = subpath.split('/')
  let current = root
  for (const directory of [path.dirname(root), root]) {
    let stat
    try {
      stat = await fsp.lstat(directory)
    } catch (error) {
      if (error.code === 'ENOENT') return { error: '资源文件不存在', absolutePath: directory }
      throw error
    }

    if (stat.isSymbolicLink()) {
      return { error: '资源路径不允许包含符号链接', absolutePath: directory }
    }
    if (!stat.isDirectory()) {
      return { error: '文章资源根路径必须是目录', absolutePath: directory }
    }
  }


  for (const segment of segments) {
    current = path.join(current, segment)
    let stat
    try {
      stat = await fsp.lstat(current)
    } catch (error) {
      if (error.code === 'ENOENT') return { error: '资源文件不存在', absolutePath: current }
      throw error
    }
    if (stat.isSymbolicLink()) return { error: '资源路径不允许包含符号链接', absolutePath: current }
  }

  const stat = await fsp.lstat(current)
  if (!stat.isFile()) return { error: '资源引用必须指向普通文件', absolutePath: current }

  const relative = path.relative(root, current)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { error: '资源路径越过了文章资源目录', absolutePath: current }
  }

  return { absolutePath: current }
}

async function listRegularFiles (root) {
  const files = []
  let entries
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return files
    throw error
  }

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      const nested = await listRegularFiles(absolutePath)
      files.push(...nested)
    } else if (entry.isFile()) {
      files.push(absolutePath)
    }
  }
  return files
}

async function validateArticleAssets ({ articleName, articlePath, assetRoot, references }) {
  const errors = []
  const routes = []
  const used = new Set()
  const uniqueReferences = new Map()

  for (const reference of references) uniqueReferences.set(reference.subpath, reference)

  for (const reference of uniqueReferences.values()) {
    const result = await inspectFilePath(assetRoot, reference.subpath)
    if (result.error) {
      errors.push({ articlePath, reference: `assets/${articleName}/${reference.subpath}`, message: result.error })
      continue
    }
    used.add(path.resolve(result.absolutePath))
    routes.push({ path: reference.publicPath, source: result.absolutePath })
  }

  const allFiles = await listRegularFiles(assetRoot)
  const warnings = allFiles
    .filter(file => !used.has(path.resolve(file)))
    .map(file => ({
      articlePath,
      reference: path.relative(path.dirname(assetRoot), file).replace(/\\/g, '/'),
      message: '资源未被当前文章引用，不会发布'
    }))

  return { errors, warnings, routes }
}

module.exports = {
  articleNameFromSource,
  parseManagedReference,
  transformHtml,
  transformFrontMatterValue,
  validateArticleAssets
}

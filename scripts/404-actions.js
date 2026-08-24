'use strict'

hexo.extend.filter.register('after_render:html', html => {
  if (!/class="[^"]*error-content[^"]*"/i.test(html)) return html

  html = html.replace(/(<div class="error-img">\s*<img\b[^>]*?)alt="Page not found"/i, '$1alt="" aria-hidden="true"')

  if (!html.includes('class="error-kicker"')) {
    const kicker = [
      '<p class="error-kicker">',
      '<span aria-hidden="true">LOST BOOKMARK</span>',
      '<span>路径未收录</span>',
      '</p>'
    ].join('')
    html = html.replace(/(<div class="error-info">)/i, `$1${kicker}`)
  }

  if (!html.includes('class="error-actions"')) {
    const root = String(hexo.config.root || '/').replace(/\/?$/, '/')
    const actions = [
      '<nav class="error-actions" aria-label="错误页面导航">',
      `<a class="error-action error-action-primary" href="${root}">返回首页</a>`,
      `<a class="error-action" href="${root}archives/">浏览文章归档</a>`,
      '<button class="error-action" id="404-search-button" type="button">搜索站内文章</button>',
      '</nav>'
    ].join('')

    html = html.replace(/(<div class="error_subtitle"[^>]*>[\s\S]*?<\/div>)/i, `$1${actions}`)
  }

  return html
})

'use strict'

const replaceHeadingTag = (html, selectorPattern, fromLevel, toLevel) => {
  const openingTag = new RegExp(`<h${fromLevel}(${selectorPattern}[^>]*)>`, 'i')
  if (!openingTag.test(html)) return html
  return html
    .replace(openingTag, `<h${toLevel}$1>`)
    .replace(new RegExp(`</h${fromLevel}>`, 'i'), `</h${toLevel}>`)
}

hexo.extend.filter.register('after_render:html', html => {
  const hasPrimaryContentHeading = /class="[^"]*(?:observatory-hero|taxonomy-archive-heading|taxonomy-hub)[^"]*"/i.test(html)
  if (hasPrimaryContentHeading) {
    html = replaceHeadingTag(html, '\\s+id="site-title"', 1, 2)
    html = replaceHeadingTag(html, '\\s+class="title-seo"', 1, 2)
  }

  if (/class="[^"]*error-content[^"]*"/i.test(html)) {
    html = replaceHeadingTag(html, '\\s+class="title-seo"', 1, 2)
  }

  return html
})

'use strict'

const TAG_TONE_COUNT = 6

/**
 * Map a taxonomy label to a stable palette slot at build time.
 *
 * @param {unknown} value
 * @returns {string}
 */
const tagTone = value => {
  let hash = 0

  for (const character of String(value || '')) {
    hash = ((hash * 31) + (character.codePointAt(0) || 0)) >>> 0
  }

  return `tag-tone-${hash % TAG_TONE_COUNT}`
}

hexo.extend.helper.register('tagTone', tagTone)

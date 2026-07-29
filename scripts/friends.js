'use strict'

const { escapeHTML, url_for: urlFor } = require('hexo-util')

const DEFAULT_AVATAR = '/img/friend-default.svg'

const escapeAttribute = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const getFriends = () => {
  const data = hexo.locals.get('data')
  const friends = data && data.friends

  if (friends === undefined || friends === null) return []

  if (!Array.isArray(friends)) {
    throw new TypeError('[friends] source/_data/friends.yml must contain a YAML list')
  }

  return friends
}

const validateRequiredText = (friend, field, index) => {
  if (typeof friend[field] !== 'string' || !friend[field].trim()) {
    throw new TypeError(`[friends] item ${index + 1} is missing a valid "${field}" value`)
  }
}

const validateFriend = (friend, index) => {
  if (!friend || typeof friend !== 'object' || Array.isArray(friend)) {
    throw new TypeError(`[friends] item ${index + 1} must be a YAML object`)
  }

  validateRequiredText(friend, 'name', index)
  validateRequiredText(friend, 'link', index)
  validateRequiredText(friend, 'descr', index)

  let homepage
  try {
    homepage = new URL(friend.link)
  } catch {
    throw new TypeError(`[friends] item ${index + 1} has an invalid "link" URL`)
  }

  if (homepage.protocol !== 'https:') {
    throw new TypeError(`[friends] item ${index + 1} must use an HTTPS "link" URL`)
  }

  if (friend.avatar !== undefined && friend.avatar !== null && friend.avatar !== '') {
    if (typeof friend.avatar !== 'string') {
      throw new TypeError(`[friends] item ${index + 1} has an invalid "avatar" value`)
    }

    const avatar = friend.avatar.trim()
    if (!avatar.startsWith('/') && !avatar.startsWith('https://')) {
      throw new TypeError(`[friends] item ${index + 1} "avatar" must be a local path or HTTPS URL`)
    }
  }
}

const validateFriends = friends => {
  friends.forEach(validateFriend)
  return friends
}

const resolveImageUrl = (value, protectFromAssetRewrite = false) => {
  if (value.startsWith('https://')) return value

  const url = urlFor.call(hexo, value)
  return protectFromAssetRewrite ? ` ${url}` : url
}

const resolveAvatar = friend => {
  const avatar = typeof friend.avatar === 'string' ? friend.avatar.trim() : ''
  return resolveImageUrl(avatar || DEFAULT_AVATAR, true)
}

const renderFriend = (friend, fallbackAvatar) => {
  const name = escapeHTML(friend.name.trim())
  const nameAttribute = escapeAttribute(friend.name.trim())
  const link = escapeAttribute(friend.link.trim())
  const descr = escapeHTML(friend.descr.trim())
  const descrAttribute = escapeAttribute(friend.descr.trim())
  const avatar = escapeAttribute(resolveAvatar(friend))

  return `
    <div class="flink-list-item">
      <a href="${link}" title="${nameAttribute}" target="_blank" rel="noopener noreferrer">
        <div class="flink-item-icon">
          <img class="no-lightbox" src="${avatar}" onerror="this.onerror=null;this.src=&quot;${fallbackAvatar}&quot;" alt="${nameAttribute}" />
        </div>
        <div class="flink-item-name">${name}</div>
        <div class="flink-item-desc" title="${descrAttribute}">${descr}</div>
      </a>
    </div>`
}

const renderFriends = () => {
  const friends = validateFriends(getFriends())

  if (friends.length === 0) {
    return `
      <section class="friends-empty" aria-labelledby="friends-empty-title">
        <span class="friends-empty__signal" aria-hidden="true">
          <span></span>
        </span>
        <div>
          <h2 id="friends-empty-title">观测信号等待接入</h2>
          <p>这里还没有公开的友链。欢迎带着你的个人博客来信交流。</p>
        </div>
      </section>`
  }

  const configuredFallback = hexo.theme.config.error_img && hexo.theme.config.error_img.flink
  const fallbackAvatar = escapeAttribute(resolveImageUrl(configuredFallback || DEFAULT_AVATAR))
  const items = friends.map(friend => renderFriend(friend, fallbackAvatar)).join('')

  return `
    <div class="flink friends-list" aria-label="友链列表">
      <div class="flink-list">${items}</div>
    </div>`
}

hexo.extend.filter.register('before_generate', () => {
  validateFriends(getFriends())
})

hexo.extend.tag.register('friends', renderFriends)

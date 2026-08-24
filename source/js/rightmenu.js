(() => {
  'use strict'

  const rmf = window.rmf = {}
  const menu = document.getElementById('rightMenu')
  if (!menu) return

  const getGroup = id => document.getElementById(id)
  const contextGroupIds = ['menu-text', 'menu-selection-link', 'menu-paste', 'menu-post', 'menu-to', 'menu-img']
  const setGroupVisible = (id, visible) => {
    const group = getGroup(id)
    if (!group) return
    group.classList.toggle('hide', !visible)
    group.style.display = ''
  }

  const copyText = async (text, successMessage) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      btf.snackbarShow(successMessage)
    } catch (error) {
      btf.snackbarShow('复制失败，请使用浏览器原生复制功能')
    }
  }

  const closeMenu = () => {
    menu.style.display = 'none'
    document.querySelectorAll('.rmMask').forEach(mask => { mask.remove() })
  }

  const showMenu = (clientX, clientY) => {
    document.querySelectorAll('.rmMask').forEach(mask => { mask.remove() })
    menu.style.visibility = 'hidden'
    menu.style.display = 'block'
    menu.style.left = '0'
    menu.style.top = '0'

    const width = menu.offsetWidth
    const height = menu.offsetHeight
    const left = Math.max(0, Math.min(clientX + 10, window.innerWidth - width - 8))
    const top = Math.max(0, Math.min(clientY, window.innerHeight - height - 8))

    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    menu.style.visibility = 'visible'

    const mask = document.createElement('div')
    mask.className = 'rmMask'
    mask.addEventListener('click', closeMenu, { once: true })
    document.body.appendChild(mask)
  }

  const insertAtCursor = (field, value) => {
    const start = field.selectionStart ?? field.value.length
    const end = field.selectionEnd ?? field.value.length
    field.setRangeText(value, start, end, 'end')
    field.focus()
  }

  const openInNewTab = url => window.open(url, '_blank', 'noopener,noreferrer')

  rmf.historyBack = () => window.history.back()
  rmf.historyForward = () => window.history.forward()
  rmf.reload = () => window.location.reload()
  rmf.scrollToTop = () => btf.scrollToDest(0, 500)
  rmf.copyWordsLink = () => copyText(window.location.href, '复制成功')
  rmf.copySelect = () => copyText(document.getSelection().toString(), '复制成功')
  rmf.searchSelection = () => {
    const selection = document.getSelection().toString().trim()
    if (selection) openInNewTab(`https://www.baidu.com/s?wd=${encodeURIComponent(selection)}`)
  }
  rmf.openSelection = () => {
    const selection = document.getSelection().toString().trim()
    if (!selection) return
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(selection) ? selection : `https://${selection}`
    let url
    try {
      url = new URL(candidate)
    } catch (error) {
      btf.snackbarShow('选中的内容不是有效链接')
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      btf.snackbarShow('仅支持打开 HTTP 或 HTTPS 链接')
      return
    }
    openInNewTab(url.href)
  }
  rmf.toggleTheme = () => document.querySelector('#nav-darkmode-toggle, #darkmode')?.click()
  rmf.print = () => window.print()
  rmf.fullScreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch (error) {
      btf.snackbarShow('当前浏览器不允许切换全屏')
    }
  }

  const savedMouseMode = localStorage.getItem('mouse')
  let mouseMode = savedMouseMode === 'off' ? 'off' : 'on'
  localStorage.setItem('mouse', mouseMode)

  window.changeMouseMode = () => {
    mouseMode = mouseMode === 'on' ? 'off' : 'on'
    localStorage.setItem('mouse', mouseMode)
    btf.snackbarShow(mouseMode === 'on'
      ? '当前鼠标右键已更换为网站指定样式！'
      : '当前鼠标右键已恢复为系统默认！')
    closeMenu()
  }

  menu.addEventListener('click', event => {
    const actionElement = event.target.closest('[data-rmf-action]')
    if (!actionElement) return
    event.preventDefault()
    const action = actionElement.dataset.rmfAction
    const handler = action === 'changeMouseMode' ? window.changeMouseMode : rmf[action]
    if (typeof handler === 'function') handler()
    if (action !== 'changeMouseMode') closeMenu()
  })

  const supportsMouseContextMenu = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  if (!supportsMouseContextMenu) return
  let lastTouchAt = 0
  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') lastTouchAt = Date.now()
  }, true)

  document.addEventListener('contextmenu', event => {
    const fromTouch = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents || Date.now() - lastTouchAt < 1500
    if (mouseMode === 'off' || fromTouch) return

    event.preventDefault()
    contextGroupIds.forEach(id => { setGroupVisible(id, false) })

    const selection = document.getSelection().toString().trim()
    setGroupVisible('menu-text', Boolean(selection))
    setGroupVisible('menu-selection-link', Boolean(selection && /^(?:https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+(?:[\w\-._~:/?#[\]@!$&'()*+,;=]*)$/i.test(selection)))
    setGroupVisible('menu-post', Boolean(document.getElementById('post') || document.getElementById('page')))

    const image = event.target.closest('img')
    const link = event.target.closest('a')
    const editable = event.target.closest('textarea, input')

    if (image) {
      setGroupVisible('menu-img', true)
      const imageUrl = new URL(image.currentSrc || image.src, window.location.href)
      rmf.openWithNewTab = () => openInNewTab(imageUrl.href)
      rmf.copyLink = () => copyText(imageUrl.href, '图片链接复制成功')
      rmf.saveAs = () => {
        if (imageUrl.origin !== window.location.origin) {
          openInNewTab(imageUrl.href)
          return
        }
        const anchor = document.createElement('a')
        const encodedName = imageUrl.pathname.split('/').filter(Boolean).pop() || 'image'
        let filename = encodedName
        try {
          filename = decodeURIComponent(encodedName)
        } catch (error) {}
        anchor.href = imageUrl.href
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      }
    } else if (link) {
      setGroupVisible('menu-to', true)
      rmf.open = () => window.location.assign(link.href)
      rmf.openWithNewTab = () => openInNewTab(link.href)
      rmf.copyLink = () => copyText(link.href, '链接复制成功')
    } else if (editable) {
      setGroupVisible('menu-paste', true)
      rmf.paste = async () => {
        try {
          const text = await navigator.clipboard.readText()
          insertAtCursor(editable, text)
          btf.snackbarShow('粘贴成功')
        } catch (error) {
          btf.snackbarShow('读取剪贴板失败，请允许权限')
        }
      }
    }

    showMenu(event.clientX, event.clientY)
  })

  window.addEventListener('blur', closeMenu)
  document.addEventListener('scroll', closeMenu, { passive: true })
})()

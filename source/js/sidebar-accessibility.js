(() => {
  'use strict'

  const initSidebarAccessibility = () => {
    const menu = document.getElementById('sidebar-menus')
    const toggle = document.getElementById('toggle-menu')
    const mask = document.getElementById('menu-mask')
    if (!menu || !toggle) return

    toggle.setAttribute('role', 'button')
    toggle.setAttribute('tabindex', '0')
    toggle.setAttribute('aria-controls', 'sidebar-menus')

    let wasOpen = menu.classList.contains('open')
    const syncState = (moveFocus = true) => {
      const isOpen = menu.classList.contains('open')
      menu.inert = !isOpen
      menu.setAttribute('aria-hidden', String(!isOpen))
      toggle.setAttribute('aria-expanded', String(isOpen))
      toggle.setAttribute('aria-label', isOpen ? '关闭导航菜单' : '打开导航菜单')

      if (moveFocus && isOpen && !wasOpen) {
        const firstFocusable = menu.querySelector('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        requestAnimationFrame(() => { firstFocusable?.focus() })
      } else if (moveFocus && !isOpen && wasOpen && toggle.offsetParent !== null) {
        toggle.focus()
      }
      wasOpen = isOpen
    }

    syncState(false)
    new MutationObserver(() => { syncState(true) }).observe(menu, {
      attributes: true,
      attributeFilter: ['class']
    })

    toggle.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      toggle.click()
    })

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.classList.contains('open')) mask?.click()
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarAccessibility, { once: true })
  } else {
    initSidebarAccessibility()
  }
})()

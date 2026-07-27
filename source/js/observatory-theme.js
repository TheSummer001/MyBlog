(() => {
  const syncToggle = () => {
    const toggle = document.getElementById('nav-darkmode-toggle')
    if (!toggle) return

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    toggle.setAttribute('aria-label', isDark ? '切换到日间模式' : '切换到夜间模式')
    toggle.setAttribute('title', isDark ? '切换到日间模式' : '切换到夜间模式')
    toggle.innerHTML = `<i class="fas ${isDark ? 'fa-moon' : 'fa-sun'}"></i>`
  }

  const bindToggle = () => {
    const toggle = document.getElementById('nav-darkmode-toggle')
    if (!toggle || toggle.dataset.bound === 'true') return

    toggle.dataset.bound = 'true'
    toggle.addEventListener('click', () => {
      const willChangeMode = document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light'
        : 'dark'

      if (willChangeMode === 'dark') {
        btf.activateDarkMode()
        GLOBAL_CONFIG.Snackbar !== undefined && btf.snackbarShow(GLOBAL_CONFIG.Snackbar.day_to_night)
      } else {
        btf.activateLightMode()
        GLOBAL_CONFIG.Snackbar !== undefined && btf.snackbarShow(GLOBAL_CONFIG.Snackbar.night_to_day)
      }

      btf.saveToLocal.set('theme', willChangeMode, 2)

      const themeChange = (window.globalFn && window.globalFn.themeChange) || {}
      Object.entries(themeChange).forEach(([key, changeTheme]) => {
        if (['disqus', 'disqusjs'].includes(key)) {
          setTimeout(() => changeTheme(willChangeMode), 300)
        } else {
          changeTheme(willChangeMode)
        }
      })
    })
  }

  const init = () => {
    bindToggle()
    syncToggle()
  }

  new MutationObserver(syncToggle).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })

  document.addEventListener('DOMContentLoaded', init)
  document.addEventListener('pjax:complete', init)
})()

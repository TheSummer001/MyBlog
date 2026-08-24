(() => {
  'use strict'

  const openSearch = () => {
    document.querySelector('#search-button > .search')?.click()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('404-search-button')?.addEventListener('click', openSearch)
    }, { once: true })
  } else {
    document.getElementById('404-search-button')?.addEventListener('click', openSearch)
  }
})()

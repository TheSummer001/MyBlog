(() => {
  const copyWithTextarea = text => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()

    const copied = document.execCommand('copy')
    textarea.remove()

    if (!copied) throw new Error('Copy command was rejected')
  }

  const copyText = async text => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }

    copyWithTextarea(text)
  }

  const setResult = (button, status, message, succeeded) => {
    const label = button.querySelector('span')
    const originalLabel = button.dataset.originalLabel || label.textContent

    button.dataset.originalLabel = originalLabel
    label.textContent = succeeded ? '已复制' : '复制失败'
    status.textContent = message

    window.setTimeout(() => {
      label.textContent = originalLabel
      status.textContent = ''
    }, 2400)
  }

  const bindCopy = () => {
    const button = document.querySelector('[data-friends-copy]')
    const source = document.getElementById('friends-site-copy')
    const status = document.getElementById('friends-copy-status')

    if (!button || !source || !status || button.dataset.bound === 'true') return

    button.dataset.bound = 'true'
    button.addEventListener('click', async () => {
      const text = source.textContent.trim()

      try {
        await copyText(text)
        setResult(button, status, '本站友链信息已复制到剪贴板。', true)
      } catch {
        setResult(button, status, '复制失败，请手动选择上方信息。', false)
      }
    })
  }

  document.addEventListener('DOMContentLoaded', bindCopy)
  document.addEventListener('pjax:complete', bindCopy)
})()

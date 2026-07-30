;(async () => {
  const MAX_WAIT_MS = 15000, POLL_MS = 1000
  const started = Date.now()
  while (Date.now() - started < MAX_WAIT_MS) {
    const url = window.location.href
    if (/login\.taobao/i.test(url)) {
      return { success: false, error: '未登录淘宝卖家账号，请先登录' }
    }
    const hasNav = !!document.querySelector('.seller-nav, .left-menu, .sidebar, .menu-container, .nav-bar')
    const hasContent = !!document.querySelector('.comment-manage, .ask-all-container, .qa-list, table')
    if (hasNav || hasContent) return { success: true }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  return { success: false, error: '登录状态检测超时' }
})()

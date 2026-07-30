;(async () => {
  const MAX_WAIT_MS = 15000
  const POLL_MS = 1000
  const started = Date.now()

  while (Date.now() - started < MAX_WAIT_MS) {
    const url = window.location.href
    if (/login|sso|auth|signin/i.test(url)) {
      return { success: false, error: '未登录Semir SSO，请先登录 https://smbd.semirapp.cn/' }
    }
    const loginInputs = document.querySelectorAll('input[type="password"], input[name="password"]')
    if (loginInputs.length > 0) {
      return { success: false, error: '检测到登录表单，请先完成Semir SSO登录' }
    }
    const hasContent = !!document.querySelector('.product-detail, .product-info, .data-panel, .chart-container, table, .semi-table, .ant-table')
    if (hasContent) {
      return { success: true }
    }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  return { success: false, error: '登录状态检测超时' }
})()

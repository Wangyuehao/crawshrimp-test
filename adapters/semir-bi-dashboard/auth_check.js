;(async () => {
  // Semir SSO 登录态检查
  // 检测页面是否已登录（不显示登录页/验证码）
  const MAX_WAIT_MS = 15000
  const POLL_MS = 1000
  const started = Date.now()

  while (Date.now() - started < MAX_WAIT_MS) {
    const url = window.location.href

    // 如果跳转到 SSO 登录页，说明未登录
    if (/login|sso|auth|signin/i.test(url)) {
      return { success: false, error: '未登录Semir SSO，请先登录 https://guanbi.ecsemir.com/' }
    }

    // 如果页面已加载出主要内容（含导航/菜单/表格），认为已登录
    const hasNav = !!document.querySelector('.semi-navigation, .ant-menu, nav, .layout-menu, .sidebar-menu')
    const hasContent = !!document.querySelector('.semi-table, .ant-table, table, .chart-container, .dashboard-content')
    const hasPageRoot = !!document.querySelector('#root, #app, .app-container')

    if ((hasNav || hasPageRoot) && hasContent) {
      return { success: true }
    }

    // 检查是否显示了登录相关的表单元素
    const loginInputs = document.querySelectorAll('input[type="password"], input[name="password"], input[placeholder*="密码"]')
    if (loginInputs.length > 0) {
      return { success: false, error: '检测到登录表单，请先完成Semir SSO登录' }
    }

    await new Promise(r => setTimeout(r, POLL_MS))
  }

  return { success: false, error: '登录状态检测超时，请确认已登录 https://guanbi.ecsemir.com/' }
})()

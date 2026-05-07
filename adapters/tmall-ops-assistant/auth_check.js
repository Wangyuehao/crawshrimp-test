;(async () => {
  const href = String(location.href || '')
  const host = String(location.hostname || '')
  const bodyText = String(document.body?.innerText || '')
  const isLoginPage = /login\.(taobao|tmall)\.com/i.test(host) || /亲，请登录|扫码登录|密码登录/.test(bodyText)
  const hasSessionCookie = /(?:^|;\s*)(_m_h5_tk|cookie2|tracknick|lgc|sn)=/i.test(String(document.cookie || ''))
  const isTmallPage = /(tmall\.com|taobao\.com)$/i.test(host) || /天猫|淘宝/.test(bodyText)

  return {
    success: true,
    data: [{ logged_in: !isLoginPage && (hasSessionCookie || isTmallPage), href }],
    meta: {
      has_more: false,
      logged_in: !isLoginPage && (hasSessionCookie || isTmallPage),
      has_session_cookie: hasSessionCookie,
    },
  }
})()

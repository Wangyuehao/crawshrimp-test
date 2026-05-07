;(async () => {
  try {
    const href = String(location.href || '')
    const host = String(location.hostname || '')
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim()
    const cookies = String(document.cookie || '')
    const accountInfo = (() => {
      try {
        return JSON.parse(localStorage.getItem('ecom_seller_base_account_info') || '{}')
      } catch (error) {
        return {}
      }
    })()

    const onLoginPage = /login|passport|signin|authorize/i.test(href) || /登录|验证码|扫码/.test(text)
    const hasTikTokHost = /tiktokshopglobalselling\.com$/i.test(host)
    const hasSellerCookie = /(?:^|;\s*)(?:oec_seller_id_unified_seller_env|global_seller_id_unified_seller_env)=/i.test(cookies)
    const hasAccountInfo = !!(accountInfo?.value?.data?.shop?.shop_id || accountInfo?.data?.shop?.shop_id)
    const hasPageSignal = /商家中心|联盟中心|商品评分|Performance|数据分析|TikTok Shop/i.test(text)
    const loggedIn = !onLoginPage && (hasSellerCookie || hasAccountInfo || (hasTikTokHost && hasPageSignal))

    return {
      success: true,
      data: [{ logged_in: loggedIn, href, host }],
      meta: {
        has_more: false,
        logged_in: loggedIn,
        has_seller_cookie: hasSellerCookie,
        has_account_info: hasAccountInfo,
      },
    }
  } catch (error) {
    return { success: false, error: String(error?.message || error) }
  }
})()

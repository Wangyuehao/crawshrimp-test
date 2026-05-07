;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}
  const shared = window.__CRAWSHRIMP_SHARED__ || {}

  const DEFAULT_REGION = 'US'
  const DEFAULT_SHOP_ID = '7496042382582647544'
  const KNOWN_REGIONS = ['US', 'GB', 'FR', 'DE', 'IT', 'ES']

  function compact(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
  }

  function clampInt(value, fallback, min, max) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    const integer = Math.floor(parsed)
    if (Number.isFinite(min) && integer < min) return min
    if (Number.isFinite(max) && integer > max) return max
    return integer
  }

  function splitValues(value) {
    if (Array.isArray(value)) return value.map(item => compact(item)).filter(Boolean)
    return compact(value)
      .split(/[\s,，;；、]+/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  function safeJsonParse(value) {
    if (!value) return null
    if (typeof value === 'object') return value
    try {
      return JSON.parse(String(value))
    } catch (error) {
      return null
    }
  }

  function getCookieValue(name) {
    const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = String(document.cookie || '').match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : ''
  }

  function readAccountInfo() {
    const candidates = [
      safeJsonParse(localStorage.getItem('ecom_seller_base_account_info')),
      safeJsonParse(sessionStorage.getItem('ecom_seller_base_account_info')),
    ].filter(Boolean)
    for (const candidate of candidates) {
      const value = candidate?.value || candidate
      const data = value?.data || value
      const shop = data?.shop || {}
      const globalSeller = data?.global_seller || {}
      if (shop.shop_id || globalSeller.global_seller_id) {
        return { shop, globalSeller }
      }
    }
    return { shop: {}, globalSeller: {} }
  }

  function readSellerStores() {
    const candidates = [
      window.__SELLER_USER_STORE__,
      window.__SELLER_FETCH_STORE__?.userStore,
      window.__SELLER_FETCH_STORE__?.sellerUserStore,
      window.__SELLER_FETCH_STORE__?.sellerStore,
      window.__SELLER_STORE__,
    ].filter(Boolean)
    return candidates.filter(item => item && typeof item === 'object')
  }

  function readRegionSellerMap() {
    const byRegion = {}
    const add = (regionValue, sellerIdValue) => {
      const region = compact(regionValue).toUpperCase()
      const sellerId = compact(sellerIdValue)
      if (/^[A-Z]{2}$/.test(region) && sellerId) byRegion[region] = sellerId
    }

    for (const store of readSellerStores()) {
      add(store.region || store.currentRegion || store.shopRegion, store.localSellerId || store.sellerId || store.shopId)
      const regions = store.regions || store.regionMap || store.sellerRegions
      if (regions && typeof regions === 'object') {
        for (const [sellerId, region] of Object.entries(regions)) {
          add(region, sellerId)
        }
      }
      const shops = store.shops || store.shopList || store.sellerList || store.availableShops
      if (Array.isArray(shops)) {
        for (const shop of shops) {
          add(
            shop?.region || shop?.shop_region || shop?.country_code || shop?.country,
            shop?.seller_id || shop?.sellerId || shop?.shop_id || shop?.shopId || shop?.id,
          )
        }
      }
    }
    return byRegion
  }

  function readAvailableRegions(account) {
    const regions = new Set()
    const addRegion = value => {
      const region = compact(value).toUpperCase()
      if (/^[A-Z]{2}$/.test(region)) regions.add(region)
    }

    addRegion(new URLSearchParams(location.search || '').get('shop_region'))
    addRegion(account?.shop?.region)
    addRegion(localStorage.getItem('ecom-seller-affiliate-selected-shop-region'))

    const accountRaw = localStorage.getItem('ecom_seller_base_account_info') || ''
    const menuRaw = localStorage.getItem('ecom_seller_base_menu') || ''
    const platformRaw = localStorage.getItem('ecom_seller_base_platform_config') || ''
    for (const region of Object.keys(readRegionSellerMap())) {
      addRegion(region)
    }
    for (const text of [accountRaw, menuRaw, platformRaw, String(document.body?.innerText || '')]) {
      for (const match of String(text || '').matchAll(/\b(US|GB|FR|DE|IT|ES|MX|BR|JP|MY|TH|VN|PH|SG|ID)\b/g)) {
        addRegion(match[1])
      }
    }
    return Array.from(regions)
  }

  function resolveContext() {
    const account = readAccountInfo()
    const query = new URLSearchParams(location.search || '')
    const regionSellerMap = readRegionSellerMap()
    const shopId =
      compact(query.get('shop_id')) ||
      compact(getCookieValue('global_seller_id_unified_seller_env')) ||
      compact(getCookieValue('oec_seller_id_unified_seller_env')) ||
      compact(account.shop?.shop_id) ||
      compact(account.globalSeller?.global_seller_id) ||
      DEFAULT_SHOP_ID
    const currentRegion =
      compact(query.get('shop_region')).toUpperCase() ||
      compact(account.shop?.region).toUpperCase() ||
      compact(localStorage.getItem('ecom-seller-affiliate-selected-shop-region')).toUpperCase() ||
      DEFAULT_REGION
    const requestedRegions = splitValues(params.shop_regions || params.regions)
      .map(item => item.toUpperCase())
      .filter(Boolean)
    let regions = requestedRegions.includes('ALL')
      ? readAvailableRegions(account)
      : requestedRegions.filter(item => /^[A-Z]{2}$/.test(item))
    if (!regions.length) regions = [currentRegion]
    regions = Array.from(new Set(regions.length ? regions : [DEFAULT_REGION]))
    const knownFirst = regions.filter(item => KNOWN_REGIONS.includes(item))
    const extra = regions.filter(item => !KNOWN_REGIONS.includes(item))
    regions = [...knownFirst, ...extra]
    return {
      shopId,
      shopName: compact(account.shop?.shop_name || account.globalSeller?.global_seller_name),
      currentRegion,
      regions,
      regionSellerMap,
    }
  }

  function getStarLevels() {
    return splitValues(params.star_levels || params.star_filter || params.star_level)
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item >= 1 && item <= 5)
      .filter((item, index, list) => list.indexOf(item) === index)
  }

  function joinUrls(value) {
    const urls = []
    const push = item => {
      const text = compact(item)
      if (text) urls.push(text)
    }
    const visit = item => {
      if (!item) return
      if (typeof item === 'string') {
        push(item)
        return
      }
      if (Array.isArray(item)) {
        item.forEach(visit)
        return
      }
      if (typeof item === 'object') {
        if (item.url) push(item.url)
        if (item.src) push(item.src)
        if (item.url_list) visit(item.url_list)
        if (item.thumb_url_list) visit(item.thumb_url_list)
        if (item.image_url) push(item.image_url)
      }
    }
    visit(value)
    return Array.from(new Set(urls)).join('\n')
  }

  function formatTimestamp(value) {
    const text = compact(value)
    if (!text || text === '0') return ''
    let ms = Number(text)
    if (!Number.isFinite(ms)) return text
    if (ms > 0 && ms < 100000000000) ms *= 1000
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) return text
    const pad = number => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }

  function normalizeReview(item, context, pageNo, index) {
    const product = item?.product_info || {}
    const filterSummary = [
      `区域=${context.region}`,
      context.starLevels.length ? `评分=${context.starLevels.join('/')}` : '评分=全部',
    ].join('; ')
    return {
      区域: context.region,
      店铺ID: context.shopId,
      店铺名称: context.shopName,
      页码: pageNo,
      序号: ((pageNo - 1) * context.pageSize) + index + 1,
      评价ID: compact(item?.main_review_id || item?.review_id || item?.id),
      评分: item?.star_level ?? '',
      评价时间: formatTimestamp(item?.review_time),
      评价时间戳: compact(item?.review_time),
      评价原文: compact(item?.review_text || item?.text),
      用户名: compact(item?.user_name || item?.username),
      订单ID: compact(item?.order_id),
      商品ID: compact(product.product_id || product.id),
      SKU_ID: compact(product.sku_id),
      商品名称: compact(product.product_name || product.name),
      商品规格: compact(product.sku_specification || product.sku_spec || product.specification),
      你的回复: compact(item?.reply_text),
      回复数: item?.reply_count ?? '',
      回复时间: formatTimestamp(item?.reply_time),
      回复时间戳: compact(item?.reply_time),
      是否可回复: item?.can_reply === false ? '否' : item?.can_reply === true ? '是' : '',
      是否已标记: item?.is_marked === true ? '是' : item?.is_marked === false ? '否' : '',
      是否有图: item?.has_imgs === true || (Array.isArray(item?.review_images) && item.review_images.length) ? '是' : '否',
      评价图片: joinUrls(item?.review_images),
      商品图片: joinUrls(product.img),
      筛选摘要: filterSummary,
    }
  }

  function apiOriginForRegion(region) {
    const normalized = compact(region).toUpperCase()
    if (normalized === 'US') {
      return 'https://seller.us.tiktokshopglobalselling.com'
    }
    const fromPerformance = (() => {
      try {
        return performance.getEntriesByType('resource')
          .map(item => item?.name || '')
          .find(name => /https:\/\/api16-normal-[^/]+\.tiktokshopglobalselling\.com\/api\/v1\/review\/biz_backend\/list/i.test(String(name || '')))
      } catch (error) {
        return ''
      }
    })()
    if (fromPerformance) return new URL(fromPerformance).origin
    return 'https://api16-normal-no1a.tiktokshopglobalselling.com'
  }

  function browserName() {
    return compact(navigator.appCodeName) || 'Mozilla'
  }

  function buildUrl(context) {
    const url = new URL('/api/v1/review/biz_backend/list', apiOriginForRegion(context.region))
    url.searchParams.set('locale', 'zh-CN')
    url.searchParams.set('language', 'zh-CN')
    url.searchParams.set('oec_seller_id', context.shopId)
    url.searchParams.set('aid', '6556')
    url.searchParams.set('app_name', 'i18n_ecom_shop')
    url.searchParams.set('device_platform', 'web')
    url.searchParams.set('cookie_enabled', 'true')
    url.searchParams.set('screen_width', compact(screen.width))
    url.searchParams.set('screen_height', compact(screen.height))
    url.searchParams.set('browser_language', compact(navigator.language || navigator.browserLanguage || 'zh-CN'))
    url.searchParams.set('browser_platform', compact(navigator.platform))
    url.searchParams.set('browser_name', browserName())
    url.searchParams.set('browser_version', compact(navigator.userAgent))
    url.searchParams.set('browser_online', 'true')
    url.searchParams.set('timezone_name', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai')
    const webId = getCookieValue('s_v_web_id')
    if (webId) url.searchParams.set('fp', webId)
    return url.href
  }

  function sellerHostForRegion(region) {
    const normalized = compact(region).toUpperCase()
    return normalized && normalized !== 'US'
      ? 'seller.eu.tiktokshopglobalselling.com'
      : 'seller.us.tiktokshopglobalselling.com'
  }

  function buildTargetUrl(context, region) {
    const url = new URL(`https://${sellerHostForRegion(region || context.currentRegion)}/product/rating`)
    url.searchParams.set('shop_region', region || context.currentRegion || DEFAULT_REGION)
    url.searchParams.set('shop_id', context.shopId || DEFAULT_SHOP_ID)
    return url.href
  }

  function isTargetPage(context, region) {
    const query = new URLSearchParams(location.search || '')
    const actualRegion = compact(query.get('shop_region')).toUpperCase()
    const expectedRegion = compact(region || context.currentRegion || DEFAULT_REGION).toUpperCase()
    const expectedHost = sellerHostForRegion(expectedRegion)
    return String(location.hostname || '').toLowerCase() === expectedHost &&
      /\/product\/rating/.test(String(location.pathname || '')) &&
      actualRegion === expectedRegion
  }

  function sellerIdForRegion(context, region) {
    const normalized = compact(region).toUpperCase()
    return compact(context.regionSellerMap?.[normalized]) || context.shopId || DEFAULT_SHOP_ID
  }

  async function parseJsonResponse(response, label) {
    try {
      return await response.json()
    } catch (error) {
      let text = ''
      try {
        text = await response.text()
      } catch (textError) {
        text = ''
      }
      const snippet = compact(text).slice(0, 160)
      throw new Error(`${label}返回非 JSON：${snippet || error?.message || response.status}`)
    }
  }

  function nextPhase(name, sleepMs, nextShared) {
    return {
      success: true,
      data: [],
      meta: {
        action: 'next_phase',
        next_phase: name,
        sleep_ms: sleepMs,
        shared: nextShared,
      },
    }
  }

  function complete(data, hasMore, nextShared) {
    return {
      success: true,
      data,
      meta: {
        action: 'complete',
        has_more: !!hasMore,
        shared: nextShared,
      },
    }
  }

  function fail(message) {
    return { success: false, error: String(message || '未知错误') }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
  }

  function shouldRetryPayload(payload, response) {
    const message = compact(payload?.message || payload?.msg).toLowerCase()
    const code = Number(payload?.code)
    return message === 'internal error' ||
      message.includes('internal error') ||
      code === 500 ||
      code === 98001002 ||
      Number(response?.status) >= 500
  }

  async function fetchRatingPayload(url, requestInit, retryLimit, retryDelayMs) {
    let lastPayload = null
    let lastResponse = null
    let lastError = null
    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      try {
        const response = await fetch(url, requestInit)
        const payload = await parseJsonResponse(response, '商品评分接口')
        lastPayload = payload
        lastResponse = response
        if (payload?.code === 0 || !shouldRetryPayload(payload, response) || attempt >= retryLimit) {
          return { payload, response, attempts: attempt + 1 }
        }
      } catch (error) {
        lastError = error
        if (attempt >= retryLimit) throw error
      }
      await sleep(retryDelayMs * (attempt + 1))
    }
    return { payload: lastPayload, response: lastResponse, error: lastError, attempts: retryLimit + 1 }
  }

  try {
    const context = resolveContext()
    const starLevels = getStarLevels()
    const pageSize = clampInt(params.page_size, 20, 1, 20)
    const maxPages = clampInt(params.max_pages_per_region, 200, 1, 1000)
    const requestRetries = clampInt(params.request_retries, 3, 0, 8)
    const retryDelayMs = clampInt(params.retry_delay_ms, 1800, 0, 30000)
    const pageDelayMs = clampInt(params.page_delay_ms, 900, 0, 30000)
    const regionIndex = clampInt(shared.region_index, 0, 0, Math.max(context.regions.length - 1, 0))
    const pageNo = clampInt(shared.page_no, 1, 1, maxPages)
    const region = context.regions[regionIndex] || context.currentRegion || DEFAULT_REGION
    if (!region) return fail('未识别到 TikTok 店铺区域，请在参数里选择区域')
    if (!isTargetPage(context, region)) {
      const targetUrl = buildTargetUrl(context, region)
      location.href = targetUrl
      return nextPhase('main', 2200, {
        ...shared,
        target_url: targetUrl,
        region_index: regionIndex,
        page_no: pageNo,
        regions: context.regions,
        shop_id: context.shopId,
      })
    }

    const requestContext = {
      ...context,
      region,
      shopId: sellerIdForRegion(context, region),
      starLevels,
      pageSize,
    }
    const body = { page: pageNo, size: pageSize }
    if (starLevels.length) body.star_level = starLevels

    const { payload, response, attempts } = await fetchRatingPayload(buildUrl(requestContext), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'X-Tt-Oec-Region': region,
      },
      body: JSON.stringify(body),
    }, requestRetries, retryDelayMs)
    if (payload?.code !== 0) {
      return fail(`商品评分接口返回失败：${payload?.message || payload?.code || response?.status}（区域=${region}，页码=${pageNo}，每页=${pageSize}，重试=${attempts}）`)
    }

    const list = Array.isArray(payload?.data?.list) ? payload.data.list : []
    const total = clampInt(payload?.data?.total, list.length, 0, Number.MAX_SAFE_INTEGER)
    const rows = list.map((item, index) => normalizeReview(item, requestContext, pageNo, index))
    const nextPage = pageNo + 1
    const hasNextInRegion = list.length > 0 && nextPage <= maxPages && nextPage <= Math.ceil(Math.max(total, list.length) / pageSize)
    let nextRegionIndex = regionIndex
    let nextPageNo = nextPage
    let hasMore = hasNextInRegion
    if (!hasNextInRegion && regionIndex + 1 < context.regions.length) {
      nextRegionIndex = regionIndex + 1
      nextPageNo = 1
      hasMore = true
    }

    const nextShared = {
      ...shared,
      region_index: nextRegionIndex,
      page_no: nextPageNo,
      regions: context.regions,
      current_region: region,
      shop_id: context.shopId,
      shop_name: context.shopName,
      page_size: pageSize,
      max_pages_per_region: maxPages,
      star_levels: starLevels,
      total_rows: (Number(shared.total_rows) || 0) + rows.length,
      region_totals: {
        ...(shared.region_totals || {}),
        [region]: total,
      },
      current_store: `${context.shopName || context.shopId}-${region}`,
      region_scope: context.regions.join('_'),
    }
    if (hasMore) {
      return {
        success: true,
        data: rows,
        meta: {
          action: 'next_phase',
          next_phase: 'main',
          sleep_ms: pageDelayMs,
          has_more: true,
          shared: nextShared,
        },
      }
    }
    return complete(rows, false, nextShared)
  } catch (error) {
    return fail(error?.message || error)
  }
})()

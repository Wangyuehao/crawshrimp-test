;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}
  const shared = window.__CRAWSHRIMP_SHARED__ || {}

  const DEFAULT_REGION = 'US'
  const DEFAULT_SHOP_ID = '7496042382582647544'
  const KNOWN_REGIONS = ['US', 'GB', 'FR', 'DE', 'IT', 'ES']
  const DEFAULT_STATUS_KEYS = ['active', 'reviewing', 'violation', 'deactivate']

  const PRODUCT_STATUS_OPTIONS = {
    all: { id: 1, label: '全部', path: 'all' },
    active: { id: 2, label: '在售', path: 'active' },
    reviewing: { id: 3, label: '审核中', path: 'reviewing' },
    'listing-failed': { id: 4, label: '审核失败', path: 'listing-failed' },
    deactivate: { id: 5, label: '已下架', path: 'deactivate' },
    suspended: { id: 6, label: '平台下架', path: 'suspended' },
    draft: { id: 7, label: '草稿', path: 'draft' },
    'sold-out': { id: 8, label: '售罄', path: 'sold-out' },
    frozen: { id: 9, label: '已冻结', path: 'frozen' },
    deleted: { id: 10, label: '已删除', path: 'deleted' },
    failed: { id: 12, label: '发布失败', path: 'failed' },
    diagnosis: { id: 13, label: '诊断', path: 'diagnosis' },
    'affiliate-opportunity': { id: 14, label: '联盟机会', path: 'affiliate-opportunity' },
    violation: { id: 19, label: '需要关注', path: 'violation' },
    'traffic-deboost': { id: 20, label: '流量管控', path: 'traffic-deboost' },
  }

  const STATUS_ALIASES = {
    全部: 'all',
    all: 'all',
    active: 'active',
    live: 'active',
    在售: 'active',
    reviewing: 'reviewing',
    review: 'reviewing',
    审核中: 'reviewing',
    violation: 'violation',
    needs_attention: 'violation',
    attention: 'violation',
    需要关注: 'violation',
    deactivate: 'deactivate',
    deactivated: 'deactivate',
    archived: 'deactivate',
    已下架: 'deactivate',
    seller_deactivate: 'deactivate',
    draft: 'draft',
    草稿: 'draft',
    deleted: 'deleted',
    已删除: 'deleted',
    'sold-out': 'sold-out',
    soldout: 'sold-out',
    outofstock: 'sold-out',
    'out-of-stock': 'sold-out',
    售罄: 'sold-out',
    'listing-failed': 'listing-failed',
    listing_failed: 'listing-failed',
    qcfailed: 'listing-failed',
    审核失败: 'listing-failed',
    suspended: 'suspended',
    平台下架: 'suspended',
    frozen: 'frozen',
    已冻结: 'frozen',
    failed: 'failed',
    发布失败: 'failed',
    diagnosis: 'diagnosis',
    诊断: 'diagnosis',
    'affiliate-opportunity': 'affiliate-opportunity',
    affiliate_opportunity: 'affiliate-opportunity',
    联盟机会: 'affiliate-opportunity',
    'traffic-deboost': 'traffic-deboost',
    traffic_deboost: 'traffic-deboost',
    流量管控: 'traffic-deboost',
  }

  const MAIN_STATUS_LABELS = {
    1: '在售',
    2: '已下架',
    3: '已暂停',
    4: '草稿',
    5: '已删除',
    6: '不可见',
  }

  const DISPLAY_STATUS_LABELS = {
    1: '在售',
    2: '商家下架',
    3: '平台下架',
    4: '草稿',
    5: '已删除',
    6: '不可见',
    7: '已冻结',
    8: '审核失败',
    9: '审核中',
    10: '定时发布',
  }

  const FILTER_KEYS = [
    'search_content',
    'category_id',
    'quality_level_list',
    'lower_price',
    'upper_price',
    'display_status_filter',
    'warehouse_ids',
    'commission_plan_status',
    'spo_bind_status',
    'is_pre_order_status',
    'is_make_to_order_status',
    'is_pre_release_order_status',
    'hero_product_filter',
    'is_back_order',
    'has_price_diagnostic_result',
    'affiliate_opportunity_filter',
    'is_low_stock',
    'is_out_of_stock',
    'is_gpr_product',
    'cod_status',
    'has_same_product_draft',
    'has_same_product_audit_failed',
    'is_multi_shop_product',
    'scheduled_sale_filter',
    'is_stock_lock_status',
    'platform_level1',
    'sale_platforms',
    'is_need_campaign_invited',
    'sale_modes',
    'sale_expect_result',
    'is_not_for_sale',
    'sns_filter',
    'toko_source',
    'filter_search',
  ]

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

  function normalizeStatusKey(value) {
    const text = compact(value)
    if (!text) return ''
    const lower = text.toLowerCase().replace(/\s+/g, '-')
    if (PRODUCT_STATUS_OPTIONS[lower]) return lower
    if (STATUS_ALIASES[text]) return STATUS_ALIASES[text]
    if (STATUS_ALIASES[lower]) return STATUS_ALIASES[lower]
    const numeric = Number(text)
    if (Number.isInteger(numeric)) {
      const entry = Object.entries(PRODUCT_STATUS_OPTIONS).find(([, option]) => option.id === numeric)
      if (entry) return entry[0]
    }
    return ''
  }

  function statusFromCurrentPage() {
    const query = new URLSearchParams(location.search || '')
    return normalizeStatusKey(query.get('tab') || query.get('tab_id') || '')
  }

  function resolveStatuses() {
    const rawValues = splitValues(params.product_statuses || params.statuses || params.tabs)
    const selected = rawValues.length ? rawValues : DEFAULT_STATUS_KEYS
    const statuses = []
    const seen = new Set()
    for (const item of selected) {
      const key = normalizeStatusKey(item)
      if (!key || seen.has(key)) continue
      const option = PRODUCT_STATUS_OPTIONS[key]
      if (!option) continue
      seen.add(key)
      statuses.push({ ...option, key })
    }
    if (!statuses.length) {
      const pageKey = statusFromCurrentPage()
      if (pageKey && PRODUCT_STATUS_OPTIONS[pageKey]) {
        statuses.push({ ...PRODUCT_STATUS_OPTIONS[pageKey], key: pageKey })
      }
    }
    return statuses.length
      ? statuses
      : DEFAULT_STATUS_KEYS.map(key => ({ ...PRODUCT_STATUS_OPTIONS[key], key }))
  }

  function joinUnique(values, delimiter = '\n') {
    const clean = []
    const seen = new Set()
    for (const value of values) {
      const text = compact(value)
      if (!text || seen.has(text)) continue
      seen.add(text)
      clean.push(text)
    }
    return clean.join(delimiter)
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
        if (item.uri) push(item.uri)
        if (item.url_list) visit(item.url_list)
        if (item.thumb_url_list) visit(item.thumb_url_list)
        if (item.image_url) push(item.image_url)
        if (item.img_url) push(item.img_url)
      }
    }
    visit(value)
    return joinUnique(urls)
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

  function formatPercent(value) {
    if (value == null || value === '') return ''
    const number = Number(value)
    if (!Number.isFinite(number)) return compact(value)
    return `${(number * 100).toFixed(2)}%`
  }

  function firstText(...values) {
    for (const value of values) {
      const text = compact(value)
      if (text) return text
    }
    return ''
  }

  function priceText(value) {
    if (value == null) return ''
    if (typeof value === 'string' || typeof value === 'number') return compact(value)
    if (typeof value !== 'object') return ''
    return firstText(
      value.price_format,
      value.sale_price_format,
      value.list_price_format,
      value.min_price_format,
      value.price,
      value.amount_format,
      value.amount,
      value.value,
      value.min_price,
    )
  }

  function priceRangeText(product) {
    const range = product?.price_range || product?.sale_price_range || product?.sale_price_ranges?.[0] || {}
    const min = firstText(range.min_price_format, range.min_sale_price_format, range.min_price, range.min)
    const max = firstText(range.max_price_format, range.max_sale_price_format, range.max_price, range.max)
    if (min && max && min !== max) return `${min} - ${max}`
    return min || max || joinUnique((product?.skus || []).map(sku => priceText(sku?.base_price?.sale_price || sku?.base_price)))
  }

  function skuPriceList(skus, keyNames) {
    return joinUnique(skus.map(sku => {
      const base = sku?.base_price || {}
      for (const key of keyNames) {
        const value = priceText(base[key] || sku?.[key])
        if (value) return value
      }
      return priceText(base)
    }))
  }

  function quantityNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
  }

  function sumSkuQuantity(skus, matcher) {
    let total = 0
    for (const sku of skus) {
      const quantities = Array.isArray(sku?.quantities) ? sku.quantities : []
      for (const item of quantities) {
        const typeText = compact(item?.type || item?.quantity_type || item?.stock_type || item?.name).toLowerCase()
        if (matcher(typeText, item)) {
          total += quantityNumber(item?.quantity ?? item?.available_stock ?? item?.stock)
        }
      }
    }
    return total || ''
  }

  function availableStock(product, skus) {
    const direct = product?.total_available_stock ?? product?.quantity?.total_available_stock ?? product?.quantity?.available_stock
    if (direct != null && direct !== '') return direct
    return sumSkuQuantity(skus, typeText => /available|sale|sellable|可售/.test(typeText))
  }

  function totalStock(product, skus) {
    const direct = product?.quantity?.total_stock ??
      product?.total_stock ??
      product?.quantity?.stock ??
      product?.total_available_stock ??
      product?.quantity?.total_available_stock
    if (direct != null && direct !== '') return direct
    const available = availableStock(product, skus)
    const total = sumSkuQuantity(skus, typeText => /total|stock|库存/.test(typeText))
    return total || available
  }

  function formatSkuProperties(sku) {
    const properties = Array.isArray(sku?.properties) ? sku.properties : []
    return joinUnique(properties.map(item => {
      const name = firstText(item?.name, item?.property_name, item?.display_name)
      const value = firstText(item?.value_name, item?.value, item?.property_value_name, item?.property_value)
      if (name && value) return `${name}=${value}`
      return value || name
    }), '; ')
  }

  function formatSkuStockDetails(skus) {
    return joinUnique(skus.map(sku => {
      const identity = firstText(sku?.seller_sku, sku?.id, sku?.global_sku_id)
      const quantities = Array.isArray(sku?.quantities) ? sku.quantities : []
      const details = quantities.map(item => {
        const name = firstText(item?.warehouse_name, item?.warehouse_id, item?.type, item?.name)
        const quantity = item?.quantity ?? item?.available_stock ?? item?.stock
        return name ? `${name}:${quantity}` : compact(quantity)
      }).filter(Boolean).join('; ')
      return details ? `${identity}: ${details}` : identity
    }))
  }

  function categoryText(categories) {
    if (!Array.isArray(categories)) return ''
    return joinUnique(categories.map(item => firstText(
      item?.local_display_name,
      item?.display_name,
      item?.name,
      item?.category_name,
      item?.id,
    )), ' / ')
  }

  function brandText(brand) {
    if (!brand) return ''
    if (typeof brand === 'string') return compact(brand)
    return firstText(brand.name, brand.brand_name, brand.local_name, brand.id)
  }

  function promotionText(values) {
    const list = Array.isArray(values) ? values : (values ? [values] : [])
    return joinUnique(list.map(item => {
      if (typeof item === 'string') return item
      return firstText(item?.name, item?.promotion_name, item?.activity_name, item?.title, item?.id)
    }))
  }

  function sameProductText(product) {
    const list = Array.isArray(product?.same_product_info_list) ? product.same_product_info_list : []
    return joinUnique(list.map(item => {
      const region = firstText(item?.shop_region, item?.region, item?.country)
      const id = firstText(item?.product_id, item?.id)
      const name = firstText(item?.product_name, item?.name)
      return [region, id, name].filter(Boolean).join(':')
    }))
  }

  function statusLabel(map, value) {
    const key = Number(value)
    return map[key] || compact(value)
  }

  function productStatusCode(product) {
    const view = product?.product_status_view || {}
    return joinUnique([
      view.product_main_status != null ? `main=${view.product_main_status}` : '',
      view.product_display_status != null ? `display=${view.product_display_status}` : '',
      product?.product_status != null ? `product=${product.product_status}` : '',
      product?.audit_status != null ? `audit=${product.audit_status}` : '',
    ], '; ')
  }

  function reasonText(product) {
    const values = []
    const visit = item => {
      if (!item) return
      if (typeof item === 'string') {
        values.push(item)
        return
      }
      if (Array.isArray(item)) {
        item.forEach(visit)
        return
      }
      if (typeof item === 'object') {
        values.push(item.title, item.reason, item.message, item.desc, item.description, item.text)
      }
    }
    visit(product?.suspend_reason)
    visit(product?.visible_status?.reason)
    visit(product?.product_status_view?.reason)
    visit(product?.sync_failed_reason)
    return joinUnique(values, '; ')
  }

  function productQualityLevel(product) {
    const tier = product?.product_tier_info || {}
    return firstText(
      tier.tier_name,
      tier.level_name,
      tier.quality_level,
      tier.level,
      product?.quality_level,
      product?.listing_quality_level,
    )
  }

  function productQualityIssueCount(product) {
    const tier = product?.product_tier_info || {}
    const candidates = [
      tier.issue_count,
      tier.problem_count,
      tier.todo_count,
      tier.improvement_count,
      product?.quality_issue_count,
      product?.listing_quality_issue_count,
    ]
    for (const value of candidates) {
      if (value != null && value !== '') return value
    }
    return ''
  }

  function packageDimension(product) {
    const width = firstText(product?.package_width, product?.package_dimension?.width)
    const height = firstText(product?.package_height, product?.package_dimension?.height)
    const length = firstText(product?.package_length, product?.package_dimension?.length)
    const unit = firstText(product?.package_dimension_unit, product?.package_dimension?.unit)
    const dimension = [length, width, height].filter(Boolean).join(' x ')
    return dimension ? `${dimension}${unit ? ` ${unit}` : ''}` : ''
  }

  function booleanText(value) {
    if (value === true || value === 1 || value === '1') return '是'
    if (value === false || value === 0 || value === '0') return '否'
    return ''
  }

  function lowStockValue(product) {
    if (product?.product_low_stock && typeof product.product_low_stock === 'object') {
      return product.product_low_stock.is_low_stock ?? product.product_low_stock.low_stock ?? product.product_low_stock.value
    }
    return product?.product_low_stock ?? product?.is_low_stock
  }

  function soldOutValue(product, status) {
    if (product?.is_out_of_stock != null) return product.is_out_of_stock
    if (product?.product_stock_status != null) return compact(product.product_stock_status).toLowerCase() === 'out_of_stock'
    if (status?.key === 'sold-out') return true
    return false
  }

  function normalizeProduct(product, context, pageNo, index, status) {
    const skus = Array.isArray(product?.skus) ? product.skus : []
    const view = product?.product_status_view || {}
    const filterSummary = [
      `区域=${context.region}`,
      `状态=${status.label}`,
      context.filterSummary,
    ].filter(Boolean).join('; ')
    return {
      __sheet_name: status.label,
      区域: context.region,
      店铺ID: context.shopId,
      店铺名称: context.shopName,
      状态Tab: status.label,
      状态TabID: status.id,
      页码: pageNo,
      序号: ((pageNo - 1) * context.pageSize) + index + 1,
      商品ID: compact(product?.product_id || product?.id),
      商品标题: compact(product?.product_name || product?.title || product?.name),
      商品图片: joinUrls(product?.image || product?.images),
      主状态: statusLabel(MAIN_STATUS_LABELS, view.product_main_status),
      展示状态: statusLabel(DISPLAY_STATUS_LABELS, view.product_display_status),
      是否在线版本: booleanText(product?.is_online_version),
      审核状态: compact(product?.audit_status),
      商品状态码: productStatusCode(product),
      总SKU数: product?.total_sku_count ?? skus.length,
      接口返回SKU数: skus.length,
      SKU_ID列表: joinUnique(skus.map(sku => sku?.id)),
      商家SKU列表: joinUnique(skus.map(sku => sku?.seller_sku)),
      全球SKU_ID列表: joinUnique(skus.map(sku => sku?.global_sku_id)),
      SKU规格: joinUnique(skus.map(formatSkuProperties)),
      库存总数: totalStock(product, skus),
      可售库存: availableStock(product, skus),
      SKU库存明细: formatSkuStockDetails(skus),
      价格区间: priceRangeText(product),
      销售价: skuPriceList(skus, ['sale_price', 'sale_price_format', 'price']),
      标价: skuPriceList(skus, ['list_price', 'list_price_format', 'origin_price']),
      促销价: skuPriceList(skus, ['promotion_price', 'promotion_price_format', 'discount_price']),
      近28天浏览次数: compact(product?.product_performance?.last_28days_pv),
      近28天订单数: compact(product?.product_performance?.last_28days_order),
      近28天GMV: compact(product?.product_performance?.last_28days_gmv),
      近7天GMV环比: formatPercent(product?.product_performance?.last_7days_gmv_sequential_value),
      其他店铺数量: product?.same_product_count ?? '',
      其他店铺: sameProductText(product),
      类目: categoryText(product?.categories),
      品牌: brandText(product?.brand),
      促销活动: promotionText(product?.promotion_infos),
      有效促销: promotionText(product?.effective_promotions),
      违规记录ID: compact(product?.violation_records_id),
      '暂停/冻结原因': reasonText(product),
      发品质量等级: productQualityLevel(product),
      发品质量问题数: productQualityIssueCount(product),
      低库存: booleanText(lowStockValue(product)),
      售罄: booleanText(soldOutValue(product, status)),
      创建时间: formatTimestamp(product?.create_time),
      更新时间: formatTimestamp(product?.edit_time || product?.update_time),
      删除时间: formatTimestamp(product?.delete_time),
      冻结时间: formatTimestamp(product?.frozen_time || product?.freeze_time),
      包裹重量: firstText(product?.package_weight, product?.package_weight_info?.weight),
      包裹尺寸: packageDimension(product),
      是否多仓: booleanText(product?.is_multi_warehouse),
      是否订阅: booleanText(product?.is_subscribe),
      是否英雄商品: booleanText(product?.is_hero),
      筛选摘要: filterSummary,
    }
  }

  function sellerHostForRegion(region) {
    const normalized = compact(region).toUpperCase()
    return normalized && normalized !== 'US'
      ? 'seller.eu.tiktokshopglobalselling.com'
      : 'seller.us.tiktokshopglobalselling.com'
  }

  function apiOriginForRegion(region) {
    return `https://${sellerHostForRegion(region)}`
  }

  function buildTargetUrl(context, region, status) {
    const url = new URL(`https://${sellerHostForRegion(region || context.currentRegion)}/product/manage`)
    url.searchParams.set('shop_region', region || context.currentRegion || DEFAULT_REGION)
    url.searchParams.set('shop_id', context.shopId || DEFAULT_SHOP_ID)
    if (status?.path) url.searchParams.set('tab', status.path)
    return url.href
  }

  function isTargetPage(context, region) {
    const query = new URLSearchParams(location.search || '')
    const actualRegion = compact(query.get('shop_region')).toUpperCase()
    const expectedRegion = compact(region || context.currentRegion || DEFAULT_REGION).toUpperCase()
    const expectedHost = sellerHostForRegion(expectedRegion)
    return String(location.hostname || '').toLowerCase() === expectedHost &&
      /\/product\/manage/.test(String(location.pathname || '')) &&
      actualRegion === expectedRegion
  }

  function sellerIdForRegion(context, region) {
    const normalized = compact(region).toUpperCase()
    return compact(context.regionSellerMap?.[normalized]) || context.shopId || DEFAULT_SHOP_ID
  }

  function browserName() {
    return compact(navigator.appCodeName) || 'Mozilla'
  }

  function appendSearchParam(url, key, value) {
    if (value == null || value === '') return
    if (Array.isArray(value)) {
      value.forEach(item => appendSearchParam(url, key, item))
      return
    }
    const text = compact(value)
    if (!text) return
    url.searchParams.append(key, text)
  }

  function buildFilters() {
    const query = new URLSearchParams(location.search || '')
    const filters = {}
    for (const key of FILTER_KEYS) {
      const urlValues = query.getAll(key).filter(Boolean)
      if (urlValues.length === 1) filters[key] = urlValues[0]
      if (urlValues.length > 1) filters[key] = urlValues
      if (params[key] != null && params[key] !== '') filters[key] = params[key]
    }

    if (params.stock_filter === 'low') filters.is_low_stock = true
    if (params.stock_filter === 'out') filters.is_out_of_stock = true

    return filters
  }

  function filterSummary(filters) {
    const parts = []
    for (const key of FILTER_KEYS) {
      const value = filters[key]
      if (value == null || value === '') continue
      const text = Array.isArray(value) ? value.map(compact).filter(Boolean).join('/') : compact(value)
      if (text) parts.push(`${key}=${text}`)
    }
    return parts.join('; ')
  }

  function buildListUrl(context) {
    const url = new URL('/api/v1/product/local/products/list', apiOriginForRegion(context.region))
    url.searchParams.set('locale', 'zh-CN')
    url.searchParams.set('language', 'zh-CN')
    url.searchParams.set('oec_seller_id', context.shopId)
    url.searchParams.set('seller_id', context.shopId)
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
    try {
      url.searchParams.set('timezone_name', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai')
    } catch (error) {
      url.searchParams.set('timezone_name', 'Asia/Shanghai')
    }
    const webId = getCookieValue('s_v_web_id')
    if (webId) url.searchParams.set('fp', webId)

    url.searchParams.set('tab_id', String(context.status.id))
    url.searchParams.set('page_number', String(context.pageNo))
    url.searchParams.set('page_size', String(context.pageSize))
    url.searchParams.set('sku_number', String(context.skuNumber))
    url.searchParams.set('is_need_target_stock', 'true')
    url.searchParams.set('same_product_page_size', String(context.sameProductPageSize))
    url.searchParams.set('is_need_clearance_tag', 'true')

    const sortFields = splitValues(params.product_sort_fields || params.sort_fields || '3')
    const sortTypes = splitValues(params.product_sort_types || params.sort_types || '0')
    for (const item of sortFields) url.searchParams.append('product_sort_fields', item)
    for (const item of sortTypes) url.searchParams.append('product_sort_types', item)
    for (const [key, value] of Object.entries(context.filters)) appendSearchParam(url, key, value)
    return url.href
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

  async function fetchProductPayload(url, requestInit, retryLimit, retryDelayMs) {
    let lastPayload = null
    let lastResponse = null
    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      const response = await fetch(url, requestInit)
      const payload = await parseJsonResponse(response, '商品管理列表接口')
      lastPayload = payload
      lastResponse = response
      if (payload?.code === 0 || !shouldRetryPayload(payload, response) || attempt >= retryLimit) {
        return { payload, response, attempts: attempt + 1 }
      }
      await sleep(retryDelayMs * (attempt + 1))
    }
    return { payload: lastPayload, response: lastResponse, attempts: retryLimit + 1 }
  }

  function productsFromPayload(payload) {
    const data = payload?.data || {}
    if (Array.isArray(data.products)) return data.products
    if (Array.isArray(data.list)) return data.list
    if (Array.isArray(data.product_list)) return data.product_list
    return []
  }

  function totalFromPayload(payload, list) {
    const data = payload?.data || {}
    return clampInt(
      data.total_product_count ?? data.total_count ?? data.total ?? data.count,
      list.length,
      0,
      Number.MAX_SAFE_INTEGER,
    )
  }

  try {
    const context = resolveContext()
    const statuses = resolveStatuses()
    const filters = buildFilters()
    const pageSize = clampInt(params.page_size, 50, 1, 100)
    const skuNumber = clampInt(params.sku_number, 50, 1, 100)
    const sameProductPageSize = clampInt(params.same_product_page_size, 3, 0, 20)
    const maxPages = clampInt(params.max_pages_per_status || params.max_pages_per_region, 200, 1, 1000)
    const requestRetries = clampInt(params.request_retries, 3, 0, 8)
    const retryDelayMs = clampInt(params.retry_delay_ms, 1800, 0, 30000)
    const pageDelayMs = clampInt(params.page_delay_ms, 900, 0, 30000)
    const regionIndex = clampInt(shared.region_index, 0, 0, Math.max(context.regions.length - 1, 0))
    const statusIndex = clampInt(shared.status_index, 0, 0, Math.max(statuses.length - 1, 0))
    const pageNo = clampInt(shared.page_no, 1, 1, maxPages)
    const region = context.regions[regionIndex] || context.currentRegion || DEFAULT_REGION
    const status = statuses[statusIndex] || statuses[0]
    if (!region) return fail('未识别到 TikTok 店铺区域，请在参数里选择区域')
    if (!status) return fail('未识别到商品状态 Tab，请检查商品状态参数')

    if (!isTargetPage(context, region)) {
      const targetUrl = buildTargetUrl(context, region, status)
      location.href = targetUrl
      return {
        success: true,
        data: [],
        meta: {
          action: 'next_phase',
          next_phase: 'main',
          sleep_ms: 2200,
          has_more: true,
          shared: {
            ...shared,
            target_url: targetUrl,
            region_index: regionIndex,
            status_index: statusIndex,
            page_no: pageNo,
            regions: context.regions,
            statuses: statuses.map(item => item.key),
            shop_id: context.shopId,
          },
        },
      }
    }

    const requestContext = {
      ...context,
      region,
      shopId: sellerIdForRegion(context, region),
      status,
      filters,
      filterSummary: filterSummary(filters),
      pageNo,
      pageSize,
      skuNumber,
      sameProductPageSize,
    }

    const { payload, response, attempts } = await fetchProductPayload(buildListUrl(requestContext), {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Tt-Oec-Region': region,
      },
    }, requestRetries, retryDelayMs)
    if (payload?.code !== 0) {
      return fail(`商品管理列表接口返回失败：${payload?.message || payload?.code || response?.status}（区域=${region}，状态=${status.label}，页码=${pageNo}，每页=${pageSize}，重试=${attempts}）`)
    }

    const list = productsFromPayload(payload)
    const total = totalFromPayload(payload, list)
    const rows = list.map((item, index) => normalizeProduct(item, requestContext, pageNo, index, status))
    const nextPage = pageNo + 1
    const hasNextInStatus = list.length > 0 && nextPage <= maxPages && nextPage <= Math.ceil(Math.max(total, list.length) / pageSize)
    let nextRegionIndex = regionIndex
    let nextStatusIndex = statusIndex
    let nextPageNo = nextPage
    let hasMore = hasNextInStatus
    if (!hasNextInStatus) {
      if (statusIndex + 1 < statuses.length) {
        nextStatusIndex = statusIndex + 1
        nextPageNo = 1
        hasMore = true
      } else if (regionIndex + 1 < context.regions.length) {
        nextRegionIndex = regionIndex + 1
        nextStatusIndex = 0
        nextPageNo = 1
        hasMore = true
      }
    }

    const nextShared = {
      ...shared,
      region_index: nextRegionIndex,
      status_index: nextStatusIndex,
      page_no: nextPageNo,
      regions: context.regions,
      statuses: statuses.map(item => item.key),
      current_region: region,
      current_status: status.key,
      shop_id: context.shopId,
      shop_name: context.shopName,
      page_size: pageSize,
      sku_number: skuNumber,
      max_pages_per_status: maxPages,
      filters,
      total_rows: (Number(shared.total_rows) || 0) + rows.length,
      status_totals: {
        ...(shared.status_totals || {}),
        [`${region}:${status.key}`]: total,
      },
      current_store: `${context.shopName || context.shopId}-${region}-${status.label}`,
      region_scope: context.regions.join('_'),
      status_scope: statuses.map(item => item.label).join('_'),
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

    return {
      success: true,
      data: rows,
      meta: {
        action: 'complete',
        has_more: false,
        shared: nextShared,
      },
    }
  } catch (error) {
    return fail(error?.message || error)
  }
})()

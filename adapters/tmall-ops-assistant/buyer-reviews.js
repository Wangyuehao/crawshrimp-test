;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}
  const shared = window.__CRAWSHRIMP_SHARED__ || {}
  const phase = window.__CRAWSHRIMP_PHASE__ || 'main'

  const DEFAULT_PAGE_SIZE = 20
  const DEFAULT_MAX_PAGES = 30
  const PAGE_DELAY_MIN_MS = 1500
  const PAGE_DELAY_MAX_MS = 3500
  const ITEM_DELAY_MIN_MS = 4000
  const ITEM_DELAY_MAX_MS = 8000

  function compact(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
  }

  function toNumber(value, fallback, min, max) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    const integer = Math.floor(parsed)
    if (Number.isFinite(min) && integer < min) return min
    if (Number.isFinite(max) && integer > max) return max
    return integer
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function randomInt(min, max) {
    const low = Math.ceil(Number(min) || 0)
    const high = Math.floor(Number(max) || low)
    if (high <= low) return low
    return low + Math.floor(Math.random() * (high - low + 1))
  }

  async function sleepRandom(min, max) {
    return await sleep(randomInt(min, max))
  }

  function normalizeUrl(rawUrl) {
    const text = compact(rawUrl)
    if (!text) return ''
    if (text.startsWith('//')) return `https:${text}`
    if (/^https?:\/\//i.test(text)) return text
    return text
  }

  function parseUrl(rawUrl) {
    const text = compact(rawUrl).replace(/[、，,;；]+$/g, '')
    if (!text) return null
    try {
      return new URL(text)
    } catch (error) {
      try {
        return new URL(text, String(location.href || 'https://detail.tmall.com/item.htm'))
      } catch (nestedError) {
        return null
      }
    }
  }

  function readSearchParam(url, keys) {
    if (!url?.searchParams) return ''
    for (const key of keys) {
      const value = compact(url.searchParams.get(key))
      if (value) return value
    }
    return ''
  }

  function parseItemLink(rawUrl) {
    const url = parseUrl(rawUrl)
    const rawText = compact(rawUrl)
    const itemId =
      readSearchParam(url, ['id', 'itemId', 'item_id', 'itemNumId', 'item_num_id']) ||
      compact((rawText.match(/[?&](?:id|itemId|item_id|itemNumId|item_num_id)=(\d+)/i) || [])[1])
    const skuId =
      readSearchParam(url, ['skuId', 'sku_id']) ||
      compact((rawText.match(/[?&](?:skuId|sku_id)=(\d+)/i) || [])[1])
    if (!/^\d{6,}$/.test(itemId)) return null
    return {
      itemId,
      skuId,
      url: url ? url.href : rawText,
    }
  }

  function extractLinksFromText(value) {
    const text = String(value || '').trim()
    if (!text) return []
    const multiUrlMatches = text.match(/https?:\/\/[\s\S]*?(?=https?:\/\/|$)/gi)
    if (multiUrlMatches?.length) {
      return multiUrlMatches
        .map(item => item.replace(/[、，,;；]+$/g, '').trim())
        .filter(Boolean)
    }
    return text
      .split(/[\n\r\t 、，,;；]+/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  function getInputItems() {
    const rawLinks = [
      ...extractLinksFromText(params.item_links),
      ...extractLinksFromText(params.item_url),
      ...extractLinksFromText(params.links),
    ]
    if (!rawLinks.length) rawLinks.push(String(location.href || ''))
    const seen = new Set()
    return rawLinks
      .map(parseItemLink)
      .filter(Boolean)
      .filter(item => {
        const key = `${item.itemId}:${item.skuId || ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  function safeJsonParse(value) {
    if (value == null || value === '') return null
    if (typeof value === 'object') return value
    const text = String(value).trim()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch (error) {
      const match = text.match(/^[\w$.]+\(([\s\S]*)\)\s*;?$/)
      if (match) {
        try {
          return JSON.parse(match[1])
        } catch (nestedError) {
          return null
        }
      }
      const objectStart = text.indexOf('{')
      const objectEnd = text.lastIndexOf('}')
      if (objectStart >= 0 && objectEnd > objectStart) {
        try {
          return JSON.parse(text.slice(objectStart, objectEnd + 1))
        } catch (nestedError) {
          return null
        }
      }
      return null
    }
  }

  function getByPath(source, path) {
    let current = source
    for (const key of path) {
      if (current == null || typeof current !== 'object') return undefined
      current = current[key]
    }
    return current
  }

  function findFirstArray(source, paths) {
    for (const path of paths) {
      const value = getByPath(source, path)
      if (Array.isArray(value)) return value
    }
    return []
  }

  function findFirstValue(source, paths) {
    for (const path of paths) {
      const value = getByPath(source, path)
      if (value != null && value !== '') return value
    }
    return undefined
  }

  function normalizeImageList(value) {
    if (!value) return []
    const list = Array.isArray(value) ? value : [value]
    return list
      .map(item => {
        if (typeof item === 'string') return normalizeUrl(item)
        if (item && typeof item === 'object') {
          return normalizeUrl(item.url || item.picUrl || item.imgUrl || item.imageUrl || item.thumbnail || item.src)
        }
        return ''
      })
      .filter(Boolean)
  }

  function normalizeSku(value) {
    if (!value) return ''
    if (typeof value === 'string') return compact(value)
    if (Array.isArray(value)) return value.map(normalizeSku).filter(Boolean).join('; ')
    if (typeof value === 'object') {
      return Object.entries(value)
        .map(([key, val]) => `${compact(key)}:${compact(val)}`)
        .filter(item => !/:$/.test(item))
        .join('; ')
    }
    return compact(value)
  }

  function getAppendComment(review) {
    const append = review?.appendComment || review?.append || review?.appendRate || review?.additionalComment
    const first = Array.isArray(append) ? append[0] : append
    if (!first || typeof first !== 'object') {
      return { content: typeof first === 'string' ? compact(first) : '', time: '' }
    }
    return {
      content: compact(first.content || first.rateContent || first.comment || first.feedback || first.text),
      time: compact(first.commentTime || first.rateDate || first.date || first.createTime || first.gmtCreate),
    }
  }

  function normalizeReview(review, context) {
    const append = getAppendComment(review)
    const images = normalizeImageList(
      review?.pics ||
      review?.images ||
      review?.photos ||
      review?.pictures ||
      review?.imageList ||
      review?.ratePicList ||
      review?.feedPicPathList ||
      review?.feedPicList,
    )
    const reviewId = compact(review?.id || review?.rateId || review?.commentId || review?.feedbackId || review?.idStr)
    const content = compact(
      review?.rateContent ||
      review?.feedback ||
      review?.content ||
      review?.comment ||
      review?.commentContent ||
      review?.reviewContent ||
      review?.text,
    )
    return {
      商品ID: context.itemId,
      SKU_ID: context.skuId || '',
      商品链接: context.url,
      商品标题: compact(review?.auctionTitle || review?.itemTitle || review?.title || context.title),
      页码: context.page,
      序号: context.index,
      评价ID: reviewId,
      买家昵称: compact(review?.reduceUserNick || review?.displayUserNick || review?.userNick || review?.nick || review?.buyerNick || review?.user?.nick),
      评价时间: compact(review?.rateDate || review?.feedbackDate || review?.commentTime || review?.date || review?.createTime || review?.gmtCreate),
      评分: compact(review?.rateStar || review?.serviceRate || review?.star || review?.score || review?.grade),
      规格: normalizeSku(review?.auctionSku || review?.skuInfo || review?.skuMap || review?.sku || review?.skuValueStr || review?.itemSku),
      评价内容: content,
      追评内容: append.content,
      追评时间: append.time,
      评价图片: images.join('\n'),
      有图: images.length ? '是' : '否',
      数据来源: context.source,
      执行结果: '成功',
      备注: '',
    }
  }

  function dedupeRows(rows) {
    const seen = new Set()
    return rows.filter(row => {
      const key = row.评价ID
        ? `${row.商品ID}|${row.评价ID}`
        : `${row.商品ID}|${row.买家昵称}|${row.评价时间}|${row.规格}|${row.评价内容}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function extractReviewItems(payload) {
    return findFirstArray(payload, [
      ['rateDetail', 'rateList'],
      ['rateDetail', 'list'],
      ['data', 'rateDetail', 'rateList'],
      ['data', 'rateList'],
      ['data', 'list'],
      ['data', 'items'],
      ['data', 'comments'],
      ['data', 'feedbacks'],
      ['result', 'rateList'],
      ['result', 'list'],
      ['model', 'rateDetail', 'rateList'],
      ['rateList'],
      ['list'],
      ['items'],
      ['comments'],
    ])
  }

  function extractPaginator(payload) {
    const total = findFirstValue(payload, [
      ['rateDetail', 'paginator', 'items'],
      ['rateDetail', 'paginator', 'total'],
      ['data', 'rateDetail', 'paginator', 'items'],
      ['data', 'total'],
      ['data', 'totalCount'],
      ['data', 'count'],
      ['result', 'total'],
      ['paginator', 'items'],
      ['total'],
      ['totalCount'],
    ])
    const lastPage = findFirstValue(payload, [
      ['rateDetail', 'paginator', 'lastPage'],
      ['data', 'rateDetail', 'paginator', 'lastPage'],
      ['data', 'lastPage'],
      ['paginator', 'lastPage'],
      ['lastPage'],
    ])
    const hasNext = findFirstValue(payload, [
      ['data', 'hasNext'],
      ['hasNext'],
    ])
    return {
      total: Number(total) || 0,
      lastPage: Number(lastPage) || 0,
      hasNext,
    }
  }

  function stringifyMetaValue(value) {
    if (value == null || value === '') return ''
    if (typeof value === 'object') return compact(JSON.stringify(value))
    return compact(value)
  }

  function extractReviewVisibility(payload, item) {
    const summary = {
      item_id: item.itemId,
      sku_id: item.skuId || '',
      feed_all_count: stringifyMetaValue(findFirstValue(payload, [
        ['feedAllCount'],
        ['data', 'feedAllCount'],
        ['rateDetail', 'feedAllCount'],
        ['data', 'rateDetail', 'feedAllCount'],
        ['data', 'module', 'feedAllCount'],
        ['module', 'feedAllCount'],
      ])),
      feed_all_count_fuzzy: stringifyMetaValue(findFirstValue(payload, [
        ['feedAllCountFuzzy'],
        ['data', 'feedAllCountFuzzy'],
        ['rateDetail', 'feedAllCountFuzzy'],
        ['data', 'rateDetail', 'feedAllCountFuzzy'],
        ['data', 'module', 'feedAllCountFuzzy'],
        ['module', 'feedAllCountFuzzy'],
      ])),
      fold_count: stringifyMetaValue(findFirstValue(payload, [
        ['foldCount'],
        ['foldFlagCount'],
        ['data', 'foldCount'],
        ['data', 'foldFlagCount'],
        ['rateDetail', 'foldCount'],
        ['data', 'rateDetail', 'foldCount'],
        ['data', 'module', 'foldCount'],
        ['data', 'module', 'foldFlagCount'],
        ['module', 'foldCount'],
        ['module', 'foldFlagCount'],
      ])),
      fold_info: stringifyMetaValue(findFirstValue(payload, [
        ['foldInfo'],
        ['data', 'foldInfo'],
        ['rateDetail', 'foldInfo'],
        ['data', 'rateDetail', 'foldInfo'],
        ['data', 'module', 'foldInfo'],
        ['module', 'foldInfo'],
      ])),
      first_page_tips: stringifyMetaValue(findFirstValue(payload, [
        ['firstPageTips'],
        ['data', 'firstPageTips'],
        ['rateDetail', 'firstPageTips'],
        ['data', 'rateDetail', 'firstPageTips'],
        ['data', 'module', 'firstPageTips'],
        ['module', 'firstPageTips'],
      ])),
      collected_reviews: 0,
    }
    const hasVisibilityInfo = [
      summary.feed_all_count,
      summary.feed_all_count_fuzzy,
      summary.fold_count,
      summary.fold_info,
      summary.first_page_tips,
    ].some(Boolean)
    return hasVisibilityInfo ? summary : null
  }

  function mergeReviewVisibility(current, next) {
    if (!next) return current
    if (!current) return next
    return {
      ...current,
      feed_all_count: current.feed_all_count || next.feed_all_count,
      feed_all_count_fuzzy: current.feed_all_count_fuzzy || next.feed_all_count_fuzzy,
      fold_count: current.fold_count || next.fold_count,
      fold_info: current.fold_info || next.fold_info,
      first_page_tips: current.first_page_tips || next.first_page_tips,
    }
  }

  function buildReviewVisibilityNote(summaries) {
    const folded = summaries
      .filter(item => compact(item.fold_count))
      .map(item => `${item.item_id} 折叠 ${item.fold_count} 条`)
    if (!folded.length) return ''
    return `天猫评价接口返回折叠计数：${folded.join('；')}。接口仅返回可见评价明细，折叠评价目前不暴露明细列表。`
  }

  function hasTruthyNext(value) {
    if (value === true) return true
    const text = compact(value).toLowerCase()
    return text === 'true' || text === '1' || text === 'yes'
  }

  function getMtopClient() {
    const mtop = window?.lib?.mtop
    if (!mtop || typeof mtop.request !== 'function') return null
    return mtop
  }

  function buildMtopRequest(item, page, pageSize) {
    return {
      api: 'mtop.taobao.rate.detaillist.get',
      v: '6.0',
      appKey: '12574478',
      type: 'GET',
      dataType: 'jsonp',
      valueType: 'string',
      data: {
        showTrueCount: false,
        auctionNumId: item.itemId,
        pageNo: page,
        pageSize,
        orderType: '',
        searchImpr: '-8',
        expression: '',
        skuVids: '',
        rateSrc: 'pc_rate_list',
        rateType: '',
        foldFlag: '0',
      },
    }
  }

  function buildReviewApiUrls(item, page, pageSize) {
    const query = new URLSearchParams({
      itemId: item.itemId,
      itemNumId: item.itemId,
      currentPage: String(page),
      pageSize: String(pageSize),
      order: '3',
      append: '0',
      content: '1',
    })
    return [
      `https://rate.tmall.com/list_detail_rate.htm?${query.toString()}`,
      `https://rate.tmall.com/list_detail_rate.htm?itemId=${encodeURIComponent(item.itemId)}&currentPage=${page}&pageSize=${pageSize}&order=3`,
    ]
  }

  async function parseResponsePayload(response) {
    let payload = null
    try {
      payload = await response.clone().json()
    } catch (error) {
      payload = null
    }
    if (payload) return { payload, text: '' }
    try {
      const text = await response.text()
      return { payload: safeJsonParse(text), text }
    } catch (error) {
      return { payload: null, text: '' }
    }
  }

  async function fetchMtopPayload(item, page, pageSize) {
    const mtop = getMtopClient()
    if (!mtop) throw new Error('当前页面未找到 window.lib.mtop.request，请在已登录的天猫详情页中运行')
    if (typeof window.__UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__ === 'function') {
      try { window.__UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__() } catch (error) {}
    }
    const request = buildMtopRequest(item, page, pageSize)
    return await new Promise((resolve, reject) => {
      let finished = false
      const timer = setTimeout(() => {
        if (finished) return
        finished = true
        reject(new Error('MTop 评价接口请求超时'))
      }, 15000)
      function finish(payload) {
        if (finished) return
        finished = true
        clearTimeout(timer)
        const riskMessage = getPayloadRiskMessage(payload)
        if (riskMessage) {
          reject(new Error(riskMessage))
          return
        }
        resolve({ payload, source: 'mtop', url: `${request.api}/${request.v}` })
      }
      function fail(error) {
        if (finished) return
        finished = true
        clearTimeout(timer)
        reject(new Error(getPayloadRiskMessage(error) || JSON.stringify(error) || compact(error?.message) || String(error)))
      }
      try {
        mtop.request(request, finish, fail)
      } catch (error) {
        fail(error)
      }
    })
  }

  function summarizeResponse(response, payload, text) {
    if (payload) return JSON.stringify(payload).slice(0, 240)
    const raw = String(text || '')
    const compactText = compact(raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
    if (/login\.taobao\.com|login\.m\.taobao\.com|redirectURL|扫码登录|密码登录|亲，请登录|x5secdata/i.test(raw)) {
      return '返回登录/验证页面，请在已登录的天猫详情页中运行，或完成页面提示的验证后重试'
    }
    const contentType = response?.headers?.get ? compact(response.headers.get('content-type')) : ''
    return [`HTTP ${response?.status || ''}`, contentType, compactText.slice(0, 160)].filter(Boolean).join(' ')
  }

  function getPayloadRiskMessage(payload) {
    if (!payload || typeof payload !== 'object') return ''
    const summary = JSON.stringify(payload).slice(0, 500)
    if (/FAIL_SYS_USER_VALIDATE|RGV587|验证|风控|login|登录|x5sec/i.test(summary)) return summary
    const ret = Array.isArray(payload.ret) ? payload.ret.join(';') : compact(payload.ret)
    if (/FAIL|ERROR|DENY|LOGIN/i.test(ret)) return ret || summary
    return ''
  }

  function isVerificationMessage(message) {
    return /FAIL_SYS_USER_VALIDATE|RGV587|验证|风控|login|登录|x5sec|403|418/i.test(compact(message))
  }

  function waitForVerification(dataRows, message, nextShared) {
    const rounds = Number(shared.captcha_wait_rounds || 0) + 1
    const reason = compact(message).slice(0, 500) || '天猫要求登录或验证'
    return {
      success: true,
      data: dataRows || [],
      meta: {
        action: 'next_phase',
        next_phase: 'wait_verification',
        sleep_ms: rounds < 3 ? 4000 : 6000,
        shared: {
          ...shared,
          ...(nextShared || {}),
          captcha_reason: reason,
          captcha_wait_rounds: rounds,
        },
      },
    }
  }

  function requestJsonp(url, timeoutMs = 12000) {
    if (!document?.createElement || !(document.head || document.documentElement || document.body)) {
      return Promise.reject(new Error('当前环境不支持 JSONP 兜底'))
    }
    const callbackName = `__crawshrimp_tmall_reviews_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    const jsonpUrl = new URL(url)
    jsonpUrl.searchParams.set('callback', callbackName)
    jsonpUrl.searchParams.set('_ksTS', `${Date.now()}_${Math.floor(Math.random() * 100)}`)
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('JSONP 请求超时'))
      }, timeoutMs)
      function cleanup() {
        clearTimeout(timer)
        try { delete window[callbackName] } catch (error) { window[callbackName] = undefined }
        try { script.remove() } catch (error) {}
      }
      window[callbackName] = payload => {
        cleanup()
        resolve(payload)
      }
      script.onerror = () => {
        cleanup()
        reject(new Error('JSONP 请求失败'))
      }
      script.src = jsonpUrl.href
      ;(document.head || document.documentElement || document.body).appendChild(script)
    })
  }

  function getEmbeddedPayload(item) {
    const injected = shared.embeddedReviewPayloads && shared.embeddedReviewPayloads[item.itemId]
    if (injected) return injected
    const currentItem = parseItemLink(String(location.href || ''))
    const isCurrentItem = currentItem?.itemId === item.itemId
    if (isCurrentItem && shared.globalEmbeddedReviewPayload) return shared.globalEmbeddedReviewPayload
    if (!isCurrentItem) return null
    const candidates = [
      window.__TMALL_RATE_DETAIL__,
      window.__TMALL_REVIEW_DATA__,
      window.__INITIAL_STATE__,
      window.__INIT_DATA__,
      window.g_config,
    ].filter(Boolean)
    for (const candidate of candidates) {
      if (extractReviewItems(candidate).length) return candidate
    }
    const scripts = document?.querySelectorAll ? [...document.querySelectorAll('script')] : []
    for (const script of scripts) {
      const text = String(script.textContent || '')
      if (!/rateList|rateDetail|displayUserNick|rateContent/.test(text)) continue
      const objectMatch = text.match(/({[\s\S]*?(?:rateList|rateDetail)[\s\S]*?})\s*;?$/)
      const payload = safeJsonParse(objectMatch ? objectMatch[1] : text)
      if (payload && extractReviewItems(payload).length) return payload
    }
    return null
  }

  async function fetchReviewPayload(item, page, pageSize) {
    try {
      return await fetchMtopPayload(item, page, pageSize)
    } catch (error) {
      if (!/未找到 window\.lib\.mtop\.request|not found|unavailable/i.test(error?.message || String(error))) {
        throw error
      }
    }

    const urls = buildReviewApiUrls(item, page, pageSize)
    const errors = []
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json,text/javascript,*/*;q=0.01',
          },
        })
        const parsed = await parseResponsePayload(response)
        const payload = parsed.payload
        const riskMessage = getPayloadRiskMessage(payload)
        if (response.ok && payload && !riskMessage) return { payload, source: 'api', url }
        const message = summarizeResponse(response, payload, parsed.text)
        errors.push(`接口 ${response.status}: ${message}`)
        if (riskMessage) break
        if (/验证|登录/i.test(message)) break
      } catch (error) {
        errors.push(error?.message || String(error))
      }
    }
    for (const url of urls) {
      try {
        const payload = await requestJsonp(url)
        if (payload) return { payload, source: 'jsonp', url }
      } catch (error) {
        errors.push(error?.message || String(error))
      }
    }
    throw new Error(errors.filter(Boolean).join('；') || '评价接口不可用')
  }

  function buildDiagnosticRow(item, message, source = 'api') {
    const text = compact(message)
    const riskHint = /FAIL_SYS_USER_VALIDATE|RGV587|验证|风控|login|登录|403|418/i.test(text)
      ? `天猫评价接口返回验证/风控提示：${text}`
      : `天猫评价接口不可用：${text}`
    return {
      商品ID: item.itemId,
      SKU_ID: item.skuId || '',
      商品链接: item.url,
      商品标题: '',
      页码: '',
      序号: '',
      评价ID: '',
      买家昵称: '',
      评价时间: '',
      评分: '',
      规格: '',
      评价内容: '',
      追评内容: '',
      追评时间: '',
      评价图片: '',
      有图: '',
      数据来源: source,
      执行结果: '失败',
      备注: riskHint,
    }
  }

  async function collectItemReviews(item, pageSize, maxPages) {
    const embeddedPayload = getEmbeddedPayload(item)
    if (embeddedPayload) {
      const reviews = extractReviewItems(embeddedPayload)
      const rows = reviews.map((review, index) => normalizeReview(review, {
        ...item,
        page: 1,
        index: index + 1,
        source: 'embedded',
      }))
      const visibility = extractReviewVisibility(embeddedPayload, item)
      if (visibility) visibility.collected_reviews = rows.length
      return {
        rows,
        failed: false,
        visibility,
      }
    }

    const rows = []
    let visibility = null
    for (let page = 1; page <= maxPages; page += 1) {
      let result
      try {
        result = await fetchReviewPayload(item, page, pageSize)
      } catch (error) {
        const message = error?.message || String(error)
        if (isVerificationMessage(message)) return { rows, failed: false, wait: true, message }
        if (!rows.length) return { rows: [buildDiagnosticRow(item, message)], failed: true }
        break
      }
      const reviews = extractReviewItems(result.payload)
      visibility = mergeReviewVisibility(visibility, extractReviewVisibility(result.payload, item))
      const paginator = extractPaginator(result.payload)
      if (!reviews.length) {
        if (!rows.length) {
          if (visibility) visibility.collected_reviews = 0
          return {
            rows: [{
              ...buildDiagnosticRow(item, '接口未返回评价列表，可能暂无评价或评价数据需要登录后查看', result.source),
              执行结果: '无数据',
            }],
            failed: false,
            visibility,
          }
        }
        break
      }
      rows.push(...reviews.map((review, index) => normalizeReview(review, {
        ...item,
        page,
        index: rows.length + index + 1,
        source: result.source,
      })))
      const lastPage = paginator.lastPage || Math.ceil((paginator.total || rows.length) / pageSize)
      if (hasTruthyNext(paginator.hasNext)) {
        if (page < maxPages) {
          await sleepRandom(PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS)
          continue
        }
        break
      }
      if (lastPage && page >= lastPage) break
      if (reviews.length < pageSize) break
      if (page < maxPages) await sleepRandom(PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS)
    }
    const dedupedRows = dedupeRows(rows)
    if (visibility) visibility.collected_reviews = dedupedRows.length
    return { rows: dedupedRows, failed: false, visibility }
  }

  try {
    const items = getInputItems()
    const pageSize = toNumber(params.page_size, DEFAULT_PAGE_SIZE, 1, 20)
    const maxPages = toNumber(params.max_pages, DEFAULT_MAX_PAGES, 1, 30)

    if (!items.length) {
      return {
        success: false,
        error: '请填写有效的天猫商品链接，或在天猫商品详情页运行当前页面模式',
      }
    }

    const data = []
    const reviewVisibilitySummaries = Array.isArray(shared.review_visibility_summaries_pending)
      ? [...shared.review_visibility_summaries_pending]
      : []
    let failedItems = Number(shared.failed_items_pending || 0)
    const completedReviews = Number(shared.completed_reviews_pending || 0)
    const maxStartIndex = Math.max(items.length - 1, 0)
    const startIndex = phase === 'wait_verification'
      ? toNumber(shared.resume_item_index, 0, 0, maxStartIndex)
      : 0
    for (let index = startIndex; index < items.length; index += 1) {
      const item = items[index]
      const result = await collectItemReviews(item, pageSize, maxPages)
      if (result.wait) {
        const successRows = data.filter(row => row.执行结果 === '成功')
        return waitForVerification(data, result.message, {
          resume_item_index: index,
          total_items: items.length,
          page_size: pageSize,
          max_pages: maxPages,
          failed_items_pending: failedItems,
          completed_reviews_pending: completedReviews + successRows.length,
          review_visibility_summaries_pending: reviewVisibilitySummaries,
        })
      }
      if (result.failed) failedItems += 1
      if (result.visibility) reviewVisibilitySummaries.push(result.visibility)
      data.push(...result.rows)
      if (index < items.length - 1) await sleepRandom(ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS)
    }

    const successRows = data.filter(row => row.执行结果 === '成功')
    const reviewVisibilityNote = buildReviewVisibilityNote(reviewVisibilitySummaries)
    return {
      success: true,
      data,
      meta: {
        action: 'complete',
        has_more: false,
        shared: {
          ...shared,
          total_items: items.length,
          total_reviews: completedReviews + successRows.length,
          failed_items: failedItems,
          page_size: pageSize,
          max_pages: maxPages,
          resume_item_index: 0,
          failed_items_pending: 0,
          completed_reviews_pending: 0,
          review_visibility_summaries_pending: [],
          captcha_reason: '',
          captcha_wait_rounds: 0,
          throttle_policy: {
            page_delay_ms: [PAGE_DELAY_MIN_MS, PAGE_DELAY_MAX_MS],
            item_delay_ms: [ITEM_DELAY_MIN_MS, ITEM_DELAY_MAX_MS],
          },
          review_visibility_summaries: reviewVisibilitySummaries,
          review_visibility_note: reviewVisibilityNote,
        },
      },
    }
  } catch (error) {
    return { success: false, error: error?.message || String(error) }
  }
})()

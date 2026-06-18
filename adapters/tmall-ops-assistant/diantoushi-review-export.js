;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}
  const shared = window.__CRAWSHRIMP_SHARED__ || {}
  const phase = window.__CRAWSHRIMP_PHASE__ || 'main'

  const DEFAULT_MIN_PAGES = 30
  const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120000
  const DEFAULT_BATCH_REST_AFTER_MIN = 5
  const DEFAULT_BATCH_REST_AFTER_MAX = 8
  const DEFAULT_BATCH_REST_BROWSE_PAGES_MIN = 2
  const DEFAULT_BATCH_REST_BROWSE_PAGES_MAX = 3
  const DEFAULT_BATCH_REST_MIN_MS = 180000
  const DEFAULT_BATCH_REST_MAX_MS = 300000
  const DEFAULT_ITEM_DELAY_MIN_MS = 5000
  const DEFAULT_ITEM_DELAY_MAX_MS = 15000
  const DEFAULT_PAGE_LOAD_DELAY_MIN_MS = 3500
  const DEFAULT_PAGE_LOAD_DELAY_MAX_MS = 9000
  const DEFAULT_QA_FULL_MODE_LOAD_DELAY_MIN_MS = 12000
  const DEFAULT_QA_FULL_MODE_LOAD_DELAY_MAX_MS = 20000
  const DEFAULT_QA_POST_PAGE_MIN_POLLS = 3
  const QA_LOADING_LABELS = ['获取数据中', '加载中', '正在加载', '正在获取', '拼命加载中']
  const REVIEW_LOAD_MORE_LABELS = ['加载下一页', '加载更多', '下一页', '更多评价', '继续加载']
  const QA_FULL_MODE_LABELS = ['完整模式', '完整问答', '完整问大家']
  const REVIEW_DATE_DESC_LABELS = [
    '日期降序',
    '时间降序',
    '按日期降序',
    '按时间降序',
    '最新优先',
    '最新排序',
    '按日期排序',
    '按时间排序',
    '日期排序',
    '时间排序',
    '日期从新到旧',
    '时间从新到旧',
    '按发布日期降序',
    '按评价日期降序',
  ]
  const REVIEW_DATE_DESC_PARENT_HINTS = [
    '排序',
    '筛选',
    '时间',
    '日期',
    'sort',
    'order',
    'filter',
    'tab',
  ]
  const REVIEW_SORT_TRIGGER_LABELS = [
    '默认排序',
    '综合排序',
    '默认',
    '排序方式',
    '排序',
    '时间筛选',
    '日期筛选',
    '选择排序',
  ]
  const REVIEW_SORT_ANCHOR_LABELS = ['默认排序', '综合排序', '默认']
  const REST_BROWSE_URLS = [
    'https://www.taobao.com/',
    'https://s.taobao.com/search?q=%E8%BF%90%E5%8A%A8%E6%9C%8D',
    'https://s.taobao.com/search?q=%E9%98%B2%E6%99%92%E8%A1%A3',
    'https://s.taobao.com/search?q=%E7%AB%A5%E8%A3%85',
    'https://s.taobao.com/search?q=%E5%87%89%E6%84%9F%E8%A1%A3',
  ]

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

  function toDurationMs(value, fallbackMs, minMs, maxMs) {
    const parsed = Number(value)
    let ms = fallbackMs
    if (Number.isFinite(parsed)) {
      ms = parsed >= 1000 ? parsed : parsed * 1000
    }
    const integer = Math.floor(ms)
    if (Number.isFinite(minMs) && integer < minMs) return minMs
    if (Number.isFinite(maxMs) && integer > maxMs) return maxMs
    return integer
  }

  function toBoolean(value, fallback = false) {
    if (value == null || value === '') return fallback
    if (typeof value === 'boolean') return value
    const text = compact(value).toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on', '开启', '启用', '是'].includes(text)) return true
    if (['0', 'false', 'no', 'n', 'off', '关闭', '停用', '否'].includes(text)) return false
    return fallback
  }

  function randomInt(min, max) {
    const lower = Math.ceil(Math.min(min, max))
    const upper = Math.floor(Math.max(min, max))
    return lower + Math.floor(Math.random() * (upper - lower + 1))
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  function parseUrl(rawUrl) {
    const text = compact(rawUrl).replace(/[、，,;；]+$/g, '')
    if (!text) return null
    try {
      return new URL(text)
    } catch (error) {
      try {
        return new URL(text, 'https://detail.tmall.com/item.htm')
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

  function parseItemLink(rawValue) {
    const rawText = compact(rawValue)
    const directItemId = compact((rawText.match(/^\d{6,}$/) || [])[0])
    if (directItemId) {
      return {
        itemId: directItemId,
        url: `https://item.taobao.com/item.htm?id=${directItemId}`,
      }
    }
    const url = parseUrl(rawText)
    const itemId =
      readSearchParam(url, ['id', 'itemId', 'item_id', 'itemNumId', 'item_num_id']) ||
      compact((rawText.match(/[?&](?:id|itemId|item_id|itemNumId|item_num_id)=(\d+)/i) || [])[1])
    if (!/^\d{6,}$/.test(itemId)) return null
    return {
      itemId,
      url: url ? url.href : rawText,
    }
  }

  function extractInputTokens(value) {
    const text = String(value || '').trim()
    if (!text) return []
    const multiUrlMatches = text.match(/https?:\/\/[\s\S]*?(?=https?:\/\/|$)/gi)
    if (multiUrlMatches?.length) {
      return multiUrlMatches.map(item => item.replace(/[、，,;；]+$/g, '').trim()).filter(Boolean)
    }
    return text.split(/[\n\r\t 、，,;；]+/).map(item => item.trim()).filter(Boolean)
  }

  function getInputItems() {
    const rawItems = [
      ...extractInputTokens(params.item_ids),
      ...extractInputTokens(params.item_id),
      ...extractInputTokens(params.item_links),
      ...extractInputTokens(params.item_url),
      ...extractInputTokens(params.links),
    ]
    if (!rawItems.length) rawItems.push(String(location.href || ''))
    const seen = new Set()
    return rawItems
      .map(parseItemLink)
      .filter(Boolean)
      .filter(item => {
        if (seen.has(item.itemId)) return false
        seen.add(item.itemId)
        return true
      })
  }

  function resultRow(item, status, extra = {}) {
    return {
      商品ID: item?.itemId || '',
      商品链接: item?.url || '',
      阶段: extra.stage || phase,
      已加载页数: extra.loadedPages || 0,
      目标页数: extra.targetPages || getMinPages(),
      导出文件: extra.file || '',
      问大家导出文件: extra.qaFile || '',
      评价分析导出文件: extra.reviewFile || '',
      执行结果: status,
      备注: extra.note || '',
    }
  }

  function flattenDownloadResults(value) {
    const rows = []
    const visit = item => {
      if (!item) return
      if (Array.isArray(item)) {
        for (const child of item) visit(child)
        return
      }
      if (Array.isArray(item.items)) {
        for (const child of item.items) visit(child)
      }
      if (Object.prototype.hasOwnProperty.call(item, 'success') || item.label || item.path || item.filename || item.error) {
        rows.push(item)
      }
    }
    visit(value)
    return rows
  }

  function findDownloadResults(item, kind = '') {
    const results = flattenDownloadResults(shared.downloadResults || [])
    const kindPattern = kind === 'qa' ? /问大家/ : kind === 'review' ? /评价/ : null
    const itemResults = results.filter(result => String(result?.label || result?.filename || result?.path || '').includes(item.itemId))
    if (!kindPattern) return itemResults
    return itemResults.filter(result => {
      const text = String(result?.label || result?.filename || result?.path || '')
      return kindPattern.test(text)
    })
  }

  function findDownloadResult(item, kind = '') {
    const itemResults = findDownloadResults(item, kind)
    return itemResults.find(result => result?.success) || itemResults[0] || null
  }

  function findLatestDownloadResult(item, kind = '') {
    const itemResults = findDownloadResults(item, kind)
    return itemResults.length ? itemResults[itemResults.length - 1] : null
  }

  function downloadRetryKey(item, kind = '') {
    return `${kind || 'download'}_${item.itemId}`
  }

  function shouldRetryDownload(item, kind = '') {
    const latest = findLatestDownloadResult(item, kind)
    if (!latest || latest.success) return false
    const error = compact(latest.error || '')
    if (!error.includes('点击后未检测到新下载文件')) return false
    const key = downloadRetryKey(item, kind)
    return !Boolean((shared.downloadRetryByItem || {})[key])
  }

  function retryDownloadFromItemStart(item, kind = '', next = {}) {
    const key = downloadRetryKey(item, kind)
    location.href = item.url
    return nextPhase('wait_page', remember({
      ...next,
      currentItemId: item.itemId,
      qaPanelWaits: 0,
      reviewPanelWaits: 0,
      closeQaWaits: 0,
      qaLoadMoreClicks: 0,
      loadMoreClicks: 0,
      downloadRetryByItem: { ...(shared.downloadRetryByItem || {}), [key]: true },
      diagnostics: {
        downloadRetry: {
          itemId: item.itemId,
          kind,
          reason: '点击后未检测到新下载文件，重新进入商品链接重试一次',
        },
      },
    }), 2500)
  }

  function remember(next = {}) {
    const diagnostics = {
      ...(shared.diagnostics || {}),
      ...(next.diagnostics || {}),
    }
    return {
      ...shared,
      ...next,
      diagnostics,
    }
  }

  function fail(message) {
    return { success: false, error: compact(message) || '店透视评价导出失败' }
  }

  function nextPhase(name, nextShared = shared, sleepMs = 1200) {
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

  function cdpClicks(clicks, nextPhaseName, nextShared = shared, sleepMs = 1200) {
    return {
      success: true,
      data: [],
      meta: {
        action: 'cdp_clicks',
        clicks,
        next_phase: nextPhaseName,
        sleep_ms: sleepMs,
        shared: nextShared,
      },
    }
  }

  function downloadClicks(clicks, nextPhaseName, item, nextShared = shared, options = {}) {
    const kind = options.kind || '评价'
    return {
      success: true,
      data: [],
      meta: {
        action: 'download_clicks',
        strict: false,
        shared_key: 'downloadResults',
        shared_append: true,
        next_phase: nextPhaseName,
        sleep_ms: 800,
        shared: nextShared,
        items: [{
          label: `店透视${kind}_${item.itemId}`,
          filename: `店透视${kind}_${item.itemId}.xlsx`,
          expected_name_regex: '.+\\.(xlsx|xls|csv)$',
          timeout_ms: getDownloadTimeoutMs(),
          download_dir: compact(params.browser_download_dir),
          clicks,
        }],
      },
    }
  }

  function getMinPages() {
    return toNumber(params.min_pages, DEFAULT_MIN_PAGES, 1, 100)
  }

  function getDownloadTimeoutMs() {
    return toNumber(params.download_timeout_ms, DEFAULT_DOWNLOAD_TIMEOUT_MS, 10000, 600000)
  }

  function isBatchRestEnabled() {
    return toBoolean(params.batch_rest_enabled, true)
  }

  function getItemDelayMs() {
    const minMs = toNumber(params.item_delay_min_ms, DEFAULT_ITEM_DELAY_MIN_MS, 0, 120000)
    const maxMs = toNumber(params.item_delay_max_ms, DEFAULT_ITEM_DELAY_MAX_MS, minMs, 180000)
    return randomInt(minMs, maxMs)
  }

  function getBatchRestAfterCount() {
    const minCount = toNumber(params.batch_rest_after_min, DEFAULT_BATCH_REST_AFTER_MIN, 1, 100)
    const maxCount = toNumber(params.batch_rest_after_max, DEFAULT_BATCH_REST_AFTER_MAX, minCount, 100)
    return randomInt(minCount, maxCount)
  }

  function getBatchRestBrowsePages() {
    const minPages = toNumber(params.batch_rest_browse_pages_min, DEFAULT_BATCH_REST_BROWSE_PAGES_MIN, 1, 10)
    const maxPages = toNumber(params.batch_rest_browse_pages_max, DEFAULT_BATCH_REST_BROWSE_PAGES_MAX, minPages, 10)
    return randomInt(minPages, maxPages)
  }

  function getBatchRestTotalMs() {
    const minMs = toNumber(params.batch_rest_min_ms, DEFAULT_BATCH_REST_MIN_MS, 60000, 1800000)
    const maxMs = toNumber(params.batch_rest_max_ms, DEFAULT_BATCH_REST_MAX_MS, minMs, 3600000)
    return randomInt(minMs, maxMs)
  }

  function getPageLoadDelayMs() {
    const minMs = toDurationMs(params.page_load_delay_min_ms, DEFAULT_PAGE_LOAD_DELAY_MIN_MS, 1000, 60000)
    const maxMs = toDurationMs(params.page_load_delay_max_ms, DEFAULT_PAGE_LOAD_DELAY_MAX_MS, minMs, 120000)
    return randomInt(minMs, maxMs)
  }

  function getQaFullModeLoadDelayMs() {
    const minMs = toDurationMs(
      params.qa_full_mode_load_delay_min_ms,
      DEFAULT_QA_FULL_MODE_LOAD_DELAY_MIN_MS,
      2000,
      120000,
    )
    const maxMs = toDurationMs(
      params.qa_full_mode_load_delay_max_ms,
      DEFAULT_QA_FULL_MODE_LOAD_DELAY_MAX_MS,
      minMs,
      180000,
    )
    return randomInt(minMs, maxMs)
  }

  function getQaFullModeMaxLoadWaits() {
    return toNumber(params.qa_full_mode_load_max_waits, 6, 1, 50)
  }

  function getQaPostPageMinPolls() {
    return toNumber(params.qa_post_page_min_polls, DEFAULT_QA_POST_PAGE_MIN_POLLS, 0, 20)
  }

  function hasQaPageAdvanceSignal(qaState) {
    const pending = shared.qaPendingAdvance || null
    if (!pending) return true
    if (qaState.loadedPages > toNumber(pending.basePage, 1, 1, 1000)) return true
    if (qaState.loadedRows > toNumber(pending.baseLoadedRows, 0, 0, 999999)) return true
    if (qaState.maxCount > toNumber(pending.baseMaxCount, 0, 0, 999999)) return true
    if (compact(qaState.sample) && compact(qaState.sample) !== compact(pending.baseSample)) return true
    return false
  }

  function isQaStillLoading(text) {
    const body = compact(text || bodyText())
    if (!body) return false
    return QA_LOADING_LABELS.some(label => body.includes(label))
  }

  function getNextBatchRestIndex(fromIndex = 0) {
    return fromIndex + getBatchRestAfterCount()
  }

  function getEntryWaitMs() {
    return toNumber(params.entry_button_wait_ms, 3000, 500, 30000)
  }

  function getEntryWaitMaxAttempts() {
    return toNumber(params.entry_button_wait_attempts, 3, 1, 10)
  }

  function getEntryRefreshMaxAttempts() {
    return toNumber(params.entry_button_refresh_attempts, 1, 0, 5)
  }

  function reloadPage(nextPhaseName, nextShared = shared, sleepMs = 5000) {
    return {
      success: true,
      data: [],
      meta: {
        action: 'reload_page',
        next_phase: nextPhaseName,
        sleep_ms: sleepMs,
        shared: nextShared,
      },
    }
  }

  function appendUnique(list, value) {
    const text = compact(value)
    if (!text) return Array.isArray(list) ? list : []
    const next = Array.isArray(list) ? [...list] : []
    if (!next.includes(text)) next.push(text)
    return next
  }

  function removeValue(list, value) {
    const text = compact(value)
    return (Array.isArray(list) ? list : []).filter(item => compact(item) !== text)
  }

  function deferQaEntryForCompensation(item, message) {
    return nextPhase('open_review', remember({
      qaEntryWaits: 0,
      qaEntryRefreshes: 0,
      qaEntryDeferredItems: appendUnique(shared.qaEntryDeferredItems, item.itemId),
      qaEntryPendingCompensationItems: appendUnique(shared.qaEntryPendingCompensationItems, item.itemId),
      diagnostics: {
        qaEntryDeferred: {
          itemId: item.itemId,
          reason: compact(message) || '未找到问大家入口，先跳过当前商品问大家导出',
          sample: bodyText().slice(0, 240),
        },
      },
    }), 800)
  }

  function skipQaEntryAfterCompensation(item, message) {
    return nextPhase('advance_qa_compensation', remember({
      qaEntryWaits: 0,
      qaEntryRefreshes: 0,
      qaEntryPendingCompensationItems: removeValue(shared.qaEntryPendingCompensationItems, item.itemId),
      qaEntryMissingItems: appendUnique(shared.qaEntryMissingItems, item.itemId),
      diagnostics: {
        qaEntryCompensationSkipped: {
          itemId: item.itemId,
          reason: compact(message) || '补偿阶段仍未找到问大家入口，跳过问大家导出',
          sample: bodyText().slice(0, 240),
        },
      },
    }), 500)
  }

  function waitOrRefreshForEntry(kind, nextPhaseName, notFoundMessage) {
    const waitKey = kind === 'qa' ? 'qaEntryWaits' : 'reviewEntryWaits'
    const refreshKey = kind === 'qa' ? 'qaEntryRefreshes' : 'reviewEntryRefreshes'
    const waits = toNumber(shared[waitKey], 0, 0, 100) + 1
    const maxWaits = getEntryWaitMaxAttempts()
    const refreshes = toNumber(shared[refreshKey], 0, 0, 100)
    if (waits <= maxWaits) {
      return nextPhase(nextPhaseName, remember({
        [waitKey]: waits,
        diagnostics: {
          entryWait: {
            kind,
            waiting: waits,
            maxWaits,
            reason: '未检测到店透视入口按钮，先等待页面/插件渲染',
            sample: bodyText().slice(0, 240),
          },
        },
      }), getEntryWaitMs())
    }
    if (refreshes < getEntryRefreshMaxAttempts()) {
      return reloadPage(nextPhaseName, remember({
        [waitKey]: 0,
        [refreshKey]: refreshes + 1,
        diagnostics: {
          entryRefresh: {
            kind,
            refreshes: refreshes + 1,
            reason: '等待后仍未检测到店透视入口按钮，刷新页面重试',
            sample: bodyText().slice(0, 240),
          },
        },
      }), 6000)
    }
    if (kind === 'qa') {
      const item = currentItem()
      if (item && shared.qaCompensationMode) return skipQaEntryAfterCompensation(item, notFoundMessage)
      if (item) return deferQaEntryForCompensation(item, notFoundMessage)
    }
    return fail(notFoundMessage)
  }

  function getItemsState() {
    const items = Array.isArray(shared.items) && shared.items.length ? shared.items : getInputItems()
    return {
      items,
      index: toNumber(shared.index, 0, 0, Math.max(items.length - 1, 0)),
    }
  }

  function currentItem() {
    const state = getItemsState()
    return state.items[state.index] || null
  }

  function isCurrentItemPage(item) {
    if (!item) return false
    const current = parseItemLink(String(location.href || ''))
    return current?.itemId === item.itemId
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
  }

  function textOf(el) {
    return compact(el?.innerText || el?.textContent || el?.getAttribute?.('title') || el?.getAttribute?.('aria-label') || '')
  }

  function collectElements(root = document) {
    const list = []
    const visit = target => {
      if (!target?.querySelectorAll) return
      for (const el of target.querySelectorAll('*')) {
        list.push(el)
        if (el.shadowRoot) visit(el.shadowRoot)
      }
    }
    visit(root)
    return list
  }

  function frameDocuments() {
    const docs = [{ doc: document, offsetX: 0, offsetY: 0 }]
    for (const frame of Array.from(document.querySelectorAll('iframe, frame'))) {
      try {
        if (frame.contentDocument) {
          const rect = frame.getBoundingClientRect()
          docs.push({ doc: frame.contentDocument, offsetX: rect.left, offsetY: rect.top })
        }
      } catch (error) {
      }
    }
    return docs
  }

  function scoreElement(el, text, label) {
    const rect = el.getBoundingClientRect()
    let score = rect.width * rect.height
    const tag = String(el.tagName || '').toLowerCase()
    if (tag === 'button' || tag === 'a') score -= 1000000
    if (el.getAttribute('role') === 'button' || el.onclick) score -= 600000
    if (text === label) score -= 300000
    if (String(el.className || '').toLowerCase().includes('tab')) score -= 200000
    return score
  }

  function isClickableLike(el) {
    if (!el) return false
    const tag = String(el.tagName || '').toLowerCase()
    if (tag === 'button' || tag === 'a') return true
    if (el.getAttribute('role') === 'button') return true
    if (typeof el.onclick === 'function') return true
    const cls = String(el.className || '').toLowerCase()
    if (/(sort|order|filter|dropdown|menu|tab|tab-item|select|option|trigger|item)/.test(cls)) return true
    return false
  }

  function isInsideReviewToolbar(el) {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    if (rect.top < 0 || rect.top > window.innerHeight * 0.7) return false
    let parent = el.parentElement
    let depth = 0
    while (parent && depth < 6) {
      const cls = String(parent.className || '').toLowerCase()
      if (REVIEW_DATE_DESC_PARENT_HINTS.some(hint => cls.includes(hint))) return true
      parent = parent.parentElement
      depth += 1
    }
    return false
  }

  function getElementCenter(el, frame) {
    const rect = el.getBoundingClientRect()
    return {
      x: Math.round(frame.offsetX + rect.left + rect.width / 2),
      y: Math.round(frame.offsetY + rect.top + rect.height / 2),
      w: rect.width,
      h: rect.height,
    }
  }

  function findReviewDateSiblingOfDefault() {
    const elements = allVisibleElements()
    const anchors = []
    const dateCandidates = []
    for (const { el, frame } of elements) {
      if (!visible(el)) continue
      const text = textOf(el)
      if (!text || text.length > 40) continue
      if (REVIEW_SORT_ANCHOR_LABELS.some(label => text === label || text.includes(label))) {
        const center = getElementCenter(el, frame)
        anchors.push({ el, frame, text, ...center })
        continue
      }
      if (text !== '日期' && text !== '时间') continue
      if (!isInsideReviewToolbar(el) && !isClickableLike(el)) continue
      const center = getElementCenter(el, frame)
      dateCandidates.push({ el, frame, text, ...center })
    }
    if (!anchors.length || !dateCandidates.length) return null
    const pairs = []
    for (const anchor of anchors) {
      for (const candidate of dateCandidates) {
        const dx = candidate.x - anchor.x
        const dy = Math.abs(candidate.y - anchor.y)
        if (dx <= 6) continue
        if (dx > Math.max(window.innerWidth * 0.35, 260)) continue
        if (dy > Math.max(anchor.h, candidate.h) * 1.4 + 12) continue
        let score = dx + dy * 3
        if (candidate.text === '日期') score -= 80
        if (isClickableLike(candidate.el)) score -= 50
        if (isInsideReviewToolbar(candidate.el)) score -= 30
        pairs.push({
          x: candidate.x,
          y: candidate.y,
          text: candidate.text,
          label: `${anchor.text}右侧${candidate.text}`,
          source: 'default_sibling',
          score,
        })
      }
    }
    pairs.sort((a, b) => a.score - b.score)
    return pairs[0] || null
  }

  function findReviewDateDescCenter() {
    const sibling = findReviewDateSiblingOfDefault()
    if (sibling) {
      try { window.__lastReviewDateDescPicked = sibling } catch (e) {}
      return sibling
    }
    const elements = allVisibleElements()
    const candidates = []
    const diagAll = []
    for (const { el, frame } of elements) {
      if (!visible(el)) continue
      const text = textOf(el)
      if (!text) continue
      if (text.length > 60) continue
      const matchedLabel = REVIEW_DATE_DESC_LABELS.find(label => text === label || text.includes(label))
      if (!matchedLabel) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const clickable = isClickableLike(el)
      const inToolbar = isInsideReviewToolbar(el)
      diagAll.push({
        text, label: matchedLabel,
        tag: String(el.tagName || '').toLowerCase(),
        cls: String(el.className || '').slice(0, 120),
        clickable, inToolbar, w: rect.width, h: rect.height,
      })
      if (!clickable && !inToolbar) continue
      const tag = String(el.tagName || '').toLowerCase()
      let score = rect.width * rect.height
      if (text === matchedLabel) score -= 400000
      else if (text.includes(matchedLabel) && text.length <= matchedLabel.length + 4) score -= 300000
      if (clickable) score -= 200000
      if (tag === 'button' || tag === 'a') score -= 200000
      if (inToolbar) score -= 100000
      candidates.push({ el, frame, text, label: matchedLabel, score, x: 0, y: 0, w: rect.width, h: rect.height })
    }
    candidates.sort((a, b) => a.score - b.score)
    try {
      window.__lastReviewDateDescCandidates = candidates.slice(0, 6).map((c) => ({
        text: c.text, label: c.label, score: c.score, x: c.x, y: c.y, w: c.w, h: c.h,
        tag: String(c.el.tagName || '').toLowerCase(),
        cls: String(c.el.className || '').slice(0, 120),
        clickable: isClickableLike(c.el),
        inToolbar: isInsideReviewToolbar(c.el),
      }))
      window.__lastReviewDateDescAll = diagAll
    } catch (e) {}
    for (const candidate of candidates) {
      const rect = candidate.el.getBoundingClientRect()
      candidate.x = Math.round(candidate.frame.offsetX + rect.left + rect.width / 2)
      candidate.y = Math.round(candidate.frame.offsetY + rect.top + rect.height / 2)
      candidate.el.scrollIntoView({ block: 'center', inline: 'center' })
      const rectAfter = candidate.el.getBoundingClientRect()
      const picked = {
        x: Math.round(candidate.frame.offsetX + rectAfter.left + rectAfter.width / 2),
        y: Math.round(candidate.frame.offsetY + rectAfter.top + rectAfter.height / 2),
        text: candidate.text,
        label: candidate.label,
        source: 'review_toolbar',
      }
      try { window.__lastReviewDateDescPicked = picked } catch (e) {}
      return picked
    }
    return null
  }

  function allVisibleElements() {
    return frameDocuments()
      .flatMap(frame => collectElements(frame.doc).map(el => ({ el, frame })))
      .filter(({ el }) => visible(el))
  }

  function findTextCenter(labels, options = {}) {
    const labelList = Array.isArray(labels) ? labels : [labels]
    const elements = allVisibleElements()
    for (const label of labelList) {
      const exact = []
      const fuzzy = []
      for (const { el, frame } of elements) {
        if (!visible(el)) continue
        const text = textOf(el)
        if (!text || text.length > (options.maxTextLength || 120)) continue
        if (text === label) exact.push({ el, frame, text, label })
        else if (text.includes(label)) fuzzy.push({ el, frame, text, label })
      }
      const candidates = exact.length ? exact : fuzzy
      candidates.sort((a, b) => scoreElement(a.el, a.text, a.label) - scoreElement(b.el, b.text, b.label))
      const picked = candidates[0]
      if (!picked) continue
      picked.el.scrollIntoView({ block: 'center', inline: 'center' })
      const rect = picked.el.getBoundingClientRect()
      return {
        x: Math.round(picked.frame.offsetX + rect.left + rect.width / 2),
        y: Math.round(picked.frame.offsetY + rect.top + rect.height / 2),
        text: picked.text,
        label: picked.label,
      }
    }
    return null
  }

  function isCloseLike(el, text) {
    const aria = compact(el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '')
    const className = String(el.className || '').toLowerCase()
    const tag = String(el.tagName || '').toLowerCase()
    return (
      ['关闭', '关 闭', '×', 'x', 'X'].includes(text) ||
      aria.includes('关闭') ||
      className.includes('close') ||
      className.includes('modal-close') ||
      className.includes('dialog-close') ||
      (tag === 'i' && className.includes('icon') && className.includes('guan'))
    )
  }

  function findModalCloseCenter() {
    const candidates = []
    for (const { el, frame } of allVisibleElements()) {
      const text = textOf(el)
      if (!isCloseLike(el, text)) continue
      const rect = el.getBoundingClientRect()
      const x = Math.round(frame.offsetX + rect.left + rect.width / 2)
      const y = Math.round(frame.offsetY + rect.top + rect.height / 2)
      if (x < window.innerWidth * 0.35 || y > window.innerHeight * 0.8) continue
      candidates.push({ el, frame, text, x, y, w: rect.width, h: rect.height })
    }
    candidates.sort((a, b) => (b.y - a.y) || (b.x - a.x))
    const picked = candidates[0]
    if (!picked) return null
    return {
      x: picked.x,
      y: picked.y,
      text: picked.text || '关闭',
      label: '关闭弹框',
    }
  }

  function findTopTextCenter(labels) {
    const previousX = window.scrollX || 0
    const previousY = window.scrollY || 0
    window.scrollTo?.({ top: 0, left: 0, behavior: 'instant' })
    const match = findTextCenter(labels)
    if (match) return match
    window.scrollTo?.({ top: previousY, left: previousX, behavior: 'instant' })
    return null
  }

  function findSectionByScrolling(labels) {
    const maxScrolls = 12
    window.scrollTo?.({ top: 0, left: 0, behavior: 'instant' })
    for (let attempt = 0; attempt <= maxScrolls; attempt += 1) {
      const match = findTextCenter(labels)
      if (match) return match
      window.scrollBy({ top: Math.max(window.innerHeight * 0.85, 600), behavior: 'instant' })
    }
    return null
  }

  function findReviewLoadMoreCenter() {
    return findTextCenter(REVIEW_LOAD_MORE_LABELS) || findSectionByScrolling(REVIEW_LOAD_MORE_LABELS)
  }

  function findQaLoadMoreCenter() {
    return findTextCenter(REVIEW_LOAD_MORE_LABELS) || findSectionByScrolling(REVIEW_LOAD_MORE_LABELS)
  }

  function isItemMarked(mapName, item) {
    return Boolean(item?.itemId && (shared[mapName] || {})[item.itemId])
  }

  function markItem(mapName, item, value = true) {
    if (!item?.itemId) return shared[mapName] || {}
    return { ...(shared[mapName] || {}), [item.itemId]: value }
  }

  function selectQaFullModeBefore(current, nextPhaseName, nextShared = shared) {
    if (isItemMarked('qaFullModeSelectedByItem', current)) return nextPhase(nextPhaseName, nextShared, 300)
    const match = findTextCenter(QA_FULL_MODE_LABELS)
    const selectedShared = remember({
      ...nextShared,
      qaFullModeSelectedByItem: markItem('qaFullModeSelectedByItem', current),
      qaFullModeLoadWaits: 0,
      diagnostics: {
        qaFullMode: match
          ? { label: match.label, text: match.text, x: match.x, y: match.y }
          : { skipped: true, reason: '未找到问大家完整模式入口，按当前模式继续', sample: bodyText().slice(0, 220) },
      },
    })
    if (!match) return nextPhase(nextPhaseName, selectedShared, 300)
    return cdpClicks([{ x: match.x, y: match.y, delay_ms: 160 }], nextPhaseName, selectedShared, getQaFullModeLoadDelayMs())
  }

  function selectReviewDateDescBefore(current, nextPhaseName, nextShared = shared) {
    if (isItemMarked('reviewDateDescSelectedByItem', current)) return nextPhase(nextPhaseName, nextShared, 300)
    const match = findReviewDateDescCenter()
    const diagnostics = {
      reviewDateDesc: match
        ? { label: match.label, text: match.text, x: match.x, y: match.y, source: match.source }
        : { skipped: true, reason: '未找到评价日期降序入口，按当前排序继续', sample: bodyText().slice(0, 220) },
    }
    if (!match) {
      const selectedShared = remember({
        ...nextShared,
        reviewDateDescSelectedByItem: markItem('reviewDateDescSelectedByItem', current),
        diagnostics,
      })
      return nextPhase(nextPhaseName, selectedShared, 300)
    }
    const selectedShared = remember({
      ...nextShared,
      reviewDateDescSelectedByItem: markItem('reviewDateDescSelectedByItem', current),
      diagnostics,
    })
    return cdpClicks([{ x: match.x, y: match.y, delay_ms: 160 }], nextPhaseName, selectedShared, getPageLoadDelayMs())
  }

  function bodyText() {
    return compact(frameDocuments().map(frame => frame.doc.body ? frame.doc.body.innerText : '').join(' '))
  }

  function detectBlocker() {
    const text = bodyText()
    const patterns = ['请先登录', '请登录', '安全验证', '滑动验证', '拖动滑块', '访问受限', '异常流量', '人机验证', '验证码']
    return patterns.find(pattern => text.includes(pattern)) || ''
  }

  function inspectReviewState() {
    const text = bodyText()
    const pageMatches = [...text.matchAll(/第\s*(\d+)\s*页/g)].map(match => Number(match[1]))
    const clickLoadedPages = 1 + toNumber(shared.loadMoreClicks, 0, 0, 1000)
    const loadedPages = Math.max(pageMatches.length ? Math.max(...pageMatches) : 1, clickLoadedPages)
    const noDataPatterns = [
      '暂无数据',
      '暂无相关数据',
      '暂无评价',
      '暂无买家评价',
      '暂无评论',
      '暂无评论数据',
      '暂无评价数据',
      '没有评价数据',
      '没有相关评价',
      '该商品暂无评价',
      '该商品暂无评论',
      '无评价',
      '暂无内容',
      '暂无分析数据',
      '暂无评价分析数据',
      '暂时没有数据',
    ]
    const endPatterns = ['没有更多了', '已加载全部', '全部加载完成', '到底了']
    const noDataText = noDataPatterns.find(pattern => text.includes(pattern)) || ''
    const endText = endPatterns.find(pattern => text.includes(pattern)) || ''
    const loadedRowsMatch = text.match(/已成功加载\s*[:：]?\s*(\d+)\s*\/\s*(\d+)\s*条?数据/)
    const loadedRows = loadedRowsMatch ? Number(loadedRowsMatch[1]) : 0
    const totalRows = loadedRowsMatch ? Number(loadedRowsMatch[2]) : 0
    const allRowsLoaded = totalRows > 0 && loadedRows >= totalRows
    const isLoading = ['获取数据中', '加载中', '正在加载'].some(pattern => text.includes(pattern))
    const hasExport = Boolean(findTextCenter(['导出表格', '批量下载', '导出'])) || text.includes('导出表格')
    const hasReviewPanel = ['评价趋势', '评价词', '评价内容', '评价明细', '差评', '好评', '中评'].some(pattern => text.includes(pattern))
    const loadMoreMatch = findTextCenter(REVIEW_LOAD_MORE_LABELS)
    const countCandidates = [
      ...[...text.matchAll(/\b(\d+)\s*条/g)].map(match => Number(match[1])),
      ...[...text.matchAll(/评价.{0,20}?(\d+)\s*条/g)].map(match => Number(match[1])),
      ...[...text.matchAll(/(\d+)\s*条.{0,20}?评价/g)].map(match => Number(match[1])),
    ].filter(value => Number.isFinite(value))
    const hasPositiveRows = countCandidates.some(value => value > 0)
    const hasZeroRows = countCandidates.length > 0 && countCandidates.every(value => value <= 0)
    const isEmptyResult = !hasPositiveRows && (Boolean(noDataText) || hasZeroRows)
    return {
      hasData: !isEmptyResult && (hasExport || hasReviewPanel || (hasPositiveRows && hasReviewPanel)),
      hasExport,
      hasReviewPanel,
      hasRows: hasPositiveRows,
      hasPositiveRows,
      hasZeroRows,
      maxCount: countCandidates.length ? Math.max(...countCandidates) : 0,
      isEmptyResult,
      loadedPages,
      loadedRows,
      totalRows,
      hasLoadMore: Boolean(loadMoreMatch) || REVIEW_LOAD_MORE_LABELS.some(label => text.includes(label)),
      hasAutoLoad: text.includes('自动加载'),
      endReached: Boolean(endText) || allRowsLoaded,
      isLoading,
      blocker: detectBlocker(),
      noDataText,
      sample: text.slice(0, 240),
    }
  }

  function inspectQaState() {
    const text = bodyText()
    const pageMatches = [...text.matchAll(/第\s*(\d+)\s*页/g)].map(match => Number(match[1]))
    const clickLoadedPages = 1 + toNumber(shared.qaLoadMoreClicks, 0, 0, 1000)
    const loadedPages = Math.max(pageMatches.length ? Math.max(...pageMatches) : 1, clickLoadedPages)
    const noDataPatterns = [
      '暂无数据',
      '暂无相关数据',
      '暂无问答',
      '暂无问大家',
      '暂无问大家数据',
      '暂无问答数据',
      '暂无相关问答',
      '暂无相关问题',
      '没有问答数据',
      '没有相关问答',
      '没有相关问题',
      '该商品暂无问答',
      '该商品暂无问题',
      '还没有人提问',
      '暂无提问',
      '暂无内容',
      '暂时没有数据',
    ]
    const noDataText = noDataPatterns.find(pattern => text.includes(pattern)) || ''
    const endPatterns = ['没有更多了', '已加载全部', '全部加载完成', '到底了']
    const endText = endPatterns.find(pattern => text.includes(pattern)) || ''
    const loadedRowsMatch = text.match(/已成功加载\s*[:：]?\s*(\d+)\s*\/\s*(\d+)\s*条?数据/)
    const loadedRows = loadedRowsMatch ? Number(loadedRowsMatch[1]) : 0
    const totalRows = loadedRowsMatch ? Number(loadedRowsMatch[2]) : 0
    const allRowsLoaded = totalRows > 0 && loadedRows >= totalRows
    const isLoading = ['获取数据中', '加载中', '正在加载'].some(pattern => text.includes(pattern))
    const hasExport = Boolean(findTextCenter(['导出表格', '批量下载', '导出'])) || text.includes('导出表格')
    const hasQaPanel = text.includes('问大家分析') || text.includes('问大家') || text.includes('问答')
    const loadMoreMatch = findTextCenter(REVIEW_LOAD_MORE_LABELS)
    const countCandidates = [
      ...[...text.matchAll(/\b(\d+)\s*条/g)].map(match => Number(match[1])),
      ...[...text.matchAll(/问答.{0,20}?(\d+)/g)].map(match => Number(match[1])),
      ...[...text.matchAll(/(\d+).{0,8}问答/g)].map(match => Number(match[1])),
    ].filter(value => Number.isFinite(value))
    const hasCountRows = countCandidates.some(value => value > 0)
    const hasOfficialRows = text.includes('官方暂无数据')
    const hasRows = hasCountRows || hasOfficialRows
    return {
      hasData: hasExport && hasRows,
      hasExport,
      hasQaPanel,
      hasRows,
      hasCountRows,
      maxCount: countCandidates.length ? Math.max(...countCandidates) : 0,
      hasOfficialRows,
      loadedPages,
      loadedRows,
      totalRows,
      hasLoadMore: Boolean(loadMoreMatch) || REVIEW_LOAD_MORE_LABELS.some(label => text.includes(label)),
      hasAutoLoad: text.includes('自动加载'),
      endReached: Boolean(endText) || allRowsLoaded,
      isLoading,
      noDataText,
      blocker: detectBlocker(),
      sample: text.slice(0, 240),
    }
  }

  function isQaFullModePending(qaState) {
    if (!isItemMarked('qaFullModeSelectedByItem', currentItem())) return false
    if (isQaStillLoading(qaState.sample)) return true
    if (!qaState.hasExport && !qaState.noDataText) return true
    if (qaState.hasQaPanel && !qaState.hasRows && !qaState.noDataText) return true
    return false
  }

  function shouldForceQaPostPageWait(qaState) {
    const minPolls = getQaPostPageMinPolls()
    if (minPolls <= 0) return false
    const clicks = toNumber(shared.qaLoadMoreClicks, 0, 0, 1000)
    if (clicks <= 0) return false
    const waits = toNumber(shared.qaPostPageWaits, 0, 0, 1000)
    if (waits >= minPolls) return false
    return true
  }

  function buildCompleteRow(current, statusWhenReady = '成功') {
    const qaDownloadResult = findDownloadResult(current, 'qa')
    const reviewDownloadResult = findDownloadResult(current, 'review')
    const fallbackDownloadResult = findDownloadResult(current)
    const primaryDownloadResult = reviewDownloadResult || qaDownloadResult || fallbackDownloadResult
    const noData = (shared.noDataItems || []).includes(current.itemId)
    const qaNoData = (shared.qaNoDataItems || []).includes(current.itemId)
    const reviewNoData = (shared.reviewNoDataItems || []).includes(current.itemId)
    const qaEntryMissing = (shared.qaEntryMissingItems || []).includes(current.itemId)
    const qaOk = qaNoData || qaEntryMissing || Boolean(qaDownloadResult?.success)
    const reviewOk = reviewNoData || Boolean(reviewDownloadResult?.success)
    const status = noData ? '无数据' : (qaOk && reviewOk ? statusWhenReady : '未知')
    const notes = []
    if (qaNoData) notes.push('问大家无数据，已跳过问大家导出')
    if (qaEntryMissing) notes.push('问大家入口补偿后仍未找到，已跳过问大家导出')
    if (reviewNoData) notes.push('评价分析无数据，已跳过评价导出')
    const errorNote = qaDownloadResult?.error || reviewDownloadResult?.error || fallbackDownloadResult?.error || ''
    return resultRow(current, status, {
      stage: 'complete',
      loadedPages: Number((shared.loadedPagesByItem || {})[current.itemId] || 0),
      targetPages: getMinPages(),
      file: primaryDownloadResult?.path || primaryDownloadResult?.filename || '',
      qaFile: qaDownloadResult?.path || qaDownloadResult?.filename || '',
      reviewFile: reviewDownloadResult?.path || reviewDownloadResult?.filename || '',
      note: noData
        ? `未检测到评价数据；诊断=${JSON.stringify(shared.diagnostics || {}).slice(0, 500)}`
        : (notes.join('；') || errorNote),
    })
  }

  async function waitForPageReady() {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 30000) {
      if ((document.readyState === 'complete' || document.readyState === 'interactive') && bodyText().length > 50) return true
      await sleep(500)
    }
    return false
  }

  async function main() {
    const state = getItemsState()
    const item = currentItem()
    const minPages = getMinPages()

    if (!state.items.length) return fail('请填写至少一个商品链接')
    if (!item) {
      const compensation = startQaCompensationIfNeeded(state)
      if (compensation) return compensation
      const rows = []
      for (const current of state.items) {
        rows.push(buildCompleteRow(current, '成功'))
      }
      return {
        success: true,
        data: rows,
        meta: { action: 'complete', has_more: false, shared },
    }
  }

  function startQaCompensationIfNeeded(state) {
    if (shared.qaCompensationMode) return null
    const deferred = Array.isArray(shared.qaEntryPendingCompensationItems) && shared.qaEntryPendingCompensationItems.length
      ? shared.qaEntryPendingCompensationItems
      : (shared.qaEntryDeferredItems || [])
    const queue = deferred
      .map(itemId => compact(itemId))
      .filter(itemId => {
        if (!itemId) return false
        if ((shared.qaNoDataItems || []).includes(itemId)) return false
        if ((shared.qaEntryMissingItems || []).includes(itemId)) return false
        const item = state.items.find(candidate => candidate.itemId === itemId)
        return item && !findDownloadResult(item, 'qa')?.success
      })
    if (!queue.length) return null
    const nextItem = state.items.find(candidate => candidate.itemId === queue[0])
    if (!nextItem) return null
    location.href = nextItem.url
    return nextPhase('navigate', remember({
      index: state.items.findIndex(candidate => candidate.itemId === nextItem.itemId),
      qaCompensationMode: true,
      qaCompensationQueue: queue,
      qaCompensationCursor: 0,
      qaEntryWaits: 0,
      qaEntryRefreshes: 0,
      qaPanelWaits: 0,
      closeQaWaits: 0,
      qaLoadMoreClicks: 0,
      diagnostics: {
        qaEntryCompensationStart: {
          reason: '所有商品已执行完成，开始补偿此前未找到问大家入口的商品',
          queue,
        },
      },
    }), getItemDelayMs())
  }

    if (phase === 'main') {
      return nextPhase('navigate', {
        ...shared,
        items: state.items,
        index: state.index,
        batchRestNextIndex: shared.batchRestNextIndex || getNextBatchRestIndex(state.index),
      }, 300)
    }

    if (phase === 'navigate') {
      if (!isCurrentItemPage(item)) {
        location.href = item.url
        return nextPhase('wait_page', { ...shared, items: state.items, index: state.index, currentItemId: item.itemId }, 2500)
      }
      return nextPhase('wait_page', { ...shared, items: state.items, index: state.index, currentItemId: item.itemId }, 800)
    }

    if (phase === 'batch_rest_browse') {
      const rest = shared.batchRest || {}
      const targetIndex = toNumber(rest.nextIndex, state.index, 0, Math.max(state.items.length - 1, 0))
      const totalPages = toNumber(rest.totalPages, getBatchRestBrowsePages(), 1, 10)
      const currentPage = toNumber(rest.currentPage, 0, 0, totalPages)
      const totalMs = toNumber(rest.totalMs, getBatchRestTotalMs(), 60000, 3600000)
      const perPageMs = Math.max(Math.floor(totalMs / Math.max(totalPages, 1)), 30000)
      if (currentPage >= totalPages) {
        return nextPhase('navigate', {
          ...shared,
          index: targetIndex,
          batchRest: null,
          batchRestNextIndex: getNextBatchRestIndex(targetIndex),
        }, getItemDelayMs())
      }
      const url = REST_BROWSE_URLS[currentPage % REST_BROWSE_URLS.length]
      location.href = url
      return nextPhase('batch_rest_browse', remember({
        index: targetIndex,
        batchRest: {
          nextIndex: targetIndex,
          totalPages,
          currentPage: currentPage + 1,
          totalMs,
        },
        diagnostics: {
          batchRest: {
            reason: '批次休息浏览淘宝页面，降低连续抓取强度',
            nextItemIndex: targetIndex,
            currentPage: currentPage + 1,
            totalPages,
            waitMs: perPageMs,
            url,
          },
        },
      }), perPageMs)
    }

    if (phase === 'wait_page') {
      const ready = await waitForPageReady()
      if (!ready) return fail(`商品页加载超时：${item.url}`)
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      return nextPhase('open_qa', shared, 500)
    }

    if (phase === 'open_qa') {
      const match = findSectionByScrolling(['问大家', '问大家分析'])
      if (!match) return waitOrRefreshForEntry('qa', 'open_qa', `未找到“问大家”入口，请确认店透视插件已启用并在当前页面可见`)
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'wait_qa_panel',
        remember({
          qaEntryWaits: 0,
          qaEntryRefreshes: 0,
          diagnostics: { openQa: { label: match.label, text: match.text, x: match.x, y: match.y } },
        }),
        2200,
      )
    }

    if (phase === 'wait_qa_panel') {
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      const qaState = inspectQaState()
      if (qaState.noDataText && !qaState.hasRows) {
        return nextPhase('close_qa_modal', remember({
          qaNoDataItems: [...(shared.qaNoDataItems || []), item.itemId],
          diagnostics: { waitQaPanel: qaState },
        }), 400)
      }
      if (qaState.hasData) {
        return selectQaFullModeBefore(item, 'inspect_qa', remember({
          diagnostics: { waitQaPanel: qaState },
        }))
      }
      const waits = toNumber(shared.qaPanelWaits, 0, 0, 10) + 1
      if (waits < 6) {
        return nextPhase('wait_qa_panel', remember({
          qaPanelWaits: waits,
          diagnostics: { waitQaPanel: { ...qaState, waiting: waits } },
        }), 1000)
      }
      return nextPhase('close_qa_modal', remember({
        qaNoDataItems: [...(shared.qaNoDataItems || []), item.itemId],
        diagnostics: { waitQaPanel: qaState },
      }), 400)
    }

    if (phase === 'inspect_qa') {
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      const qaState = inspectQaState()
      if (shouldForceQaPostPageWait(qaState)) {
        const waits = toNumber(shared.qaPostPageWaits, 0, 0, 1000) + 1
        return nextPhase('inspect_qa', remember({
          qaPostPageWaits: waits,
          diagnostics: {
            inspectQa: {
              ...qaState,
              qaPostPageWaiting: true,
              waiting: waits,
              minPolls: getQaPostPageMinPolls(),
              minWaitMs: getQaPostPageMinPolls() * toDurationMs(
                params.qa_full_mode_load_delay_min_ms,
                DEFAULT_QA_FULL_MODE_LOAD_DELAY_MIN_MS,
                2000,
                120000,
              ),
            },
          },
        }), getQaFullModeLoadDelayMs())
      }
      if (isQaFullModePending(qaState)) {
        const waits = toNumber(shared.qaFullModeLoadWaits, 0, 0, 50) + 1
        const maxQaLoadWaits = getQaFullModeMaxLoadWaits()
        if (waits <= maxQaLoadWaits) {
          return nextPhase('inspect_qa', remember({
            qaFullModeLoadWaits: waits,
            diagnostics: { inspectQa: { ...qaState, qaFullModePending: true, waiting: waits, maxWaits: maxQaLoadWaits } },
          }), getQaFullModeLoadDelayMs())
        }
      }
      if ((qaState.noDataText && !qaState.hasRows) || (qaState.hasExport && !qaState.hasRows)) {
        return nextPhase('close_qa_modal', remember({
          qaNoDataItems: [...(shared.qaNoDataItems || []), item.itemId],
          diagnostics: { inspectQa: qaState },
        }), 400)
      }
      if (!qaState.hasData) {
        return nextPhase('close_qa_modal', remember({
          qaNoDataItems: [...(shared.qaNoDataItems || []), item.itemId],
          diagnostics: { inspectQa: qaState },
        }), 400)
      }
      if (!isItemMarked('qaFullModeSelectedByItem', item)) {
        return selectQaFullModeBefore(item, 'inspect_qa', remember({
          diagnostics: { inspectQa: qaState },
        }))
      }
      if (qaState.loadedPages >= minPages || qaState.endReached) {
        return nextPhase('export_qa', remember({
          qaPendingAdvance: null,
          qaLoadedPagesByItem: { ...(shared.qaLoadedPagesByItem || {}), [item.itemId]: qaState.loadedPages },
          diagnostics: { inspectQa: qaState },
        }), 400)
      }
      return nextPhase('load_qa_more', remember({
        qaPendingAdvance: null,
        qaLoadedPagesByItem: { ...(shared.qaLoadedPagesByItem || {}), [item.itemId]: qaState.loadedPages },
        diagnostics: { inspectQa: qaState },
      }), 300)
    }

    if (phase === 'load_qa_more') {
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      const qaState = inspectQaState()
      if (isQaFullModePending(qaState)) {
        const waits = toNumber(shared.qaFullModeLoadWaits, 0, 0, 50) + 1
        const maxQaLoadWaits = getQaFullModeMaxLoadWaits()
        if (waits <= maxQaLoadWaits) {
          return nextPhase('load_qa_more', remember({
            qaFullModeLoadWaits: waits,
            diagnostics: { loadQaMore: { ...qaState, qaFullModePending: true, waiting: waits, maxWaits: maxQaLoadWaits } },
          }), getQaFullModeLoadDelayMs())
        }
      }
      if ((qaState.noDataText && !qaState.hasRows) || (qaState.hasExport && !qaState.hasRows)) {
        return nextPhase('close_qa_modal', remember({
          qaNoDataItems: [...(shared.qaNoDataItems || []), item.itemId],
          diagnostics: { loadQaMore: qaState },
        }), 400)
      }
      const match = qaState.hasLoadMore
        ? findQaLoadMoreCenter()
        : findTextCenter(['自动加载'])
      if (!match) {
        if (qaState.endReached || qaState.loadedPages >= minPages) return nextPhase('export_qa', shared, 400)
        if (qaState.hasRows || qaState.hasExport) {
          return nextPhase('export_qa', remember({
            qaLoadedPagesByItem: { ...(shared.qaLoadedPagesByItem || {}), [item.itemId]: qaState.loadedPages },
            diagnostics: { loadQaMore: { ...qaState, reason: '未找到问大家继续加载入口，按已加载数据导出' } },
          }), 400)
        }
        return nextPhase('close_qa_modal', remember({
          qaNoDataItems: [...(shared.qaNoDataItems || []), item.itemId],
          diagnostics: { loadQaMore: { ...qaState, reason: '未找到问大家继续加载入口且未识别到数据' } },
        }), 400)
      }
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'inspect_qa',
        remember({
          qaLoadMoreClicks: toNumber(shared.qaLoadMoreClicks, 0, 0, 1000) + 1,
          qaLoadMoreWaits: 0,
          qaFullModeLoadWaits: 0,
          qaPostPageWaits: 0,
          qaPendingAdvance: {
            basePage: qaState.loadedPages,
            baseLoadedRows: qaState.loadedRows,
            baseMaxCount: qaState.maxCount,
            baseSample: qaState.sample,
          },
          diagnostics: { loadQaMore: { ...qaState, label: match.label, text: match.text } },
        }),
        getPageLoadDelayMs(),
      )
    }

    if (phase === 'export_qa') {
      const qaState = inspectQaState()
      if ((qaState.noDataText && !qaState.hasRows) || (qaState.hasExport && !qaState.hasRows)) {
        return nextPhase('close_qa_modal', remember({
          qaNoDataItems: [...(shared.qaNoDataItems || []), item.itemId],
          diagnostics: { exportQa: qaState },
        }), 400)
      }
      const match = findTextCenter(['导出表格', '批量下载', '导出'])
      if (!match) return fail('未找到“问大家”导出表格入口')
      return downloadClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'after_export_qa',
        item,
        remember({
          diagnostics: { exportQa: { label: match.label, text: match.text, x: match.x, y: match.y } },
        }),
        { kind: '问大家' },
      )
    }

    if (phase === 'after_export_qa') {
      if (shouldRetryDownload(item, 'qa')) return retryDownloadFromItemStart(item, 'qa')
      if (shared.qaCompensationMode) return nextPhase('advance_qa_compensation', shared, 300)
      return nextPhase('close_qa_modal', shared, 300)
    }

    if (phase === 'close_qa_modal') {
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      const match = findModalCloseCenter() || findTextCenter(['关闭'])
      if (!match) {
        const waits = toNumber(shared.closeQaWaits, 0, 0, 10) + 1
        if (waits < 4) {
          return nextPhase('close_qa_modal', remember({
            closeQaWaits: waits,
            diagnostics: { closeQaModal: { waiting: waits, sample: bodyText().slice(0, 220) } },
          }), 800)
        }
        if (shared.qaCompensationMode) {
          return nextPhase('advance_qa_compensation', remember({
            closeQaWaits: 0,
            qaPanelWaits: 0,
            diagnostics: { closeQaModal: { skipped: true, compensation: true, reason: '补偿阶段未找到问大家弹框关闭按钮，继续下一个补偿商品', sample: bodyText().slice(0, 220) } },
          }), 800)
        }
        return nextPhase('open_review', remember({
          closeQaWaits: 0,
          qaPanelWaits: 0,
          reviewPanelWaits: 0,
          loadMoreClicks: 0,
          diagnostics: { closeQaModal: { skipped: true, reason: '未找到问大家弹框关闭按钮，继续尝试评价分析', sample: bodyText().slice(0, 220) } },
        }), 800)
      }
      if (shared.qaCompensationMode) {
        return nextPhase('advance_qa_compensation', remember({
          closeQaWaits: 0,
          qaPanelWaits: 0,
          diagnostics: { closeQaModal: { label: match.label, text: match.text, x: match.x, y: match.y, compensation: true } },
        }), 800)
      }
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'open_review',
        remember({
          closeQaWaits: 0,
          qaPanelWaits: 0,
          reviewPanelWaits: 0,
          loadMoreClicks: 0,
          diagnostics: { closeQaModal: { label: match.label, text: match.text, x: match.x, y: match.y } },
        }),
        1200,
      )
    }

    if (phase === 'open_review') {
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      const match =
        findTopTextCenter(['评价分析', '评论分析', '买家评价']) ||
        findSectionByScrolling(['评价分析', '评论分析', '买家评价'])
      if (!match) {
        return waitOrRefreshForEntry('review', 'open_review', `未找到“评价分析”入口；已点击问大家，但当前页面未出现评价分析标签。页面片段：${bodyText().slice(0, 180)}`)
      }
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'wait_review_panel',
        remember({
          reviewEntryWaits: 0,
          reviewEntryRefreshes: 0,
          reviewPanelWaits: 0,
          loadMoreClicks: 0,
          diagnostics: { openReview: { label: match.label, text: match.text, x: match.x, y: match.y } },
        }),
        2200,
      )
    }

    if (phase === 'wait_review_panel') {
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      const reviewState = inspectReviewState()
      if (reviewState.hasReviewPanel || reviewState.hasExport || reviewState.noDataText) {
        if (reviewState.hasReviewPanel || reviewState.hasExport) {
          return selectReviewDateDescBefore(item, 'inspect_reviews', remember({
            diagnostics: { waitReviewPanel: reviewState },
          }))
        }
        return nextPhase('inspect_reviews', remember({
          diagnostics: { waitReviewPanel: reviewState },
        }), 500)
      }
      const waits = toNumber(shared.reviewPanelWaits, 0, 0, 10) + 1
      if (waits < 6) {
        return nextPhase('wait_review_panel', remember({
          reviewPanelWaits: waits,
          diagnostics: { waitReviewPanel: reviewState },
        }), 1200)
      }
      return fail(`点击评价分析后未检测到评价面板或导出入口。页面片段：${reviewState.sample}`)
    }

    if (phase === 'inspect_reviews') {
      const blocker = detectBlocker()
      if (blocker) return fail(`页面出现拦截提示：${blocker}`)
      const reviewState = inspectReviewState()
      if (reviewState.isEmptyResult && !reviewState.hasRows) {
        return nextPhase('advance_item', {
          ...shared,
          reviewNoDataItems: [...(shared.reviewNoDataItems || []), item.itemId],
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { ...(shared.diagnostics || {}), inspectReviews: reviewState },
        }, 300)
      }
      if (reviewState.hasExport && !reviewState.hasRows && !reviewState.hasLoadMore && !reviewState.hasAutoLoad) {
        return nextPhase('export_reviews', {
          ...shared,
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { ...(shared.diagnostics || {}), inspectReviews: reviewState },
        }, 500)
      }
      if (!reviewState.hasData) {
        return nextPhase('advance_item', {
          ...shared,
          noDataItems: [...(shared.noDataItems || []), item.itemId],
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { ...(shared.diagnostics || {}), inspectReviews: reviewState },
        }, 300)
      }
      if (!isItemMarked('reviewDateDescSelectedByItem', item)) {
        return selectReviewDateDescBefore(item, 'inspect_reviews', remember({
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { inspectReviews: reviewState },
        }))
      }
      if (reviewState.loadedPages >= minPages || reviewState.endReached) {
        return nextPhase('export_reviews', {
          ...shared,
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { ...(shared.diagnostics || {}), inspectReviews: reviewState },
        }, 500)
      }
      return nextPhase('load_more', {
        ...shared,
        loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
        diagnostics: { ...(shared.diagnostics || {}), inspectReviews: reviewState },
      }, 300)
    }

    if (phase === 'load_more') {
      const reviewState = inspectReviewState()
      if (reviewState.isEmptyResult && !reviewState.hasRows) {
        return nextPhase('advance_item', {
          ...shared,
          reviewNoDataItems: [...(shared.reviewNoDataItems || []), item.itemId],
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { ...(shared.diagnostics || {}), loadMore: reviewState },
        }, 300)
      }
      const match = reviewState.hasLoadMore
        ? findReviewLoadMoreCenter()
        : findTextCenter(['自动加载'])
      if (!match) {
        if (reviewState.endReached || reviewState.loadedPages >= minPages) return nextPhase('export_reviews', shared, 500)
        if (reviewState.hasRows || reviewState.hasExport) {
          return nextPhase('export_reviews', remember({
            loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
            diagnostics: { loadMore: { ...reviewState, reason: '未找到继续加载入口，按已加载数据导出' } },
          }), 500)
        }
        return nextPhase('advance_item', remember({
          noDataItems: [...(shared.noDataItems || []), item.itemId],
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { loadMore: { ...reviewState, reason: '未找到继续加载入口且未识别到评价数据' } },
        }), 300)
      }
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'inspect_reviews',
        remember({
          loadMoreClicks: toNumber(shared.loadMoreClicks, 0, 0, 1000) + 1,
          loadMoreWaits: 0,
          diagnostics: { loadMore: { ...reviewState, label: match.label, text: match.text } },
        }),
        getPageLoadDelayMs(),
      )
    }

    if (phase === 'export_reviews') {
      const reviewState = inspectReviewState()
      if (reviewState.isEmptyResult && !reviewState.hasRows) {
        return nextPhase('advance_item', {
          ...shared,
          reviewNoDataItems: [...(shared.reviewNoDataItems || []), item.itemId],
          loadedPagesByItem: { ...(shared.loadedPagesByItem || {}), [item.itemId]: reviewState.loadedPages },
          diagnostics: { ...(shared.diagnostics || {}), exportReviews: reviewState },
        }, 300)
      }
      const match = findTextCenter(['导出表格', '批量下载', '导出'])
      if (!match) return fail('未找到“导出表格”入口')
      return downloadClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'after_export_reviews',
        item,
        remember({
          diagnostics: { exportReviews: { label: match.label, text: match.text, x: match.x, y: match.y } },
        }),
        { kind: '评价' },
      )
    }

    if (phase === 'after_export_reviews') {
      if (shouldRetryDownload(item, 'review')) return retryDownloadFromItemStart(item, 'review')
      return nextPhase('advance_item', shared, 300)
    }

    if (phase === 'advance_item') {
      const nextIndex = state.index + 1
      if (nextIndex >= state.items.length) {
        const compensation = startQaCompensationIfNeeded(state)
        if (compensation) return compensation
        return nextPhase('complete', { ...shared, index: nextIndex }, 300)
      }
      const nextRestIndex = toNumber(shared.batchRestNextIndex, getNextBatchRestIndex(0), 1, 100000)
      if (isBatchRestEnabled() && nextIndex >= nextRestIndex) {
        const totalPages = getBatchRestBrowsePages()
        const totalMs = getBatchRestTotalMs()
        return nextPhase('batch_rest_browse', {
          ...shared,
          index: nextIndex,
          batchRest: {
            nextIndex,
            totalPages,
            currentPage: 0,
            totalMs,
          },
        }, getItemDelayMs())
      }
      return nextPhase('navigate', { ...shared, index: nextIndex }, getItemDelayMs())
    }

    if (phase === 'advance_qa_compensation') {
      const queue = Array.isArray(shared.qaCompensationQueue) ? shared.qaCompensationQueue : []
      const cursor = toNumber(shared.qaCompensationCursor, 0, 0, Math.max(queue.length - 1, 0)) + 1
      const nextItemId = compact(queue[cursor])
      if (!nextItemId) {
        return nextPhase('complete', remember({
          index: state.items.length,
          qaCompensationMode: false,
          qaCompensationCursor: cursor,
          qaEntryPendingCompensationItems: [],
          diagnostics: {
            qaEntryCompensationComplete: {
              reason: '问大家入口补偿流程已结束',
              total: queue.length,
            },
          },
        }), 300)
      }
      const nextIndex = state.items.findIndex(candidate => candidate.itemId === nextItemId)
      if (nextIndex < 0) {
        return nextPhase('advance_qa_compensation', remember({
          qaCompensationCursor: cursor,
          diagnostics: {
            qaEntryCompensationMissingItem: {
              itemId: nextItemId,
              reason: '补偿队列中的商品已不在当前商品列表，跳过',
            },
          },
        }), 100)
      }
      location.href = state.items[nextIndex].url
      return nextPhase('navigate', remember({
        index: nextIndex,
        qaCompensationMode: true,
        qaCompensationCursor: cursor,
        qaEntryWaits: 0,
        qaEntryRefreshes: 0,
        qaPanelWaits: 0,
        closeQaWaits: 0,
        qaLoadMoreClicks: 0,
        diagnostics: {
          qaEntryCompensationNext: {
            itemId: nextItemId,
            cursor,
            total: queue.length,
          },
        },
      }), getItemDelayMs())
    }

    if (phase === 'complete') {
      const compensation = startQaCompensationIfNeeded(state)
      if (compensation) return compensation
      const rows = []
      for (const current of state.items) {
        rows.push(buildCompleteRow(current, '成功'))
      }
      return {
        success: true,
        data: rows,
        meta: { action: 'complete', has_more: false, shared },
      }
    }

    return fail(`未知阶段：${phase}`)
  }

  try {
    return await main()
  } catch (error) {
    return fail(error?.message || String(error))
  }
})()

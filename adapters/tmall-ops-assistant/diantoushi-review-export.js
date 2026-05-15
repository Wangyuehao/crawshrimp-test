;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}
  const shared = window.__CRAWSHRIMP_SHARED__ || {}
  const phase = window.__CRAWSHRIMP_PHASE__ || 'main'

  const DEFAULT_MIN_PAGES = 30
  const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120000
  const REVIEW_LOAD_MORE_LABELS = ['加载下一页', '加载更多', '下一页', '更多评价', '继续加载']

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

  function findDownloadResult(item, kind = '') {
    const results = flattenDownloadResults(shared.downloadResults || [])
    const kindPattern = kind === 'qa' ? /问大家/ : kind === 'review' ? /评价/ : null
    const itemResults = results.filter(result => String(result?.label || result?.filename || result?.path || '').includes(item.itemId))
    if (kindPattern) {
      const matched = itemResults.find(result => {
        const text = String(result?.label || result?.filename || result?.path || '')
        return kindPattern.test(text)
      })
      if (matched) return matched
      return null
    }
    return itemResults.find(result => result?.success) || itemResults[0] || null
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
        strict: true,
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
    const noDataPatterns = ['暂无数据', '暂无评价', '暂无评论', '没有评价数据', '暂无内容', '暂无分析数据']
    const endPatterns = ['没有更多了', '已加载全部', '全部加载完成', '到底了']
    const noDataText = noDataPatterns.find(pattern => text.includes(pattern)) || ''
    const endText = endPatterns.find(pattern => text.includes(pattern)) || ''
    const loadedRowsMatch = text.match(/已成功加载\s*[:：]?\s*(\d+)\s*\/\s*(\d+)\s*条?数据/)
    const loadedRows = loadedRowsMatch ? Number(loadedRowsMatch[1]) : 0
    const totalRows = loadedRowsMatch ? Number(loadedRowsMatch[2]) : 0
    const allRowsLoaded = totalRows > 0 && loadedRows >= totalRows
    const hasExport = Boolean(findTextCenter(['导出表格', '批量下载', '导出'])) || text.includes('导出表格')
    const hasReviewPanel = ['评价分析', '评价趋势', '评价词', '评价内容', '差评', '好评', '中评'].some(pattern => text.includes(pattern))
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
      hasData: !isEmptyResult && (hasExport || hasPositiveRows || hasReviewPanel),
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
      blocker: detectBlocker(),
      noDataText,
      sample: text.slice(0, 240),
    }
  }

  function inspectQaState() {
    const text = bodyText()
    const noDataPatterns = ['暂无数据', '暂无问答', '暂无内容', '没有问答数据']
    const noDataText = noDataPatterns.find(pattern => text.includes(pattern)) || ''
    const hasExport = Boolean(findTextCenter(['导出表格', '批量下载', '导出'])) || text.includes('导出表格')
    const hasQaPanel = text.includes('问大家分析') || text.includes('问大家') || text.includes('问答')
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
      noDataText,
      blocker: detectBlocker(),
      sample: text.slice(0, 240),
    }
  }

  function buildCompleteRow(current, statusWhenReady = '成功') {
    const qaDownloadResult = findDownloadResult(current, 'qa')
    const reviewDownloadResult = findDownloadResult(current, 'review')
    const fallbackDownloadResult = findDownloadResult(current)
    const primaryDownloadResult = reviewDownloadResult || qaDownloadResult || fallbackDownloadResult
    const noData = (shared.noDataItems || []).includes(current.itemId)
    const qaNoData = (shared.qaNoDataItems || []).includes(current.itemId)
    const reviewNoData = (shared.reviewNoDataItems || []).includes(current.itemId)
    const qaOk = qaNoData || Boolean(qaDownloadResult?.success)
    const reviewOk = reviewNoData || Boolean(reviewDownloadResult?.success)
    const status = noData ? '无数据' : (qaOk && reviewOk ? statusWhenReady : '未知')
    const notes = []
    if (qaNoData) notes.push('问大家无数据，已跳过问大家导出')
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

    if (phase === 'main') {
      return nextPhase('navigate', { ...shared, items: state.items, index: state.index }, 300)
    }

    if (phase === 'navigate') {
      if (!isCurrentItemPage(item)) {
        location.href = item.url
        return nextPhase('wait_page', { ...shared, items: state.items, index: state.index, currentItemId: item.itemId }, 2500)
      }
      return nextPhase('wait_page', { ...shared, items: state.items, index: state.index, currentItemId: item.itemId }, 800)
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
      if (!match) return fail(`未找到“问大家”入口，请确认店透视插件已启用并在当前页面可见`)
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'wait_qa_panel',
        remember({
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
        return nextPhase('export_qa', remember({
          diagnostics: { waitQaPanel: qaState },
        }), 400)
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
        'close_qa_modal',
        item,
        remember({
          diagnostics: { exportQa: { label: match.label, text: match.text, x: match.x, y: match.y } },
        }),
        { kind: '问大家' },
      )
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
        return fail(`已打开问大家，但未找到弹框关闭按钮；请手动关闭后重试。页面片段：${bodyText().slice(0, 220)}`)
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
        return fail(`未找到“评价分析”入口；已点击问大家，但当前页面未出现评价分析标签。页面片段：${bodyText().slice(0, 180)}`)
      }
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'wait_review_panel',
        remember({
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
        if (reviewState.hasRows && reviewState.loadedPages < minPages) {
          return fail(`评价数据只有 ${reviewState.loadedPages} 页，且未找到继续加载入口；页面片段：${reviewState.sample}`)
        }
        if (reviewState.hasExport) return nextPhase('export_reviews', shared, 500)
        return fail(`评价数据只有 ${reviewState.loadedPages} 页，且未找到继续加载入口；页面片段：${reviewState.sample}`)
      }
      return cdpClicks(
        [{ x: match.x, y: match.y, delay_ms: 160 }],
        'inspect_reviews',
        remember({
          loadMoreClicks: toNumber(shared.loadMoreClicks, 0, 0, 1000) + 1,
          diagnostics: { loadMore: { ...reviewState, label: match.label, text: match.text } },
        }),
        2400,
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
        'advance_item',
        item,
        remember({
          diagnostics: { exportReviews: { label: match.label, text: match.text, x: match.x, y: match.y } },
        }),
        { kind: '评价' },
      )
    }

    if (phase === 'advance_item') {
      const nextIndex = state.index + 1
      if (nextIndex >= state.items.length) {
        return nextPhase('complete', { ...shared, index: nextIndex }, 300)
      }
      return nextPhase('navigate', { ...shared, index: nextIndex }, 800)
    }

    if (phase === 'complete') {
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

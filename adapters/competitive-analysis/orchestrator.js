;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}
  const shared = window.__CRAWSHRIMP_SHARED__ || {}
  const phase = window.__CRAWSHRIMP_PHASE__ || 'main'

  const BI_URL = 'https://guanbi.ecsemir.com/page/j54270c33616049dcb650111'
  const P360_URL = 'https://smbd.semirapp.cn/pc/product/productManager/product360'
  const LOGIN_WAIT_MAX_ROUNDS = 30 // 每轮3s，最长约90s

  function isExpectedBiPage() {
    try {
      const url = new URL(window.location.href)
      const expected = new URL(BI_URL)
      return url.origin === expected.origin && url.pathname === expected.pathname
    } catch (_) {
      return false
    }
  }

  // ── 阶段协议辅助 ─────────────────────────────────────────
  function nextPhase(name, nextShared, sleepMs = 1200, data = []) {
    return {
      success: true,
      data,
      meta: { action: 'next_phase', next_phase: name, sleep_ms: sleepMs, shared: nextShared },
    }
  }
  function complete(nextShared, data = []) {
    return {
      success: true,
      data,
      meta: { action: 'complete', has_more: false, shared: nextShared },
    }
  }

  // ── 通用工具 ─────────────────────────────────────────────
  function compact(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim() }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  function randomInt(min, max) {
    const lo = Math.ceil(Number(min) || 0), hi = Math.floor(Number(max) || lo)
    return hi <= lo ? lo : lo + Math.floor(Math.random() * (hi - lo + 1))
  }

  function row(source, id, name, value, status, remark) {
    return {
      数据源: source,
      '款号/商品ID': id,
      结构名称: shared.structure || '竞品分析',
      指标名称: name,
      指标值: value,
      状态: status,
      备注: remark || '',
    }
  }

  async function waitForLoadIdle(timeoutMs = 12000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const spinners = document.querySelectorAll('.semi-spin-spinning, .ant-spin-spinning, .loading, .skeleton, [class*="spin"]')
      if (spinners.length === 0) { await sleep(1000); return }
      await sleep(500)
    }
  }

  async function waitForSelector(selector, timeoutMs = 15000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const el = document.querySelector(selector)
      if (el) return el
      await sleep(500)
    }
    return null
  }

  async function fillInput(selector, value) {
    const el = await waitForSelector(selector, 8000)
    if (!el) return false
    el.focus(); el.value = ''
    el.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    await sleep(300); return true
  }

  async function clickByText(text, tag = 'button, a, span, div', timeoutMs = 8000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const els = document.querySelectorAll(tag)
      for (const el of els) {
        if (el.textContent && el.textContent.includes(text) && el.offsetParent !== null) {
          el.click(); await sleep(500); return true
        }
      }
      await sleep(500)
    }
    return false
  }

  async function clickElement(selector, timeoutMs = 8000) {
    const el = await waitForSelector(selector, timeoutMs)
    if (!el) return false
    el.click(); await sleep(500); return true
  }

  // ── BI看板（观远BI）专用工具 ──────────────────────────────
  function realClick(el) {
    const rect = el.getBoundingClientRect()
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }))
    }
  }
  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function findTextEl(text) {
    return Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && (el.textContent || '').trim() === text)
  }
  function findBtn(text) {
    return Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === text && b.offsetParent !== null)
  }
  function clickPoint(el) {
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, delay_ms: 180 }
  }
  function visibleExactText(text, root = document, selector = 'button, a, label, span, div') {
    return Array.from(root.querySelectorAll(selector)).find(el =>
      el.offsetParent !== null && (el.textContent || '').replace(/\s+/g, '').trim() === text
    )
  }
  function getP360Dialog() {
    return Array.from(document.querySelectorAll('.el-dialog, [role="dialog"], .semi-modal, .ant-modal')).find(el => el.offsetParent !== null) || null
  }
  function getP360DownloadButtons() {
    const roots = Array.from(document.querySelectorAll('.el-drawer, .el-dialog, [role="dialog"], .semi-sidesheet, .ant-drawer'))
      .filter(el => el.offsetParent !== null)
    const root = roots[0] || document
    const seen = new Set()
    // 商品360表格中“任务类型”列也会显示“数据下载”，它只是文本。
    // 真实下载动作位于最右侧“操作”列，元素 class 为 download-btn。
    return Array.from(root.querySelectorAll('.download-btn')).filter(el => {
      const text = compact(el.textContent)
      if (!/^(数据下载|下载|重新下载)$/.test(text) || el.offsetParent === null) return false
      const point = clickPoint(el)
      // 下载中心的表格可能停留在中间位置。不能对已滚出视窗的元素使用
      // CDP 坐标点击（坐标会是负数，导致请求根本没有发出）。
      if (!point || point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) return false
      const key = Math.round(point.x) + ':' + Math.round(point.y)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  function resetP360DownloadScroll() {
    const root = getP360Dialog() || document
    const candidates = Array.from(root.querySelectorAll('*'))
      .filter(el => el.offsetParent !== null && el.scrollHeight > el.clientHeight + 12)
      .sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth))
    // 下载中心列表的滚动容器通常是可视面积最大的纵向滚动节点。
    const scrollable = candidates.find(el => el.clientHeight > 180) || candidates[0]
    if (!scrollable) return false
    scrollable.scrollTop = 0
    // 下载中心“操作”列在横向表格最右侧；初始视图只显示任务描述列，必须先
    // 滚到最右侧，才能得到“数据下载”按钮的有效可见坐标。
    // 横向滚动层有时和纵向表格体不是同一个节点，所有可滚动候选都右移。
    candidates.forEach(el => { el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth) })
    scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
    return true
  }
  function requestDownloadClicks(items, nextPhaseName, nextShared, sleepMs = 1000, sharedKey = 'p360Downloads') {
    return {
      success: true,
      data: [],
      meta: {
        action: 'download_clicks', items, strict: false, shared_key: sharedKey,
        next_phase: nextPhaseName, sleep_ms: sleepMs, shared: nextShared,
      },
    }
  }
  // 请求 Runner 用 CDP 受信任鼠标点击坐标后进入下一阶段（rc-picker 日期选择必须受信任点击）
  function cdpClicks(clicks, nextPhaseName, nextShared, sleepMs = 800, data = []) {
    return {
      success: true,
      data,
      meta: { action: 'cdp_clicks', clicks, next_phase: nextPhaseName, sleep_ms: sleepMs, shared: nextShared },
    }
  }
  function getDatePanel() {
    return document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)') ||
      document.querySelector('.next-overlay-wrapper.opened .next-date-picker2-overlay')
  }
  // 日期面板翻页到目标月份，返回目标日期单元格中心坐标（供CDP点击）；失败返回 null
  async function navDatePanelTo(dateStr) {
    const target = new Date(dateStr + 'T00:00:00')
    for (let i = 0; i < 40; i++) {
      const panel = getDatePanel()
      if (!panel) return null
      const cell = panel.querySelector('td[title="' + dateStr + '"]')
      if (cell) {
        const r = cell.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
      const isNextPicker = panel.classList.contains('next-date-picker2-overlay')
      const calendar = isNextPicker ? panel.querySelector('.next-range-picker-left') : panel
      const head = isNextPicker
        ? (calendar?.querySelector('.next-calendar2-header-text-field')?.textContent || '').trim()
        : (panel.querySelector('.ant-picker-header-view')?.textContent || '').trim()
      const m = head.match(/(\d{4})年\s*(\d{1,2})月/)
      if (!m) return null
      const diff = (target.getFullYear() * 12 + target.getMonth()) - (+m[1] * 12 + (+m[2]) - 1)
      let btn
      if (isNextPicker) {
        const buttons = Array.from(calendar?.querySelectorAll('.next-calendar2-header button') || [])
        const iconButton = (name) => buttons.find(button => button.querySelector(`.next-icon-${name}`))
        btn = diff > 0 ? iconButton('arrow-right') : iconButton('arrow-left')
      } else if (diff > 12) btn = panel.querySelector('.ant-picker-header-super-next-btn')
      else if (diff > 0) btn = panel.querySelector('.ant-picker-header-next-btn')
      else if (diff < -12) btn = panel.querySelector('.ant-picker-header-super-prev-btn')
      else btn = panel.querySelector('.ant-picker-header-prev-btn')
      if (!btn) return null
      realClick(btn)
      await sleep(300)
    }
    return null
  }
  // 千牛的 Next 日期控件在坐标点击后存在延迟挂载浮层的情况；问大家筛选改用
  // 控件本身的点击事件，并在每次选择后留出渲染时间，避免误判“无法选择日期”。
  async function chooseQaDate(dateStr) {
    const point = await navDatePanelTo(dateStr)
    if (!point) return false
    const panel = getDatePanel()
    const cell = panel?.querySelector('td[title="' + dateStr + '"]')
    if (!cell) return false
    realClick(cell)
    return true
  }
  function getBiCards() { return Array.from(document.querySelectorAll('.react-grid-item.gd-card')) }
  function findBiCard(name) { return getBiCards().find(c => (c.textContent || '').trim().startsWith(name)) }
  function getBiScrollRoot() {
    // 单品分析把内容区放在内部 .scroll-y 容器中，document/window 本身不可滚动。
    // 优先命中该容器，并保留通用兜底以兼容 BI 页面样式微调。
    const preferred = document.querySelector('.gd-color-bg.scroll-y')
    if (preferred && preferred.scrollHeight > preferred.clientHeight + 20) return preferred
    return Array.from(document.querySelectorAll('div')).find(el => {
      const style = window.getComputedStyle(el)
      return el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(style.overflowY)
    }) || document.scrollingElement || document.documentElement
  }
  // BI 的款号是异步下拉选择。只看“已点击候选项”并不可靠，必须确认该值已
  // 回写到筛选控件（且候选浮层已关闭）后，才允许进入查询阶段。
  function isBiSkuSelected(sku) {
    const wanted = compact(sku)
    const label = findTextEl('款号')
    const customControl = label && label.closest('.DvhVn-wp')?.querySelector('.SEL_container')
    if (customControl) {
      const openPopover = Array.from(document.querySelectorAll('.ant-popover')).some(p => p.offsetParent !== null && (p.textContent || '').includes('批量粘贴'))
      return !openPopover && compact(customControl.textContent).includes(wanted)
    }
    const input = document.querySelector('input[id^="rc_select_"]')
      || Array.from(document.querySelectorAll('input')).find(i => i.getAttribute('role') === 'combobox')
    if (!input) return false
    const select = input.closest('.ant-select, [class*="select"], [class*="Select"]') || input.parentElement
    return compact(input.value) === wanted || compact(select?.textContent).includes(wanted)
  }
  // 观远BI自绘网格提取：单元格 class 形如 "cell tr col3 row0"，tr 为表头行标记
  function extractGuandataGrid(card) {
    const byRow = new Map()
    let headerRows = 0
    card.querySelectorAll('.cell').forEach(c => {
      const cls = String(c.className || '')
      if (cls.includes('merged-hidden-cell')) return
      const rm = cls.match(/(?:^|\s)row(\d+)(?:\s|$)/)
      const cm = cls.match(/(?:^|\s)col(\d+)(?:\s|$)/)
      if (!rm || !cm) return
      const r = +rm[1], col = +cm[1]
      if (/(?:^|\s)tr(?:\s|$)/.test(cls)) headerRows = Math.max(headerRows, r + 1)
      if (!byRow.has(r)) byRow.set(r, new Map())
      byRow.get(r).set(col, compact(c.textContent))
    })
    const table = Array.from(byRow.keys()).sort((a, b) => a - b).map(r => {
      const colMap = byRow.get(r)
      return Array.from(colMap.keys()).sort((a, b) => a - b).map(c => colMap.get(c))
    })
    return { header: table.slice(0, headerRows), body: table.slice(headerRows) }
  }

  function extractTableData() {
    const rows = []
    document.querySelectorAll('table').forEach(table => {
      table.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td, th')
        const values = Array.from(cells).map(c => compact(c.textContent))
        if (values.some(v => v)) rows.push(values)
      })
    })
    if (rows.length === 0) {
      document.querySelectorAll('.semi-table-tbody tr, .ant-table-tbody tr').forEach(tr => {
        const cells = tr.querySelectorAll('td')
        const values = Array.from(cells).map(c => compact(c.textContent))
        if (values.some(v => v)) rows.push(values)
      })
    }
    return rows
  }

  function onLoginPage() { return /login|sso|auth/i.test(window.location.href) }
  function onTaobaoLoginPage() { return /login\.taobao/i.test(window.location.href) }

  // 登录等待：返回 null 表示未在登录页可继续；否则返回阶段结果（继续等或放弃）
  function handleLoginWait(checkFn, waitKey, currentPhase, abortRows, abortNextPhase) {
    if (!checkFn()) {
      if (shared[waitKey]) shared[waitKey] = 0
      return null
    }
    const rounds = Number(shared[waitKey] || 0) + 1
    if (rounds > LOGIN_WAIT_MAX_ROUNDS) {
      return nextPhase(abortNextPhase, { ...shared, [waitKey]: 0 }, 1000, abortRows)
    }
    return nextPhase(currentPhase, { ...shared, [waitKey]: rounds }, 3000)
  }

  // ══════════════════ main：解析Excel并初始化 ══════════════════
  if (phase === 'main') {
    const raw = params.input_excel
    let headers = []
    let dataRows = []
    if (raw && typeof raw === 'object' && Array.isArray(raw.rows)) {
      // 后台注入 {path, headers, rows:[{表头:值}]}（rows已剥离表头）
      headers = Array.isArray(raw.headers) && raw.headers.length ? raw.headers : Object.keys(raw.rows[0] || {})
      dataRows = raw.rows
    } else if (Array.isArray(raw) && raw.length > 0) {
      // 兼容直接传原始二维行（首行为表头）
      const headerRow = raw[0] || {}
      headers = Array.isArray(headerRow) ? headerRow : Object.keys(headerRow)
      dataRows = raw.slice(1)
    }
    dataRows = dataRows.filter(r => {
      const vals = Array.isArray(r) ? r : Object.values(r)
      return vals.some(v => v != null && String(v).trim() !== '')
    })
    if (dataRows.length === 0) {
      return { success: false, error: '输入Excel无有效数据行，请按模板格式填写' }
    }

    // 列定位：关键词按顺序精确到泛化，避免"id"误命中其它列
    function findCol(keywords) {
      for (const k of keywords) {
        const idx = headers.findIndex(h => String(h || '').toLowerCase().includes(k))
        if (idx >= 0) return idx
      }
      return -1
    }
    const colStructure = findCol(['结构', '名称'])
    const colSku = findCol(['款号', 'sku'])
    const colSelfId = findCol(['自品'])
    const colCompetitorId = findCol(['竞品'])
    const colDateRange = findCol(['取值时间', '时间', '日期'])

    function cell(r, col) {
      if (col < 0) return ''
      if (Array.isArray(r)) return String(r[col] || '').trim()
      const key = headers[col]
      return String(r[key] || '').trim()
    }

    const seenSkus = new Set(), seenSelfIds = new Set(), seenCompIds = new Set()
    let structure = '', dateRangeText = ''
    dataRows.forEach(r => {
      if (!structure) structure = cell(r, colStructure)
      if (!dateRangeText) dateRangeText = cell(r, colDateRange)
      const sku = cell(r, colSku)
      const selfId = cell(r, colSelfId)
      const compId = cell(r, colCompetitorId)
      if (sku) seenSkus.add(sku)
      if (selfId) seenSelfIds.add(selfId)
      if (compId) seenCompIds.add(compId)
    })

    let dateStart = '', dateEnd = ''
    const dateMatch = dateRangeText.match(/(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})/)
    if (dateMatch) { dateStart = dateMatch[1]; dateEnd = dateMatch[2] }

    const init = {
      structure: structure || '竞品分析',
      dateStart, dateEnd,
      skus: Array.from(seenSkus),
      selfIds: Array.from(seenSelfIds),
      compIds: Array.from(seenCompIds),
      biCursor: 0, p360Cursor: 0, qaCursor: 0, compCursor: 0,
      successCount: 0, failedCount: 0,
    }
    // BI、商品360和本店问答由本编排器执行；竞品店透视由服务端在本编排器
    // 完成后调用专用适配器执行，因此竞品ID是合法的独立输入。
    if (init.skus.length > 0) return nextPhase('bi_nav', init, 500)
    if (init.selfIds.length > 0) return nextPhase('qa_nav', init, 500)
    if (init.compIds.length > 0) return nextPhase('summary', init, 300)
    return { success: false, error: '输入Excel未解析到款号、自品ID或竞品ID，请检查对应列名与内容' }
  }

  // ══════════════════ 数据源1：BI看板-单品分析 ══════════════════
  if (phase === 'bi_nav') {
    window.location.href = BI_URL
    return nextPhase('bi_wait', shared, 5000)
  }

  if (phase === 'bi_wait') {
    // 页面身份校验：必须处于约定的“单品分析”页面，禁止在 BI 自动打开的
    // 其它看板（例如电商商品 SKU 销售明细）继续筛选或抓取。
    if (!isExpectedBiPage()) {
      const retry = Number(shared.biPageRetry || 0)
      if (retry < 3) {
        window.location.href = BI_URL
        return nextPhase('bi_wait', { ...shared, biPageRetry: retry + 1 }, 4000)
      }
      const rows = shared.skus.map(sku => row(
        'BI看板-单品分析', sku, '页面校验', window.location.href,
        '失败', '未进入目标“单品分析”页面，已终止 BI 采集'
      ))
      const next = { ...shared, biPageRetry: 0, failedCount: (shared.failedCount || 0) + rows.length }
      return nextPhase('p360_nav', next, 1000, rows)
    }
    const abortRows = shared.skus.map(sku => row('BI看板-单品分析', sku, '未登录', '需Semir SSO登录', '失败', '请先登录BI看板'))
    const wait = handleLoginWait(onLoginPage, 'biLoginRounds', 'bi_wait',
      abortRows.length ? abortRows : [], 'p360_nav')
    if (wait) {
      if (wait.data.length) wait.meta.shared.failedCount = (shared.failedCount || 0) + wait.data.length
      return wait
    }
    await waitForLoadIdle(15000)
    return nextPhase('bi_filter', { ...shared, biPageRetry: 0 }, 1000)
  }

  // bi_filter：先填写销售时间。单品分析页的款号候选依赖时间范围，必须
  // 先选日期、再选款号，最后才能点击“查询”。
  if (phase === 'bi_filter') {
    const retry = Number(shared.biFilterRetry || 0)
    if (retry >= 3) return nextPhase('bi_sku_filter', { ...shared, biFilterRetry: 0 }, 500)
    try {
      // 清空既有筛选（含上一款号与日期）
      const clearBtn = findBtn('清空')
      if (clearBtn) { realClick(clearBtn); await sleep(1200) }
      if (!shared.dateStart || !shared.dateEnd) return nextPhase('bi_sku_filter', { ...shared, biFilterRetry: 0 }, 500)
      const startInput = document.querySelector('input[placeholder="开始日期"]')
      if (!startInput) return nextPhase('bi_sku_filter', { ...shared, biFilterRetry: 0 }, 500)
      realClick(startInput); startInput.focus()
      await sleep(1000)
      const pos = await navDatePanelTo(shared.dateStart)
      if (!pos) return nextPhase('bi_filter', { ...shared, biFilterRetry: retry + 1 }, 2000)
      return cdpClicks([pos], 'bi_date_end', { ...shared, biFilterRetry: 0 }, 1000)
    } catch (e) {
      return nextPhase('bi_filter', { ...shared, biFilterRetry: retry + 1 }, 2000)
    }
  }

  // bi_sku_filter：日期已填写后，再按款号选择下拉项。
  if (phase === 'bi_sku_filter') {
    const sku = shared.skus[shared.biCursor]
    const retry = Number(shared.biSkuFilterRetry || 0)
    function skipSku(reason) {
      const rows = [row('BI看板-单品分析', sku, '筛选失败', reason, '失败', '')]
      const next = { ...shared, biCursor: shared.biCursor + 1, biSkuFilterRetry: 0, failedCount: (shared.failedCount || 0) + 1 }
      if (next.biCursor < shared.skus.length) return nextPhase('bi_filter', next, 2000, rows)
      return nextPhase('p360_nav', next, 2000, rows)
    }
    if (retry >= 5) return skipSku('款号筛选交互重试超限')
    try {
      const label = findTextEl('款号')
      const sel = label && label.closest('.DvhVn-wp')?.querySelector('.SEL_container')
      if (sel) {
        // 该控件不响应 synthetic click，必须由 Runner 发出 CDP 受信任点击。
        const point = clickPoint(sel)
        if (!point) return nextPhase('bi_sku_filter', { ...shared, biSkuFilterRetry: retry + 1 }, 1500)
        return cdpClicks([point], 'bi_sku_popover', shared, 1200)
      } else {
        const input = document.querySelector('input[id^="rc_select_"]')
          || Array.from(document.querySelectorAll('input')).find(i => i.getAttribute('role') === 'combobox')
        if (!input) return nextPhase('bi_sku_filter', { ...shared, biSkuFilterRetry: retry + 1 }, 3000)
        realClick(input)
        setNativeValue(input, sku)
        await sleep(1500)
        const option = Array.from(document.querySelectorAll('.ant-select-item-option'))
          .find(i => (i.textContent || '').includes(sku) && i.offsetParent !== null)
        if (!option) return nextPhase('bi_sku_filter', { ...shared, biSkuFilterRetry: retry + 1 }, 2500)
        realClick(option)
        return nextPhase('bi_query', { ...shared, biSkuFilterRetry: 0, biSkuVerifyRetry: 0 }, 1200)
      }
    } catch (e) {
      return nextPhase('bi_sku_filter', { ...shared, biSkuFilterRetry: retry + 1 }, 2000)
    }
  }

  if (phase === 'bi_sku_popover') {
    const sku = shared.skus[shared.biCursor]
    const retry = Number(shared.biSkuFilterRetry || 0)
    const pop = Array.from(document.querySelectorAll('.ant-popover')).find(p => p.offsetParent !== null && (p.textContent || '').includes('批量粘贴'))
    const searchInput = pop?.querySelector('input.ant-input')
    if (!searchInput) return nextPhase('bi_sku_filter', { ...shared, biSkuFilterRetry: retry + 1 }, 1800)
    setNativeValue(searchInput, sku)
    await sleep(1800)
    const target = Array.from(pop.querySelectorAll('.ant-checkbox-wrapper')).find(i => compact(i.textContent) === compact(sku))
      || Array.from(pop.querySelectorAll('.ant-checkbox-wrapper')).find(i => compact(i.textContent).includes(compact(sku)))
    const point = clickPoint(target?.querySelector('input') || target)
    if (!point) return nextPhase('bi_sku_filter', { ...shared, biSkuFilterRetry: retry + 1 }, 1800)
    return cdpClicks([point], 'bi_sku_confirm', shared, 700)
  }

  if (phase === 'bi_sku_confirm') {
    const retry = Number(shared.biSkuFilterRetry || 0)
    const pop = Array.from(document.querySelectorAll('.ant-popover')).find(p => p.offsetParent !== null && (p.textContent || '').includes('批量粘贴'))
    const okBtn = pop && Array.from(pop.querySelectorAll('button')).find(b => (b.textContent || '').trim() === '确定')
    const point = clickPoint(okBtn)
    if (!point) return nextPhase('bi_sku_filter', { ...shared, biSkuFilterRetry: retry + 1 }, 1800)
    return cdpClicks([point], 'bi_query', { ...shared, biSkuFilterRetry: 0, biSkuVerifyRetry: 0 }, 1200)
  }

  if (phase === 'bi_sku_verify') {
    const sku = shared.skus[shared.biCursor]
    const retry = Number(shared.biSkuVerifyRetry || 0)
    if (isBiSkuSelected(sku)) {
      return nextPhase('bi_query', { ...shared, biSkuFilterRetry: 0, biSkuVerifyRetry: 0 }, 300)
    }
    if (retry < 4) {
      return nextPhase('bi_sku_verify', { ...shared, biSkuVerifyRetry: retry + 1 }, 900)
    }
    // 候选点击未生效时回到同一款号的选择阶段，不移动 biCursor。
    return nextPhase('bi_sku_filter', {
      ...shared,
      biSkuFilterRetry: Number(shared.biSkuFilterRetry || 0) + 1,
      biSkuVerifyRetry: 0,
    }, 1200)
  }

  // bi_date_end：CDP点选结束日期；两端都选中后进入查询
  if (phase === 'bi_date_end') {
    const retry = Number(shared.biDateEndRetry || 0)
    const startVal = document.querySelector('input[placeholder="开始日期"]')?.value || ''
    const endVal = document.querySelector('input[placeholder="结束日期"]')?.value || ''
    if (startVal && endVal) return nextPhase('bi_sku_filter', { ...shared, biDateEndRetry: 0 }, 500)
    if (retry >= 4) return nextPhase('bi_sku_filter', { ...shared, biDateEndRetry: 0 }, 500) // 日期失败也尝试选款号，便于记录真实失败原因
    if (!getDatePanel()) {
      const startInput = document.querySelector('input[placeholder="开始日期"]')
      if (startInput) { realClick(startInput); startInput.focus(); await sleep(1000) }
    }
    const pos = await navDatePanelTo(shared.dateEnd)
    if (!pos) return nextPhase('bi_date_end', { ...shared, biDateEndRetry: retry + 1 }, 1500)
    return cdpClicks([pos], 'bi_date_end', { ...shared, biDateEndRetry: retry + 1 }, 1200)
  }

  // bi_query：点击查询等待出数
  if (phase === 'bi_query') {
    const btn = findBtn('查询')
    if (btn) realClick(btn)
    // 不再解析页面卡片；按产品要求使用右上角“导出 → 批量导出Excel”。
    return nextPhase('bi_export_menu', shared, 8000)
  }

  if (phase === 'bi_export_menu') {
    const point = clickPoint(visibleExactText('导出'))
    if (!point) return nextPhase('bi_export_result', { ...shared, biExport: { items: [{ success: false, error: '未找到“导出”菜单' }] } }, 0)
    return cdpClicks([point], 'bi_export_batch', shared, 700)
  }

  if (phase === 'bi_export_batch') {
    const option = visibleExactText('批量导出Excel') || visibleExactText('批量导出 Excel')
    const point = clickPoint(option)
    if (!point) return nextPhase('bi_export_result', { ...shared, biExport: { items: [{ success: false, error: '未找到“批量导出Excel”菜单项' }] } }, 0)
    return cdpClicks([point], 'bi_export_select_all', shared, 700)
  }

  if (phase === 'bi_export_select_all') {
    const all = visibleExactText('全选')
    const point = clickPoint(all?.querySelector('input') || all)
    if (!point) return nextPhase('bi_export_result', { ...shared, biExport: { items: [{ success: false, error: '未找到“全选”' }] } }, 0)
    return cdpClicks([point], 'bi_export_submit', shared, 500)
  }

  if (phase === 'bi_export_submit') {
    // 此时菜单已关闭，页面仅剩浮层内的提交按钮；按可见文本取最后一个。
    const candidates = Array.from(document.querySelectorAll('button, span, div')).filter(el =>
      el.offsetParent !== null && compact(el.textContent) === '批量导出Excel'
    )
    const point = clickPoint(candidates[candidates.length - 1])
    if (!point) return nextPhase('bi_export_result', { ...shared, biExport: { items: [{ success: false, error: '未找到批量导出提交按钮' }] } }, 0)
    return cdpClicks([point], 'bi_export_confirm', shared, 700)
  }

  if (phase === 'bi_export_confirm') {
    const confirm = visibleExactText('确定')
    const point = clickPoint(confirm)
    if (!point) return nextPhase('bi_export_result', { ...shared, biExport: { items: [{ success: false, error: '未找到导出设置弹框的“确定”按钮' }] } }, 0)
    const sku = shared.skus[shared.biCursor]
    const filename = `${shared.structure || '竞品分析'}-${sku}-单品分析.xlsx`
    return requestDownloadClicks([{ label: filename, filename, clicks: [point], expected_name_regex: '\\.(xlsx|xls)$', timeout_ms: 30000 }], 'bi_export_result', shared, 1200, 'biExport')
  }

  if (phase === 'bi_export_result') {
    const sku = shared.skus[shared.biCursor]
    const item = (shared.biExport && shared.biExport.items && shared.biExport.items[0]) || { success: false, error: '未获得导出结果' }
    const rows = [row('BI看板-单品分析', sku, '批量导出Excel', item.filename || '观远BI导出', item.success ? '成功' : '失败', item.success ? (item.path || '已下载') : (item.error || '导出失败'))]
    const next = { ...shared, biCursor: shared.biCursor + 1, successCount: (shared.successCount || 0) + (item.success ? 1 : 0), failedCount: (shared.failedCount || 0) + (item.success ? 0 : 1), biExport: null }
    if (next.biCursor < shared.skus.length) return nextPhase('bi_filter', next, 1800, rows)
    return nextPhase('p360_nav', next, 2000, rows)
  }

  // bi_scroll_data：逐段向下滚动触发 BI 下半屏卡片的懒加载；确认“退货留言数据”
  // 与“评价内容”都已渲染出网格后才进入提取阶段。
  if (phase === 'bi_scroll_data') {
    const rounds = Number(shared.biScrollRounds || 0)
    const root = getBiScrollRoot()
    const rootRect = root.getBoundingClientRect ? root.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    const requiredCards = ['退货留言数据', '评价内容']
    const cardsReady = requiredCards.every(name => {
      const card = findBiCard(name)
      // 标题在首屏 DOM 中可能已存在；只有实际网格单元渲染出来才说明
      // 该区域的数据已加载，且卡片确实被滚动到内部内容区可视范围，不能把
      // “找到标题”误判为“已加载”。
      if (!card || card.querySelectorAll('.cell').length === 0) return false
      const rect = card.getBoundingClientRect()
      return rect.bottom > rootRect.top && rect.top < rootRect.bottom
    })
    if (cardsReady && rounds >= 2) {
      return nextPhase('bi_extract', { ...shared, biScrollRounds: 0 }, 1200)
    }

    const before = root.scrollTop || 0
    const step = Math.max(650, Math.floor(window.innerHeight * 0.8))
    root.scrollTop = before + step
    root.dispatchEvent(new Event('scroll', { bubbles: true }))
    await sleep(1600)
    const after = root.scrollTop || 0
    const atBottom = after + root.clientHeight >= root.scrollHeight - 8 || after === before
    // 允许到页底后再额外等待两轮，给最后一个卡片的异步网格留出渲染时间。
    if (rounds >= 18 || (atBottom && rounds >= 4)) {
      return nextPhase('bi_extract', { ...shared, biScrollRounds: 0 }, 1200)
    }
    return nextPhase('bi_scroll_data', { ...shared, biScrollRounds: rounds + 1 }, 500)
  }

  // bi_extract：提取 销售情况/周销趋势/渠道销售明细/退货留言数据/评价内容 五个数据块
  if (phase === 'bi_extract') {
    const sku = shared.skus[shared.biCursor]
    const src = 'BI看板-单品分析'
    const rows = []
    try {
      await waitForLoadIdle(15000)
      // 1) 销售情况：文本指标卡（净销额/零售量/采购售罄率/退货率/毛利率）
      const saleCard = findBiCard('销售情况')
      if (saleCard) {
        const lines = (saleCard.innerText || '').split('\n').map(s => s.trim()).filter(Boolean)
        for (let i = 1; i + 1 < lines.length; i += 2) {
          rows.push(row(src, sku, '销售情况-' + lines[i], lines[i + 1], '成功', ''))
        }
      } else {
        rows.push(row(src, sku, '销售情况', '未找到卡片', '失败', ''))
      }
      // 2) 周销趋势：echarts dataset（周 × 各颜色零售量）
      const weekCard = findBiCard('周销趋势')
      const weekDom = weekCard && weekCard.querySelector('[_echarts_instance_]')
      const weekInst = weekDom && window.echarts && window.echarts.getInstanceByDom(weekDom)
      if (weekInst) {
        const ds = (weekInst.getOption().dataset || [])[0]
        if (ds && Array.isArray(ds.source) && ds.source.length) {
          const dims = (ds.dimensions || []).map(d => (d.name || '') + (d.metricName ? '(' + d.metricName + ')' : ''))
          ds.source.forEach(line => {
            const parts = []
            for (let i = 1; i < line.length; i++) parts.push((dims[i] || ('列' + i)) + ':' + (line[i] == null ? '' : line[i]))
            rows.push(row(src, sku, '周销趋势-' + line[0], parts.join(', '), '成功', ''))
          })
        } else {
          rows.push(row(src, sku, '周销趋势', '无数据', '失败', ''))
        }
      } else {
        rows.push(row(src, sku, '周销趋势', '未找到图表', '失败', ''))
      }
      // 3) 三个表格卡片：观远自绘网格
      for (const name of ['渠道销售明细', '退货留言数据', '评价内容']) {
        const card = findBiCard(name)
        if (!card) { rows.push(row(src, sku, name, '未找到卡片', '失败', '')); continue }
        const grid = extractGuandataGrid(card)
        if (grid.header.length) {
          rows.push(row(src, sku, name + '-表头', grid.header.map(h => h.join('|')).join(' / '), '成功', ''))
        }
        grid.body.forEach((line, i) => {
          rows.push(row(src, sku, name + '#' + (i + 1), line.join(' | '), '成功', ''))
        })
        if (!grid.body.length) rows.push(row(src, sku, name, '无数据', '失败', ''))
      }
    } catch (e) {
      rows.push(row(src, sku, '异常', String(e.message || e), '失败', ''))
    }
    const ok = rows.filter(r => r.状态 === '成功').length
    const next = {
      ...shared,
      biCursor: shared.biCursor + 1,
      successCount: (shared.successCount || 0) + ok,
      failedCount: (shared.failedCount || 0) + (rows.length - ok),
    }
    if (next.biCursor < shared.skus.length) return nextPhase('bi_filter', next, randomInt(3000, 5000), rows)
    return nextPhase('p360_nav', next, 2000, rows)
  }

  // ══════════════════ 数据源2：商品360 ══════════════════
  if (phase === 'p360_nav') {
    window.location.href = P360_URL
    return nextPhase('p360_wait', shared, 5000)
  }

  if (phase === 'p360_wait') {
    const abortRows = shared.skus.map(sku => row('商品360', sku, '未登录', '需Semir SSO登录', '失败', '请先登录商品360'))
    const wait = handleLoginWait(onLoginPage, 'p360LoginRounds', 'p360_wait',
      abortRows.length ? abortRows : [], shared.selfIds.length > 0 ? 'qa_nav' : 'summary')
    if (wait) {
      if (wait.data.length) wait.meta.shared.failedCount = (shared.failedCount || 0) + wait.data.length
      return wait
    }
    await waitForLoadIdle(15000)
    return nextPhase('p360_item', shared, 1000)
  }

  if (phase === 'p360_item') {
    const sku = shared.skus[shared.p360Cursor]
    try {
      const filled = await fillInput('input[placeholder="请输入款号编码"], input[placeholder*="款号"], input[placeholder*="搜索"], input[placeholder*="商品"]', sku)
      if (!filled) throw new Error('未找到商品360款号输入框')
      const point = clickPoint(findBtn('查询') || visibleExactText('查询'))
      if (!point) throw new Error('未找到商品360查询按钮')
      return cdpClicks([point], 'p360_after_query', shared, 3500)
    } catch (e) {
      const rows = [row('商品360', sku, '导出任务', '未提交', '失败', String(e.message || e))]
      const next = {
        ...shared,
        p360Cursor: shared.p360Cursor + 1,
        failedCount: (shared.failedCount || 0) + 1,
      }
      if (next.p360Cursor < shared.skus.length) return nextPhase('p360_item', next, randomInt(3000, 6000), rows)
      return nextPhase('p360_download_center', next, 2000, rows)
    }
  }

  // 查询完成后，逐款提交“数据导出 → 全部 → 导出”。
  // 不在这里直接抓看板数字，最终以下载中心生成的原始 Excel 为准。
  if (phase === 'p360_after_query') {
    const sku = shared.skus[shared.p360Cursor]
    await waitForLoadIdle(15000)
    const point = clickPoint(visibleExactText('数据导出'))
    if (!point) return nextPhase('p360_item', {
      ...shared, p360Cursor: shared.p360Cursor + 1,
      failedCount: (shared.failedCount || 0) + 1,
    }, 1000, [row('商品360', sku, '数据导出', '未找到导出按钮', '失败', '页面加载异常或无导出权限')])
    return cdpClicks([point], 'p360_export_dialog', shared, 800)
  }

  if (phase === 'p360_export_dialog') {
    const sku = shared.skus[shared.p360Cursor]
    const dialog = getP360Dialog()
    if (!dialog) return nextPhase('p360_after_query', shared, 1000)
    // Excel 默认为选中格式；仅确保“全部”这一总选项已勾选。
    const allLabel = visibleExactText('全部', dialog)
    const allInput = allLabel?.querySelector('input[type="checkbox"]') ||
      Array.from(dialog.querySelectorAll('input[type="checkbox"]')).find(input => compact(input.parentElement?.textContent).includes('全部'))
    if (!allInput) return nextPhase('p360_item', {
      ...shared, p360Cursor: shared.p360Cursor + 1,
      failedCount: (shared.failedCount || 0) + 1,
    }, 1000, [row('商品360', sku, '导出选项', '未找到“全部”', '失败', '导出弹窗结构已变化')])
    if (!allInput.checked) {
      const point = clickPoint(allLabel || allInput)
      if (point) return cdpClicks([point], 'p360_export_dialog', shared, 500)
    }
    return nextPhase('p360_export_submit', shared, 300)
  }

  if (phase === 'p360_export_submit') {
    const sku = shared.skus[shared.p360Cursor]
    const dialog = getP360Dialog()
    const point = clickPoint((dialog && (findBtn('导出') || visibleExactText('导出', dialog))) || visibleExactText('导出'))
    if (!point) return nextPhase('p360_item', {
      ...shared, p360Cursor: shared.p360Cursor + 1,
      failedCount: (shared.failedCount || 0) + 1,
    }, 1000, [row('商品360', sku, '导出任务', '未提交', '失败', '未找到弹窗导出按钮')])
    return cdpClicks([point], 'p360_export_queued', shared, 1800)
  }

  if (phase === 'p360_export_queued') {
    const sku = shared.skus[shared.p360Cursor]
    const rows = [row('商品360', sku, '导出任务', '已提交（全部）', '成功', '待全部款号提交后统一在下载中心下载')]
    const next = {
      ...shared,
      p360Cursor: shared.p360Cursor + 1,
      successCount: (shared.successCount || 0) + 1,
    }
    if (next.p360Cursor < shared.skus.length) return nextPhase('p360_item', next, randomInt(3000, 6000), rows)
    return nextPhase('p360_download_center', next, 5000, rows)
  }

  if (phase === 'p360_download_center') {
    const point = clickPoint(visibleExactText('下载中心'))
    if (!point) return nextPhase('p360_download_result', {
      ...shared, p360Downloads: { ok: false, items: [] },
    }, 0, [row('商品360', '全部款号', '下载中心', '未找到入口', '失败', '请确认右侧下载中心入口可见')])
    return cdpClicks([point], 'p360_download_prepare', shared, 1500)
  }

  if (phase === 'p360_download_prepare') {
    resetP360DownloadScroll()
    return nextPhase('p360_download_scan', shared, 600)
  }

  if (phase === 'p360_download_scan') {
    // download_clicks 每次只下载一个文件；将上一次 Runner 回传的结果累计，
    // 以便最终既能生成状态行，也能让后处理按款号重命名并打包。
    const collected = Array.isArray(shared.p360DownloadItems) ? shared.p360DownloadItems.slice() : []
    const latest = shared.p360Downloads
    if (latest && Array.isArray(latest.items) && latest.items.length) {
      latest.items.forEach(item => {
        const key = `${item.path || ''}|${item.filename || ''}|${item.label || ''}`
        if (!collected.some(saved => `${saved.path || ''}|${saved.filename || ''}|${saved.label || ''}` === key)) collected.push(item)
      })
    }
    // 下载中心在点击后会异步刷新列表，偶发导致本次网络捕获没有拿到临时地址。
    // 对这类“未取得下载地址”只重试同一行一次，避免把可重试的瞬时失败直接
    // 计入最终结果；重试时移除该次失败记录，最终仅保留该行最后一次结果。
    const lastDownload = latest && Array.isArray(latest.items) ? latest.items[latest.items.length - 1] : null
    const retryCount = Number(shared.p360DownloadRetryCount || 0)
    if (lastDownload && !lastDownload.success && lastDownload.label && retryCount < 2) {
      return nextPhase('p360_download_scan', {
        ...shared,
        p360Downloads: null,
        p360DownloadRetryCount: retryCount + 1,
        p360DownloadItems: collected.filter(item => item.label !== lastDownload.label),
        p360DownloadCursor: Math.max(0, Number(shared.p360DownloadCursor || 0) - 1),
      }, 800)
    }
    const buttons = getP360DownloadButtons()
    if (!buttons.length) {
      const rounds = Number(shared.p360DownloadRounds || 0) + 1
      // 商品360导出是服务端异步任务，60 秒后才完成是正常情况。持续刷新下载中心，
      // 最长等待 5 分钟，不能把“尚在生成”误判为“没有文件”。
      const refresh = findBtn('刷新') || visibleExactText('刷新')
      if (refresh) realClick(refresh)
      if (rounds <= 60) return nextPhase('p360_download_scan', { ...shared, p360DownloadRounds: rounds }, 5000)
      return nextPhase('p360_download_result', {
        ...shared, p360DownloadItems: collected, p360Downloads: { ok: false, items: [] },
      }, 0, [row('商品360', '全部款号', '下载中心', '导出文件尚未就绪', '失败', '已持续刷新并等待5分钟，平台任务仍未完成')])
    }
    // 下载中心按最新任务倒序排列；只取本轮提交的款号数量，避免误下载历史导出。
    // 必须经 Runner 的 download_clicks 执行受信任点击并监测文件落地，不能只调用
    // DOM click，否则文件只留在浏览器 Downloads，程序输出无法取得。
    const targetButtons = buttons.slice(0, shared.skus.length)
    const cursor = Number(shared.p360DownloadCursor || 0)
    if (cursor >= targetButtons.length) {
      return nextPhase('p360_download_result', {
        ...shared,
        p360DownloadItems: collected,
      }, 1500)
    }
    // 最新任务排在首行，和提交顺序相反，因此用倒序款号匹配文件名。
    const sku = shared.skus[shared.skus.length - cursor - 1] || shared.skus[cursor] || `第${cursor + 1}个款号`
    const point = clickPoint(targetButtons[cursor])
    if (!point) return nextPhase('p360_download_scan', { ...shared, p360DownloadItems: collected, p360DownloadCursor: cursor + 1 }, 1000)
    const filename = `${shared.structure || '竞品分析'}-${sku}-商品360.xlsx`
    return requestDownloadClicks([{
      label: filename,
      filename,
      clicks: [point],
      expected_name_regex: '\\.(xlsx|xls)$',
      // 商品360点击后先返回 { code, data: "<临时Excel地址>" }，并非浏览器原生下载。
      // 由 Runner 解析 data 后直接保存该地址对应的文件。
      response_url_field: 'data',
      capture_matches: [{ url_contains: '/api/pc/ude/downcenter/api/downtask/u/v1/download' }],
      timeout_ms: 45000,
    }], 'p360_download_scan', {
      ...shared, p360DownloadItems: collected, p360DownloadCursor: cursor + 1,
      p360DownloadRounds: 0, p360DownloadRetryCount: 0,
    }, 1000)
  }

  if (phase === 'p360_download_result') {
    const result = shared.p360Downloads || { items: [] }
    const items = Array.isArray(shared.p360DownloadItems) && shared.p360DownloadItems.length
      ? shared.p360DownloadItems : (Array.isArray(result.items) ? result.items : [])
    const rows = items.map(item => row(
      '商品360', '全部款号', '下载中心', item.filename || item.label || '导出文件',
      item.success ? '成功' : '失败', item.success ? (item.path || '已下载') : (item.error || '下载失败')
    ))
    const ok = rows.filter(item => item.状态 === '成功').length
    const next = {
      ...shared,
      successCount: (shared.successCount || 0) + ok,
      failedCount: (shared.failedCount || 0) + (rows.length - ok),
    }
    if (shared.selfIds.length > 0) return nextPhase('qa_nav', next, 2000, rows)
    return nextPhase('summary', next, 500, rows)
  }

  // ══════════════════ 数据源3：天猫问大家 ══════════════════
  if (phase === 'qa_nav') {
    window.location.href = 'https://myseller.taobao.com/home.htm/comment-manage/ask-all?current=1&pageSize=10'
    return nextPhase('qa_filter', shared, 5000)
  }

  function qaFinishItem(nextShared, rows, sleepMs = 1200) {
    const next = { ...nextShared, qaCursor: nextShared.qaCursor + 1, qaPending: [], qaDetailCursor: 0 }
    if (next.qaCursor < next.selfIds.length) return nextPhase('qa_nav', next, sleepMs, rows)
    return nextPhase('summary', next, 500, rows)
  }

  // 问大家不能靠 URL 参数取数：必须完整填写商品ID和提问日期范围后点击搜索。
  if (phase === 'qa_filter') {
    const itemId = shared.selfIds[shared.qaCursor]
    const abortRows = [row('天猫问大家', itemId, '未登录', '需淘宝卖家登录', '失败', '请先登录卖家后台')]
    const wait = handleLoginWait(onTaobaoLoginPage, 'qaLoginRounds', 'qa_filter',
      abortRows, 'summary')
    if (wait) {
      if (wait.data.length) wait.meta.shared.failedCount = (shared.failedCount || 0) + wait.data.length
      return wait
    }
    await waitForLoadIdle(12000)
    const itemInput = document.querySelector('#itemParams, input[placeholder="商品ID/商品名称"]')
    const startInput = document.querySelector('input[placeholder="起始日期"]')
    if (!itemInput || !startInput || !shared.dateStart || !shared.dateEnd) {
      const failure = row('天猫问大家', itemId, '筛选失败', '缺少商品ID或取值时间控件', '失败', '商品ID、起始日期、结束日期均为必填')
      return qaFinishItem({ ...shared, failedCount: (shared.failedCount || 0) + 1 }, [failure])
    }
    if (!await fillInput('#itemParams, input[placeholder="商品ID/商品名称"]', itemId)) {
      const failure = row('天猫问大家', itemId, '筛选失败', '商品ID未成功写入', '失败', '')
      return qaFinishItem({ ...shared, failedCount: (shared.failedCount || 0) + 1 }, [failure])
    }
    const dateTrigger = startInput.closest('[role="button"]') || startInput
    if (!dateTrigger) return nextPhase('qa_filter', shared, 1500)
    realClick(dateTrigger)
    return nextPhase('qa_date_start', shared, 1000)
  }

  if (phase === 'qa_date_start') {
    const itemId = shared.selfIds[shared.qaCursor]
    if (!await chooseQaDate(shared.dateStart)) {
      const failure = row('天猫问大家', itemId, '筛选失败', '无法选择起始日期', '失败', shared.dateStart)
      return qaFinishItem({ ...shared, failedCount: (shared.failedCount || 0) + 1 }, [failure])
    }
    return nextPhase('qa_date_end', shared, 900)
  }

  if (phase === 'qa_date_end') {
    const itemId = shared.selfIds[shared.qaCursor]
    if (!await chooseQaDate(shared.dateEnd)) {
      const failure = row('天猫问大家', itemId, '筛选失败', '无法选择结束日期', '失败', shared.dateEnd)
      return qaFinishItem({ ...shared, failedCount: (shared.failedCount || 0) + 1 }, [failure])
    }
    return nextPhase('qa_search', shared, 900)
  }

  if (phase === 'qa_search') {
    const search = Array.from(document.querySelectorAll('button')).find(button =>
      button.offsetParent !== null && compact(button.textContent) === '搜索' && button.type === 'submit'
    )
    const point = clickPoint(search)
    if (!point) return nextPhase('qa_search', shared, 1200)
    return cdpClicks([point], 'qa_collect', shared, 3000)
  }

  if (phase === 'qa_collect') {
    const itemId = shared.selfIds[shared.qaCursor]
    await waitForLoadIdle(12000)
    const items = Array.from(document.querySelectorAll('tr')).filter(tr =>
      Array.from(tr.querySelectorAll('button')).some(button => compact(button.textContent) === '查看回答')
    ).map(tr => ({ question: compact(tr.querySelector('td:first-child')?.textContent || ''), text: compact(tr.textContent) }))
    if (!items.length) {
      const empty = row('天猫问大家', itemId, '无数据', '指定商品ID和取值时间内未返回问答', '成功', `${shared.dateStart}~${shared.dateEnd}`)
      return qaFinishItem({ ...shared, successCount: (shared.successCount || 0) + 1 }, [empty])
    }
    return nextPhase('qa_open_detail', { ...shared, qaPending: items, qaDetailCursor: 0 }, 300)
  }

  // 每条问答必须点击“查看回答”，从右侧抽屉抓取“回答内容”明细，不能只取列表摘要。
  if (phase === 'qa_open_detail') {
    const pending = Array.isArray(shared.qaPending) ? shared.qaPending : []
    const cursor = Number(shared.qaDetailCursor || 0)
    if (cursor >= pending.length) {
      const next = { ...shared, successCount: (shared.successCount || 0) + pending.length }
      return qaFinishItem(next, [])
    }
    const buttons = Array.from(document.querySelectorAll('button')).filter(button =>
      button.offsetParent !== null && compact(button.textContent) === '查看回答'
    )
    // 不按可变的 DOM 序号盲点：列表滚动后后续按钮可能落在视窗外。优先以
    // 问题内容定位到同一行的按钮，并滚动到可视区中央后再计算受信任点击坐标。
    const expectedQuestion = compact(pending[cursor]?.question || '')
    const target = buttons.find(button => expectedQuestion && compact(button.closest('tr')?.textContent || '').includes(expectedQuestion))
      || buttons[cursor]
    try { target?.scrollIntoView({ block: 'center', inline: 'center' }) } catch (e) {}
    const point = clickPoint(target)
    if (!point) return nextPhase('qa_open_detail', { ...shared, qaDetailCursor: cursor + 1 }, 300)
    return cdpClicks([point], 'qa_collect_detail', { ...shared, qaDetailWaitRounds: 0 }, 700)
  }

  if (phase === 'qa_collect_detail') {
    const itemId = shared.selfIds[shared.qaCursor]
    const cursor = Number(shared.qaDetailCursor || 0)
    const fallbackQuestion = shared.qaPending?.[cursor]?.question || ''
    const drawer = document.querySelector('.next-drawer-body')
    if (!drawer) {
      const rounds = Number(shared.qaDetailWaitRounds || 0) + 1
      if (rounds <= 8) return nextPhase('qa_collect_detail', { ...shared, qaDetailWaitRounds: rounds }, 500)
      const failure = row('天猫问大家', itemId, fallbackQuestion || '查看回答', '未打开回答详情抽屉', '失败', '已重试8次，跳过该问题继续执行')
      return nextPhase('qa_open_detail', {
        ...shared,
        qaDetailCursor: cursor + 1,
        qaDetailWaitRounds: 0,
        failedCount: (shared.failedCount || 0) + 1,
      }, 500, [failure])
    }
    // 长回答默认折叠。先展开详情抽屉中的全部回答，再读取正文，避免把“展开”
    // 这个前端操作文案拼进回答内容。
    if (!shared.qaDetailExpanded) {
      const expandPoints = Array.from(drawer.querySelectorAll('button, a, [role="button"], span'))
        .filter(el => el.offsetParent !== null && compact(el.textContent) === '展开')
        .map(clickPoint)
        .filter(Boolean)
      if (expandPoints.length) {
        return cdpClicks(expandPoints, 'qa_collect_detail', { ...shared, qaDetailExpanded: true }, 700)
      }
    }
    const question = compact(drawer.querySelector('.question-text')?.textContent || fallbackQuestion)
    const answerRows = Array.from(drawer.querySelectorAll('tr')).filter(tr => tr.querySelectorAll('td').length > 0)
    const rows = answerRows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('td')).map(cell => {
        const clone = cell.cloneNode(true)
        Array.from(clone.querySelectorAll('button, a, [role="button"], span')).forEach(control => {
          if (/^(展开|收起)$/.test(compact(control.textContent))) control.remove()
        })
        return compact(clone.textContent)
      })
      return row('天猫问大家', itemId, question, cells[0] || '', '成功', cells[1] ? `回答ID:${cells[1]}` : '')
    })
    if (!rows.length) rows.push(row('天猫问大家', itemId, question || '问题详情', '暂无回答', '成功', `${shared.dateStart}~${shared.dateEnd}`))
    const close = drawer.parentElement?.querySelector('.next-drawer-close') || document.querySelector('.next-drawer-close')
    const point = clickPoint(close)
    const next = { ...shared, qaDetailCursor: cursor + 1, qaDetailWaitRounds: 0, qaDetailExpanded: false }
    if (point) return cdpClicks([point], 'qa_open_detail', next, 500, rows)
    return nextPhase('qa_open_detail', next, 500, rows)
  }

  if (phase === 'qa_legacy_collect') {
    // 兼容旧任务续跑状态；新流程不会进入该分支。
    const itemId = shared.selfIds[shared.qaCursor]
    const rows = [row('天猫问大家', itemId, '流程已升级', '请重新运行以应用商品ID+时间筛选和回答详情采集', '失败', '')]
    const ok = rows.filter(r => r.状态 === '成功').length
    const next = {
      ...shared,
      qaCursor: shared.qaCursor + 1,
      successCount: (shared.successCount || 0) + ok,
      failedCount: (shared.failedCount || 0) + (rows.length - ok),
    }
    if (next.qaCursor < shared.selfIds.length) return nextPhase('qa_nav', next, randomInt(5000, 10000), rows)
    return nextPhase('summary', next, 500, rows)
  }

  // ══════════════════ 数据源4：竞品店透视 / 竞品评价（暂不接入）══════════════════
  // 用户要求：在本店及 BI、商品360 等能力完全稳定前，不得把竞品商品的店透视、
  // 问大家或评价采集接入 run_all 主链路和最终压缩包。以下遗留分支不从任何阶段跳转，
  // 仅保留作后续独立验证使用；恢复时需先确认买家账号登录态及平台访问权限。
  if (phase === 'comp_nav') {
    const cid = shared.compIds[shared.compCursor]
    window.location.href = `https://detail.tmall.com/item.htm?id=${cid}`
    return nextPhase('comp_collect', shared, 5000)
  }

  if (phase === 'comp_collect') {
    const cid = shared.compIds[shared.compCursor]
    const rows = []
    try {
      await waitForLoadIdle(10000)
      const reviews = document.querySelectorAll('.tm-rate-content, .rate-content, .comment-item, .tm-rate-fulltxt')
      reviews.forEach(r => {
        const content = compact(r.textContent)
        if (content) rows.push(row('竞品评价', cid, '评价', content, '成功', ''))
      })
      if (reviews.length === 0) {
        rows.push(row('竞品评价', cid, '需登录', '竞品评价需淘宝登录后通过API获取', '失败', '可使用tmall-ops-assistant单独抓取'))
      }
    } catch (e) {
      rows.push(row('竞品评价', cid, '异常', String(e.message || e), '失败', ''))
    }
    const ok = rows.filter(r => r.状态 === '成功').length
    const next = {
      ...shared,
      compCursor: shared.compCursor + 1,
      successCount: (shared.successCount || 0) + ok,
      failedCount: (shared.failedCount || 0) + (rows.length - ok),
    }
    if (next.compCursor < shared.compIds.length) return nextPhase('comp_nav', next, randomInt(4000, 8000), rows)
    return nextPhase('summary', next, 500, rows)
  }

  // ══════════════════ 汇总收尾 ══════════════════
  if (phase === 'summary') {
    const success = Number(shared.successCount || 0)
    const failed = Number(shared.failedCount || 0)
    const summaryRow = row(
      '===汇总===', '',
      `总计${success + failed}条`,
      `成功${success} / 失败${failed}`,
      success > 0 ? (failed > 0 ? '部分完成' : '全部完成') : '全部失败',
      `${(shared.skus || []).length}款号 ${(shared.selfIds || []).length}自品；不执行竞品评价`
    )
    return complete(shared, [summaryRow])
  }

  return { success: false, error: `未知阶段: ${phase}` }
})()

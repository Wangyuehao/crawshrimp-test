;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}

  const itemIds = (params.item_ids || '').split(/[\n,，、\s]+/).map(s => s.trim()).filter(Boolean)
  const dateStart = (params.date_start || '').trim()
  const dateEnd = (params.date_end || '').trim()
  const structureName = (params.structure_name || '').trim()

  if (itemIds.length === 0) return { success: false, error: '商品ID列表为空' }

  function compact(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim() }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  function randomInt(min, max) {
    const lo = Math.ceil(Number(min) || 0), hi = Math.floor(Number(max) || lo)
    return hi <= lo ? lo : lo + Math.floor(Math.random() * (hi - lo + 1))
  }
  async function sleepRandom(min, max) { return sleep(randomInt(min, max)) }

  const NOW = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const allRows = []

  function parseDate(text) {
    const m = String(text || '').match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/)
    return m ? m[1].replace(/\//g, '-') : ''
  }

  function isInDateRange(dateStr) {
    if (!dateStart && !dateEnd) return true
    if (!dateStr) return true
    const d = dateStr.slice(0, 10)
    if (dateStart && d < dateStart) return false
    if (dateEnd && d > dateEnd) return false
    return true
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

  async function waitForLoadIdle(timeoutMs = 10000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const spinners = document.querySelectorAll('.loading, .skeleton, [class*="spin"]')
      if (spinners.length === 0) { await sleep(1000); return }
      await sleep(500)
    }
  }

  /**
   * Extract Q&A pairs from the page
   */
  function extractQAData(itemId) {
    const rows = []
    const qaItems = document.querySelectorAll('.qa-item, .ask-item, .question-item, .qa-row, .qa-card, [class*="ask-all"] li, .comment-item')

    qaItems.forEach(item => {
      const question = item.querySelector('.question, .ask-content, .qa-question, .q-text, [class*="question"]')
      const answer = item.querySelector('.answer, .reply-content, .qa-answer, .a-text, [class*="answer"]')
      const askTime = item.querySelector('.ask-time, .question-time, .qa-time, .time')
      const answerTime = item.querySelector('.answer-time, .reply-time')
      const answerer = item.querySelector('.answerer, .reply-user, .user-name')

      const qText = compact(question?.textContent || '')
      const aText = compact(answer?.textContent || '')
      const askDate = parseDate(askTime?.textContent)
      const ansDate = parseDate(answerTime?.textContent)

      if (!qText && !aText) return
      if (!isInDateRange(askDate)) return

      rows.push({
        商品ID: itemId,
        结构名称: structureName || itemId,
        问题: qText,
        回答: aText,
        提问时间: askDate,
        回答时间: ansDate,
        回答者: compact(answerer?.textContent || ''),
        数据来源: '天猫卖家后台-问大家',
        抓取时间: NOW,
        备注: ''
      })
    })

    // Fallback: try generic table/list extraction
    if (rows.length === 0) {
      const tables = document.querySelectorAll('table')
      tables.forEach(table => {
        table.querySelectorAll('tbody tr').forEach(tr => {
          const cells = tr.querySelectorAll('td')
          const values = Array.from(cells).map(c => compact(c.textContent))
          if (values.length >= 2 && values.some(v => v)) {
            rows.push({
              商品ID: itemId, 结构名称: structureName || itemId,
              问题: values[0] || '', 回答: values[1] || '',
              提问时间: values[2] || '', 回答时间: values[3] || '',
              回答者: values[4] || '',
              数据来源: '天猫卖家后台-问大家',
              抓取时间: NOW, 备注: '表格提取'
            })
          }
        })
      })
    }

    return rows
  }

  /**
   * Click "next page" and return true if there are more pages
   */
  async function gotoNextPage() {
    const nextBtn = document.querySelector(
      '.next-page, .pagination-next, .ant-pagination-next, .pager-next, button:has-text("下一页"), a:has-text("下一页"), .next:not(.disabled)'
    )
    if (!nextBtn) return false
    if (nextBtn.classList.contains('disabled') || nextBtn.disabled) return false
    nextBtn.click()
    await sleep(2000)
    await waitForLoadIdle(8000)
    return true
  }

  async function processItem(itemId) {
    // Navigate to the ask-all page for this item
    const url = `https://myseller.taobao.com/home.htm/comment-manage/ask-all?itemId=${itemId}&current=1&pageSize=10`
    window.location.href = url
    await sleep(4000)
    await waitForLoadIdle(12000)

    // Check if we need to switch to this item (seller backend may have item selector)
    const itemSelector = document.querySelector('select.item-selector, .item-switch select')
    if (itemSelector) {
      const option = Array.from(itemSelector.options).find(o => o.value === itemId || o.text.includes(itemId))
      if (option) { itemSelector.value = option.value; itemSelector.dispatchEvent(new Event('change', { bubbles: true })); await sleep(3000); await waitForLoadIdle(10000) }
    }

    // Paginate and extract
    let page = 0
    const MAX_PAGES = 50
    while (page < MAX_PAGES) {
      await waitForLoadIdle(8000)
      const pageRows = extractQAData(itemId)
      allRows.push(...pageRows)
      page++
      if (page >= MAX_PAGES) break
      const hasMore = await gotoNextPage()
      if (!hasMore) break
    }
  }

  for (let i = 0; i < itemIds.length; i++) {
    try {
      await processItem(itemIds[i])
      if (i < itemIds.length - 1) await sleepRandom(5000, 10000)
    } catch (err) {
      allRows.push({
        商品ID: itemIds[i], 结构名称: structureName || itemIds[i],
        问题: '取数异常', 回答: String(err.message || err),
        提问时间: '', 回答时间: '', 回答者: '',
        数据来源: '天猫卖家后台-问大家',
        抓取时间: NOW, 备注: 'JS异常'
      })
    }
  }

  return { success: true, data: allRows }
})()

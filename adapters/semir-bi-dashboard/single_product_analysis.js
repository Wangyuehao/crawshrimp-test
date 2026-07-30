;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}
  const shared = window.__CRAWSHRIMP_SHARED__ || {}

  const skuList = (params.sku_list || '').split(/[\n,，、\s]+/).map(s => s.trim()).filter(Boolean)
  const dateStart = (params.date_start || '').trim()
  const dateEnd = (params.date_end || '').trim()
  const structureName = (params.structure_name || '').trim()

  if (skuList.length === 0) {
    return { success: false, error: '款号列表为空' }
  }

  function compact(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim() }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  function randomInt(min, max) {
    const lo = Math.ceil(Number(min) || 0), hi = Math.floor(Number(max) || lo)
    return hi <= lo ? lo : lo + Math.floor(Math.random() * (hi - lo + 1))
  }
  async function sleepRandom(min, max) { return sleep(randomInt(min, max)) }

  const BASE_URL = 'https://guanbi.ecsemir.com/page/j54270c33616049dcb650111'
  const NOW = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const allRows = []

  /**
   * Wait for a selector to appear in DOM
   */
  async function waitForSelector(selector, timeoutMs = 15000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const el = document.querySelector(selector)
      if (el) return el
      await sleep(500)
    }
    return null
  }

  /**
   * Wait for network/loading to settle
   */
  async function waitForLoadIdle(timeoutMs = 10000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const spinners = document.querySelectorAll('.semi-spin-spinning, .ant-spin-spinning, .loading, .skeleton')
      if (spinners.length === 0) {
        await sleep(1000)
        const still = document.querySelectorAll('.semi-spin-spinning, .ant-spin-spinning, .loading, .skeleton')
        if (still.length === 0) return
      }
      await sleep(500)
    }
  }

  /**
   * Find and click an input, then type a value and dispatch events
   */
  async function fillInput(selector, value) {
    const el = await waitForSelector(selector, 8000)
    if (!el) return false
    el.focus()
    el.value = ''
    el.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    await sleep(300)
    return true
  }

  /**
   * Click element by selector
   */
  async function clickElement(selector, timeoutMs = 8000) {
    const el = await waitForSelector(selector, timeoutMs)
    if (!el) return false
    el.click()
    await sleep(500)
    return true
  }

  /**
   * Extract table data from the page.
   * Tries multiple common table structures.
   */
  function extractTableData() {
    const rows = []

    // Try Semi Design Table
    const semiRows = document.querySelectorAll('.semi-table-tbody tr, .semi-table-body table tr')
    if (semiRows.length > 0) {
      semiRows.forEach(tr => {
        const cells = tr.querySelectorAll('td, th')
        const values = Array.from(cells).map(c => compact(c.textContent))
        if (values.some(v => v)) rows.push(values)
      })
      return rows
    }

    // Try Ant Design Table
    const antRows = document.querySelectorAll('.ant-table-tbody tr')
    if (antRows.length > 0) {
      antRows.forEach(tr => {
        const cells = tr.querySelectorAll('td')
        const values = Array.from(cells).map(c => compact(c.textContent))
        if (values.some(v => v)) rows.push(values)
      })
      return rows
    }

    // Try generic table
    const table = document.querySelector('table')
    if (table) {
      table.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('td, th')
        const values = Array.from(cells).map(c => compact(c.textContent))
        if (values.some(v => v)) rows.push(values)
      })
      return rows
    }

    return rows
  }

  /**
   * Navigate to the BI dashboard and extract data for one SKU
   */
  async function processSku(sku) {
    // Navigate to BI dashboard
    window.location.href = BASE_URL
    await sleep(4000)
    await waitForLoadIdle(15000)

    // Input SKU - try multiple selectors
    const skuFilled = await fillInput(
      'input[placeholder*="款号"], input[placeholder*="商品"], input[name*="sku"], input[name*="code"], .semi-input input, .ant-input-affix-wrapper input, input[type="text"]',
      sku
    )
    if (!skuFilled) {
      // Try finding the search/query area
      const anyInput = document.querySelector('input[type="text"]')
      if (anyInput) {
        anyInput.focus()
        anyInput.value = sku
        anyInput.dispatchEvent(new Event('input', { bubbles: true }))
        anyInput.dispatchEvent(new Event('change', { bubbles: true }))
        await sleep(500)
      }
    }

    // Set date range if provided
    if (dateStart && dateEnd) {
      await fillInput(
        'input[placeholder*="开始"], input[placeholder*="起始"], .date-range-start input, .datepicker-start input',
        dateStart
      )
      await fillInput(
        'input[placeholder*="结束"], input[placeholder*="截止"], .date-range-end input, .datepicker-end input',
        dateEnd
      )
    }

    // Click search/query button
    await clickElement(
      'button:has-text("查询"), button:has-text("搜索"), .semi-button-primary, .ant-btn-primary, button[type="submit"]'
    )
    await sleep(2000)
    await waitForLoadIdle(15000)

    // Extract table data
    const tableData = extractTableData()
    const dataDimension = '评价&退货留言&周销趋势'

    if (tableData.length === 0) {
      allRows.push({
        款号: sku,
        结构名称: structureName || sku,
        数据维度: dataDimension,
        指标名称: '取数失败',
        指标值: '无数据',
        时间范围: `${dateStart}~${dateEnd}`,
        数据来源: 'BI看板-单品分析',
        抓取时间: NOW,
        备注: '未检测到表格数据'
      })
      return
    }

    // Try to determine if there's a header row (first row)
    let headers = tableData[0]
    let dataStart = 1
    const isHeader = headers.some(h => /指标|日期|评价|退货|销量|趋势|维度|指标值/i.test(String(h)))
    if (!isHeader) {
      headers = []
      dataStart = 0
    }

    // Extract data rows
    for (let i = dataStart; i < tableData.length; i++) {
      const row = tableData[i]
      const rowObj = {
        款号: sku,
        结构名称: structureName || sku,
        数据维度: dataDimension,
        指标名称: '',
        指标值: '',
        时间范围: `${dateStart}~${dateEnd}`,
        数据来源: 'BI看板-单品分析',
        抓取时间: NOW,
        备注: ''
      }

      if (headers.length > 0 && row.length > 0) {
        // Map header->value pairs
        for (let j = 0; j < Math.min(headers.length, row.length); j++) {
          if (headers[j]) {
            rowObj.指标名称 = compact(headers[j])
            rowObj.指标值 = compact(row[j])
            allRows.push({ ...rowObj })
          }
        }
      } else {
        // No headers found, concatenate row values
        rowObj.指标名称 = `数据行${i - dataStart + 1}`
        rowObj.指标值 = row.filter(v => v).join(' | ')
        allRows.push(rowObj)
      }
    }
  }

  // Process all SKUs sequentially
  for (let i = 0; i < skuList.length; i++) {
    const sku = skuList[i]
    try {
      await processSku(sku)
      // Random delay between SKUs to avoid rate limiting
      if (i < skuList.length - 1) {
        await sleepRandom(3000, 6000)
      }
    } catch (err) {
      allRows.push({
        款号: sku,
        结构名称: structureName || sku,
        数据维度: '评价&退货留言&周销趋势',
        指标名称: '取数异常',
        指标值: String(err.message || err),
        时间范围: `${dateStart}~${dateEnd}`,
        数据来源: 'BI看板-单品分析',
        抓取时间: NOW,
        备注: 'JS执行异常'
      })
    }
  }

  return { success: true, data: allRows }
})()

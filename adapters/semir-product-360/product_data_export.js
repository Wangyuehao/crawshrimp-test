;(async () => {
  const params = window.__CRAWSHRIMP_PARAMS__ || {}

  const skuList = (params.sku_list || '').split(/[\n,，、\s]+/).map(s => s.trim()).filter(Boolean)
  const structureName = (params.structure_name || '').trim()

  if (skuList.length === 0) return { success: false, error: '款号列表为空' }

  function compact(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim() }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  function randomInt(min, max) {
    const lo = Math.ceil(Number(min) || 0), hi = Math.floor(Number(max) || lo)
    return hi <= lo ? lo : lo + Math.floor(Math.random() * (hi - lo + 1))
  }
  async function sleepRandom(min, max) { return sleep(randomInt(min, max)) }

  const BASE_URL = 'https://smbd.semirapp.cn/pc/product/productManager/product360'
  const NOW = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const allRows = []

  async function waitForSelector(selector, timeoutMs = 15000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const el = document.querySelector(selector)
      if (el) return el
      await sleep(500)
    }
    return null
  }

  async function waitForLoadIdle(timeoutMs = 12000) {
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

  async function clickElement(selector, timeoutMs = 8000) {
    const el = await waitForSelector(selector, timeoutMs)
    if (!el) return false
    el.click()
    await sleep(500)
    return true
  }

  /**
   * Extract all data from the product 360 page.
   * Collects key-value pairs from info cards, stats panels, and tables.
   */
  function extractAllData(sku) {
    const rows = []

    // Extract labeled data from description lists / info cards
    const descItems = document.querySelectorAll('.semi-descriptions-item, .ant-descriptions-item, .info-item, .product-info-item')
    descItems.forEach(item => {
      const label = item.querySelector('.semi-descriptions-item-label, .ant-descriptions-item-label, .label, .info-label')
      const content = item.querySelector('.semi-descriptions-item-content, .ant-descriptions-item-content, .value, .info-value')
      if (label && content) {
        rows.push({
          款号: sku, 结构名称: structureName || sku,
          数据维度: '商品维度', 指标名称: compact(label.textContent),
          指标值: compact(content.textContent),
          数据来源: '商品360', 抓取时间: NOW, 备注: ''
        })
      }
    })

    // Extract stat cards
    const statCards = document.querySelectorAll('.stat-card, .semi-card, .ant-card, .metric-card, .data-card')
    statCards.forEach(card => {
      const title = card.querySelector('.semi-card-header-title, .ant-card-head-title, .card-title, .stat-title, .title')
      const value = card.querySelector('.stat-value, .metric-value, .number, .value, .semi-statistic-value')
      if (title && value) {
        rows.push({
          款号: sku, 结构名称: structureName || sku,
          数据维度: '销售维度', 指标名称: compact(title.textContent),
          指标值: compact(value.textContent),
          数据来源: '商品360', 抓取时间: NOW, 备注: ''
        })
      }
    })

    // Extract table data
    const tables = document.querySelectorAll('.semi-table, .ant-table, table.data-table')
    tables.forEach((table, tIdx) => {
      const tableRows = table.querySelectorAll('tr')
      let headers = []
      tableRows.forEach((tr, rIdx) => {
        const cells = tr.querySelectorAll('td, th')
        const values = Array.from(cells).map(c => compact(c.textContent))
        if (values.every(v => !v)) return
        if (rIdx === 0 && values.some(v => /指标|维度|名称|日期/i.test(v))) {
          headers = values
        } else if (headers.length > 0) {
          for (let i = 0; i < Math.min(headers.length, values.length); i++) {
            rows.push({
              款号: sku, 结构名称: structureName || sku,
              数据维度: `表格${tIdx + 1}`,
              指标名称: compact(headers[i]) || `列${i + 1}`,
              指标值: compact(values[i]),
              数据来源: '商品360', 抓取时间: NOW, 备注: ''
            })
          }
        }
      })
    })

    // Fallback: extract all visible number values
    if (rows.length === 0) {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, .section-title, .panel-title')
      headings.forEach(h => {
        const nextValue = h.nextElementSibling
        if (nextValue && /\d/.test(nextValue.textContent)) {
          rows.push({
            款号: sku, 结构名称: structureName || sku,
            数据维度: '页面数据', 指标名称: compact(h.textContent),
            指标值: compact(nextValue.textContent),
            数据来源: '商品360', 抓取时间: NOW, 备注: ''
          })
        }
      })
    }

    return rows
  }

  async function processSku(sku) {
    window.location.href = BASE_URL
    await sleep(4000)
    await waitForLoadIdle(15000)

    // Try to find product search and input SKU
    const filled = await fillInput(
      'input[placeholder*="款号"], input[placeholder*="搜索"], input[placeholder*="商品"], input[name*="sku"], .search-input input, .semi-input input'
      , sku
    )

    if (filled) {
      // Click search
      await clickElement('button:has-text("搜索"), button:has-text("查询"), .semi-button-primary, .ant-btn-primary')
      await sleep(3000)
      await waitForLoadIdle(15000)
    }

    // If we're on the product detail page, extract data
    const pageData = extractAllData(sku)
    if (pageData.length === 0) {
      allRows.push({
        款号: sku, 结构名称: structureName || sku,
        数据维度: '页面数据', 指标名称: '取数失败',
        指标值: '未检测到数据', 数据来源: '商品360',
        抓取时间: NOW, 备注: '页面可能需手动导航到具体商品360页'
      })
    } else {
      allRows.push(...pageData)
    }
  }

  for (let i = 0; i < skuList.length; i++) {
    try {
      await processSku(skuList[i])
      if (i < skuList.length - 1) await sleepRandom(3000, 6000)
    } catch (err) {
      allRows.push({
        款号: skuList[i], 结构名称: structureName || skuList[i],
        数据维度: '页面数据', 指标名称: '取数异常',
        指标值: String(err.message || err), 数据来源: '商品360',
        抓取时间: NOW, 备注: 'JS异常'
      })
    }
  }

  return { success: true, data: allRows }
})()

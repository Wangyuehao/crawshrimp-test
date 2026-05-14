import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const SAMPLE_LINK = 'https://detail.tmall.com/item.htm?id=1013055146212&skuId=6017725613985'

class FakeElement {
  constructor(options = {}) {
    this.tagName = String(options.tagName || 'DIV').toUpperCase()
    this._text = String(options.text || '')
    this._attrs = new Map(Object.entries(options.attributes || {}))
    this.className = options.className || ''
    this.onclick = options.onclick || null
  }

  get innerText() { return this._text }
  get textContent() { return this._text }

  getAttribute(name) {
    return this._attrs.has(name) ? this._attrs.get(name) : null
  }

  getBoundingClientRect() {
    return { left: 10, top: 20, width: 100, height: 32, right: 110, bottom: 52 }
  }

  scrollIntoView() {}
}

class FakeDocument {
  constructor(bodyText = '') {
    this.readyState = 'complete'
    this.cookie = 'cookie2=abc; _m_h5_tk=token'
    this._elements = []
    this.body = new FakeElement({ tagName: 'body', text: bodyText })
  }

  setElements(elements) {
    this._elements = elements
    return this
  }

  querySelectorAll(selector) {
    if (selector === '*') return this._elements
    return []
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }
}

async function runScript({
  params = {},
  document,
  href = SAMPLE_LINK,
  shared = {},
  phase = 'main',
  timeoutImpl,
}) {
  const scriptPath = path.resolve('adapters/tmall-ops-assistant/diantoushi-review-export.js')
  const source = fs.readFileSync(scriptPath, 'utf8')
  const locationUrl = new URL(href)
  const context = {
    window: {
      __CRAWSHRIMP_PARAMS__: params,
      __CRAWSHRIMP_SHARED__: shared,
      __CRAWSHRIMP_PHASE__: phase,
      location: locationUrl,
      scrollBy() {},
      scrollTo() {},
      innerHeight: 800,
      innerWidth: 1280,
    },
    document: document || new FakeDocument('淘宝 天猫 店透视 评价分析 导出表格'),
    location: locationUrl,
    console,
    setTimeout: timeoutImpl || ((callback, ms, ...args) => {
      if (Number(ms) < 10000) Promise.resolve().then(() => callback(...args))
      return { ms }
    }),
    clearTimeout,
    getComputedStyle() {
      return { visibility: 'visible', display: 'block', opacity: '1' }
    },
    URL,
    URLSearchParams,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
  }
  context.globalThis = context
  Object.assign(context.window, {
    document: context.document,
    getComputedStyle: context.getComputedStyle,
  })
  return await vm.runInNewContext(source, context, { filename: scriptPath })
}

test('diantoushi export starts with parsed item links and navigate phase', async () => {
  const result = await runScript({
    params: {
      item_links: `${SAMPLE_LINK}\nhttps://detail.tmall.com/item.htm?id=1013055146212&spm=duplicate`,
      min_pages: 30,
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'navigate')
  assert.equal(result.meta.shared.items.length, 1)
  assert.equal(result.meta.shared.items[0].itemId, '1013055146212')
})

test('diantoushi export accepts plain item ids and builds taobao urls', async () => {
  const result = await runScript({
    params: {
      item_links: '1002377057629\n1049051219737\n955794351682',
      min_pages: 30,
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.shared.items.length, 3)
  assert.equal(result.meta.shared.items[0].itemId, '1002377057629')
  assert.equal(result.meta.shared.items[0].url, 'https://item.taobao.com/item.htm?id=1002377057629')
  assert.equal(result.meta.shared.items[1].url, 'https://item.taobao.com/item.htm?id=1049051219737')
})

test('diantoushi export turns review export button into download_clicks action', async () => {
  const document = new FakeDocument('店透视 评价分析 导出表格 第 30 页')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'export_reviews',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    params: { min_pages: 30, download_timeout_ms: 90000 },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'download_clicks')
  assert.equal(result.meta.next_phase, 'advance_item')
  assert.equal(result.meta.items[0].filename, '店透视评价_1013055146212.xlsx')
  assert.equal(result.meta.items[0].timeout_ms, 90000)
  assert.equal(result.meta.items[0].clicks[0].x, 60)
})

test('diantoushi export downloads qa table before closing qa modal', async () => {
  const openQaDocument = new FakeDocument('店透视 问大家 问大家分析')
    .setElements([
      new FakeElement({ tagName: 'button', text: '问大家' }),
    ])
  const openQa = await runScript({
    phase: 'open_qa',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    openQaDocument,
    document: openQaDocument,
  })

  assert.equal(openQa.success, true)
  assert.equal(openQa.meta.action, 'cdp_clicks')
  assert.equal(openQa.meta.next_phase, 'wait_qa_panel')

  const qaDocument = new FakeDocument('店透视 问大家分析 导出表格 问答 1 条 官方暂无数据 这个涂码割芯了吗？')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const exportQa = await runScript({
    phase: 'export_qa',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    document: qaDocument,
  })

  assert.equal(exportQa.success, true)
  assert.equal(exportQa.meta.action, 'download_clicks')
  assert.equal(exportQa.meta.next_phase, 'close_qa_modal')
  assert.equal(exportQa.meta.items[0].filename, '店透视问大家_1013055146212.xlsx')

  const closeDocument = new FakeDocument('店透视 问大家分析 导出表格')
    .setElements([
      new FakeElement({ tagName: 'button', text: '关闭', className: 'modal-close' }),
    ])
  const closeQa = await runScript({
    phase: 'close_qa_modal',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    document: closeDocument,
  })

  assert.equal(closeQa.success, true)
  assert.equal(closeQa.meta.action, 'cdp_clicks')
  assert.equal(closeQa.meta.next_phase, 'open_review')
})

test('diantoushi export skips qa download when qa panel has no data', async () => {
  const document = new FakeDocument('店透视 问大家分析 导出表格 暂无数据')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'wait_qa_panel',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'close_qa_modal')
  assert.equal(JSON.stringify(result.meta.shared.qaNoDataItems), JSON.stringify(['1013055146212']))
})

test('diantoushi export skips qa download when qa modal only has export button', async () => {
  const document = new FakeDocument('店透视 问大家分析 导出表格')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'wait_qa_panel',
    shared: {
      items: [{ itemId: '1049051219737', url: 'https://item.taobao.com/item.htm?id=1049051219737' }],
      index: 0,
      qaPanelWaits: 5,
    },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'close_qa_modal')
  assert.equal(JSON.stringify(result.meta.shared.qaNoDataItems), JSON.stringify(['1049051219737']))
})

test('diantoushi export skips qa download when qa count is zero', async () => {
  const document = new FakeDocument('店透视 问大家分析 导出表格 问答 0 条')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'export_qa',
    shared: {
      items: [{ itemId: '1049051219737', url: 'https://item.taobao.com/item.htm?id=1049051219737' }],
      index: 0,
    },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'close_qa_modal')
  assert.equal(JSON.stringify(result.meta.shared.qaNoDataItems), JSON.stringify(['1049051219737']))
})

test('diantoushi export treats official no-nickname text as qa row data', async () => {
  const document = new FakeDocument('店透视 问大家分析 导出表格 官方暂无数据 这个涂码割芯了吗？')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'wait_qa_panel',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'export_qa')
  assert.equal(result.meta.shared.qaNoDataItems, undefined)
})

test('diantoushi export summary requires qa and review downloads', async () => {
  const result = await runScript({
    phase: 'complete',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 1,
      loadedPagesByItem: { 1013055146212: 30 },
      downloadResults: [
        { items: [{ success: true, label: '店透视问大家_1013055146212', path: '/tmp/qa.xlsx' }] },
        { items: [{ success: true, label: '店透视评价_1013055146212', path: '/tmp/review.xlsx' }] },
      ],
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.data[0].执行结果, '成功')
  assert.equal(result.data[0].问大家导出文件, '/tmp/qa.xlsx')
  assert.equal(result.data[0].评价分析导出文件, '/tmp/review.xlsx')
})

test('diantoushi export summary succeeds when qa is empty but review downloads', async () => {
  const result = await runScript({
    phase: 'complete',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 1,
      qaNoDataItems: ['1013055146212'],
      loadedPagesByItem: { 1013055146212: 30 },
      downloadResults: [
        { items: [{ success: true, label: '店透视评价_1013055146212', path: '/tmp/review.xlsx' }] },
      ],
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.data[0].执行结果, '成功')
  assert.equal(result.data[0].问大家导出文件, '')
  assert.equal(result.data[0].评价分析导出文件, '/tmp/review.xlsx')
  assert.match(result.data[0].备注, /问大家无数据/)
})

test('diantoushi export skips review download when review panel has no data', async () => {
  const document = new FakeDocument('店透视 评价分析 导出表格 暂无评价 第 1 页')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'inspect_reviews',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    params: { min_pages: 30 },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'advance_item')
  assert.equal(JSON.stringify(result.meta.shared.reviewNoDataItems), JSON.stringify(['1013055146212']))
})

test('diantoushi export skips review download when review count is zero', async () => {
  const document = new FakeDocument('店透视 评价分析 导出表格 评价 0 条 第 1 页')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'export_reviews',
    shared: {
      items: [{ itemId: '1049051323295', url: 'https://item.taobao.com/item.htm?id=1049051323295' }],
      index: 0,
    },
    params: { min_pages: 1 },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'advance_item')
  assert.equal(JSON.stringify(result.meta.shared.reviewNoDataItems), JSON.stringify(['1049051323295']))
})

test('diantoushi export summary succeeds when qa and review are empty', async () => {
  const result = await runScript({
    phase: 'complete',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 1,
      qaNoDataItems: ['1013055146212'],
      reviewNoDataItems: ['1013055146212'],
      loadedPagesByItem: { 1013055146212: 1 },
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.data[0].执行结果, '成功')
  assert.equal(result.data[0].问大家导出文件, '')
  assert.equal(result.data[0].评价分析导出文件, '')
  assert.match(result.data[0].备注, /问大家无数据/)
  assert.match(result.data[0].备注, /评价分析无数据/)
})

test('diantoushi export summary does not borrow another item download for empty item', async () => {
  const result = await runScript({
    phase: 'complete',
    shared: {
      items: [
        { itemId: '1049051323295', url: 'https://item.taobao.com/item.htm?id=1049051323295' },
        { itemId: '955794351682', url: 'https://item.taobao.com/item.htm?id=955794351682' },
      ],
      index: 2,
      qaNoDataItems: ['1049051323295'],
      reviewNoDataItems: ['1049051323295'],
      downloadResults: [
        { items: [{ success: true, label: '店透视问大家_955794351682', path: '/tmp/qa-955794351682.xlsx' }] },
      ],
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.data[0].商品ID, '1049051323295')
  assert.equal(result.data[0].导出文件, '')
  assert.equal(result.data[0].问大家导出文件, '')
  assert.equal(result.data[0].评价分析导出文件, '')
  assert.equal(result.data[1].商品ID, '955794351682')
  assert.equal(result.data[1].导出文件, '/tmp/qa-955794351682.xlsx')
  assert.equal(result.data[1].问大家导出文件, '/tmp/qa-955794351682.xlsx')
})

test('diantoushi export waits for review panel instead of silently marking no data', async () => {
  const document = new FakeDocument('店透视 问大家 评价分析 导出表格 评价词 好评 加载更多 第 1 页')
    .setElements([
      new FakeElement({ tagName: 'button', text: '评价分析' }),
      new FakeElement({ tagName: 'button', text: '加载更多' }),
    ])
  const openReview = await runScript({
    phase: 'open_review',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    document,
  })

  assert.equal(openReview.success, true)
  assert.equal(openReview.meta.action, 'cdp_clicks')
  assert.equal(openReview.meta.next_phase, 'wait_review_panel')

  const inspect = await runScript({
    phase: 'inspect_reviews',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    params: { min_pages: 30 },
    document,
  })

  assert.equal(inspect.success, true)
  assert.equal(inspect.meta.action, 'next_phase')
  assert.equal(inspect.meta.next_phase, 'load_more')
  assert.equal(inspect.meta.shared.noDataItems, undefined)
})

test('diantoushi export prefers positive review count over unrelated no-data text', async () => {
  const document = new FakeDocument('店透视 评价分析 导出表格 暂无数据 评价 400 条 第 1 页')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
      new FakeElement({ tagName: 'button', text: '加载更多' }),
    ])
  const result = await runScript({
    phase: 'inspect_reviews',
    shared: {
      items: [{ itemId: '1013055146212', url: SAMPLE_LINK }],
      index: 0,
    },
    params: { min_pages: 30 },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'load_more')
  assert.equal(result.meta.shared.noDataItems, undefined)
})

test('diantoushi export fails instead of partial export when positive rows need more pages but no loader is found', async () => {
  const document = new FakeDocument('店透视 评价分析 导出表格 评价 400 条 第 1 页')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'load_more',
    shared: {
      items: [{ itemId: '955794351682', url: 'https://item.taobao.com/item.htm?id=955794351682' }],
      index: 0,
    },
    params: { min_pages: 30 },
    document,
  })

  assert.equal(result.success, false)
  assert.match(result.error, /未找到继续加载入口/)
})

test('diantoushi export treats fully loaded row counter as end reached', async () => {
  const document = new FakeDocument('店透视 评价分析 导出表格 当前表格中共有400 条数据 已成功加载：400/400条数据 1345678 前往页')
    .setElements([
      new FakeElement({ tagName: 'button', text: '导出表格' }),
    ])
  const result = await runScript({
    phase: 'inspect_reviews',
    shared: {
      items: [{ itemId: '955794351682', url: 'https://item.taobao.com/item.htm?id=955794351682' }],
      index: 0,
      loadMoreClicks: 7,
    },
    params: { min_pages: 30 },
    document,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'export_reviews')
  assert.equal(result.meta.shared.diagnostics.inspectReviews.loadedRows, 400)
  assert.equal(result.meta.shared.diagnostics.inspectReviews.totalRows, 400)
  assert.equal(result.meta.shared.diagnostics.inspectReviews.endReached, true)
})

test('tmall manifest exposes diantoushi export task', () => {
  const manifest = fs.readFileSync(path.resolve('adapters/tmall-ops-assistant/manifest.yaml'), 'utf8')
  assert.match(manifest, /id:\s+diantoushi_review_export/)
  assert.match(manifest, /script:\s+diantoushi-review-export\.js/)
  assert.match(manifest, /店透视评价表格导出/)
  assert.match(manifest, /问大家导出文件/)
  assert.match(manifest, /评价分析导出文件/)
})

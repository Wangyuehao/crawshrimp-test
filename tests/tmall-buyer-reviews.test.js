import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const SAMPLE_LINKS = [
  'https://detail.tmall.com/item.htm?ali_refid=a3_430582_1006%3A2538299721%3AH%3AnRermbLQ7BCZavGPLCDqOw%3D%3D%3A9f37130647858d75ee5528af81d29cf3&id=919643072179&skuId=5789814873879',
  'https://detail.tmall.com/item.htm?ali_refid=a3_420434_1006%3A1106039598%3AH%3At0vfbs1t3ml%2Bm01JiMPFkiGZah3zNU28%3A192407e8270fa0b56e8688e56f59f6c4&id=1023254962064&skuId=6034929285662',
  'https://detail.tmall.com/item.htm?ali_refid=a3_430582_1006%3A1103400469%3AH%3AgqRrVlZ%2FyEoP2qOeo77wRaK2rYBgL%2Fj%2B%3Ad6024f75fd1de5737b0f584a168bf248&id=732533512173&skuId=6038497472965',
]

class FakeElement {
  constructor(options = {}) {
    this.tagName = String(options.tagName || 'DIV').toUpperCase()
    this._text = String(options.text || '')
    this._attrs = new Map(Object.entries(options.attributes || {}))
    this._selectors = new Map()
  }

  get innerText() { return this._text }
  get textContent() { return this._text }

  setSelector(selector, items) {
    this._selectors.set(selector, Array.isArray(items) ? items : [])
    return this
  }

  querySelectorAll(selector) {
    return this._selectors.get(selector) || []
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }

  getAttribute(name) {
    return this._attrs.has(name) ? this._attrs.get(name) : null
  }
}

class FakeDocument {
  constructor(bodyText = '') {
    this._selectors = new Map()
    this.body = new FakeElement({ tagName: 'body', text: bodyText })
    this.cookie = 'cookie2=abc; _m_h5_tk=token_1234567890; isg=xyz'
  }

  setSelector(selector, items) {
    this._selectors.set(selector, Array.isArray(items) ? items : [])
    return this
  }

  querySelectorAll(selector) {
    return this._selectors.get(selector) || []
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }
}

async function runScript({
  params = {},
  document,
  fetchImpl,
  href = SAMPLE_LINKS[0],
  shared = {},
  page = 1,
  phase = 'main',
  windowOverrides = {},
  randomImpl,
  timeoutImpl,
}) {
  const scriptPath = path.resolve('adapters/tmall-ops-assistant/buyer-reviews.js')
  const source = fs.readFileSync(scriptPath, 'utf8')
  const locationUrl = new URL(href)
  const mathObject = Object.create(Math)
  mathObject.random = randomImpl || Math.random
  const setTimeoutImpl = timeoutImpl || ((callback, ms, ...args) => {
    if (Number(ms) < 10000) Promise.resolve().then(() => callback(...args))
    return { ms }
  })
  const context = {
    window: {
      __CRAWSHRIMP_PARAMS__: params,
      __CRAWSHRIMP_SHARED__: shared,
      __CRAWSHRIMP_PAGE__: page,
      __CRAWSHRIMP_PHASE__: phase,
      location: locationUrl,
    },
    document: document || new FakeDocument('天猫 商品详情 累计评价'),
    location: locationUrl,
    fetch: fetchImpl || (async () => { throw new Error('fetch not mocked') }),
    console,
    setTimeout: setTimeoutImpl,
    clearTimeout,
    URL,
    URLSearchParams,
    JSON,
    Math: mathObject,
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
  Object.assign(context.window, windowOverrides)
  context.globalThis = context
  context.window.fetch = (...args) => context.fetch(...args)
  return await vm.runInNewContext(source, context, { filename: scriptPath })
}

function createMtopMock(pagesByPageNo) {
  const calls = []
  return {
    calls,
    lib: {
      mtop: {
        request(request, success, failure) {
          calls.push(request)
          const pageNo = Number(request?.data?.pageNo || 1)
          const payload = pagesByPageNo[pageNo]
          if (payload instanceof Error) {
            failure({
              ret: [`FAIL_SYS_MOCK::${payload.message}`],
              errorMessage: payload.message,
            })
            return { abort() {} }
          }
          success({
            ret: ['SUCCESS::调用成功'],
            data: payload,
          })
          return { abort() {} }
        },
      },
    },
  }
}

test('buyer reviews parses tmall links and normalizes review API rows', async () => {
  const fetchCalls = []
  const fetchImpl = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init })
    return {
      status: 200,
      ok: true,
      async json() {
        return {
          rateDetail: {
            paginator: { items: 2, lastPage: 1 },
            rateList: [
              {
                id: 'R-1001',
                rateId: 'R-1001',
                displayUserNick: '买家A',
                rateContent: '版型很好，面料舒服',
                rateDate: '2026-05-01',
                auctionSku: '颜色:黑色;尺码:M',
                skuInfo: '黑色 M',
                appendComment: { content: '追评也不错', commentTime: '2026-05-03' },
                pics: ['//img.alicdn.com/review-a.jpg'],
                rateStar: 5,
              },
              {
                id: 'R-1002',
                displayUserNick: '买家B',
                feedback: '物流快',
                feedbackDate: '2026-05-02',
                skuMap: { 颜色: '白色', 尺码: 'L' },
                images: [{ url: 'https://img.alicdn.com/review-b.jpg' }],
                serviceRate: 4,
              },
            ],
          },
        }
      },
      async text() {
        return ''
      },
      clone() {
        return this
      },
    }
  }

  const result = await runScript({
    params: {
      item_links: SAMPLE_LINKS.join('\n'),
      page_size: 20,
    },
    fetchImpl,
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.action, 'complete')
  assert.equal(result.meta.shared.total_items, 3)
  assert.equal(result.meta.shared.total_reviews, 6)
  assert.equal(result.data.length, 6)
  assert.equal(result.data[0].商品ID, '919643072179')
  assert.equal(result.data[0].SKU_ID, '5789814873879')
  assert.equal(result.data[0].评价ID, 'R-1001')
  assert.equal(result.data[0].买家昵称, '买家A')
  assert.equal(result.data[0].评价内容, '版型很好，面料舒服')
  assert.equal(result.data[0].追评内容, '追评也不错')
  assert.equal(result.data[0].评价图片, 'https://img.alicdn.com/review-a.jpg')
  assert.equal(result.data[1].商品ID, '919643072179')
  assert.equal(result.data[1].规格, '颜色:白色; 尺码:L')
  assert.match(fetchCalls[0].url, /itemNumId=919643072179/)
  assert.match(fetchCalls[0].url, /currentPage=1/)
  assert.match(fetchCalls[0].url, /pageSize=20/)
})

test('buyer reviews splits multiple long links joined by Chinese delimiter', async () => {
  const joinedLinks = SAMPLE_LINKS.join('、')
  const calls = []
  const lib = {
    mtop: {
      request(request, success) {
        calls.push(request)
        const itemId = String(request?.data?.auctionNumId || '')
        success({
          ret: ['SUCCESS::调用成功'],
          data: {
            hasNext: 'false',
            rateList: [
              {
                id: `ROW-${itemId}`,
                auctionNumId: itemId,
                feedback: `评价-${itemId}`,
                feedbackDate: '2026-05-07',
                reduceUserNick: `买家-${itemId.slice(-4)}`,
              },
            ],
          },
        })
        return { abort() {} }
      },
    },
  }

  const result = await runScript({
    params: { item_links: joinedLinks, page_size: 20, max_pages: 1 },
    windowOverrides: {
      lib,
      __UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__: () => {},
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.shared.total_items, 3)
  assert.deepEqual(
    calls.map(call => String(call.data.auctionNumId)),
    ['919643072179', '1023254962064', '732533512173'],
  )
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.data.map(row => row.商品ID))),
    ['919643072179', '1023254962064', '732533512173'],
  )
})

test('buyer reviews requests and normalizes real tmall mtop rateList rows', async () => {
  const mtop = createMtopMock({
    1: {
      hasNext: 'false',
      feedAllCount: '500',
      feedAllCountFuzzy: '500+',
      foldCount: '507',
      foldInfo: '已折叠507条对你帮助不大的评价',
      firstPageTips: '为你展示真实评价',
      rateList: [
        {
          id: 'MTOP-1001',
          auctionNumId: '919643072179',
          auctionTitle: '英氏儿童内裤纯棉男童平角底裤',
          feedback: '新版接口评价内容',
          feedbackDate: '2026-05-06',
          createTime: '2026-05-06 12:30:00',
          skuId: '5789814873879',
          skuMap: { 颜色: '黑色', 尺码: '130' },
          skuValueStr: '黑色 130',
          userNick: '完整昵称',
          reduceUserNick: '隐***称',
          feedPicPathList: ['//img.alicdn.com/review-mtop-a.jpg'],
          feedPicList: [{ thumbnail: '//img.alicdn.com/review-mtop-thumb.jpg' }],
          rateType: '1',
          reply: '商家回复',
          share: { detailUrl: 'https://detail.tmall.com/item.htm?id=919643072179' },
        },
      ],
    },
  })

  const result = await runScript({
    params: { item_links: SAMPLE_LINKS[0], page_size: 20, max_pages: 3 },
    windowOverrides: {
      lib: mtop.lib,
      __UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__: () => {},
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.shared.total_reviews, 1)
  assert.equal(result.meta.shared.review_visibility_summaries.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(result.meta.shared.review_visibility_summaries[0])), {
    item_id: '919643072179',
    sku_id: '5789814873879',
    feed_all_count: '500',
    feed_all_count_fuzzy: '500+',
    fold_count: '507',
    fold_info: '已折叠507条对你帮助不大的评价',
    first_page_tips: '为你展示真实评价',
    collected_reviews: 1,
  })
  assert.match(result.meta.shared.review_visibility_note, /折叠.*507|507.*折叠/)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].评价ID, 'MTOP-1001')
  assert.equal(result.data[0].商品ID, '919643072179')
  assert.equal(result.data[0].SKU_ID, '5789814873879')
  assert.equal(result.data[0].商品标题, '英氏儿童内裤纯棉男童平角底裤')
  assert.equal(result.data[0].买家昵称, '隐***称')
  assert.equal(result.data[0].评价时间, '2026-05-06')
  assert.equal(result.data[0].规格, '颜色:黑色; 尺码:130')
  assert.equal(result.data[0].评价内容, '新版接口评价内容')
  assert.equal(result.data[0].评价图片, 'https://img.alicdn.com/review-mtop-a.jpg')
  assert.equal(result.data[0].数据来源, 'mtop')
  assert.equal(mtop.calls.length, 1)
  assert.equal(mtop.calls[0].api, 'mtop.taobao.rate.detaillist.get')
  assert.equal(mtop.calls[0].v, '6.0')
  assert.equal(mtop.calls[0].appKey, '12574478')
  assert.equal(mtop.calls[0].data.auctionNumId, '919643072179')
  assert.equal(mtop.calls[0].data.pageNo, 1)
  assert.equal(mtop.calls[0].data.pageSize, 20)
  assert.equal(mtop.calls[0].data.rateSrc, 'pc_rate_list')
})

test('buyer reviews keeps paging mtop while hasNext is true up to max_pages', async () => {
  const mtop = createMtopMock({
    1: {
      hasNext: 'true',
      rateList: [
        {
          id: 'PAGE-1',
          auctionNumId: '919643072179',
          feedback: '第一页评价',
          feedbackDate: '2026-05-01',
          reduceUserNick: '一***页',
        },
      ],
    },
    2: {
      hasNext: 'false',
      rateList: [
        {
          id: 'PAGE-2',
          auctionNumId: '919643072179',
          feedback: '第二页评价',
          feedbackDate: '2026-05-02',
          reduceUserNick: '二***页',
        },
      ],
    },
  })

  const result = await runScript({
    params: { item_links: SAMPLE_LINKS[0], page_size: 20, max_pages: 2 },
    windowOverrides: {
      lib: mtop.lib,
      __UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__: () => {},
    },
  })

  assert.equal(result.success, true)
  assert.deepEqual(mtop.calls.map(call => call.data.pageNo), [1, 2])
  assert.equal(result.data.length, 2)
  assert.equal(result.data[0].评价ID, 'PAGE-1')
  assert.equal(result.data[1].评价ID, 'PAGE-2')
  assert.equal(result.data[1].页码, 2)
})

test('buyer reviews uses slower randomized delays between pages and items', async () => {
  const calls = []
  const lib = {
    mtop: {
      request() {},
    },
  }
  lib.mtop.request = (request, success) => {
    calls.push(request)
    const itemId = String(request?.data?.auctionNumId || '')
    const pageNo = Number(request?.data?.pageNo || 1)
    success({
      ret: ['SUCCESS::调用成功'],
      data: {
        hasNext: itemId === '919643072179' && pageNo === 1 ? 'true' : 'false',
        rateList: [
          {
            id: itemId === '1023254962064' ? 'ITEM2-PAGE1' : (pageNo === 1 ? 'ITEM1-PAGE1' : 'ITEM1-PAGE2'),
            auctionNumId: itemId,
            feedback: itemId === '1023254962064' ? '第二个商品第一页' : (pageNo === 1 ? '第一个商品第一页' : '第一个商品第二页'),
            feedbackDate: itemId === '1023254962064' ? '2026-05-03' : (pageNo === 1 ? '2026-05-01' : '2026-05-02'),
            reduceUserNick: itemId === '1023254962064' ? '二***一' : (pageNo === 1 ? '一***一' : '一***二'),
          },
        ],
      },
    })
    return { abort() {} }
  }
  const delayCalls = []
  const result = await runScript({
    params: { item_links: SAMPLE_LINKS.slice(0, 2).join('\n'), page_size: 20, max_pages: 2 },
    randomImpl: () => 0,
    timeoutImpl: (callback, ms, ...args) => {
      if (Number(ms) < 10000) {
        delayCalls.push(ms)
        Promise.resolve().then(() => callback(...args))
      }
      return { ms }
    },
    windowOverrides: {
      lib,
      __UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__: () => {},
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.data.length, 3)
  assert.deepEqual(JSON.parse(JSON.stringify(result.meta.shared.throttle_policy.page_delay_ms)), [1500, 3500])
  assert.deepEqual(JSON.parse(JSON.stringify(result.meta.shared.throttle_policy.item_delay_ms)), [4000, 8000])
  assert.deepEqual(calls.map(call => `${call.data.auctionNumId}:${call.data.pageNo}`), [
    '919643072179:1',
    '919643072179:2',
    '1023254962064:1',
  ])
  assert.equal(delayCalls.length, 2)
  assert.ok(delayCalls[0] >= 1500 && delayCalls[0] <= 3500, `page delay ${delayCalls[0]}ms is outside 1500-3500ms`)
  assert.ok(delayCalls[1] >= 4000 && delayCalls[1] <= 8000, `item delay ${delayCalls[1]}ms is outside 4000-8000ms`)
})

test('buyer reviews defaults to deep paging so 500 plus reviews are not capped at one page', async () => {
  const pages = {}
  for (let pageNo = 1; pageNo <= 30; pageNo += 1) {
    pages[pageNo] = {
      hasNext: pageNo < 30 ? 'true' : 'false',
      rateList: [
        {
          id: `DEFAULT-PAGE-${pageNo}`,
          auctionNumId: '919643072179',
          feedback: `第 ${pageNo} 页评价`,
          feedbackDate: '2026-05-01',
          reduceUserNick: `第${pageNo}页买家`,
        },
      ],
    }
  }
  const mtop = createMtopMock(pages)

  const result = await runScript({
    params: { item_links: SAMPLE_LINKS[0], page_size: 20 },
    windowOverrides: {
      lib: mtop.lib,
      __UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__: () => {},
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.shared.max_pages, 30)
  assert.equal(mtop.calls.length, 30)
  assert.equal(result.data.length, 30)
  assert.equal(result.data.at(-1).评价ID, 'DEFAULT-PAGE-30')
})

test('buyer reviews clamps page_size to 20 because tmall mtop truncates larger pages', async () => {
  const mtop = createMtopMock({
    1: {
      hasNext: 'false',
      rateList: [
        {
          id: 'CLAMPED-PAGE-SIZE',
          auctionNumId: '919643072179',
          feedback: '页大小被保护',
          feedbackDate: '2026-05-01',
          reduceUserNick: '保护买家',
        },
      ],
    },
  })

  const result = await runScript({
    params: { item_links: SAMPLE_LINKS[0], page_size: 50, max_pages: 1 },
    windowOverrides: {
      lib: mtop.lib,
      __UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__: () => {},
    },
  })

  assert.equal(result.success, true)
  assert.equal(result.meta.shared.page_size, 20)
  assert.equal(mtop.calls[0].data.pageSize, 20)
})

test('buyer reviews falls back to page embedded review data before remote fetch', async () => {
  const document = new FakeDocument('天猫 商品详情 累计评价')
  const embedded = {
    rateDetail: {
      rateList: [
        {
          id: 'EMBED-1',
          displayUserNick: '页面买家',
          rateContent: '页面已有评价',
          rateDate: '2026-05-04',
        },
      ],
      paginator: { items: 1 },
    },
  }
  const result = await runScript({
    params: { item_links: SAMPLE_LINKS[0] },
    document,
    fetchImpl: async () => { throw new Error('should not call fetch') },
    shared: { embeddedReviewPayloads: { '919643072179': embedded } },
  })

  assert.equal(result.success, true)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].评价ID, 'EMBED-1')
  assert.equal(result.data[0].数据来源, 'embedded')
})

test('buyer reviews only uses global embedded data for the matching current item', async () => {
  const document = new FakeDocument('天猫 商品详情 累计评价')
  const embedded = {
    rateDetail: {
      rateList: [
        {
          id: 'CURRENT-ONLY',
          displayUserNick: '当前页买家',
          rateContent: '只能属于当前页商品',
          rateDate: '2026-05-04',
        },
      ],
      paginator: { items: 1 },
    },
  }
  const fetchCalls = []
  const result = await runScript({
    params: { item_links: SAMPLE_LINKS.slice(0, 2).join('\n') },
    document,
    fetchImpl: async url => {
      fetchCalls.push(String(url))
      return {
        status: 200,
        ok: true,
        async json() {
          return {
            rateDetail: {
              rateList: [
                {
                  id: 'SECOND-ITEM',
                  displayUserNick: '第二个商品买家',
                  rateContent: '第二个商品评价',
                  rateDate: '2026-05-05',
                },
              ],
              paginator: { items: 1, lastPage: 1 },
            },
          }
        },
        async text() { return '' },
        clone() { return this },
      }
    },
    shared: { globalEmbeddedReviewPayload: embedded },
    href: SAMPLE_LINKS[0],
  })

  assert.equal(result.success, true)
  assert.equal(result.data.length, 2)
  assert.equal(result.data[0].商品ID, '919643072179')
  assert.equal(result.data[0].评价ID, 'CURRENT-ONLY')
  assert.equal(result.data[0].数据来源, 'embedded')
  assert.equal(result.data[1].商品ID, '1023254962064')
  assert.equal(result.data[1].评价ID, 'SECOND-ITEM')
  assert.equal(result.data[1].数据来源, 'api')
  assert.equal(fetchCalls.length, 1)
  assert.match(fetchCalls[0], /itemNumId=1023254962064/)
})

test('buyer reviews waits when tmall review API requires verification', async () => {
  const result = await runScript({
    params: { item_links: SAMPLE_LINKS[0] },
    fetchImpl: async () => ({
      status: 200,
      ok: true,
      async json() {
        return { ret: ['FAIL_SYS_USER_VALIDATE::需要验证'] }
      },
      async text() {
        return '{"ret":["FAIL_SYS_USER_VALIDATE::需要验证"]}'
      },
      clone() {
        return this
      },
    }),
  })

  assert.equal(result.success, true)
  assert.equal(result.data.length, 0)
  assert.equal(result.meta.action, 'next_phase')
  assert.equal(result.meta.next_phase, 'wait_verification')
  assert.match(result.meta.shared.captcha_reason, /验证|风控|FAIL_SYS_USER_VALIDATE/)
  assert.equal(result.meta.shared.resume_item_index, 0)
})

test('buyer reviews returns diagnostic row when tmall review API is unavailable', async () => {
  const result = await runScript({
    params: { item_links: SAMPLE_LINKS[0] },
    fetchImpl: async () => { throw new Error('network unavailable') },
  })

  assert.equal(result.success, true)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].商品ID, '919643072179')
  assert.equal(result.data[0].执行结果, '失败')
  assert.match(result.data[0].备注, /接口|network unavailable/)
  assert.equal(result.meta.shared.failed_items, 1)
})

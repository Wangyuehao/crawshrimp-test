# SHEIN Product Feedback Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional 商品SKC, 评价ID, and 评价星级 filters to the SHEIN 商品评价 export script.

**Architecture:** The manifest exposes the three filter inputs. The adapter keeps capturing the current `/goods/comment/list` request, then overlays non-empty requested filters onto the captured API payload during `prepare_template`. Collection reuses the prepared payload and existing pagination replay.

**Tech Stack:** JavaScript adapter executed in browser VM, YAML task manifest, Node `node:test` regression suite.

---

### Task 1: Add Regression Test For Requested Feedback Filters

**Files:**
- Modify: `tests/shein-product-feedback.test.js`

- [ ] **Step 1: Write the failing test**

Add this test after `product feedback prepare_template overrides review date range and resets captured totals`:

```js
test('product feedback prepare_template applies requested skc comment id and star filters', async () => {
  const document = new FakeDocument('商品评价')
  const shared = {
    captureResult: {
      matches: [
        {
          url: 'https://sso.geiwohuo.com/mgs-api-prefix/goods/comment/list',
          responseUrl: 'https://sso.geiwohuo.com/mgs-api-prefix/goods/comment/list',
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
          },
          postData: JSON.stringify({
            startCommentTime: '2026-01-21 00:00:00',
            commentEndTime: '2026-04-20 23:59:59',
            skc: 'old-skc',
            commentId: 'old-comment',
            goodsCommentStar: 5,
            page: 12,
            perPage: 30,
          }),
          body: JSON.stringify({
            code: '0',
            info: {
              data: [],
              meta: { count: 23312 },
            },
          }),
        },
      ],
    },
  }

  const result = await runScript({
    phase: 'prepare_template',
    params: {
      filter_skc: 'sk25021051271714212\nsa260303103351937770319',
      filter_comment_id: '18249209315',
      filter_star: '4',
    },
    shared,
    document,
  })

  assert.equal(result.success, true)
  const template = result.meta.shared.api_template
  assert.deepEqual(template.payload.skc, ['sk25021051271714212', 'sa260303103351937770319'])
  assert.equal(template.payload.commentId, '18249209315')
  assert.equal(template.payload.goodsCommentStar, 4)
  assert.match(template.filter_summary, /SKC=sk25021051271714212,sa260303103351937770319/)
  assert.match(template.filter_summary, /评价ID=18249209315/)
  assert.match(template.filter_summary, /星级=4星/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shein-product-feedback.test.js`

Expected: FAIL because the new filter params are ignored and payload values remain `old-skc`, `old-comment`, and `5`.

### Task 2: Implement Filter Params In Adapter

**Files:**
- Modify: `adapters/shein-helper/product-feedback.js`

- [ ] **Step 1: Add persisted requested filters**

Extend `persistedRequestShared` near the top of the file:

```js
requestedFeedbackFilters: normalizeFeedbackFilterParams(shared.requestedFeedbackFilters || {
  skc: params.filter_skc,
  commentId: params.filter_comment_id,
  star: params.filter_star,
}),
```

Add helpers after `normalizeDateRangeParam`:

```js
function splitFilterValues(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(/[\s,，;；]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function normalizeFeedbackFilterParams(value) {
  const source = value && typeof value === 'object' ? value : {}
  const starText = String(source.star || '').trim()
  return {
    skc: splitFilterValues(source.skc),
    commentId: splitFilterValues(source.commentId),
    star: /^[1-5]$/.test(starText) ? Number(starText) : '',
  }
}
```

- [ ] **Step 2: Apply requested filters to payload**

Add helpers before `applyRequestedReviewDateRange`:

```js
function pickPayloadKey(payload, candidates, fallback) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(payload || {}, key)) return key
  }
  return fallback
}

function assignTextFilter(payload, candidates, fallback, values) {
  if (!Array.isArray(values) || !values.length) return false
  const key = pickPayloadKey(payload, candidates, fallback)
  payload[key] = values.length === 1 ? values[0] : values
  return true
}

function applyRequestedFeedbackFilters(payload, requestedFilters) {
  const filterPayload = deepClone(payload, {})
  const filters = normalizeFeedbackFilterParams(requestedFilters)
  let changed = false
  changed = assignTextFilter(filterPayload, ['skc', 'goodsSkc', 'goodsSKC'], 'skc', filters.skc) || changed
  changed = assignTextFilter(filterPayload, ['commentId', 'comment_id', 'id'], 'commentId', filters.commentId) || changed
  if (filters.star) {
    const key = pickPayloadKey(filterPayload, ['goodsCommentStar', 'commentStar', 'star'], 'goodsCommentStar')
    filterPayload[key] = filters.star
    changed = true
  }
  return {
    filterPayload,
    filterSummary: summarizeFilters(filterPayload),
    changed,
  }
}
```

Update `buildTemplateFromCapture` to call `applyRequestedFeedbackFilters` after review date range is applied:

```js
const feedbackFilterResult = applyRequestedFeedbackFilters(
  reviewRangeResult.filterPayload,
  options.feedbackFilters,
)
const filterPayload = feedbackFilterResult.filterPayload
const filterSummary = feedbackFilterResult.filterSummary
const preserveCapturedTotals = !reviewRangeResult.changed && !feedbackFilterResult.changed
```

Pass filters from `prepare_template`:

```js
feedbackFilters: persistedRequestShared.requestedFeedbackFilters,
```

- [ ] **Step 3: Include summary labels**

Extend `summarizeFilters` mapping:

```js
['commentId', '评价ID'],
['comment_id', '评价ID'],
['id', '评价ID'],
['goodsSkc', 'SKC'],
['goodsSKC', 'SKC'],
['goodsCommentStar', '星级'],
['commentStar', '星级'],
['star', '星级'],
```

Format numeric star values as `N星` before adding to `parts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shein-product-feedback.test.js`

Expected: PASS.

### Task 3: Expose Filters In Manifest

**Files:**
- Modify: `adapters/shein-helper/manifest.yaml`

- [ ] **Step 1: Add params under `product_feedback`**

Add these params after `review_date_range`:

```yaml
      - id: filter_skc
        type: textarea
        label: 商品SKC
        rows: 2
        ui_span: compact
        hint: 支持多个 SKC，一行一个；留空则继承当前页面筛选
        placeholder: "例如：\nsk25021051271714212"
      - id: filter_comment_id
        type: textarea
        label: 评价ID
        rows: 2
        ui_span: compact
        hint: 支持多个评价ID，一行一个；留空则继承当前页面筛选
        placeholder: "例如：\n18249209315"
      - id: filter_star
        type: select
        label: 评价星级
        default: ""
        hint: 留空则继承当前页面筛选
        options:
          - value: ""
            label: 不额外指定
          - value: "1"
            label: 1星
          - value: "2"
            label: 2星
          - value: "3"
            label: 3星
          - value: "4"
            label: 4星
          - value: "5"
            label: 5星
```

- [ ] **Step 2: Run focused tests**

Run: `node --test tests/shein-product-feedback.test.js`

Expected: PASS.

### Task 4: Final Verification

**Files:**
- Read: `git diff -- adapters/shein-helper/product-feedback.js adapters/shein-helper/manifest.yaml tests/shein-product-feedback.test.js docs/superpowers/specs/2026-04-29-shein-product-feedback-filter-design.md docs/superpowers/plans/2026-04-29-shein-product-feedback-filters.md`

- [ ] **Step 1: Run regression test**

Run: `node --test tests/shein-product-feedback.test.js`

Expected: PASS.

- [ ] **Step 2: Inspect git diff**

Confirm only the SHEIN product feedback adapter, manifest, test, and new docs changed for this task.

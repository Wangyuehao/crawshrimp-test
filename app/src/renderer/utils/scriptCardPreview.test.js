import test from 'node:test'
import assert from 'node:assert/strict'

import { getScriptCardTaskPreviewMeta } from './scriptCardPreview.js'

test('script card preview uses three fixed rows', () => {
  const meta = getScriptCardTaskPreviewMeta({ tasks: [] })

  assert.equal(meta.maxRows, 3)
  assert.equal(meta.maxHeight, 90)
  assert.equal(meta.hiddenTaskCount, 0)
  assert.equal(meta.isOverflowing, false)
})

test('script card preview marks large task groups as overflowing', () => {
  const compactMeta = getScriptCardTaskPreviewMeta({
    tasks: new Array(6).fill(null).map((_, index) => ({ task_id: `task-${index}` })),
  })
  const overflowMeta = getScriptCardTaskPreviewMeta({
    tasks: new Array(7).fill(null).map((_, index) => ({ task_id: `task-${index}` })),
  })

  assert.equal(compactMeta.hiddenTaskCount, 0)
  assert.equal(overflowMeta.hiddenTaskCount, 1)
  assert.equal(compactMeta.isOverflowing, false)
  assert.equal(overflowMeta.isOverflowing, true)
})

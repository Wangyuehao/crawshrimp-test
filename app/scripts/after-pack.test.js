const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { requirePythonBundle } = require('./after-pack')

test('requirePythonBundle rejects missing bundled Python source', () => {
  const missing = path.join(__dirname, '..', '.missing-python-dist', 'win-x64')

  assert.throws(
    () => requirePythonBundle(missing),
    /bundled Python not found/
  )
})

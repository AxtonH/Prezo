import test from 'node:test'
import assert from 'node:assert/strict'

import {
  asText,
  clamp,
  extractApiErrorMessage,
  normalizeApiBase,
  normalizeCode,
  normalizeThemeName,
  parsePollSelector,
  parsePromptSelector,
  safeJsonParse,
  toInt,
  toWsBase
} from '../public/poc/gamified/poll-game-gamified-utils.js'

test('asText trims strings and rejects non-strings', () => {
  assert.equal(asText('  hi  '), 'hi')
  assert.equal(asText(42), '')
  assert.equal(asText(null), '')
})

test('numeric coercions', () => {
  assert.equal(clamp('5', 0, 10, 3), 5)
  assert.equal(clamp('nope', 0, 10, 3), 3)
  assert.equal(clamp(99, 0, 10, 3), 10)
  assert.equal(toInt('7.6'), 8)
  assert.equal(toInt(-3), 0)
  assert.equal(toInt('x'), 0)
})

test('api base and ws base normalization', () => {
  assert.equal(normalizeApiBase('https://x.example//'), 'https://x.example')
  assert.equal(toWsBase('https://x.example'), 'wss://x.example')
  assert.equal(toWsBase('http://x.example'), 'ws://x.example')
  assert.equal(toWsBase('not a url'), '')
})

test('code and theme-name normalization', () => {
  assert.equal(normalizeCode(' ab12 '), 'AB12')
  assert.equal(normalizeThemeName('  My   Theme  '), 'My Theme')
})

test('safeJsonParse never throws', () => {
  assert.deepEqual(safeJsonParse('{"a":1}'), { a: 1 })
  assert.equal(safeJsonParse('{oops'), null)
  assert.equal(safeJsonParse(''), null)
})

test('extractApiErrorMessage prefers detail, falls back to status', () => {
  assert.equal(extractApiErrorMessage({ detail: 'nope' }, 400), 'nope')
  assert.equal(extractApiErrorMessage({}, 502), 'Request failed (502)')
  assert.equal(
    extractApiErrorMessage({ detail: [{ msg: 'bad', loc: ['body', 'kind'] }] }, 422),
    'bad [body.kind]'
  )
})

test('poll selector parsing covers the descriptor forms', () => {
  assert.deepEqual(parsePollSelector(''), {
    mode: 'latestOpen',
    descriptor: 'latest/open',
    explicitId: ''
  })
  assert.equal(parsePollSelector('latest').mode, 'latest')
  assert.equal(parsePollSelector('open').mode, 'open')
  assert.deepEqual(parsePollSelector('poll-123'), {
    mode: 'id',
    descriptor: 'poll-123',
    explicitId: 'poll-123'
  })
})

test('prompt selector parsing: explicit id or latest-open fallback', () => {
  assert.equal(parsePromptSelector('').mode, 'latestOpen')
  assert.deepEqual(parsePromptSelector('prompt-9'), {
    mode: 'id',
    descriptor: 'prompt-9',
    explicitId: 'prompt-9'
  })
})

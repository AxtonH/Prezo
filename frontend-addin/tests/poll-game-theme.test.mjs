import test from 'node:test'
import assert from 'node:assert/strict'

import {
  defaultTheme,
  hexLuminance,
  hexToRgba,
  normalizeColorToHex,
  sanitizeAiThemePatch,
  sanitizeHex,
  sanitizeInlineColorValue,
  sanitizeOptionalDimension,
  sanitizeTheme,
  sanitizeVisualMode
} from '../public/poc/gamified/poll-game-gamified-theme.js'

test('sanitizeTheme fills every default and clamps ranges', () => {
  const clean = sanitizeTheme({})
  assert.deepEqual(clean, { ...defaultTheme })
  const clamped = sanitizeTheme({
    barHeight: 400,
    questionSize: 1,
    overlayOpacity: 9,
    bgA: 'not-a-color',
    fillA: '#ABC',
    visualMode: 'bogus',
    fontFamily: 'Comic { Sans }; drop'
  })
  assert.equal(clamped.barHeight, 44)
  assert.equal(clamped.questionSize, 42)
  assert.equal(clamped.overlayOpacity, 1)
  assert.equal(clamped.bgA, defaultTheme.bgA)
  assert.equal(clamped.fillA, '#ABC', 'short hex accepted')
  assert.equal(clamped.visualMode, defaultTheme.visualMode)
  assert.equal(clamped.fontFamily, 'Comic  Sans  drop')
})

test('sanitizeTheme migrates legacy title fields onto eyebrow + question', () => {
  const migrated = sanitizeTheme({ titleX: 40, titleY: -12, titleBoxWidth: 500 })
  assert.equal(migrated.eyebrowX, 40)
  assert.equal(migrated.questionX, 40)
  assert.equal(migrated.eyebrowY, -12)
  assert.equal(migrated.questionY, -12)
  assert.equal(migrated.questionBoxWidth, 500)
  assert.ok(!('titleX' in migrated))
})

test('sanitizeTheme scrubs per-option maps and deleted objects', () => {
  const clean = sanitizeTheme({
    optionOffsets: { o1: { x: 99999, y: -99999 }, '': { x: 1, y: 1 }, bad: 'nope' },
    optionScales: { o1: { x: 99, y: 0.01 } },
    deletedObjects: { logo: 1, '': true, asset: 0 }
  })
  assert.deepEqual(clean.optionOffsets, { o1: { x: 2400, y: -2400 } })
  assert.deepEqual(clean.optionScales, { o1: { x: 5, y: 0.25 } })
  assert.deepEqual(clean.deletedObjects, { logo: true })
})

test('gridVisible=false forces the grid off', () => {
  assert.equal(sanitizeTheme({ gridOpacity: 0.4, gridVisible: false }).gridOpacity, 0)
  assert.equal(sanitizeTheme({ gridOpacity: 0.4 }).gridOpacity, 0.4)
})

test('color utilities', () => {
  assert.equal(sanitizeHex('#a1b2c3', '#000'), '#a1b2c3')
  assert.equal(sanitizeHex('red', '#000'), '#000')
  assert.equal(hexToRgba('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)')
  assert.equal(hexToRgba('#f00', 2), 'rgba(255, 0, 0, 1)')
  assert.equal(hexLuminance('#ffffff'), 1)
  assert.equal(hexLuminance('nope'), null)
  assert.equal(normalizeColorToHex('rgb(255, 0, 0)'), '#ff0000')
  assert.equal(normalizeColorToHex('#ABCDEF'), '#abcdef')
  assert.equal(normalizeColorToHex('weird()'), '#16375e')
  assert.equal(sanitizeInlineColorValue('rgba(10, 20, 30, 0.5)'), 'rgb(10, 20, 30)')
  assert.equal(sanitizeInlineColorValue('rgb(50% 100% 0%)'), 'rgb(128, 255, 0)')
  assert.equal(sanitizeInlineColorValue('bogus'), '')
  assert.equal(sanitizeOptionalDimension('', 10, 100), null)
  assert.equal(sanitizeOptionalDimension(5, 10, 100), 10)
  assert.equal(sanitizeVisualMode('CLASSIC', 'artifact'), 'classic')
})

test('sanitizeAiThemePatch keeps allowed keys and falls back to the current theme', () => {
  const currentTheme = { ...defaultTheme, bgA: '#111111', barHeight: 20 }
  const patch = sanitizeAiThemePatch(
    {
      bgA: '#222222',
      bgB: 'not-a-color',
      barHeight: 9999,
      hackedKey: 'nope',
      visualMode: 'classic'
    },
    currentTheme
  )
  assert.equal(patch.bgA, '#222222')
  assert.equal(patch.bgB, currentTheme.bgB, 'invalid color falls back to current value')
  assert.ok(patch.barHeight <= 44, 'number clamped to allowed range')
  assert.ok(!('hackedKey' in patch))
  assert.equal(patch.visualMode, 'classic')
  assert.deepEqual(sanitizeAiThemePatch(null, currentTheme), {})
})

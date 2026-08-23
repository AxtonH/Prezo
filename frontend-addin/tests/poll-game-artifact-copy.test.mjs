import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildArtifactHiddenSelectors,
  buildArtifactHiddenCss
} from '../public/poc/gamified/poll-game-gamified-artifact-copy.js'

test('buildArtifactHiddenSelectors keeps specific cssLabel fallbacks (anchored + bare)', () => {
  const sels = buildArtifactHiddenSelectors('t1', {
    hidden: true,
    role: 'element',
    cssLabel: 'div.logo',
    anchor: '#fg'
  })
  assert.ok(sels.includes('#fg div.logo'), 'anchored form emitted')
  assert.ok(sels.includes('div.logo'), 'specific (classed) bare fallback still emitted')
})

test('buildArtifactHiddenSelectors never emits an unscoped bare-tag selector when anchored', () => {
  const sels = buildArtifactHiddenSelectors('t2', {
    hidden: true,
    role: 'text',
    cssLabel: 'small',
    anchor: '[data-option-id="opt-1"]'
  })
  assert.ok(sels.includes('[data-option-id="opt-1"] small'), 'anchored form emitted')
  assert.ok(!sels.includes('small'), 'bare tag must not become a document-wide hide')
})

test('buildArtifactHiddenSelectors keeps a bare-tag selector only when there is no anchor', () => {
  const sels = buildArtifactHiddenSelectors('t3', {
    hidden: true,
    role: 'element',
    cssLabel: 'img',
    anchor: ''
  })
  assert.ok(sels.includes('img'), 'no anchor to scope with — bare tag is the only handle left')
})

test('buildArtifactHiddenCss builds rules from __prezo_hidden entries without bare-tag leaks', () => {
  const css = buildArtifactHiddenCss({
    '__prezo_hidden:t1': JSON.stringify({
      hidden: true,
      role: 'element',
      cssLabel: 'div.logo',
      anchor: '#fg',
      label: 'div.logo'
    }),
    '__prezo_hidden:t2': JSON.stringify({
      hidden: true,
      role: 'text',
      cssLabel: 'small',
      anchor: '[data-option-id="opt-1"]',
      label: 'Text'
    })
  })
  assert.ok(css.includes('#fg div.logo'), 'anchored logo selector present')
  assert.ok(css.includes('[data-option-id="opt-1"] small'), 'anchored small selector present')
  const selectorText = css.slice(0, css.indexOf('{'))
  const selectors = selectorText.split(',').map((s) => s.trim())
  assert.ok(!selectors.includes('small'), 'no document-wide bare-tag rule')
  assert.ok(css.includes('visibility: hidden !important'), 'hide declaration intact')
})

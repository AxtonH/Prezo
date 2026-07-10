import test from 'node:test'
import assert from 'node:assert/strict'

import { createOverrideDiff } from '../public/poc/gamified/poll-game-gamified-override-diff.js'

function makeDiff() {
  const pending = {}
  const state = { artifact: { savedStyleOverrides: {} } }
  const diff = createOverrideDiff({
    state,
    el: {},
    getPendingStyleOverrides: () => pending
  })
  return { diff, state, pending }
}

// extractPlainTextFromHtml needs document; a naive tag-strip covers the
// controlled inputs here.
function installDomStub() {
  globalThis.document = {
    createElement: () => {
      const el = { _html: '' }
      Object.defineProperty(el, 'innerHTML', {
        set: (value) => {
          el._html = String(value)
        }
      })
      Object.defineProperty(el, 'textContent', {
        get: () => el._html.replace(/<[^>]*>/g, '')
      })
      return el
    }
  }
  return () => {
    delete globalThis.document
  }
}

test('pruneStalePollStyleOverridesInStore drops copy that no longer matches the live poll', () => {
  const restore = installDomStub()
  try {
    const { diff } = makeDiff()
    const store = {
      question: '<span style="color: red">Best  color?</span>',
      'option-label:o1': '<b>Red</b>',
      'option-label:o2': '<b>Old label</b>',
      'option-label:gone': '<b>Whatever</b>',
      unrelated: 'kept'
    }
    diff.pruneStalePollStyleOverridesInStore(store, {
      question: 'Best color?',
      options: [
        { id: 'o1', label: 'Red' },
        { id: 'o2', label: 'Blue' }
      ]
    })
    assert.ok('question' in store, 'matching question kept (whitespace-insensitive)')
    assert.ok('option-label:o1' in store, 'matching label kept')
    assert.ok(!('option-label:o2' in store), 'mismatched label dropped')
    assert.ok(!('option-label:gone' in store), 'label for a removed option dropped')
    assert.ok('unrelated' in store, 'non-copy keys untouched')
  } finally {
    restore()
  }
})

test('pruneStalePollStyleOverrides runs over both saved and pending stores', () => {
  const restore = installDomStub()
  try {
    const { diff, state, pending } = makeDiff()
    state.artifact.savedStyleOverrides = { question: '<b>Old?</b>' }
    pending.question = '<b>Also old?</b>'
    diff.pruneStalePollStyleOverrides({ question: 'New question?', options: [] })
    assert.deepEqual(state.artifact.savedStyleOverrides, {})
    assert.deepEqual(pending, {})
  } finally {
    restore()
  }
})

test('dropOverridesAiChanged keeps everything when the HTML is unchanged or unlocatable', () => {
  const { diff } = makeDiff()
  const store = { question: '<b>x</b>', 'option-label:o1': 'y' }
  // Identical prior/new HTML: early return, no DOMParser needed.
  diff.dropOverridesAiChanged(store, '<html>same</html>', '<html>same</html>')
  assert.deepEqual(Object.keys(store), ['question', 'option-label:o1'])

  // Docs where nothing can be located: conservative keep-all.
  globalThis.DOMParser = class {
    parseFromString() {
      return {
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        body: null
      }
    }
  }
  try {
    diff.dropOverridesAiChanged(store, '<html>a</html>', '<html>b</html>')
    assert.deepEqual(
      Object.keys(store),
      ['question', 'option-label:o1'],
      'overrides that cannot be located in BOTH documents survive'
    )
  } finally {
    delete globalThis.DOMParser
  }
})

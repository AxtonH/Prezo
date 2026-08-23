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

// ---------------------------------------------------------------------------
// __prezo_hidden reconciliation. dropOverridesAiChanged needs real selector
// matching, which node:test has no DOM for — this fake implements just the
// selector forms the hidden branch exercises: `tag`, `.class`, `#id`,
// `tag.class`, `tag#id`, `[attr="value"]` (with optional ` i` flag), `*`,
// and comma lists.
// ---------------------------------------------------------------------------
class FakeEl {
  constructor(tag, attrs = {}, children = [], text = '') {
    this.tagName = tag.toUpperCase()
    this.nodeType = 1
    this.attrs = { ...attrs }
    this.children = []
    this.parentElement = null
    this._text = text
    for (const child of children) this.appendChild(child)
  }
  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }
  get id() {
    return this.attrs.id || ''
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('')
  }
  _all() {
    const out = []
    const walk = (node) => {
      for (const child of node.children) {
        out.push(child)
        walk(child)
      }
    }
    walk(this)
    return out
  }
  matches(selector) {
    const sel = String(selector).trim()
    if (sel === '*') return true
    const attrMatch = sel.match(/^\[([a-zA-Z-]+)="((?:[^"\\]|\\.)*)"(\s+i)?\]$/)
    if (attrMatch) {
      const got = this.getAttribute(attrMatch[1])
      if (got == null) return false
      const want = attrMatch[2].replace(/\\(.)/g, '$1')
      return attrMatch[3] ? got.toLowerCase() === want.toLowerCase() : got === want
    }
    const m = sel.match(/^([a-zA-Z][a-zA-Z0-9-]*)?(?:#([\w-]+))?(?:\.([\w-]+))?$/)
    if (!m || (!m[1] && !m[2] && !m[3])) return false
    if (m[1] && this.tagName.toLowerCase() !== m[1].toLowerCase()) return false
    if (m[2] && this.id !== m[2]) return false
    if (m[3]) {
      const classes = (this.getAttribute('class') || '').split(/\s+/)
      if (!classes.includes(m[3])) return false
    }
    return true
  }
  querySelector(selector) {
    const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean)
    for (const node of this._all()) {
      for (const part of parts) {
        if (node.matches(part)) return node
      }
    }
    return null
  }
  querySelectorAll(selector) {
    const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean)
    return this._all().filter((node) => parts.some((part) => node.matches(part)))
  }
}

function makeFakeDoc(children) {
  const body = new FakeEl('body', {}, children)
  return {
    body,
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    getElementById: (id) => body.querySelector(`#${id}`)
  }
}

function installFakeDomParser(docsByHtml) {
  globalThis.DOMParser = class {
    parseFromString(html) {
      return docsByHtml.get(html)
    }
  }
  return () => {
    delete globalThis.DOMParser
  }
}

const LOGO_HIDE_KEY = '__prezo_hidden:t1'
const LOGO_HIDE_META = JSON.stringify({
  hidden: true,
  label: 'div.logo',
  cssLabel: 'div.logo',
  role: 'element',
  anchor: '#fg'
})

function makeLogoDoc({ extraLogo = false, logoStyle = '', dropLogo = false, styleText = '' } = {}) {
  const fgChildren = []
  if (!dropLogo) {
    const attrs = { class: 'logo' }
    if (logoStyle) attrs.style = logoStyle
    fgChildren.push(new FakeEl('div', attrs, [], 'BLK'))
  }
  if (extraLogo) {
    fgChildren.push(new FakeEl('div', { class: 'logo logo-top-right' }, [], 'NEW'))
  }
  const children = [new FakeEl('div', { id: 'fg' }, fgChildren)]
  if (styleText) {
    children.push(new FakeEl('style', {}, [], styleText))
  }
  return makeFakeDoc(children)
}

function runHiddenDiff(priorDoc, nextDoc, store) {
  const docs = new Map([
    ['PRIOR', priorDoc],
    ['NEXT', nextDoc]
  ])
  const restore = installFakeDomParser(docs)
  try {
    const { diff } = makeDiff()
    diff.dropOverridesAiChanged(store, 'PRIOR', 'NEXT')
  } finally {
    restore()
  }
  return store
}

test('hidden override survives when the AI leaves the element alone', () => {
  const store = { [LOGO_HIDE_KEY]: LOGO_HIDE_META }
  runHiddenDiff(makeLogoDoc(), makeLogoDoc(), store)
  assert.ok(LOGO_HIDE_KEY in store, 'untouched element: the manual delete still applies')
})

test('hidden override drops when the AI adds a new element matching the hide selector', () => {
  const store = { [LOGO_HIDE_KEY]: LOGO_HIDE_META }
  runHiddenDiff(makeLogoDoc(), makeLogoDoc({ extraLogo: true }), store)
  assert.ok(!(LOGO_HIDE_KEY in store), 'stale hide must not swallow the AI-added logo')
})

test('hidden override drops when the AI removed the element', () => {
  const store = { [LOGO_HIDE_KEY]: LOGO_HIDE_META }
  runHiddenDiff(makeLogoDoc(), makeLogoDoc({ dropLogo: true }), store)
  assert.ok(!(LOGO_HIDE_KEY in store), 'hide for an element the AI removed is moot and dangerous')
})

test('hidden override drops when the AI rewrote the element markup', () => {
  const store = { [LOGO_HIDE_KEY]: LOGO_HIDE_META }
  runHiddenDiff(makeLogoDoc(), makeLogoDoc({ logoStyle: 'position:absolute; top:12px; right:12px' }), store)
  assert.ok(!(LOGO_HIDE_KEY in store), 'AI changed the element — the AI edit wins over the stale hide')
})

test('hidden override drops when stylesheet rules for the element changed', () => {
  const store = { [LOGO_HIDE_KEY]: LOGO_HIDE_META }
  runHiddenDiff(
    makeLogoDoc(),
    makeLogoDoc({ styleText: '.logo { position: absolute; top: 20px; right: 20px; }' }),
    store
  )
  assert.ok(!(LOGO_HIDE_KEY in store), 'AI moved the element via CSS rules — the stale hide yields')
})

test('hidden override for a runtime-rendered element is kept', () => {
  const store = {
    '__prezo_hidden:t9': JSON.stringify({
      hidden: true,
      label: 'Option Label',
      cssLabel: 'div.leader-badge',
      role: 'option-label',
      optionId: 'opt-1',
      anchor: '[data-option-id="opt-1"]'
    })
  }
  // Neither doc contains the runtime-rendered element.
  runHiddenDiff(makeLogoDoc(), makeLogoDoc(), store)
  assert.ok('__prezo_hidden:t9' in store, 'untraceable in static HTML: conservative keep')
})

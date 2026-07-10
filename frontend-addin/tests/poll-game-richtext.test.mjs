import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getEyebrowTextKey,
  getFooterTextKey,
  getOptionStatsTextKey,
  getOptionTextKey,
  getOptionsStateTextKey,
  getQuestionStateTextKey,
  getQuestionTextKey,
  getStatusTextKey,
  getVotesTextKey,
  isLiveBoundTextKey,
  isPollQuestionTextKey,
  isStaleQuestionOverride,
  loadTextOverrides,
  sanitizeFontStyleValue,
  sanitizeFontWeightValue,
  sanitizeInlineFontFamilyValue,
  sanitizeInlineFontSizeValue,
  sanitizeInlineTextStyle,
  sanitizeRichTextHtml,
  sanitizeTextDecorationValue,
  sanitizeTextOverridesMap,
  saveTextOverrides,
  textToRichHtml
} from '../public/poc/gamified/poll-game-gamified-richtext.js'

// sanitizeRichTextHtml rebuilds nodes through real DOM traversal, so the test
// installs a micro-DOM: a tiny parser/serializer that handles the controlled
// inputs below (plain tags, optional style="..." attributes, text). This
// exercises the actual allowlist logic — which tags survive, which unwrap,
// which style declarations pass — not a stub that returns ''.
class FakeNode {
  constructor(nodeType) {
    this.nodeType = nodeType
    this.childNodes = []
  }
  appendChild(child) {
    if (child.nodeType === 11) {
      this.childNodes.push(...child.childNodes)
      child.childNodes = []
    } else {
      this.childNodes.push(child)
    }
    return child
  }
}

class FakeText extends FakeNode {
  constructor(text) {
    super(3)
    this.textContent = text
  }
}

class FakeElement extends FakeNode {
  constructor(tag) {
    super(1)
    this.tagName = tag.toUpperCase()
    this.attrs = {}
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value)
  }
  getAttribute(key) {
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null
  }
  set innerHTML(html) {
    this.childNodes = parseHtml(String(html))
  }
  get innerHTML() {
    return this.childNodes.map(serializeNode).join('')
  }
  get textContent() {
    return this.childNodes
      .map((child) => (child.nodeType === 3 ? child.textContent : child.textContent))
      .join('')
  }
}

function parseHtml(html) {
  const root = new FakeNode(11)
  const stack = [root]
  const tokens = html.match(/<\/?[a-zA-Z][^>]*>|[^<]+/g) ?? []
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      stack[stack.length - 1].appendChild(new FakeText(token))
      continue
    }
    if (token.startsWith('</')) {
      if (stack.length > 1) {
        stack.pop()
      }
      continue
    }
    const match = /^<([a-zA-Z0-9]+)([^>]*)>$/.exec(token)
    const element = new FakeElement(match[1])
    const styleMatch = /style="([^"]*)"/.exec(match[2])
    if (styleMatch) {
      element.attrs.style = styleMatch[1]
    }
    stack[stack.length - 1].appendChild(element)
    if (element.tagName !== 'BR') {
      stack.push(element)
    }
  }
  return root.childNodes
}

function serializeNode(node) {
  if (node.nodeType === 3) {
    return node.textContent
  }
  const tag = node.tagName.toLowerCase()
  if (tag === 'br') {
    return '<br>'
  }
  const style = node.attrs.style ? ` style="${node.attrs.style}"` : ''
  return `<${tag}${style}>${node.childNodes.map(serializeNode).join('')}</${tag}>`
}

function installDomStub() {
  globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 }
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
    createDocumentFragment: () => new FakeNode(11)
  }
  return () => {
    delete globalThis.Node
    delete globalThis.document
  }
}

test('sanitizeRichTextHtml keeps the inline allowlist and unwraps everything else', () => {
  const restore = installDomStub()
  try {
    assert.equal(sanitizeRichTextHtml('<b>bold</b> and <em>it</em>'), '<b>bold</b> and <em>it</em>')
    assert.equal(sanitizeRichTextHtml('line<br>break'), 'line<br>break')
    assert.equal(
      sanitizeRichTextHtml('<script>alert(1)</script> after'),
      'alert(1) after',
      'disallowed tags unwrap to their text'
    )
    assert.equal(
      sanitizeRichTextHtml('<div><u>kept</u></div>'),
      '<u>kept</u>',
      'wrappers unwrap, allowed children survive'
    )
    assert.equal(sanitizeRichTextHtml(null), '')
    assert.equal(sanitizeRichTextHtml(42), '')
  } finally {
    restore()
  }
})

test('sanitizeRichTextHtml filters span styles through the inline allowlist', () => {
  const restore = installDomStub()
  try {
    assert.equal(
      sanitizeRichTextHtml('<span style="color: rgb(255, 0, 0); position: absolute">x</span>'),
      '<span style="color: rgb(255, 0, 0)">x</span>',
      'dangerous declarations dropped, safe ones kept'
    )
    assert.equal(
      sanitizeRichTextHtml('<span style="position: absolute">x</span>'),
      'x',
      'a span with no safe styles unwraps entirely'
    )
  } finally {
    restore()
  }
})

test('sanitizeTextOverridesMap keeps only string entries and sanitizes them', () => {
  const restore = installDomStub()
  try {
    const map = sanitizeTextOverridesMap({
      'chrome:eyebrow': '<b>Live</b><script>x</script>',
      'poll:1:question': 42,
      '': 'nope'
    })
    assert.deepEqual(map, { 'chrome:eyebrow': '<b>Live</b>x' })
    assert.deepEqual(sanitizeTextOverridesMap(null), {})
    assert.deepEqual(sanitizeTextOverridesMap('text'), {})
  } finally {
    restore()
  }
})

test('overrides round-trip through localStorage', () => {
  const restore = installDomStub()
  const store = {}
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value)
    }
  }
  try {
    saveTextOverrides({ 'chrome:eyebrow': '<b>Hi</b>' })
    assert.deepEqual(loadTextOverrides(), { 'chrome:eyebrow': '<b>Hi</b>' })
    store['prezo.poll-game-poc.text-overrides.v1'] = 'not json'
    assert.deepEqual(loadTextOverrides(), {}, 'corrupt storage degrades to empty')
  } finally {
    delete globalThis.localStorage
    restore()
  }
})

test('sanitizeInlineTextStyle allows exactly the six text properties', () => {
  assert.equal(
    sanitizeInlineTextStyle(
      'font-weight: bold; font-style: italic; text-decoration-line: underline wavy; color: #ff0000; position: fixed; behavior: url(x)'
    ),
    'font-weight: bold; font-style: italic; text-decoration: underline; color: #ff0000'
  )
  assert.equal(
    sanitizeInlineTextStyle('color: rgba(10, 20, 30, 0.5)'),
    'color: rgb(10, 20, 30)',
    'alpha colors flatten to rgb'
  )
  assert.equal(sanitizeInlineTextStyle('position: fixed'), '')
  assert.equal(sanitizeInlineTextStyle(''), '')
})

test('individual style value sanitizers clamp and reject', () => {
  assert.equal(sanitizeFontWeightValue('700'), '700')
  assert.equal(sanitizeFontWeightValue('950'), '', 'only x00 weights pass')
  assert.equal(sanitizeFontStyleValue('oblique'), '')
  assert.equal(sanitizeTextDecorationValue('underline dotted'), 'underline')
  assert.equal(sanitizeTextDecorationValue('none'), 'none')
  assert.equal(sanitizeTextDecorationValue('blink'), '')
  assert.equal(sanitizeInlineFontFamilyValue('Segoe UI, Arial'), '"Segoe UI", Arial')
  assert.equal(sanitizeInlineFontSizeValue('900px'), '300px', 'font size clamps to 300')
  assert.equal(sanitizeInlineFontSizeValue('2px'), '4px', 'font size clamps up to 4')
  assert.equal(sanitizeInlineFontSizeValue('12vh'), '', 'unknown units rejected')
})

test('textToRichHtml escapes markup and preserves line breaks', () => {
  assert.equal(textToRichHtml('a <b> c\r\nd\re'), 'a &lt;b&gt; c<br>d<br>e')
  assert.equal(textToRichHtml(null), '')
})

test('text keys are stable and fall back to placeholders', () => {
  assert.equal(getQuestionTextKey({ id: 'p1' }), 'poll:p1:question')
  assert.equal(getQuestionTextKey(null), 'poll:unknown:question')
  assert.equal(getQuestionStateTextKey(''), 'chrome:question-state:default')
  assert.equal(getEyebrowTextKey(), 'chrome:eyebrow')
  assert.equal(getStatusTextKey(), 'chrome:status')
  assert.equal(getVotesTextKey(), 'chrome:votes')
  assert.equal(getFooterTextKey(), 'chrome:footer')
  assert.equal(getOptionTextKey({ id: 'p1' }, { id: 'o1' }, 0), 'poll:p1:option:o1')
  assert.equal(getOptionTextKey({ id: 'p1' }, {}, 2), 'poll:p1:option:index-2')
  assert.equal(getOptionStatsTextKey({ id: 'p1' }, { id: 'o1' }, 0), 'poll:p1:option:o1:stats')
  assert.equal(getOptionsStateTextKey('waiting'), 'chrome:options-state:waiting')
})

test('live-bound keys refuse overrides; poll question keys detect stale placeholders', () => {
  const restore = installDomStub()
  try {
    assert.equal(isLiveBoundTextKey('chrome:status'), true)
    assert.equal(isLiveBoundTextKey('poll:p1:option:o1:stats'), true)
    assert.equal(isLiveBoundTextKey('poll:p1:option:o1'), false)
    assert.equal(isLiveBoundTextKey('chrome:eyebrow'), false)
    assert.equal(isPollQuestionTextKey('poll:p1:question'), true)
    assert.equal(isPollQuestionTextKey('poll:p1:option:o1'), false)
    assert.equal(isStaleQuestionOverride('Waiting for poll data...'), true)
    assert.equal(isStaleQuestionOverride('<b>Real question?</b>'), false)
  } finally {
    restore()
  }
})

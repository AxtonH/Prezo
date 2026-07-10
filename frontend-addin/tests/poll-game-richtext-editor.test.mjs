import test from 'node:test'
import assert from 'node:assert/strict'

import { createRichTextEditor } from '../public/poc/gamified/poll-game-gamified-richtext-editor.js'
import {
  TEXT_FONT_FAMILIES,
  TEXT_FONT_SIZES,
  TEXT_OVERRIDES_KEY
} from '../public/poc/gamified/poll-game-gamified-constants.js'

// The selection machinery itself needs a browser (ranges, execCommand); these
// tests cover the editor's pure seams and the renderRichText host lifecycle,
// which only needs an element stub and localStorage.
function makeOptionEl() {
  return { value: '', textContent: '', style: {} }
}

function makeSelectEl() {
  const select = {
    value: '',
    options: [],
    appendChild(option) {
      select.options.push(option)
    }
  }
  Object.defineProperty(select, 'innerHTML', {
    set: () => {
      select.options = []
    }
  })
  return select
}

function makeHostEl() {
  return {
    classList: {
      added: [],
      add(name) {
        this.added.push(name)
      },
      contains: () => false
    },
    attrs: {},
    setAttribute(key, value) {
      this.attrs[key] = value
    },
    dataset: {},
    innerHTML: ''
  }
}

function installDomStub() {
  const store = {}
  globalThis.document = {
    activeElement: null,
    createElement: (tag) => {
      if (tag === 'option') {
        return makeOptionEl()
      }
      // extractPlainTextFromHtml probe: naive tag-strip is enough for the
      // controlled inputs below.
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
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value)
    }
  }
  return {
    store,
    restore() {
      delete globalThis.document
      delete globalThis.localStorage
    }
  }
}

function makeEditor() {
  const state = {
    textOverrides: {},
    activeTextHost: null,
    activeInlineStyleNode: null,
    isSyncingTextStyleControls: false
  }
  const historyState = { applying: false }
  const editor = createRichTextEditor({
    state,
    el: {},
    historyState,
    getCurrentTheme: () => ({ fontFamily: TEXT_FONT_FAMILIES[0], textMain: '#16375e' }),
    recordHistoryCheckpoint: () => {},
    renderFromSnapshot: () => {},
    scheduleTypingHistoryCheckpoint: () => {},
    setupArtifactTextToolbar: () => {}
  })
  return { editor, state }
}

test('renderRichText applies overrides and marks the node editable', () => {
  const dom = installDomStub()
  try {
    const { editor, state } = makeEditor()
    state.textOverrides['chrome:eyebrow'] = '<b>Live polls</b>'
    const node = makeHostEl()
    editor.renderRichText(node, 'chrome:eyebrow', 'fallback text')
    assert.equal(node.innerHTML, '<b>Live polls</b>')
    assert.equal(node.dataset.richTextHtml, '<b>Live polls</b>')
    assert.equal(node.dataset.textKey, 'chrome:eyebrow')
    assert.ok(node.classList.added.includes('rich-text-editable'))
    assert.equal(node.attrs.contenteditable, 'true')
  } finally {
    dom.restore()
  }
})

test('renderRichText refuses overrides on live-bound keys and purges them', () => {
  const dom = installDomStub()
  try {
    const { editor, state } = makeEditor()
    state.textOverrides['chrome:status'] = 'stale override'
    const node = makeHostEl()
    editor.renderRichText(node, 'chrome:status', 'Live & open')
    assert.equal(node.innerHTML, 'Live &amp; open', 'fallback rendered through textToRichHtml')
    assert.ok(!('chrome:status' in state.textOverrides), 'live-bound override deleted')
    assert.ok(dom.store[TEXT_OVERRIDES_KEY].includes('{}'), 'purge persisted')
  } finally {
    dom.restore()
  }
})

test('renderRichText drops stale question placeholders captured as overrides', () => {
  const dom = installDomStub()
  try {
    const { editor, state } = makeEditor()
    state.textOverrides['poll:p1:question'] = 'Waiting for poll data...'
    const node = makeHostEl()
    editor.renderRichText(node, 'poll:p1:question', 'Real question?')
    assert.equal(node.innerHTML, 'Real question?')
    assert.ok(!('poll:p1:question' in state.textOverrides))
  } finally {
    dom.restore()
  }
})

test('fillSelectOptions dedupes by value; syncTextSelectOption creates missing options', () => {
  const dom = installDomStub()
  try {
    const { editor } = makeEditor()
    const select = makeSelectEl()
    editor.fillSelectOptions(
      [select],
      [
        { label: 'Arial', value: 'Arial' },
        { label: 'ARIAL', value: 'ARIAL' },
        { label: 'Empty', value: '' },
        { label: 'Georgia', value: 'Georgia', style: 'font-family: Georgia' }
      ]
    )
    assert.deepEqual(
      select.options.map((option) => option.value),
      ['Arial', 'Georgia']
    )
    assert.equal(select.options[1].style.cssText, 'font-family: Georgia')

    editor.syncTextSelectOption([select], 'Custom Font')
    assert.equal(select.value, 'Custom Font')
    assert.equal(select.options.length, 3, 'missing option appended')
    editor.syncTextSelectOption([select], 'Georgia')
    assert.equal(select.options.length, 3, 'existing option reused')
  } finally {
    dom.restore()
  }
})

test('font choice and size normalizers snap to the configured lists', () => {
  const dom = installDomStub()
  try {
    const { editor } = makeEditor()
    const canonical = TEXT_FONT_FAMILIES[0]
    assert.equal(editor.normalizeFontFamilyChoice(canonical.toUpperCase()), canonical)
    assert.equal(
      editor.normalizeFontFamilyChoice('"Some Custom", sans-serif'),
      'Some Custom',
      'unknown families keep their primary name'
    )
    assert.equal(editor.extractFontFamilyName("'Quoted Name', serif"), 'Quoted Name')
    assert.equal(editor.normalizeFontSizeChoice('nope'), '')
    assert.equal(
      editor.normalizeFontSizeChoice(TEXT_FONT_SIZES[0] + 0.4),
      String(TEXT_FONT_SIZES[0]),
      'snaps to closest configured size'
    )
    assert.equal(editor.normalizeFontSizeCss('12'), '12pt', 'bare numbers default to points')
    assert.equal(editor.normalizeFontSizeCss('900px'), '300px', 'clamps to 300')
    assert.equal(editor.normalizeFontSizeCss('0pt'), '')
    assert.equal(editor.pxToPoints('96px'), 72)
    assert.equal(editor.pxToPoints('garbage'), 24, 'unparseable px falls back to 24pt')
  } finally {
    dom.restore()
  }
})

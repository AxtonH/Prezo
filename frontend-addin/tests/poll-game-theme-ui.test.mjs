import test from 'node:test'
import assert from 'node:assert/strict'

import { createThemeEditor } from '../public/poc/gamified/poll-game-gamified-theme-ui.js'
import { defaultTheme } from '../public/poc/gamified/poll-game-gamified-theme.js'

// The editor owns the theme panel DOM: controls resolve through
// document.getElementById and applyTheme writes CSS variables onto
// document.documentElement. Both are stubbed; the canvas-object helpers are
// injected spies, exactly like the app wires them.
function makeInput() {
  const input = {
    value: '',
    checked: false,
    listeners: {},
    addEventListener(name, fn) {
      input.listeners[name] = fn
    },
    trigger(name, event = {}) {
      input.listeners[name]?.({
        preventDefault() {},
        stopPropagation() {},
        ...event
      })
    },
    classList: {
      state: {},
      add(name) {
        input.classList.state[name] = true
      },
      remove(name) {
        input.classList.state[name] = false
      },
      toggle(name, force) {
        input.classList.state[name] = Boolean(force)
      }
    },
    style: {},
    hidden: false,
    contains: () => false,
    click() {},
    querySelector: () => null
  }
  return input
}

function installDomStub(registry = {}) {
  const rootStyle = {
    props: {},
    setProperty(key, value) {
      rootStyle.props[key] = value
    }
  }
  globalThis.document = {
    getElementById: (id) => registry[id] ?? null,
    documentElement: { style: rootStyle }
  }
  globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} }
  return {
    rootStyle,
    restore() {
      delete globalThis.document
      delete globalThis.window
    }
  }
}

function makeEditor({ registry = {}, state: stateOverrides = {}, theme = {} } = {}) {
  const dom = installDomStub(registry)
  const state = {
    snapshot: null,
    artifact: { busy: false, lastPrompt: 'old prompt', lastAnswers: { keep: true } },
    ...stateOverrides
  }
  const historyState = { applying: false }
  const styleEl = () => ({ style: {}, classList: makeInput().classList })
  const el = {
    bgImage: styleEl(),
    bgOverlay: styleEl(),
    gridBg: styleEl(),
    headLeft: styleEl(),
    metaBar: styleEl(),
    footer: styleEl(),
    customLogo: styleEl(),
    customAsset: styleEl()
  }
  let currentTheme = { ...defaultTheme, ...theme }
  const calls = {
    saveThemeDraft: 0,
    recordHistoryCheckpoint: [],
    renderFromSnapshot: 0,
    postVisualModeToParent: [],
    clearArtifactMarkup: 0,
    resetArtifactConversation: 0,
    hideArtifactStage: 0,
    showThemeFeedback: [],
    applyElementOffset: [],
    applyElementBoxSize: [],
    applyHeaderTextObjects: 0,
    applyImageAsset: [],
    applyDeletedStaticTargets: 0,
    syncArtifactComposerVisibility: 0,
    scheduleResizeSelectionUpdate: 0
  }
  const editor = createThemeEditor({
    state,
    el,
    historyState,
    getCurrentTheme: () => currentTheme,
    setCurrentTheme: (nextTheme) => {
      currentTheme = nextTheme
    },
    saveThemeDraft: () => {
      calls.saveThemeDraft += 1
    },
    recordHistoryCheckpoint: (label) => {
      calls.recordHistoryCheckpoint.push(label)
    },
    renderFromSnapshot: () => {
      calls.renderFromSnapshot += 1
    },
    postVisualModeToParent: (reason) => {
      calls.postVisualModeToParent.push(reason)
    },
    clearArtifactMarkup: () => {
      calls.clearArtifactMarkup += 1
    },
    resetArtifactConversation: () => {
      calls.resetArtifactConversation += 1
    },
    hideArtifactStage: () => {
      calls.hideArtifactStage += 1
    },
    showThemeFeedback: (text, type) => {
      calls.showThemeFeedback.push({ text, type })
    },
    applyElementOffset: (node, x, y) => {
      calls.applyElementOffset.push({ node, x, y })
    },
    applyElementBoxSize: (node, width, height) => {
      calls.applyElementBoxSize.push({ node, width, height })
    },
    applyHeaderTextObjects: () => {
      calls.applyHeaderTextObjects += 1
    },
    applyImageAsset: (node, options) => {
      calls.applyImageAsset.push({ node, options })
    },
    applyDeletedStaticTargets: () => {
      calls.applyDeletedStaticTargets += 1
    },
    syncArtifactComposerVisibility: () => {
      calls.syncArtifactComposerVisibility += 1
    },
    scheduleResizeSelectionUpdate: () => {
      calls.scheduleResizeSelectionUpdate += 1
    }
  })
  return { editor, el, state, historyState, calls, dom, getTheme: () => currentTheme }
}

test('updateTheme sanitizes the patch, persists, records history, and repaints', () => {
  const { editor, calls, dom, getTheme } = makeEditor()
  try {
    editor.updateTheme({ bgA: '#222222', barHeight: 9999 })
    assert.equal(getTheme().bgA, '#222222')
    assert.ok(getTheme().barHeight <= 44, 'patch runs through sanitizeTheme')
    assert.equal(calls.saveThemeDraft, 1)
    assert.deepEqual(calls.recordHistoryCheckpoint, ['Update design'])
    assert.equal(dom.rootStyle.props['--bg-a'], '#222222', 'applyTheme repainted the CSS vars')
    assert.deepEqual(calls.postVisualModeToParent, [], 'visual mode unchanged, no post')
  } finally {
    dom.restore()
  }
})

test('updateTheme skips persistence and history when asked (and while history applies)', () => {
  const { editor, calls, historyState, dom } = makeEditor()
  try {
    editor.updateTheme({ bgA: '#333333' }, { persist: false })
    assert.equal(calls.saveThemeDraft, 0)
    assert.deepEqual(calls.recordHistoryCheckpoint, [], 'no history without persist')

    historyState.applying = true
    editor.updateTheme({ bgA: '#444444' })
    assert.equal(calls.saveThemeDraft, 1, 'persist still happens')
    assert.deepEqual(calls.recordHistoryCheckpoint, [], 'no history while re-applying')
  } finally {
    dom.restore()
  }
})

test('entering artifact mode resets the wizard and announces the mode change', () => {
  const { editor, state, calls, dom, getTheme } = makeEditor({
    state: { snapshot: { session: {} } },
    theme: { visualMode: 'classic' }
  })
  try {
    editor.updateTheme({ visualMode: 'artifact' }, { historyLabel: 'New artifact' })
    assert.equal(getTheme().visualMode, 'artifact')
    assert.equal(state.artifact.lastPrompt, '')
    assert.equal(calls.clearArtifactMarkup, 1)
    assert.equal(calls.resetArtifactConversation, 1)
    assert.equal(calls.hideArtifactStage, 1)
    assert.deepEqual(calls.postVisualModeToParent, ['update-theme'])
    assert.equal(calls.renderFromSnapshot, 1, 'visualMode patch re-renders the snapshot')
    assert.deepEqual(calls.recordHistoryCheckpoint, ['New artifact'])
  } finally {
    dom.restore()
  }
})

test('a busy artifact build survives entering artifact mode', () => {
  const { editor, state, calls, dom } = makeEditor({
    state: { artifact: { busy: true, lastPrompt: 'keep me', lastAnswers: { a: 1 } } },
    theme: { visualMode: 'classic' }
  })
  try {
    editor.updateTheme({ visualMode: 'artifact' })
    assert.equal(state.artifact.lastPrompt, 'keep me')
    assert.equal(calls.clearArtifactMarkup, 0)
  } finally {
    dom.restore()
  }
})

test('setting a background image bumps an invisible opacity to 0.55', () => {
  const { editor, dom, getTheme } = makeEditor({ theme: { bgImageOpacity: 0 } })
  try {
    editor.updateTheme({ bgImageUrl: 'https://img.example/bg.png' })
    assert.equal(getTheme().bgImageOpacity, 0.55)
    editor.updateTheme({ bgImageUrl: 'https://img.example/bg2.png', bgImageOpacity: 0.01 })
    assert.equal(getTheme().bgImageOpacity, 0.01, 'explicit opacity wins')
  } finally {
    dom.restore()
  }
})

test('applyTheme paints CSS variables and delegates canvas objects to the shared helpers', () => {
  const { editor, el, calls, dom, getTheme } = makeEditor({ theme: { gridOpacity: 0 } })
  try {
    editor.applyTheme(getTheme())
    assert.equal(dom.rootStyle.props['--font-family'], defaultTheme.fontFamily)
    assert.equal(dom.rootStyle.props['--bar-height'], `${defaultTheme.barHeight}px`)
    assert.ok(dom.rootStyle.props['--panel-bg'].startsWith('rgba('))
    assert.equal(el.gridBg.style.display, 'none', 'zero grid opacity hides the grid')
    assert.equal(el.bgImage.style.backgroundImage, 'none')
    assert.ok(calls.applyElementOffset.length >= 6)
    assert.equal(calls.applyHeaderTextObjects, 1)
    assert.equal(calls.applyImageAsset.length, 2, 'logo + overlay asset')
    assert.equal(calls.applyDeletedStaticTargets, 1)
    assert.equal(calls.syncArtifactComposerVisibility, 1)
    assert.equal(calls.scheduleResizeSelectionUpdate, 1)
  } finally {
    dom.restore()
  }
})

test('bindThemeControls wires inputs to updateTheme and visualMode re-renders', () => {
  const bgInput = makeInput()
  const modeSelect = makeInput()
  const { editor, calls, dom, getTheme } = makeEditor({
    registry: { 'theme-bg-a': bgInput, 'theme-visual-mode': modeSelect },
    state: { snapshot: { session: {} } }
  })
  try {
    editor.bindThemeControls()
    bgInput.value = '#123456'
    bgInput.trigger('input')
    assert.equal(getTheme().bgA, '#123456')

    const rendersBefore = calls.renderFromSnapshot
    modeSelect.value = 'classic'
    modeSelect.trigger('change')
    assert.equal(getTheme().visualMode, 'classic')
    assert.ok(calls.renderFromSnapshot > rendersBefore, 'visualMode change re-renders')
  } finally {
    dom.restore()
  }
})

test('syncThemeControls mirrors the theme into the panel inputs', () => {
  const bgInput = makeInput()
  const heightInput = makeInput()
  const { editor, dom } = makeEditor({
    registry: { 'theme-bg-a': bgInput, 'theme-bar-height': heightInput },
    theme: { bgA: '#abcdef', barHeight: 22 }
  })
  try {
    editor.syncThemeControls()
    assert.equal(bgInput.value, '#abcdef')
    assert.equal(heightInput.value, '22')
    editor.syncSingleControlValue('barHeight', 27.6)
    assert.equal(heightInput.value, '28', 'single sync rounds numbers')
  } finally {
    dom.restore()
  }
})

test('the background dropzone mirrors the current image and clears it', () => {
  const zone = makeInput()
  const label = makeInput()
  const hint = makeInput()
  zone.querySelector = (selector) =>
    selector === '.theme-bg-dropzone-label' ? label : selector === '.theme-bg-dropzone-hint' ? hint : null
  const uploadInput = makeInput()
  const clearBtn = makeInput()
  const { editor, calls, dom, getTheme } = makeEditor({
    registry: {
      'theme-bg-image-dropzone': zone,
      'theme-bg-image-upload': uploadInput,
      'theme-bg-image-clear': clearBtn
    },
    theme: { bgImageUrl: 'https://img.example/bg.png' }
  })
  try {
    editor.syncThemeControls()
    assert.equal(zone.classList.state['theme-bg-dropzone--has-image'], true)
    assert.ok(zone.style.backgroundImage.includes('img.example'))
    assert.ok(label.textContent.includes('Image applied'))
    assert.equal(clearBtn.hidden, false)

    editor.setupBackgroundDropzone()
    clearBtn.trigger('click')
    assert.equal(getTheme().bgImageUrl, '')
    assert.equal(zone.classList.state['theme-bg-dropzone--has-image'], false, 'repaint cleared the zone')
    assert.ok(calls.showThemeFeedback.some((entry) => entry.text === 'Background image removed.'))
  } finally {
    dom.restore()
  }
})

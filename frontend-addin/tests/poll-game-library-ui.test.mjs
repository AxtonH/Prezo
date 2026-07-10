import test from 'node:test'
import assert from 'node:assert/strict'

import { createLibraryPanel } from '../public/poc/gamified/poll-game-gamified-library-ui.js'
import { defaultTheme } from '../public/poc/gamified/poll-game-gamified-theme.js'

// The panel owns its DOM, so tests run against stub elements. Saving an
// artifact also re-segments its markup, which needs the same minimal
// window/DOMParser stand-ins the ai-transport tests use.
function makeEl() {
  const el = {
    value: '',
    textContent: '',
    children: [],
    appendChild(child) {
      el.children.push(child)
    },
    classList: {
      added: [],
      add(...names) {
        el.classList.added.push(...names)
      },
      remove() {}
    },
    style: {},
    disabled: false,
    title: ''
  }
  Object.defineProperty(el, 'innerHTML', {
    get: () => '',
    set: () => {
      el.children = []
    }
  })
  return el
}

function installDomStub() {
  globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} }
  globalThis.document = { createElement: () => makeEl(), body: { appendChild() {} } }
  const makeStubEl = () => {
    const attrs = {}
    return {
      setAttribute(key, value) {
        attrs[key] = value
      },
      getAttribute(key) {
        return attrs[key] ?? null
      },
      appendChild() {},
      insertBefore() {},
      replaceWith() {},
      remove() {},
      textContent: '',
      firstChild: null
    }
  }
  globalThis.DOMParser = class {
    parseFromString(source) {
      return {
        documentElement: {
          ...makeStubEl(),
          outerHTML: source.replace(/^<!doctype html>\s*/i, '')
        },
        head: makeStubEl(),
        body: makeStubEl(),
        querySelectorAll: () => [],
        createElement: () => makeStubEl()
      }
    }
  }
  return () => {
    delete globalThis.window
    delete globalThis.document
    delete globalThis.DOMParser
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

function makePanel({ state: stateOverrides = {}, deps: depOverrides = {}, pendingStyle = {}, pendingCopy = {} } = {}) {
  const el = {
    librarySyncStatus: makeEl(),
    librarySyncStatusText: makeEl(),
    themeSelect: makeEl(),
    themeName: makeEl(),
    themeFeedback: makeEl(),
    artifactSelect: makeEl(),
    artifactName: makeEl(),
    artifactFeedback: makeEl(),
    artifactVersionSelect: makeEl(),
    restoreArtifactVersion: makeEl(),
    importTheme: makeEl()
  }
  const state = {
    activityKind: 'poll',
    snapshot: null,
    library: { status: '', detail: '' },
    artifact: {
      html: '',
      package: null,
      busy: false,
      lastPrompt: 'make it pop',
      lastAnswers: {},
      conversationAnswers: {},
      conversationStepIndex: 0,
      editHistory: [],
      savedStyleOverrides: {},
      activeEditRequest: '',
      autoRepairInFlight: false,
      repairAttemptCount: 0,
      lastRuntimeError: ''
    },
    ...stateOverrides
  }
  const themeLibrary = { themes: {}, activeName: null }
  const artifactLibrary = { artifacts: {}, activeName: null }
  const calls = { saveThemeLibrary: 0, saveArtifactLibrary: 0, applyArtifactMarkup: 0, cleared: 0 }
  let currentTheme = { ...defaultTheme }
  const deps = {
    state,
    el,
    themeLibrary,
    artifactLibrary,
    getCurrentTheme: () => currentTheme,
    setCurrentTheme: (nextTheme) => {
      currentTheme = nextTheme
    },
    getPendingStyleOverrides: () => pendingStyle,
    getPendingCopyOverrides: () => pendingCopy,
    clearPendingArtifactOverrides: () => {
      calls.cleared += 1
    },
    saveThemeLibrary: () => {
      calls.saveThemeLibrary += 1
    },
    saveArtifactLibrary: () => {
      calls.saveArtifactLibrary += 1
    },
    saveThemeDraft: () => {},
    sanitizeSavedArtifactRecord: (record) => (record && record.html ? { ...record } : null),
    persistThemeToAccount: async () => ({ type: 'success', message: '' }),
    deleteThemeFromAccount: async () => ({ type: 'success', message: '' }),
    persistArtifactToAccount: async () => ({ type: 'success', message: '' }),
    deleteArtifactFromAccount: async () => ({ type: 'success', message: '' }),
    listArtifactVersionsFromAccount: async () => [],
    restoreArtifactVersionInAccount: async () => null,
    reflectLibrarySyncResult: () => {},
    artifactPosition: {
      getPendingPositionOverrides: () => ({}),
      clearPendingPositionOverrides: () => {}
    },
    artifactSize: {
      getPendingSizeOverrides: () => ({}),
      clearPendingSizeOverrides: () => {}
    },
    artifactDelete: { getPendingHiddenOverrides: () => ({}) },
    artifactHistory: { clear: () => {} },
    updateTheme: () => {},
    applyTheme: () => {},
    syncThemeControls: () => {},
    postVisualModeToParent: () => {},
    postActiveArtifactToParent: () => {},
    recordHistoryCheckpoint: () => {},
    renderFromSnapshot: () => {},
    applyArtifactMarkup: () => {
      calls.applyArtifactMarkup += 1
      return true
    },
    clearArtifactMarkup: () => {},
    resetArtifactConversation: () => {},
    hideArtifactStage: () => {},
    showArtifactStagePlaceholder: () => {},
    showArtifactStageFrame: () => {},
    clearArtifactEditPromptQueue: () => {},
    syncArtifactConversationUi: () => {},
    ...depOverrides
  }
  const panel = createLibraryPanel(deps)
  return { panel, el, state, themeLibrary, artifactLibrary, calls, getTheme: () => currentTheme }
}

test('buildSavedArtifactRecord stamps the station kind and snapshots the theme', () => {
  const restore = installDomStub()
  try {
    const { panel, state } = makePanel({
      state: { activityKind: 'qna' },
      pendingStyle: { question: { color: '#111111' } }
    })
    assert.equal(panel.buildSavedArtifactRecord(), null, 'no markup -> no record')
    state.artifact.html = '<html><body>votes</body></html>'
    const record = panel.buildSavedArtifactRecord()
    assert.equal(record.kind, 'qna')
    assert.ok(record.html.includes('votes'))
    assert.equal(record.themeSnapshot.visualMode, 'artifact')
    assert.equal(record.lastPrompt, 'make it pop')
    assert.ok(record.styleOverrides, 'pending style overrides merged into the record')
    assert.ok(record.styleOverrides.question)
  } finally {
    restore()
  }
})

test('artifactRecordMatchesActivityKind treats legacy records as polls and pairs qna with discussion', () => {
  const restore = installDomStub()
  try {
    const poll = makePanel().panel
    assert.equal(poll.artifactRecordMatchesActivityKind({ kind: 'poll' }), true)
    assert.equal(poll.artifactRecordMatchesActivityKind({}), true, 'legacy record is a poll')
    assert.equal(poll.artifactRecordMatchesActivityKind({ kind: 'qna' }), false)

    const qna = makePanel({ state: { activityKind: 'qna' } }).panel
    assert.equal(qna.artifactRecordMatchesActivityKind({ kind: 'qna' }), true)
    assert.equal(qna.artifactRecordMatchesActivityKind({ kind: 'discussion' }), true, 'shared runtime contract')
    assert.equal(qna.artifactRecordMatchesActivityKind({ kind: 'poll' }), false)
    assert.equal(qna.artifactRecordMatchesActivityKind({}), false)
  } finally {
    restore()
  }
})

test('refreshArtifactSelect lists only records matching the station kind', () => {
  const restore = installDomStub()
  try {
    const { panel, el, artifactLibrary } = makePanel()
    artifactLibrary.artifacts = {
      'poll-art': { kind: 'poll', html: '<div>a</div>' },
      'qna-art': { kind: 'qna', html: '<div>b</div>' },
      legacy: { html: '<div>c</div>' }
    }
    panel.refreshArtifactSelect('poll-art')
    const labels = el.artifactSelect.children.map((option) => option.textContent)
    assert.deepEqual(labels, ['legacy', 'poll-art'])
    assert.equal(el.artifactSelect.value, 'poll-art')
  } finally {
    restore()
  }
})

test('mergeRemoteThemeLibrary sanitizes incoming themes and skips invalid records', () => {
  const restore = installDomStub()
  try {
    const { panel, el, themeLibrary, calls } = makePanel()
    panel.mergeRemoteThemeLibrary([
      { name: '  Neon   Nights ', theme: { bgA: '#111111', barHeight: 9999 } },
      { name: '', theme: { bgA: '#222222' } },
      { name: 'no-theme-key' },
      'garbage'
    ])
    assert.deepEqual(Object.keys(themeLibrary.themes), ['Neon Nights'])
    assert.equal(themeLibrary.themes['Neon Nights'].bgA, '#111111')
    assert.ok(themeLibrary.themes['Neon Nights'].barHeight <= 44, 'sanitizeTheme clamps values')
    assert.equal(calls.saveThemeLibrary, 1)
    assert.deepEqual(
      el.themeSelect.children.map((option) => option.textContent),
      ['Neon Nights']
    )
  } finally {
    restore()
  }
})

test('mergeRemoteArtifactLibrary keeps only records the sanitizer accepts', async () => {
  const restore = installDomStub()
  try {
    const { panel, el, artifactLibrary, calls } = makePanel()
    panel.mergeRemoteArtifactLibrary([
      { name: 'wall', html: '<div>wall</div>' },
      { name: 'broken' },
      { name: '', html: '<div>x</div>' }
    ])
    await flush()
    assert.deepEqual(Object.keys(artifactLibrary.artifacts), ['wall'])
    assert.equal(calls.saveArtifactLibrary, 1)
    assert.deepEqual(
      el.artifactSelect.children.map((option) => option.textContent),
      ['wall']
    )
  } finally {
    restore()
  }
})

test('setLibrarySyncStatus reflects status onto state and the pill', () => {
  const restore = installDomStub()
  try {
    const { panel, el, state } = makePanel()
    panel.setLibrarySyncStatus('warning', 'Local library only', 'Sign in through Prezo Host')
    assert.equal(state.library.status, 'warning')
    assert.equal(state.library.detail, 'Sign in through Prezo Host')
    assert.ok(el.librarySyncStatus.classList.added.includes('status-warning'))
    assert.equal(el.librarySyncStatusText.textContent, 'Local library only')
    assert.equal(el.librarySyncStatus.title, 'Sign in through Prezo Host')
  } finally {
    restore()
  }
})

test('refreshArtifactVersionHistory sorts account versions newest-first and renders labels', async () => {
  const restore = installDomStub()
  try {
    const { panel, el } = makePanel({
      deps: {
        listArtifactVersionsFromAccount: async () => [
          { version: 1, source: 'manual', created_at: '2026-07-01T10:00:00Z' },
          { version: 3, source: 'restore' },
          null
        ]
      }
    })
    el.artifactSelect.value = 'wall'
    await panel.refreshArtifactVersionHistory({ force: true })
    const labels = el.artifactVersionSelect.children.map((option) => option.textContent)
    assert.equal(labels.length, 2)
    assert.ok(labels[0].startsWith('v3'), 'newest first')
    assert.ok(labels[1].startsWith('v1 · manual'))
    assert.equal(el.artifactVersionSelect.value, '3')
    assert.equal(el.restoreArtifactVersion.disabled, false)
  } finally {
    restore()
  }
})

test('applyArtifactLibraryRecord refuses records built for another activity kind', () => {
  const restore = installDomStub()
  try {
    const { panel, el, calls } = makePanel()
    const applied = panel.applyArtifactLibraryRecord('wall', { kind: 'qna', html: '<div>x</div>' })
    assert.equal(applied, false)
    assert.equal(calls.applyArtifactMarkup, 0)
    assert.ok(el.artifactFeedback.textContent.includes('different activity type'))
  } finally {
    restore()
  }
})

test('applyArtifactLibraryRecord loads a matching record and resets the edit state', () => {
  const restore = installDomStub()
  try {
    const { panel, el, state, calls, getTheme } = makePanel()
    state.artifact.editHistory = [{ prompt: 'old' }]
    state.artifact.activeEditRequest = 'old request'
    const applied = panel.applyArtifactLibraryRecord('wall', {
      kind: 'poll',
      html: '<div>x</div>',
      lastPrompt: 'leaderboard',
      themeSnapshot: { ...defaultTheme, bgA: '#123456' },
      lastAnswers: {}
    })
    assert.equal(applied, true)
    assert.equal(calls.applyArtifactMarkup, 1)
    assert.equal(calls.cleared, 1, 'pending overrides cleared before load')
    assert.equal(getTheme().visualMode, 'artifact')
    assert.equal(getTheme().bgA, '#123456')
    assert.equal(state.artifact.lastPrompt, 'leaderboard')
    assert.deepEqual(state.artifact.editHistory, [])
    assert.equal(state.artifact.activeEditRequest, '')
    assert.equal(el.artifactName.value, 'wall')
    assert.ok(el.artifactFeedback.textContent.includes('loaded'))
  } finally {
    restore()
  }
})

test('saveTheme normalizes the name, saves locally, and syncs to the account', async () => {
  const restore = installDomStub()
  try {
    let persisted = null
    const { panel, el, themeLibrary, calls } = makePanel({
      deps: {
        persistThemeToAccount: async (name, theme) => {
          persisted = { name, theme }
          return { type: 'success', message: 'Theme "Neon" saved to your account.' }
        }
      }
    })
    await panel.saveTheme()
    assert.ok(el.themeFeedback.textContent.includes('required'), 'empty name rejected')

    el.themeName.value = '  Neon  '
    await panel.saveTheme()
    assert.deepEqual(Object.keys(themeLibrary.themes), ['Neon'])
    assert.equal(themeLibrary.activeName, 'Neon')
    assert.equal(el.themeName.value, 'Neon')
    assert.equal(persisted.name, 'Neon')
    assert.ok(calls.saveThemeLibrary >= 1)
    assert.equal(el.themeFeedback.textContent, 'Theme "Neon" saved to your account.')
  } finally {
    restore()
  }
})

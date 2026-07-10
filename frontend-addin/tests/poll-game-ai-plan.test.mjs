import test from 'node:test'
import assert from 'node:assert/strict'

import { createAiPlanApplier } from '../public/poc/gamified/poll-game-gamified-ai-plan.js'
import { AI_MOVE_TARGETS, TEXT_OVERRIDES_KEY } from '../public/poc/gamified/poll-game-gamified-constants.js'
import { defaultTheme } from '../public/poc/gamified/poll-game-gamified-theme.js'

function makeApplier({ snapshot = null, historyEqual = false } = {}) {
  const state = {
    textOverrides: {},
    snapshot,
    currentPoll: {
      id: 'p1',
      question: 'Best color?',
      options: [
        { id: 'o1', label: 'Red' },
        { id: 'o2', label: 'Blue' }
      ]
    },
    activeTextHost: null,
    activeInlineStyleNode: null
  }
  const calls = {
    updateTheme: [],
    syncThemeControls: 0,
    renderFromSnapshot: 0,
    renderInitialState: 0,
    recordHistoryCheckpoint: [],
    cleanup: 0
  }
  let snapshotCounter = 0
  const applier = createAiPlanApplier({
    state,
    el: { question: { dataset: {} } },
    getCurrentTheme: () => ({ ...defaultTheme }),
    updateTheme: (patch, options) => {
      calls.updateTheme.push({ patch, options })
    },
    syncThemeControls: () => {
      calls.syncThemeControls += 1
    },
    renderFromSnapshot: () => {
      calls.renderFromSnapshot += 1
    },
    renderInitialState: () => {
      calls.renderInitialState += 1
    },
    recordHistoryCheckpoint: (label) => {
      calls.recordHistoryCheckpoint.push(label)
    },
    captureHistorySnapshot: () => (snapshotCounter += 1),
    historySnapshotsEqual: () => historyEqual,
    buildDefaultPositionThemePatch: () => ({ panelX: defaultTheme.panelX }),
    scheduleResizeSelectionUpdate: () => {},
    clearCachedRichTextSelection: () => {
      calls.cleanup += 1
    },
    hideSelectionToolbar: () => {},
    refreshTextToolStates: () => {},
    syncTextStyleControlsFromSelection: () => {}
  })
  return { applier, state, calls }
}

function withLocalStorage(fn) {
  const store = {}
  globalThis.localStorage = {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = String(value)
    }
  }
  try {
    return fn(store)
  } finally {
    delete globalThis.localStorage
  }
}

test('theme actions merge into one sanitized updateTheme call', () => {
  const { applier, calls } = makeApplier()
  const outcome = applier.applyAiPlanActions({
    actions: [
      { type: 'update_theme', theme: { bgA: '#222222', hackedKey: 'nope' } },
      { type: 'update_theme', theme: { barHeight: 9999 } },
      { type: 'update_theme', theme: {} }
    ]
  })
  assert.equal(calls.updateTheme.length, 1, 'patches batched into a single update')
  const { patch, options } = calls.updateTheme[0]
  assert.equal(patch.bgA, '#222222')
  assert.ok(patch.barHeight <= 44, 'sanitized against theme ranges')
  assert.ok(!('hackedKey' in patch))
  assert.equal(options.recordHistory, false, 'history recorded once at the end instead')
  assert.equal(calls.syncThemeControls, 1)
  assert.equal(outcome.themeActionCount, 2)
  assert.equal(outcome.warningCount, 1, 'empty theme update warned')
})

test('move actions offset from the current theme and clamp', () => {
  const { applier, calls } = makeApplier()
  const target = Object.keys(AI_MOVE_TARGETS)[0]
  const config = AI_MOVE_TARGETS[target]
  const outcome = applier.applyAiPlanActions({
    actions: [
      { type: 'move_element', target, deltaX: 40 },
      { type: 'move_element', target: 'not-a-target', x: 1 },
      { type: 'move_element', target }
    ]
  })
  const patch = calls.updateTheme[0].patch
  const base = Number(defaultTheme[config.xKey])
  assert.equal(patch[config.xKey], Math.min(config.maxX, base + 40))
  assert.equal(outcome.themeActionCount, 1)
  assert.equal(outcome.warningCount, 2, 'unknown target + no-coordinates both warn')
})

test('text actions write sanitized overrides and re-render', () => {
  withLocalStorage((store) => {
    const { applier, state, calls } = makeApplier()
    const outcome = applier.applyAiPlanActions({
      actions: [
        { type: 'set_text', target: 'eyebrow', value: 'Live <polls>' },
        { type: 'set_option_label', optionLabel: 'blue', value: 'Navy' },
        { type: 'set_text', target: 'question', value: 'New question?' }
      ]
    })
    assert.equal(state.textOverrides['chrome:eyebrow'], 'Live &lt;polls&gt;')
    assert.equal(state.textOverrides['poll:p1:option:o2'], 'Navy')
    assert.equal(state.textOverrides['poll:p1:question'], 'New question?')
    assert.ok(store[TEXT_OVERRIDES_KEY].includes('chrome:eyebrow'), 'overrides persisted')
    assert.equal(calls.renderInitialState, 1, 'no snapshot -> initial state render')
    assert.equal(calls.cleanup, 1, 'selection cache cleared')
    assert.equal(outcome.textActionCount, 3)
    assert.deepEqual(calls.recordHistoryCheckpoint, ['AI edit'])
  })
})

test('unsupported actions only warn; unchanged snapshots skip the checkpoint', () => {
  const { applier, calls } = makeApplier({ historyEqual: true })
  const outcome = applier.applyAiPlanActions({
    actions: [{ type: 'explode_everything' }, null, 'garbage']
  })
  assert.equal(outcome.changed, false)
  assert.equal(outcome.themeActionCount, 0)
  assert.equal(outcome.warningCount, 1, 'non-objects skipped silently, unknown type warns')
  assert.deepEqual(calls.recordHistoryCheckpoint, [])
  assert.equal(
    applier.summarizeAiOutcome({}, outcome),
    'No editable change was applied from that prompt.'
  )
})

test('reset_theme floods the patch with defaults; summaries count the parts', () => {
  const { applier, calls } = makeApplier()
  const outcome = applier.applyAiPlanActions({ actions: [{ type: 'reset_theme' }] })
  const patch = calls.updateTheme[0].patch
  assert.equal(patch.bgA, defaultTheme.bgA)
  assert.ok(Object.keys(patch).length > 30)
  assert.equal(
    applier.summarizeAiOutcome({}, outcome),
    'Applied 1 style/layout change.'
  )
  assert.equal(
    applier.summarizeAiOutcome({}, { changed: true, themeActionCount: 2, textActionCount: 1, warningCount: 1 }),
    'Applied 2 style/layout changes, 1 text change, 1 ignored action.'
  )
})

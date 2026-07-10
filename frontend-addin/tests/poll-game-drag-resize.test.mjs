import test from 'node:test'
import assert from 'node:assert/strict'

import { createDragResizeEngine } from '../public/poc/gamified/poll-game-gamified-drag-resize.js'
import { defaultTheme } from '../public/poc/gamified/poll-game-gamified-theme.js'

// Pointer choreography needs a browser; these tests cover the engine's pure
// seams: the geometry helpers, the deleted-objects map, and the position
// reset patch. `el` is a Proxy that materializes a stub element per handle,
// since applyDeletedStaticTargets touches a couple dozen of them.
function makeEl() {
  const node = {
    classList: {
      state: {},
      toggle(name, force) {
        node.classList.state[name] = Boolean(force)
      },
      add(name) {
        node.classList.state[name] = true
      },
      remove(name) {
        node.classList.state[name] = false
      }
    },
    style: {
      removed: [],
      removeProperty(prop) {
        node.style.removed.push(prop)
      }
    },
    attrs: {},
    setAttribute(key, value) {
      node.attrs[key] = value
    },
    getAttribute(key) {
      return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null
    },
    removeAttribute(key) {
      delete node.attrs[key]
    }
  }
  return node
}

function makeEngine() {
  const elStore = {}
  const el = new Proxy(elStore, {
    get: (target, key) => (target[key] ??= makeEl())
  })
  let currentTheme = { ...defaultTheme }
  const engine = createDragResizeEngine({
    state: { snapshot: null, presentMode: false },
    el,
    getCurrentTheme: () => currentTheme,
    updateTheme: () => {},
    syncSingleControlValue: () => {},
    saveThemeDraft: () => {},
    recordHistoryCheckpoint: () => {},
    renderFromSnapshot: () => {},
    showThemeFeedback: () => {},
    getOptionDeleteTargetKey: (optionId, part) => `option:${optionId}:${part}`
  })
  return { engine, el: elStore, getTheme: () => currentTheme }
}

test('the engine owns its interaction state and returns it by reference', () => {
  const { engine } = makeEngine()
  assert.deepEqual(engine.dragState, { enabled: false, active: null, pending: null })
  assert.deepEqual(engine.resizeState, { selectedNode: null, active: null, rafId: null })
  assert.ok(engine.resizeProfiles instanceof WeakMap)
})

test('applyElementOffset clamps translation and scale into the transform', () => {
  const { engine } = makeEngine()
  const node = makeEl()
  engine.applyElementOffset(node, 99999, -99999, 99, 0.01)
  assert.equal(node.style.transform, 'translate(2400px, -2400px) scale(8, 0.2)')
  engine.applyElementOffset(null)
})

test('applyElementBoxSize sets sanitized dimensions and clears empties', () => {
  const { engine } = makeEngine()
  const node = makeEl()
  engine.applyElementBoxSize(node, 500, 9999)
  assert.equal(node.style.width, '500px')
  assert.equal(node.style.height, '2400px', 'height clamped to max')
  const cleared = makeEl()
  engine.applyElementBoxSize(cleared, null, '')
  assert.deepEqual(cleared.style.removed, ['width', 'height'])
})

test('applyImageAsset hides without a url and positions with one', () => {
  const { engine } = makeEngine()
  const node = makeEl()
  engine.applyImageAsset(node, { url: '' })
  assert.equal(node.classList.state.hidden, true)
  assert.ok(!('src' in node.attrs))

  const shown = makeEl()
  engine.applyImageAsset(shown, {
    url: 'https://img.example/logo.png',
    width: '120px',
    opacity: '0.8',
    left: '10%',
    top: '20%',
    scaleX: 99,
    scaleY: 0.1
  })
  assert.equal(shown.attrs.src, 'https://img.example/logo.png')
  assert.equal(shown.classList.state.hidden, false)
  assert.equal(shown.style.width, '120px')
  assert.equal(shown.style.transform, 'translate(-50%, -50%) scale(5, 0.25)')
})

test('deleted-objects map: set/unset round-trips through the live theme', () => {
  const { engine, getTheme } = makeEngine()
  assert.equal(engine.isThemeObjectDeleted('logo'), false)
  engine.setThemeObjectDeleted('logo')
  assert.equal(engine.isThemeObjectDeleted('logo'), true)
  assert.deepEqual(getTheme().deletedObjects, { logo: true })
  engine.setThemeObjectDeleted('logo', false)
  assert.equal(engine.isThemeObjectDeleted('logo'), false)
  assert.deepEqual(getTheme().deletedObjects, {})
  engine.setThemeObjectDeleted('')
  assert.deepEqual(getTheme().deletedObjects, {}, 'empty keys ignored')
})

test('applyDeletedStaticTargets toggles the hidden class per target key', () => {
  const { engine, el } = makeEngine()
  engine.applyDeletedStaticTargets({ deletedObjects: { question: true, logo: true } })
  assert.equal(el.question.classList.state.hidden, true)
  assert.equal(el.eyebrow.classList.state.hidden, false)
  assert.equal(el.customLogo.classList.state.hidden, true)
  engine.applyDeletedStaticTargets({})
  assert.equal(el.question.classList.state.hidden, false, 'restored when map empty')
})

test('buildDefaultPositionThemePatch resets exactly the position/scale/box keys', () => {
  const { engine } = makeEngine()
  const patch = engine.buildDefaultPositionThemePatch()
  assert.equal(patch.panelX, defaultTheme.panelX)
  assert.equal(patch.questionBoxWidth, defaultTheme.questionBoxWidth)
  assert.equal(patch.logoScaleX, defaultTheme.logoScaleX)
  assert.ok(!('bgA' in patch), 'colors untouched')
  assert.ok(!('fontFamily' in patch), 'typography untouched')
  assert.ok(Object.keys(patch).length >= 30)
})

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createArtifactAiUndo,
  ARTIFACT_AI_UNDO_MAX_DEPTH
} from '../public/poc/gamified/poll-game-gamified-artifact-ai-undo.js'

function snap(tag) {
  return {
    html: `<html>${tag}</html>`,
    package: { entry: 'index.html', files: [{ path: 'index.html', content: tag }] },
    styleOverrides: { [`key-${tag}`]: tag }
  }
}

test('undo restores the pushed pre-edit snapshot and redo restores the edit', () => {
  const history = createArtifactAiUndo()
  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)

  history.pushSnapshot(snap('v1'))
  assert.equal(history.canUndo(), true)

  const restored = history.undo(snap('v2'))
  assert.equal(restored.html, '<html>v1</html>')
  assert.deepEqual(restored.styleOverrides, { 'key-v1': 'v1' })
  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), true)

  const reapplied = history.redo(snap('v1'))
  assert.equal(reapplied.html, '<html>v2</html>')
  assert.equal(history.canUndo(), true)
  assert.equal(history.canRedo(), false)
})

test('multi-step undo walks back through edits in order', () => {
  const history = createArtifactAiUndo()
  history.pushSnapshot(snap('v1'))
  history.pushSnapshot(snap('v2'))
  history.pushSnapshot(snap('v3'))

  assert.equal(history.undo(snap('v4')).html, '<html>v3</html>')
  assert.equal(history.undo(snap('v3')).html, '<html>v2</html>')
  assert.equal(history.undo(snap('v2')).html, '<html>v1</html>')
  assert.equal(history.undo(snap('v1')), null, 'stack exhausted')
})

test('a new edit clears the redo stack', () => {
  const history = createArtifactAiUndo()
  history.pushSnapshot(snap('v1'))
  history.undo(snap('v2'))
  assert.equal(history.canRedo(), true)
  history.pushSnapshot(snap('v2b'))
  assert.equal(history.canRedo(), false, 'divergent edit invalidates redo')
})

test('depth is capped at the oldest end', () => {
  const history = createArtifactAiUndo({ maxDepth: 3 })
  for (let i = 1; i <= 5; i++) history.pushSnapshot(snap(`v${i}`))
  assert.equal(history.undo(snap('cur')).html, '<html>v5</html>')
  assert.equal(history.undo(snap('v5')).html, '<html>v4</html>')
  assert.equal(history.undo(snap('v4')).html, '<html>v3</html>')
  assert.equal(history.undo(snap('v3')), null, 'v1/v2 were evicted')
  assert.ok(ARTIFACT_AI_UNDO_MAX_DEPTH >= 3)
})

test('discardLast drops the failed edit snapshot without touching redo', () => {
  const history = createArtifactAiUndo()
  history.pushSnapshot(snap('v1'))
  history.pushSnapshot(snap('v2-failed'))
  history.discardLast()
  assert.equal(history.undo(snap('cur')).html, '<html>v1</html>')
})

test('clear resets both stacks', () => {
  const history = createArtifactAiUndo()
  history.pushSnapshot(snap('v1'))
  history.undo(snap('v2'))
  history.pushSnapshot(snap('v3'))
  history.clear()
  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)
})

test('invalid snapshots are rejected and nothing is popped', () => {
  const history = createArtifactAiUndo()
  assert.equal(history.pushSnapshot(null), false)
  assert.equal(history.pushSnapshot({ html: '   ' }), false)
  assert.equal(history.canUndo(), false)

  history.pushSnapshot(snap('v1'))
  // Current state can't be captured -> undo refuses and keeps the stack.
  assert.equal(history.undo({ html: '' }), null)
  assert.equal(history.canUndo(), true)
})

test('snapshots are isolated from later mutation of the caller objects', () => {
  const history = createArtifactAiUndo()
  const original = snap('v1')
  history.pushSnapshot(original)
  original.styleOverrides['key-v1'] = 'MUTATED'
  original.package.files[0].content = 'MUTATED'

  const restored = history.undo(snap('v2'))
  assert.equal(restored.styleOverrides['key-v1'], 'v1')
  assert.equal(restored.package.files[0].content, 'v1')
})

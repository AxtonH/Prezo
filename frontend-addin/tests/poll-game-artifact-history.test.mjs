import test from 'node:test'
import assert from 'node:assert/strict'

import { createArtifactHistoryHandler } from '../public/poc/gamified/poll-game-gamified-artifact-history.js'

function makeHistory() {
  /** @type {Array<{kind: string, direction: string}>} */
  const applied = []
  const history = createArtifactHistoryHandler({
    applyEntry: (entry, direction) => applied.push({ kind: entry.kind, direction })
  })
  return { history, applied }
}

function entry(kind, targetKey, extra = {}) {
  return {
    kind,
    targetKey,
    before: { tag: `${targetKey}-before` },
    after: { tag: `${targetKey}-after` },
    label: targetKey,
    ts: Date.now(),
    ...extra
  }
}

test('manual and AI edits share one timeline and undo in reverse chronological order', () => {
  const { history, applied } = makeHistory()
  // The exact reported expectation:
  // AI edit -> delete element -> AI edit -> recolor text -> move element
  history.push(entry('ai-edit', 'ai-1'))
  history.push(entry('hidden', 'el-1'))
  history.push(entry('ai-edit', 'ai-2'))
  history.push(entry('text-html', 'question'))
  history.push(entry('position', 'el-2'))

  // Undo walks: move -> recolor -> AI edit -> delete -> AI edit.
  assert.equal(history.undo(), true)
  assert.equal(history.undo(), true)
  assert.equal(history.undo(), true)
  assert.equal(history.undo(), true)
  assert.equal(history.undo(), true)
  assert.equal(history.undo(), false, 'timeline exhausted')
  assert.deepEqual(
    applied.map((a) => a.kind),
    ['position', 'text-html', 'ai-edit', 'hidden', 'ai-edit']
  )
  assert.ok(applied.every((a) => a.direction === 'undo'))

  // Redo replays forward in the original order.
  applied.length = 0
  while (history.redo()) {}
  assert.deepEqual(
    applied.map((a) => a.kind),
    ['ai-edit', 'hidden', 'ai-edit', 'text-html', 'position']
  )
  assert.ok(applied.every((a) => a.direction === 'redo'))
})

test('depth tracks the undo stack so a clean checkpoint can be compared', () => {
  const { history } = makeHistory()
  assert.equal(history.depth(), 0)
  const cleanDepth = history.depth() // checkpoint at the unedited state

  // The reported bug scenario: edit -> undo -> depth is back at the
  // checkpoint, so the host recomputes "not dirty" and the discard
  // guard must not fire.
  history.push(entry('position', 'el-1'))
  assert.equal(history.depth(), 1)
  assert.notEqual(history.depth(), cleanDepth, 'edited state differs from checkpoint')
  history.undo()
  assert.equal(history.depth(), cleanDepth, 'undo returns to the checkpoint depth')

  // Redo moves away from the checkpoint again.
  history.redo()
  assert.equal(history.depth(), 1)

  // Divergence: undo below a checkpoint, then a NEW edit clears the redo
  // path back to it — same depth number, but the checkpoint is unreachable
  // (the host poisons it when a push lands at or below the clean depth).
  history.undo()
  history.push(entry('hidden', 'el-2'))
  assert.equal(history.depth(), 1, 'same depth as the checkpoint, different content')
  assert.equal(history.canRedo(), false, 'the path back to the checkpoint is gone')
})

test('a new edit after undo invalidates redo', () => {
  const { history } = makeHistory()
  history.push(entry('ai-edit', 'ai-1'))
  history.push(entry('position', 'el-1'))
  history.undo()
  assert.equal(history.canRedo(), true)
  history.push(entry('hidden', 'el-2'))
  assert.equal(history.canRedo(), false)
})

test('discardLast drops the newest entry only when the kind matches', () => {
  const { history, applied } = makeHistory()
  history.push(entry('position', 'el-1'))
  history.push(entry('ai-edit', 'ai-failed'))

  assert.equal(history.discardLast('position'), false, 'kind mismatch leaves the stack alone')
  assert.equal(history.discardLast('ai-edit'), true, 'failed AI edit dropped')
  assert.equal(history.discardLast('ai-edit'), false, 'top is now a position entry')

  history.undo()
  assert.deepEqual(applied, [{ kind: 'position', direction: 'undo' }])
  assert.equal(history.discardLast(), false, 'empty stack')
})

test('failed apply keeps the entry out of the redo stack', () => {
  const applied = []
  const history = createArtifactHistoryHandler({
    applyEntry: () => {
      applied.push('attempt')
      throw new Error('boom')
    }
  })
  history.push(entry('ai-edit', 'ai-1'))
  assert.equal(history.undo(), false)
  assert.equal(history.canRedo(), false)
})

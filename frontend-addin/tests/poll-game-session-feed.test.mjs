import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSessionFeed,
  getQnaTotalVotes,
  getTotalVotes,
  qnaViewAsPollShape,
  sortQnaQuestions
} from '../public/poc/gamified/poll-game-gamified-session-feed.js'

// The feed schedules renders through window timers; capture callbacks so
// tests fire them deterministically.
function installFakeWindow() {
  const timers = []
  globalThis.window = {
    setTimeout(fn) {
      timers.push(fn)
      return timers.length
    },
    clearTimeout() {},
    setInterval() {
      return 1
    },
    clearInterval() {}
  }
  return {
    timers,
    flush() {
      while (timers.length) {
        timers.shift()()
      }
    },
    restore() {
      delete globalThis.window
    }
  }
}

function makeFeed({ activityKind = 'poll', textEditing = false } = {}) {
  const state = {
    apiBase: 'https://api.example',
    sessionId: 's1',
    code: 'AB12',
    activityKind,
    pollSelector: { mode: 'latestOpen', descriptor: 'latest/open', explicitId: '' },
    promptSelector: { mode: 'latestOpen', descriptor: 'latest/open', explicitId: '' },
    snapshot: null,
    socket: null,
    socketStatus: 'connecting',
    reconnectTimer: null,
    reconnectDelayMs: 2800,
    pollTimer: null,
    snapshotRenderTimer: null,
    fetchPromise: null,
    isUnloading: false
  }
  const calls = { renders: [], statusChanges: 0 }
  const feed = createSessionFeed({
    state,
    onRenderSnapshot: (force) => calls.renders.push(Boolean(force)),
    onSocketStatusChange: () => {
      calls.statusChanges += 1
    },
    onMissingSession: () => {},
    onError: () => {},
    isTextEditing: () => textEditing
  })
  return { state, feed, calls }
}

const frame = (type, payload) => JSON.stringify({ type, payload })

test('session_snapshot replaces the snapshot and schedules a render', () => {
  const fake = installFakeWindow()
  try {
    const { state, feed, calls } = makeFeed()
    feed.handleSocketMessage(
      frame('session_snapshot', {
        snapshot: { session: { id: 's1', code: 'ZZ99' }, polls: [], questions: [], prompts: [] }
      })
    )
    assert.equal(state.snapshot.session.code, 'ZZ99')
    assert.equal(state.code, 'ZZ99')
    fake.flush()
    assert.deepEqual(calls.renders, [false])
  } finally {
    fake.restore()
  }
})

test('poll patches merge by id and only render on poll stations', () => {
  const fake = installFakeWindow()
  try {
    const poll = { id: 'p1', status: 'open', options: [] }
    for (const [kind, expectRender] of [
      ['poll', true],
      ['qna', false]
    ]) {
      const { state, feed, calls } = makeFeed({ activityKind: kind })
      feed.handleSocketMessage(frame('poll_updated', { poll }))
      assert.deepEqual(state.snapshot.polls, [poll], `${kind}: poll merged`)
      fake.flush()
      assert.equal(calls.renders.length > 0, expectRender, `${kind}: render relevance`)
    }
  } finally {
    fake.restore()
  }
})

test('question patches merge by id and only render on qna stations', () => {
  const fake = installFakeWindow()
  try {
    const question = { id: 'q1', status: 'approved', votes: 2 }
    for (const [kind, expectRender] of [
      ['qna', true],
      ['poll', false]
    ]) {
      const { state, feed, calls } = makeFeed({ activityKind: kind })
      feed.handleSocketMessage(frame('question_approved', { question }))
      assert.deepEqual(state.snapshot.questions, [question], `${kind}: question merged`)
      // Re-sending replaces rather than duplicating.
      feed.handleSocketMessage(frame('question_vote_updated', { question: { ...question, votes: 5 } }))
      assert.equal(state.snapshot.questions.length, 1, `${kind}: upsert not append`)
      assert.equal(state.snapshot.questions[0].votes, 5, `${kind}: upsert took the newer row`)
      fake.flush()
      assert.equal(calls.renders.length > 0, expectRender, `${kind}: render relevance`)
    }
  } finally {
    fake.restore()
  }
})

test('session patches render on every station kind', () => {
  const fake = installFakeWindow()
  try {
    for (const kind of ['poll', 'qna', 'discussion']) {
      const { feed, calls } = makeFeed({ activityKind: kind })
      feed.handleSocketMessage(frame('qna_config_updated', { session: { id: 's1', qna_open: true } }))
      fake.flush()
      assert.equal(calls.renders.length, 1, `${kind}: session patch renders`)
    }
  } finally {
    fake.restore()
  }
})

test('poll echo during an inline text edit skips the render', () => {
  const fake = installFakeWindow()
  try {
    const { state, feed, calls } = makeFeed({ activityKind: 'poll', textEditing: true })
    feed.handleSocketMessage(frame('poll_updated', { poll: { id: 'p1' } }))
    assert.equal(state.snapshot.polls.length, 1, 'patch still merged')
    fake.flush()
    assert.deepEqual(calls.renders, [], 'no render while editing')
  } finally {
    fake.restore()
  }
})

test('deletion events prune the snapshot', () => {
  const fake = installFakeWindow()
  try {
    const { state, feed } = makeFeed({ activityKind: 'discussion' })
    feed.handleSocketMessage(frame('qna_prompt_created', { prompt: { id: 'pr1', status: 'open' } }))
    feed.handleSocketMessage(frame('question_submitted', { question: { id: 'q1', prompt_id: 'pr1' } }))
    feed.handleSocketMessage(frame('qna_prompt_deleted', { prompt_id: 'pr1' }))
    feed.handleSocketMessage(frame('audience_questions_deleted', { question_ids: ['q1'] }))
    assert.deepEqual(state.snapshot.prompts, [])
    assert.deepEqual(state.snapshot.questions, [])
  } finally {
    fake.restore()
  }
})

test('buildQnaActivityView: discussion filters to the bound prompt, approved only, ranked', () => {
  const { state, feed } = makeFeed({ activityKind: 'discussion' })
  state.promptSelector = { mode: 'id', descriptor: 'pr1', explicitId: 'pr1' }
  state.snapshot = {
    session: { id: 's1' },
    polls: [],
    prompts: [
      { id: 'pr1', prompt: 'Improve what?', status: 'open', created_at: '2026-07-01T00:00:00Z' },
      { id: 'pr2', prompt: 'Other', status: 'open', created_at: '2026-07-02T00:00:00Z' }
    ],
    questions: [
      { id: 'a', prompt_id: 'pr1', status: 'approved', votes: 1, text: 'old', created_at: '2026-07-01T00:00:00Z' },
      { id: 'b', prompt_id: 'pr1', status: 'approved', votes: 1, text: 'new', created_at: '2026-07-03T00:00:00Z' },
      { id: 'c', prompt_id: 'pr1', status: 'pending', votes: 9, text: 'unmoderated' },
      { id: 'd', prompt_id: 'pr2', status: 'approved', votes: 9, text: 'other prompt' },
      { id: 'e', prompt_id: 'pr1', status: 'approved', votes: 5, text: 'top', created_at: '2026-07-02T00:00:00Z' }
    ]
  }
  const view = feed.buildQnaActivityView()
  assert.equal(view.id, 'pr1')
  assert.equal(view.title, 'Improve what?')
  // votes desc, recency tiebreak: e(5), b(1, newer), a(1, older)
  assert.deepEqual(view.questions.map((q) => q.id), ['e', 'b', 'a'])
})

test('buildQnaActivityView: qna kind uses session state and unbound questions', () => {
  const { state, feed } = makeFeed({ activityKind: 'qna' })
  state.snapshot = {
    session: { id: 's1', qna_open: true, qna_prompt: '' },
    polls: [],
    prompts: [],
    questions: [
      { id: 'a', prompt_id: null, status: 'approved', votes: 3, text: 'session q' },
      { id: 'b', prompt_id: 'pr1', status: 'approved', votes: 9, text: 'prompt q' }
    ]
  }
  const view = feed.buildQnaActivityView()
  assert.equal(view.title, 'Audience Q&A')
  assert.equal(view.status, 'open')
  assert.deepEqual(view.questions.map((q) => q.id), ['a'])
})

test('selectPoll honors selector modes with latest/open fallback', () => {
  const { state, feed } = makeFeed()
  const polls = [
    { id: 'p1', status: 'closed', created_at: '2026-07-01T00:00:00Z' },
    { id: 'p2', status: 'open', created_at: '2026-06-01T00:00:00Z' },
    { id: 'p3', status: 'closed', created_at: '2026-07-05T00:00:00Z' }
  ]
  assert.equal(feed.selectPoll(polls).id, 'p2', 'latestOpen prefers the open poll')
  state.pollSelector = { mode: 'latest', descriptor: 'latest', explicitId: '' }
  assert.equal(feed.selectPoll(polls).id, 'p3', 'latest picks newest')
  state.pollSelector = { mode: 'id', descriptor: 'p1', explicitId: 'p1' }
  assert.equal(feed.selectPoll(polls).id, 'p1', 'id picks the explicit poll')
  state.pollSelector = { mode: 'id', descriptor: 'nope', explicitId: 'nope' }
  assert.equal(feed.selectPoll(polls), null, 'missing explicit id selects nothing')
})

test('pure helpers: totals, projection, ranking', () => {
  assert.equal(getTotalVotes({ options: [{ votes: 2 }, { votes: 3 }] }), 5)
  assert.equal(getTotalVotes(null), 0)
  const view = {
    id: 'v1',
    title: 'T',
    status: 'open',
    questions: [
      { id: 'q1', text: 'a', votes: 4 },
      { id: 'q2', text: 'b', votes: 1 }
    ]
  }
  assert.equal(getQnaTotalVotes(view), 5)
  assert.deepEqual(qnaViewAsPollShape(view).options, [
    { id: 'q1', label: 'a', votes: 4 },
    { id: 'q2', label: 'b', votes: 1 }
  ])
  assert.equal(qnaViewAsPollShape(null), null)
  const ranked = sortQnaQuestions([
    { id: 'a', text: 'x', votes: 1, created_at: '2026-07-01T00:00:00Z' },
    { id: 'b', text: 'y', votes: 1, created_at: '2026-07-02T00:00:00Z' },
    { id: 'c', text: 'z', votes: 7, created_at: '2026-06-01T00:00:00Z' }
  ])
  assert.deepEqual(ranked.map((q) => q.id), ['c', 'b', 'a'])
})

import test from 'node:test'
import assert from 'node:assert/strict'

// Node 24 type-strips the .ts import; the module is deliberately
// dependency-free with erasable-only syntax.
import {
  pollProjection,
  pollWidgetsDataSignature,
  promptProjection,
  qnaWidgetsDataSignature,
  questionProjection
} from '../src/office/widgetDataSignatures.ts'

const makePoll = (overrides = {}) => ({
  id: 'poll-1',
  question: 'Favorite color?',
  status: 'open',
  created_at: '2026-08-01T10:00:00Z',
  options: [
    { id: 'opt-1', label: 'Red', votes: 3 },
    { id: 'opt-2', label: 'Blue', votes: 5 }
  ],
  ...overrides
})

const makeQuestion = (overrides = {}) => ({
  id: 'q-1',
  text: 'Why?',
  status: 'approved',
  votes: 2,
  prompt_id: null,
  ...overrides
})

const makePrompt = (overrides = {}) => ({
  id: 'prompt-1',
  prompt: 'Share one takeaway',
  status: 'open',
  created_at: '2026-08-01T10:00:00Z',
  ...overrides
})

test('poll signature is stable across fresh arrays with identical content', () => {
  const a = pollWidgetsDataSignature('s1', 'CODE', [makePoll()])
  const b = pollWidgetsDataSignature('s1', 'CODE', [makePoll()])
  assert.equal(a, b)
})

test('poll signature changes when a vote count changes', () => {
  const before = pollWidgetsDataSignature('s1', 'CODE', [makePoll()])
  const after = pollWidgetsDataSignature('s1', 'CODE', [
    makePoll({
      options: [
        { id: 'opt-1', label: 'Red', votes: 4 },
        { id: 'opt-2', label: 'Blue', votes: 5 }
      ]
    })
  ])
  assert.notEqual(before, after)
})

test('poll signature tracks every rendered field', () => {
  const base = pollWidgetsDataSignature('s1', 'CODE', [makePoll()])
  const variants = [
    pollWidgetsDataSignature('s2', 'CODE', [makePoll()]),
    pollWidgetsDataSignature('s1', 'OTHER', [makePoll()]),
    pollWidgetsDataSignature('s1', 'CODE', [makePoll({ question: 'Changed?' })]),
    pollWidgetsDataSignature('s1', 'CODE', [makePoll({ status: 'closed' })]),
    // created_at drives which poll unbound widgets pick, so it must count.
    pollWidgetsDataSignature('s1', 'CODE', [
      makePoll({ created_at: '2026-08-02T10:00:00Z' })
    ]),
    pollWidgetsDataSignature('s1', 'CODE', [
      makePoll({
        options: [
          { id: 'opt-1', label: 'Crimson', votes: 3 },
          { id: 'opt-2', label: 'Blue', votes: 5 }
        ]
      })
    ]),
    pollWidgetsDataSignature('s1', 'CODE', [])
  ]
  for (const variant of variants) {
    assert.notEqual(base, variant)
  }
})

test('poll projection excludes non-rendered fields', () => {
  const a = pollProjection(makePoll())
  const b = pollProjection(makePoll({ session_id: 'other', mode: 'auto' }))
  assert.deepEqual(a, b)
})

test('qna signature is stable across fresh arrays with identical content', () => {
  const a = qnaWidgetsDataSignature('s1', 'CODE', [makeQuestion()], [makePrompt()])
  const b = qnaWidgetsDataSignature('s1', 'CODE', [makeQuestion()], [makePrompt()])
  assert.equal(a, b)
})

test('qna signature changes with question and prompt content', () => {
  const base = qnaWidgetsDataSignature('s1', 'CODE', [makeQuestion()], [makePrompt()])
  const variants = [
    qnaWidgetsDataSignature('s1', 'CODE', [makeQuestion({ votes: 3 })], [makePrompt()]),
    qnaWidgetsDataSignature(
      's1',
      'CODE',
      [makeQuestion({ status: 'pending' })],
      [makePrompt()]
    ),
    qnaWidgetsDataSignature(
      's1',
      'CODE',
      [makeQuestion({ prompt_id: 'prompt-1' })],
      [makePrompt()]
    ),
    qnaWidgetsDataSignature(
      's1',
      'CODE',
      [makeQuestion()],
      [makePrompt({ prompt: 'New prompt text' })]
    ),
    qnaWidgetsDataSignature(
      's1',
      'CODE',
      [makeQuestion()],
      [makePrompt({ status: 'closed' })]
    ),
    qnaWidgetsDataSignature('s1', 'CODE', [], [makePrompt()])
  ]
  for (const variant of variants) {
    assert.notEqual(base, variant)
  }
})

test('question and prompt projections are arrays (stable key order)', () => {
  assert.ok(Array.isArray(questionProjection(makeQuestion())))
  assert.ok(Array.isArray(promptProjection(makePrompt())))
})

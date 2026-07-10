import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ARTIFACT_QNA_MAX_PAYLOAD_QUESTIONS,
  ARTIFACT_QNA_RECOMMENDED_VISIBLE_QUESTIONS,
  bakePositionOverridesIntoHtml,
  buildArtifactEditContextMarkup,
  buildArtifactLiveHookContext,
  buildArtifactPayloadKey,
  buildArtifactQnaCapacityMeta,
  buildArtifactQnaPayloadKey,
  createArtifactPayloadBuilders,
  estimateArtifactVoteCapacity
} from '../public/poc/gamified/poll-game-gamified-artifact-payloads.js'

test('estimateArtifactVoteCapacity: explicit audience size wins, else rounded heuristic', () => {
  const explicit = estimateArtifactVoteCapacity({ options: [] }, { audienceSize: 'about 350 people' })
  assert.equal(explicit.expectedMaxVotes, 350)
  const heuristic = estimateArtifactVoteCapacity(
    { options: [{ votes: 3 }, { votes: 4 }] },
    null
  )
  assert.equal(heuristic.expectedMaxVotes, 100, 'floor of 100 rounded to a step')
  assert.equal(heuristic.recommendedVisibleUnits, 20)
  assert.equal(heuristic.avoidOneToOneVoteObjects, true)
})

test('qna capacity meta shares one formula', () => {
  assert.deepEqual(buildArtifactQnaCapacityMeta(null), {
    recommendedVisibleQuestions: ARTIFACT_QNA_RECOMMENDED_VISIBLE_QUESTIONS,
    expectedMaxQuestions: 20
  })
  assert.equal(
    buildArtifactQnaCapacityMeta({ questions: new Array(30).fill({}) }).expectedMaxQuestions,
    60
  )
})

test('payload keys are stable and change with votes', () => {
  const payload = {
    poll: { id: 'p1', question: 'Q', status: 'open', options: [{ id: 'o1', label: 'A', votes: 1, percentage: 100 }] },
    totalVotes: 1,
    meta: {}
  }
  const key = buildArtifactPayloadKey(payload)
  assert.equal(buildArtifactPayloadKey(structuredClone(payload)), key)
  const bumped = structuredClone(payload)
  bumped.poll.options[0].votes = 2
  assert.notEqual(buildArtifactPayloadKey(bumped), key)

  const qnaPayload = {
    kind: 'qna',
    qna: { id: 's1', title: 'T', status: 'open', questions: [{ id: 'q1', text: 'x', votes: 1 }] },
    totalVotes: 1,
    meta: {}
  }
  const qnaKey = buildArtifactQnaPayloadKey(qnaPayload)
  assert.equal(buildArtifactQnaPayloadKey(structuredClone(qnaPayload)), qnaKey)
  const qnaBumped = structuredClone(qnaPayload)
  qnaBumped.qna.questions[0].votes = 3
  assert.notEqual(buildArtifactQnaPayloadKey(qnaBumped), qnaKey)
})

test('bakePositionOverridesIntoHtml injects transforms by hint', () => {
  const html = '<div id="poll-question" style="color: red">Q</div><div data-option-id="o1">A</div>'
  const out = bakePositionOverridesIntoHtml(html, [
    { role: 'poll-question', dx: 10, dy: -4 },
    { role: 'option-row', optionId: 'o1', dx: 3, dy: 3 },
    { role: 'poll-question', dx: 0, dy: 0 }
  ])
  assert.ok(out.includes('style="color: red; transform: translate(10px, -4px);"'))
  assert.ok(out.includes('data-option-id="o1" style="transform: translate(3px, 3px);"'))
})

const bigPad = '<div>'.padEnd(45000, 'x')
const pollHookScript = '<script>window.prezoSetPollRenderer(function (s) {})</script>'
const qnaHookScript = '<script>window.prezoSetQnaRenderer(function (s) {})</script>'

test('edit-context compression keeps the kind-matching hook scripts', () => {
  const markup = `${bigPad}${pollHookScript}${qnaHookScript}</div>`
  const pollContext = buildArtifactEditContextMarkup(markup)
  assert.ok(pollContext.includes('prezoSetPollRenderer'))
  const qnaContext = buildArtifactEditContextMarkup(markup, 'qna')
  assert.ok(qnaContext.includes('prezoSetQnaRenderer'))
  // Small markup is passed through untouched regardless of kind.
  const small = `<html>${pollHookScript}</html>`
  assert.equal(buildArtifactEditContextMarkup(small, 'discussion'), small)
})

test('live-hook context extracts only the kind-matching wiring', () => {
  const markup = `<html><body>${pollHookScript}${qnaHookScript}</body></html>`
  assert.equal(buildArtifactLiveHookContext(markup), pollHookScript)
  assert.equal(buildArtifactLiveHookContext(markup, 'discussion'), qnaHookScript)
  assert.equal(buildArtifactLiveHookContext('<html></html>', 'qna'), '')
})

function makeBuilders({ activityKind = 'poll' } = {}) {
  const state = {
    apiBase: 'https://api.example',
    sessionId: 's1',
    code: 'AB12',
    socketStatus: 'connected',
    activityKind,
    pollSelector: { mode: 'latestOpen', descriptor: 'latest/open', explicitId: '' },
    promptSelector: { mode: 'id', descriptor: 'pr1', explicitId: 'pr1' },
    currentPoll: { id: 'p1', question: 'Best color?', status: 'open', options: [{ id: 'o1', label: 'Red', votes: 2 }] },
    currentQnaView: {
      id: 'pr1',
      title: 'Ask anything',
      status: 'open',
      questions: new Array(15).fill(null).map((_, i) => ({ id: `q${i}`, text: `question ${i}`, votes: 15 - i }))
    },
    artifact: {
      html: '',
      package: null,
      lastPrompt: 'sticky notes',
      lastAnswers: { artifactType: 'board', designGuidelines: '', brandProfileName: '', referenceImageGuidelines: '' },
      savedStyleOverrides: {},
      editHistory: []
    }
  }
  const builders = createArtifactPayloadBuilders({
    state,
    getCurrentTheme: () => ({ visualMode: 'artifact', bgA: '#000', bgB: '#111' }),
    artifactPosition: { buildAiPositionContext: () => [], getMergedPositionOverrides: () => ({}) },
    artifactSize: { buildAiSizeContext: () => [], getMergedSizeOverrides: () => ({}) },
    getPendingStyleOverrides: () => ({}),
    getPendingCopyOverrides: () => ({}),
    getEyebrowHtml: () => 'Eyebrow',
    getQuestionHtml: () => 'Question'
  })
  return { state, builders }
}

test('poll payload carries options, percentages, and capacity hints', () => {
  const { state, builders } = makeBuilders()
  const payload = builders.buildArtifactPollPayload(state.currentPoll, 2)
  assert.equal(payload.poll.id, 'p1')
  assert.deepEqual(payload.poll.options[0], { id: 'o1', label: 'Red', votes: 2, percentage: 100 })
  assert.equal(payload.meta.sessionId, 's1')
  assert.ok(payload.meta.expectedMaxVotes >= 100)
  assert.ok(!('artifactCopy' in payload.meta), 'no copy overrides → no artifactCopy block')
})

test('qna payload caps the shipped list but reports the real total', () => {
  const { state, builders } = makeBuilders({ activityKind: 'discussion' })
  state.currentQnaView.questions = new Array(80)
    .fill(null)
    .map((_, i) => ({ id: `q${i}`, text: `t${i}`, votes: 80 - i }))
  const payload = builders.buildArtifactQnaPayload(state.currentQnaView)
  assert.equal(payload.qna.questions.length, ARTIFACT_QNA_MAX_PAYLOAD_QUESTIONS)
  assert.equal(payload.qna.totalQuestions, 80)
  assert.equal(payload.totalQuestions, 80)
  assert.equal(payload.kind, 'discussion')
  assert.equal(payload.meta.selector, 'pr1')
  assert.equal(payload.qna.questions[0].rank, 1)
})

test('poll build context has no activityKind key and speaks the poll contract', () => {
  const { builders } = makeBuilders()
  const context = builders.buildArtifactContext({ prompt: 'p', answers: {} })
  assert.ok(!('activityKind' in context), 'poll context byte-stability')
  assert.equal(context.runtimeApi.setRenderer, 'window.prezoSetPollRenderer(fn)')
  assert.equal(context.pollTitle, 'Best color?')
  assert.ok(context.dataEndpoints.pollsList.includes('/sessions/s1/polls'))
  assert.equal(context.qnaTitle, '')
})

test('qna build context stamps the kind and the qna contract', () => {
  const { builders } = makeBuilders({ activityKind: 'qna' })
  const context = builders.buildArtifactContext({ prompt: 'p', answers: {} })
  assert.equal(context.activityKind, 'qna')
  assert.equal(context.runtimeApi.setRenderer, 'window.prezoSetQnaRenderer(fn)')
  assert.equal(context.qnaTitle, 'Ask anything')
  assert.equal(context.activitySelector, 'session')
  assert.equal(context.recommendedVisibleQuestions, ARTIFACT_QNA_RECOMMENDED_VISIBLE_QUESTIONS)
  assert.ok(context.dataEndpoints.questionsList.includes('/sessions/s1/questions'))
  assert.equal(context.pollTitle, '')
})

test('editor context samples qna questions and reads DOM through getters', () => {
  // extractPlainTextFromHtml needs a document; provide a minimal stub.
  globalThis.document = {
    createElement: () => {
      const node = { innerHTML: '' }
      Object.defineProperty(node, 'textContent', {
        get() {
          return node.innerHTML.replace(/<[^>]*>/g, '')
        }
      })
      return node
    }
  }
  try {
    const { builders } = makeBuilders({ activityKind: 'discussion' })
    const context = builders.buildAiEditorContext()
    assert.equal(context.activityKind, 'discussion')
    assert.equal(context.qna.totalQuestions, 15)
    assert.equal(context.qna.questions.length, 12, 'design-context sample is capped')
    assert.equal(context.poll, null)
    assert.deepEqual(context.currentText, { eyebrow: 'Eyebrow', question: 'Question' })
    assert.equal(context.visualMode, 'artifact')
    assert.equal(context.artifact.enabled, true)
  } finally {
    delete globalThis.document
  }
})

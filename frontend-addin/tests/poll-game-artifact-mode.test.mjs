import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildArtifactAiPrompt,
  buildArtifactEditPrompt,
  buildArtifactRepairPrompt,
  normalizeArtifactActivityKind
} from '../public/poc/gamified/poll-game-gamified-artifact-mode.js'

test('normalizeArtifactActivityKind coerces unknowns to poll', () => {
  assert.equal(normalizeArtifactActivityKind('poll'), 'poll')
  assert.equal(normalizeArtifactActivityKind('QNA'), 'qna')
  assert.equal(normalizeArtifactActivityKind(' discussion '), 'discussion')
  assert.equal(normalizeArtifactActivityKind('mystery'), 'poll')
  assert.equal(normalizeArtifactActivityKind(null), 'poll')
  assert.equal(normalizeArtifactActivityKind(42), 'poll')
})

test('poll ai prompt speaks the poll contract only', () => {
  const prompt = buildArtifactAiPrompt('race cars', {
    pollTitle: 'Best color?',
    pollSelector: 'latest/open'
  })
  assert.ok(prompt.includes('prezoSetPollRenderer'))
  assert.ok(prompt.includes('Live poll title: Best color?'))
  assert.ok(!prompt.includes('prezoSetQnaRenderer'))
})

test('qna ai prompt speaks the qna contract only', () => {
  const prompt = buildArtifactAiPrompt('sticky notes', {
    activityKind: 'qna',
    qnaTitle: 'Ask us anything'
  })
  assert.ok(prompt.includes('prezoSetQnaRenderer'))
  assert.ok(prompt.includes('prezo-qna-state') || prompt.includes('state.qna.questions'))
  assert.ok(prompt.includes('Live Q&A title: Ask us anything'))
  assert.ok(prompt.includes('empty state'))
  assert.ok(!prompt.includes('prezoSetPollRenderer'))
})

test('discussion ai prompt frames the host prompt', () => {
  const prompt = buildArtifactAiPrompt('mural wall', {
    activityKind: 'discussion',
    qnaTitle: 'What should we improve?'
  })
  assert.ok(prompt.includes('Live discussion prompt: What should we improve?'))
  assert.ok(prompt.includes('prezoSetQnaRenderer'))
})

test('edit and repair prompts preserve the wiring of their own kind', () => {
  const pollEdit = buildArtifactEditPrompt('bigger title', {})
  assert.ok(pollEdit.includes('prezoSetPollRenderer'))
  assert.ok(!pollEdit.includes('prezoSetQnaRenderer'))

  const qnaEdit = buildArtifactEditPrompt('bigger title', {}, 'qna')
  assert.ok(qnaEdit.includes('prezoSetQnaRenderer'))
  assert.ok(!qnaEdit.includes('prezoSetPollRenderer'))

  const discussionRepair = buildArtifactRepairPrompt('bigger title', 'boom', {}, 'discussion')
  assert.ok(discussionRepair.includes('prezoRenderQna'))
})

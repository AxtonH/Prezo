import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildArtifactRenderHealthErrorMessage,
  createArtifactWizard,
  isArtifactFeedbackFollowupRequest,
  isArtifactQuestionRequest,
  resolveArtifactEditRequest,
  shouldRejectArtifactRenderHealth
} from '../public/poc/gamified/poll-game-gamified-artifact-wizard.js'

// ── Pure policy helpers ──

test('isArtifactQuestionRequest separates questions from polite edit requests', () => {
  assert.equal(isArtifactQuestionRequest('what does the footer show?'), true)
  assert.equal(isArtifactQuestionRequest('How does this update live?'), true)
  assert.equal(isArtifactQuestionRequest('can you change the background to blue'), false)
  assert.equal(isArtifactQuestionRequest('make the title bigger'), false)
  assert.equal(isArtifactQuestionRequest('is the poll title dynamic?'), true)
  assert.equal(isArtifactQuestionRequest(''), false)
})

test('resolveArtifactEditRequest expands feedback follow-ups from history', () => {
  const history = [
    { tone: 'user', text: 'make the sky a neon city skyline' },
    { tone: 'assistant', text: 'done' }
  ]
  assert.equal(resolveArtifactEditRequest('add a logo', history), 'add a logo')
  const expanded = resolveArtifactEditRequest("nothing changed", history)
  assert.ok(expanded.includes('Retry the previous background-only edit more strongly.'))
  assert.ok(expanded.includes('make the sky a neon city skyline'))
  const targeted = resolveArtifactEditRequest(
    "didn't work",
    [{ tone: 'user', text: 'make the title italic' }]
  )
  assert.ok(targeted.includes('Retry the previous targeted edit more faithfully.'))
  assert.equal(resolveArtifactEditRequest('still blank', []), 'still blank')
  assert.equal(isArtifactFeedbackFollowupRequest('still the same'), true)
})

test('render-health rejection policy', () => {
  const meaningful = { visibleElementCount: 40, textLength: 200 }
  assert.equal(shouldRejectArtifactRenderHealth(meaningful), false)
  assert.equal(shouldRejectArtifactRenderHealth({ ...meaningful, likelyBlank: true }), true)
  const washed = { ...meaningful, likelyWashedOut: true }
  assert.equal(shouldRejectArtifactRenderHealth(washed, 'add confetti'), true)
  assert.equal(
    shouldRejectArtifactRenderHealth(washed, 'give it a minimal white look'),
    false,
    'pale look allowed when the user asked for it'
  )
  assert.equal(
    shouldRejectArtifactRenderHealth({ visibleElementCount: 3, textLength: 10 }),
    true,
    'no meaningful scene'
  )
  assert.ok(
    buildArtifactRenderHealthErrorMessage({ likelyWashedOut: true }).includes('washed-out')
  )
  assert.ok(
    buildArtifactRenderHealthErrorMessage({ visibleElementCount: 2 }).includes(
      'without meaningful content'
    )
  )
})

// ── Factory harness ──

function makeWizard(overrides = {}) {
  const state = {
    activityKind: 'poll',
    isUnloading: false,
    artifact: {
      busy: false,
      intake: { messages: [], busy: false, done: false },
      conversationAnswers: {
        artifactType: '',
        designGuidelines: '',
        brandProfileName: '',
        referenceImageGuidelines: ''
      },
      conversationStepIndex: 0,
      lastAnswers: { artifactType: 'board', brandProfileName: '' },
      editPromptQueue: [],
      editQueueSeq: 0,
      editQueueActivePrompt: '',
      activeEditRequest: '',
      autoRepairInFlight: false,
      repairAttemptCount: 0,
      lastRuntimeError: '',
      editHistory: [],
      pendingSuccessMessage: ''
    }
  }
  const calls = {
    intake: [],
    builds: [],
    answers: [],
    submits: [],
    chat: [],
    applied: [],
    shellExpanded: 0,
    conversationSyncs: 0
  }
  const deps = {
    state,
    requestAiArtifactIntake: async (messages, options) => {
      calls.intake.push({ messages: structuredClone(messages), options })
      if (overrides.intakeError) throw new Error(overrides.intakeError)
      return overrides.intakeReply ?? { action: 'ask', question: 'Which vibe?', topic: 'style' }
    },
    requestAiArtifactBuild: async (prompt, context) => {
      calls.builds.push({ prompt, context })
      if (overrides.buildError) throw new Error(overrides.buildError)
      return { html: '<html>ok</html>', package: null }
    },
    requestAiArtifactAnswer: async (prompt, context) => {
      calls.answers.push({ prompt, context })
      return { text: 'It animates live.' }
    },
    buildArtifactContext: (input) => ({ enabled: true, mode: input?.mode }),
    buildAiEditorContext: () => ({ poll: null }),
    submitArtifactPrompt: async (prompt, options) => {
      calls.submits.push({ prompt, options })
    },
    appendArtifactEditMessage: (role, text) => calls.chat.push({ role, text }),
    clearPromptInput: () => {},
    serializePromptInput: () => ({ text: overrides.composerText ?? '' }),
    clearArtifactBuildReferenceUi: () => {},
    renderArtifactPromptQueue: () => {},
    syncArtifactComposerBusyState: () => {},
    syncArtifactConversationUi: () => {
      calls.conversationSyncs += 1
    },
    startArtifactIntakeThinking: () => {},
    stopArtifactIntakeThinking: () => {},
    setEditorShellExpanded: () => {
      calls.shellExpanded += 1
    },
    ensureArtifactBrandProfilesLoaded: async () => {},
    collectReferenceImagePayloads: () => [],
    collectReadyAttachmentUrls: () => [],
    isArtifactConversationComplete: () => state.artifact.intake.done,
    applyArtifactMarkup: (html, options) => {
      calls.applied.push({ html, options })
      return overrides.applyFails ? false : true
    },
    renderFromSnapshot: () => {},
    showArtifactStageFrame: () => {}
  }
  return { state, calls, wizard: createArtifactWizard(deps) }
}

test('intake ask reply appends the question and expands the shell for brand topics', async () => {
  const { state, calls, wizard } = makeWizard({
    intakeReply: { action: 'ask', question: 'Which brand?', topic: 'brand' }
  })
  await wizard.submitArtifactConversationAnswer('a retro leaderboard')
  assert.deepEqual(
    state.artifact.intake.messages.map((m) => m.role),
    ['user', 'assistant']
  )
  assert.equal(state.artifact.intake.messages[1].text, 'Which brand?')
  assert.equal(calls.shellExpanded, 1, 'brand topic reveals the chat log')
  assert.equal(state.artifact.intake.busy, false)
  assert.equal(calls.submits.length, 0, 'no build yet')
})

test('intake ready reply maps the brief and submits the build', async () => {
  const { state, calls, wizard } = makeWizard({
    intakeReply: {
      action: 'ready',
      brief: {
        artifactType: 'sticky wall',
        designGuidelines: 'warm colors',
        audience: 'executives',
        mustHaves: ['logo'],
        avoid: ['clutter'],
        brandProfileName: 'Prezlab Core'
      }
    }
  })
  await wizard.submitArtifactConversationAnswer('sticky notes please')
  const answers = state.artifact.conversationAnswers
  assert.equal(answers.artifactType, 'sticky wall')
  assert.ok(answers.designGuidelines.includes('warm colors'))
  assert.ok(answers.designGuidelines.includes('Audience: executives'))
  assert.ok(answers.designGuidelines.includes('Must include: logo'))
  assert.ok(answers.designGuidelines.includes('Avoid: clutter'))
  assert.equal(answers.brandProfileName, 'Prezlab Core')
  assert.equal(state.artifact.intake.done, true)
  assert.equal(calls.submits.length, 1)
  assert.ok(calls.submits[0].prompt.includes('sticky wall'))
})

test('empty answers surface the brand choice in the transcript', async () => {
  const { state, wizard } = makeWizard()
  state.artifact.conversationAnswers.brandProfileName = 'Prezlab Core'
  await wizard.submitArtifactConversationAnswer('   ')
  assert.equal(
    state.artifact.intake.messages[0].text,
    'Use the "Prezlab Core" brand profile.'
  )
})

test('intake transport errors degrade to a retry message', async () => {
  const { state, calls, wizard } = makeWizard({ intakeError: 'backend 503' })
  await wizard.submitArtifactConversationAnswer('a retro leaderboard')
  const lastMessage = state.artifact.intake.messages.at(-1)
  assert.equal(lastMessage.role, 'assistant')
  assert.ok(lastMessage.text.includes('backend 503'))
  assert.ok(lastMessage.text.includes('build now'))
  assert.equal(state.artifact.intake.busy, false)
  assert.equal(calls.submits.length, 0, 'no build after a failed intake turn')
})

test('edit prompts queue serially and questions route to the answer route', async () => {
  const flushables = []
  globalThis.window = {
    setTimeout: (fn) => {
      flushables.push(fn)
      return flushables.length
    },
    clearTimeout: () => {}
  }
  try {
    const { state, calls, wizard } = makeWizard()
    await wizard.enqueueArtifactEditPrompt('make the title bigger')
    // enqueue kicks the queue fire-and-forget; let the async chain settle.
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(calls.submits.length, 1)
    assert.equal(calls.submits[0].options.requestKind, 'edit')
    assert.equal(calls.submits[0].options.originalEditRequest, 'make the title bigger')
    assert.equal(state.artifact.editPromptQueue.length, 0)
    assert.equal(state.artifact.editQueueActivePrompt, '')

    await wizard.enqueueArtifactEditPrompt('what does the footer show?')
    assert.equal(calls.answers.length, 1, 'question routed to answer route')
    assert.equal(calls.submits.length, 1, 'no extra build for questions')
    assert.equal(calls.chat.at(-1).text, 'It animates live.')
  } finally {
    delete globalThis.window
  }
})

test('queue rejects overflow beyond 12 pending edits', async () => {
  globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} }
  try {
    const { state, calls, wizard } = makeWizard()
    state.artifact.busy = true // hold the queue so entries accumulate
    for (let i = 0; i < 13; i += 1) {
      await wizard.enqueueArtifactEditPrompt(`edit ${i}`)
    }
    assert.equal(state.artifact.editPromptQueue.length, 12)
    assert.ok(calls.chat.some((m) => m.text.includes('queue is full')))
  } finally {
    delete globalThis.window
  }
})

test('runtime repair applies the rebuilt artifact and clears the in-flight flag', async () => {
  const { state, calls, wizard } = makeWizard()
  state.artifact.autoRepairInFlight = true
  await wizard.submitArtifactRuntimeRepairRequest({
    request: 'add a skyline',
    runtimeError: 'renderer threw',
    failedArtifactHtml: '<html>bad</html>',
    failedArtifactPackage: null,
    baseArtifactHtml: '<html>stable</html>',
    baseArtifactPackage: null
  })
  assert.equal(calls.builds.length, 1)
  assert.ok(calls.builds[0].prompt.includes('add a skyline'))
  assert.equal(calls.builds[0].context.artifact.mode, 'repair')
  assert.equal(calls.applied.length, 1)
  assert.equal(state.artifact.pendingSuccessMessage, 'Artifact updated.')
  assert.equal(state.artifact.autoRepairInFlight, false)
  assert.equal(state.artifact.busy, false)
})

test('runtime repair keeps the stable artifact when the AI returns empty markup', async () => {
  const { state, calls, wizard } = makeWizard({ applyFails: true })
  await wizard.submitArtifactRuntimeRepairRequest({
    request: 'add a skyline',
    runtimeError: 'boom',
    failedArtifactHtml: '',
    failedArtifactPackage: null,
    baseArtifactHtml: '<html>stable</html>',
    baseArtifactPackage: null
  })
  assert.ok(calls.chat.at(-1).text.includes('previous working artifact was kept'))
  assert.equal(state.artifact.pendingSuccessMessage, '')
  assert.equal(state.artifact.busy, false)
})

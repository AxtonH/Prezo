/**
 * Artifact wizard + edit queue for the gamified station: the conversational
 * intake loop (ask/ready turns against the intake model), creative-brief
 * application, the serial edit prompt queue, question-vs-edit routing, the
 * runtime auto-repair request, and the render-health rejection policy.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 5). The factory owns the
 * async orchestration and queue state transitions; everything that touches
 * the DOM (composer, chat log, thinking animation, queue chips, stage) plus
 * the heavyweight build orchestrator (submitArtifactPrompt) stays in app.js
 * and arrives as injected callbacks with their original names, so function
 * bodies read exactly as they did in the closure.
 */
import { ARTIFACT_BRAND_REFERENCE_VALUE } from './poll-game-gamified-constants.js'
import {
  ARTIFACT_CONVERSATION_STEPS,
  buildArtifactConversationPrompt,
  buildArtifactEditPrompt,
  buildArtifactRepairPrompt,
  cloneArtifactConversationAnswers
} from './poll-game-gamified-artifact-mode.js'
import { asText, errorToMessage, toInt } from './poll-game-gamified-utils.js'

// ── Edit-intent helpers (frontend twins of backend artifact_edit_intent) ──

function isArtifactBackgroundEditRequest(value) {
  const text = asText(value).trim().toLowerCase()
  if (!text) {
    return false
  }
  return /(background|backdrop|sky|track|road|ground|terrain|landscape|sunrise|sunset|daytime|nighttime|lighting|light|ambient|weather|day\b|night\b|city|cityscape|urban|skyline|downtown|building|buildings|skyscraper)/.test(
    text
  )
}

export function isArtifactFeedbackFollowupRequest(value) {
  const text = asText(value).trim().toLowerCase()
  if (!text) {
    return false
  }
  return /\b(?:nothing changed|no change|still white|still blank|still the same|didn't work|didnt work|not a city|not a skyline|isn't a city|isnt a city|too white|too blank|can't see|cant see|background didn't change|background didnt change)\b/.test(
    text
  )
}

function findPreviousArtifactTargetedRequest(history, currentRequest) {
  if (!Array.isArray(history)) {
    return ''
  }
  const normalizedCurrent = asText(currentRequest).trim()
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]
    if (!entry || typeof entry !== 'object' || asText(entry.tone) !== 'user') {
      continue
    }
    const text = asText(entry.text).trim()
    if (!text || text === normalizedCurrent || isArtifactFeedbackFollowupRequest(text)) {
      continue
    }
    return text
  }
  return ''
}

/** Expand a vague "it didn't work" follow-up into a concrete retry of the
    previous targeted request. Pure: the edit history arrives as an argument. */
export function resolveArtifactEditRequest(request, editHistory) {
  const normalized = asText(request).trim()
  if (!normalized || !isArtifactFeedbackFollowupRequest(normalized)) {
    return normalized
  }
  const previousRequest = findPreviousArtifactTargetedRequest(editHistory, normalized)
  if (!previousRequest) {
    return normalized
  }
  if (isArtifactBackgroundEditRequest(previousRequest)) {
    return [
      'Retry the previous background-only edit more strongly.',
      `Previous request: ${previousRequest}.`,
      `User feedback on the last attempt: ${normalized}.`,
      'Keep cars, labels, layout, vote visuals, and foreground gameplay art unchanged.',
      'The background change must be clearly visible across the full scene and must not result in a pale, blank, or nearly white background.'
    ].join(' ')
  }
  return [
    'Retry the previous targeted edit more faithfully.',
    `Previous request: ${previousRequest}.`,
    `User feedback on the last attempt: ${normalized}.`,
    'Keep unrelated visuals unchanged.'
  ].join(' ')
}

export function isArtifactQuestionRequest(value) {
  const text = asText(value).trim().toLowerCase()
  if (!text) {
    return false
  }
  const looksLikeEditRequest = /\b(?:change|make|update|edit|set|use|swap|replace|turn|move|resize|add|remove|background|backdrop|image|photo|picture|logo|asset|color|layout|spacing|animation|font)\b/.test(
    text
  )
  if (looksLikeEditRequest && /^(can|could|would|should|please)\b/.test(text)) {
    return false
  }
  if (text.endsWith('?')) {
    return true
  }
  return /^(what|why|how|when|where|which|who|can|could|would|should|does|do|did|is|are|was|were|tell me|explain)\b/.test(
    text
  )
}

// ── Render-health rejection policy (feeds the auto-repair loop) ──

function hasMeaningfulArtifactScene(renderHealth) {
  const visibleElementCount = Math.max(0, toInt(renderHealth?.visibleElementCount))
  const largeVisibleElementCount = Math.max(0, toInt(renderHealth?.largeVisibleElementCount))
  const mediaCount = Math.max(0, toInt(renderHealth?.mediaCount))
  const textLength = Math.max(0, toInt(renderHealth?.textLength))
  return (
    visibleElementCount >= 24 ||
    largeVisibleElementCount >= 7 ||
    mediaCount > 0 ||
    textLength >= 130
  )
}

function artifactEditAllowsPaleBackground(request) {
  const text = asText(request).toLowerCase()
  if (!text) {
    return false
  }
  return /\b(?:white|minimal|airy|pale|soft white|foggy|washed|monochrome|snow)\b/.test(text)
}

/** Should a render-ok health snapshot be treated as a FAILED render? Pure:
    the active edit request arrives as an argument (a washed-out frame is
    acceptable only when the user explicitly asked for a pale look). */
export function shouldRejectArtifactRenderHealth(renderHealth, activeEditRequest = '') {
  if (!renderHealth || typeof renderHealth !== 'object') {
    return false
  }
  if (Boolean(renderHealth.likelyBlank)) {
    return true
  }
  if (
    Boolean(renderHealth.likelyWashedOut) &&
    !artifactEditAllowsPaleBackground(activeEditRequest)
  ) {
    return true
  }
  if (!hasMeaningfulArtifactScene(renderHealth)) {
    return true
  }
  return false
}

export function buildArtifactRenderHealthErrorMessage(renderHealth) {
  const visibleElementCount = Math.max(0, toInt(renderHealth?.visibleElementCount))
  const mediaCount = Math.max(0, toInt(renderHealth?.mediaCount))
  const textLength = Math.max(0, toInt(renderHealth?.textLength))
  const darkCoverCount = Math.max(0, toInt(renderHealth?.largeDarkCoverCount))
  const paleCoverCount = Math.max(0, toInt(renderHealth?.largePaleCoverCount))
  if (Boolean(renderHealth?.likelyWashedOut)) {
    return (
      'The updated artifact rendered a washed-out light frame instead of a meaningful scene. ' +
      `Visible elements: ${visibleElementCount}. Media elements: ${mediaCount}. ` +
      `Text length: ${textLength}. Pale full-frame layers: ${paleCoverCount}.`
    )
  }
  if (!hasMeaningfulArtifactScene(renderHealth)) {
    return (
      'The updated artifact rendered without meaningful content (no poll labels, options, or media). ' +
      `Visible elements: ${visibleElementCount}. Media elements: ${mediaCount}. ` +
      `Text length: ${textLength}.`
    )
  }
  return (
    'The updated artifact rendered a near-empty dark frame instead of the expected scene. ' +
    `Visible elements: ${visibleElementCount}. Media elements: ${mediaCount}. ` +
    `Text length: ${textLength}. Dark full-frame layers: ${darkCoverCount}.`
  )
}

export function createArtifactWizard(deps) {
  const {
    state,
    // Transport + payload builders (module instances created in app.js).
    requestAiArtifactIntake,
    requestAiArtifactBuild,
    requestAiArtifactAnswer,
    buildArtifactContext,
    buildAiEditorContext,
    // The heavyweight build orchestrator (stage lifecycle) stays in app.js.
    submitArtifactPrompt,
    // UI callbacks — original closure names so the bodies read unchanged.
    appendArtifactEditMessage,
    clearPromptInput,
    serializePromptInput,
    clearArtifactBuildReferenceUi,
    renderArtifactPromptQueue,
    syncArtifactComposerBusyState,
    syncArtifactConversationUi,
    startArtifactIntakeThinking,
    stopArtifactIntakeThinking,
    setEditorShellExpanded,
    ensureArtifactBrandProfilesLoaded,
    collectReferenceImagePayloads,
    collectReadyAttachmentUrls,
    isArtifactConversationComplete,
    applyArtifactMarkup,
    renderFromSnapshot,
    showArtifactStageFrame
  } = deps

  async function submitArtifactRuntimeRepairRequest({
    request,
    runtimeError,
    failedArtifactHtml,
    failedArtifactPackage,
    baseArtifactHtml,
    baseArtifactPackage
  }) {
    const normalizedRequest = asText(request).trim()
    if (!normalizedRequest) {
      state.artifact.autoRepairInFlight = false
      return
    }

    state.artifact.busy = true
    syncArtifactComposerBusyState()

    try {
      const context = buildAiEditorContext()
      const repairPrompt = buildArtifactRepairPrompt(
        normalizedRequest,
        runtimeError,
        state.artifact.lastAnswers,
        state.activityKind
      )
      context.artifact = buildArtifactContext(
        {
          prompt: repairPrompt,
          answers: state.artifact.lastAnswers,
          mode: 'repair',
          originalEditRequest: normalizedRequest,
          runtimeRenderError: runtimeError,
          failedMarkup: failedArtifactHtml,
          failedPackage: failedArtifactPackage,
          baseMarkup: baseArtifactHtml,
          basePackage: baseArtifactPackage
        },
        context.poll
      )
      const buildResult = await requestAiArtifactBuild(repairPrompt, context)
      const applied = applyArtifactMarkup(buildResult.html, {
        requestKind: 'edit',
        artifactPackage: buildResult.package || null
      })
      if (!applied) {
        const message =
          'Artifact repair failed because the AI returned empty markup. The previous working artifact was kept.'
        appendArtifactEditMessage('assistant', message)
        return
      }
      renderFromSnapshot(true)
      showArtifactStageFrame()
      const statusMessage = 'Artifact updated.'
      state.artifact.pendingSuccessMessage = statusMessage
    } catch (error) {
      const message = `Artifact repair failed: ${errorToMessage(error)}`
      state.artifact.pendingSuccessMessage = ''
      appendArtifactEditMessage('assistant', message)
    } finally {
      state.artifact.busy = false
      state.artifact.autoRepairInFlight = false
      syncArtifactComposerBusyState()
    }
  }

  async function submitArtifactConversationAnswer(answer) {
    const intake = state.artifact.intake
    if (intake.busy || isArtifactConversationComplete()) {
      return
    }
    // An empty submit is allowed when the user answered by picking from the
    // brand dropdown (the legacy designGuidelines validation lets it through);
    // surface that choice as their answer so the transcript stays coherent.
    let text = asText(answer).trim()
    if (!text) {
      const brand = asText(state.artifact.conversationAnswers?.brandProfileName).trim()
      const refText = asText(state.artifact.conversationAnswers?.referenceImageGuidelines).trim()
      text = brand && brand !== ARTIFACT_BRAND_REFERENCE_VALUE
        ? `Use the "${brand}" brand profile.`
        : refText
          ? 'Use the reference image I uploaded for the look.'
          : 'No preference — use your judgment.'
    }
    // The answer text already carries any inline `[attached image: <url>]` markers.
    // Attachments accumulate in state.artifact.attachments across intake turns and
    // are read at build submit in applyArtifactIntakeBrief below.
    intake.messages.push({ role: 'user', text })
    clearPromptInput()
    await runArtifactIntakeTurn({ forceReady: false })
  }

  async function runArtifactIntakeTurn({ forceReady }) {
    const intake = state.artifact.intake
    intake.busy = true
    startArtifactIntakeThinking({ forceReady })
    syncArtifactConversationUi()
    // Make sure the saved brand profile names are in the dropdown before the
    // call — they ride along so the intake model can offer them to the user.
    try {
      await ensureArtifactBrandProfilesLoaded()
    } catch {}
    let reply = null
    try {
      reply = await requestAiArtifactIntake(intake.messages, { forceReady })
    } catch (error) {
      intake.busy = false
      stopArtifactIntakeThinking()
      const detail = asText(error?.message).trim()
      intake.messages.push({
        role: 'assistant',
        text: detail
          ? `I hit a problem (${detail}). Send your answer again, or use the lightning bolt below to build now.`
          : 'I hit a problem. Send your answer again, or use the lightning bolt below to build now.'
      })
      syncArtifactConversationUi()
      return
    }
    intake.busy = false
    stopArtifactIntakeThinking()
    if (reply.action === 'ask' && reply.question) {
      intake.messages.push({ role: 'assistant', text: reply.question, topic: reply.topic })
      syncArtifactConversationUi()
      if (asText(reply.topic).trim().toLowerCase() === 'brand') {
        // Make sure the chat log (and its brand chips) is actually visible.
        setEditorShellExpanded(true)
      }
      return
    }
    await applyArtifactIntakeBrief(reply.brief || {})
  }

  /** Map the intake model's creative brief onto the legacy conversationAnswers
   *  shape and hand off to the unchanged build flow. */
  async function applyArtifactIntakeBrief(brief) {
    const intake = state.artifact.intake
    const answers = state.artifact.conversationAnswers
    const artifactType = asText(brief?.artifactType).trim()
    if (artifactType) {
      answers.artifactType = artifactType
    } else if (!asText(answers.artifactType).trim()) {
      const firstUser = intake.messages.find((message) => message.role === 'user')
      answers.artifactType = asText(firstUser?.text).trim() || 'poll artifact'
    }

    const guidelineParts = []
    const designGuidelines = asText(brief?.designGuidelines).trim()
    if (designGuidelines) {
      guidelineParts.push(designGuidelines)
    }
    const audience = asText(brief?.audience).trim()
    if (audience) {
      guidelineParts.push(`Audience: ${audience}`)
    }
    const mustHaves = Array.isArray(brief?.mustHaves)
      ? brief.mustHaves.map((item) => asText(item).trim()).filter(Boolean)
      : []
    if (mustHaves.length) {
      guidelineParts.push(`Must include: ${mustHaves.join('; ')}`)
    }
    const avoid = Array.isArray(brief?.avoid)
      ? brief.avoid.map((item) => asText(item).trim()).filter(Boolean)
      : []
    if (avoid.length) {
      guidelineParts.push(`Avoid: ${avoid.join('; ')}`)
    }
    if (guidelineParts.length) {
      answers.designGuidelines = guidelineParts.join('\n')
    }

    // The backend already validated the brief's brand name against the saved
    // profiles and gave an explicit dropdown selection precedence, so a
    // non-empty value here is safe to adopt; an empty one keeps the dropdown's.
    const briefBrand = asText(brief?.brandProfileName).trim()
    if (briefBrand) {
      answers.brandProfileName = briefBrand
    }

    intake.done = true
    state.artifact.conversationStepIndex = ARTIFACT_CONVERSATION_STEPS.length
    syncArtifactConversationUi()

    const conversationAnswers = cloneArtifactConversationAnswers(state.artifact.conversationAnswers)
    const prompt = buildArtifactConversationPrompt(conversationAnswers)
    await submitArtifactPrompt(prompt, {
      conversationAnswers,
      referenceImages: collectReferenceImagePayloads(),
      attachedImageUrls: collectReadyAttachmentUrls()
    })
  }

  function handleArtifactIntakeBuildNowClick() {
    const intake = state.artifact.intake
    if (intake.busy || state.artifact.busy || isArtifactConversationComplete()) {
      return
    }
    const submission = serializePromptInput()
    const answer = asText(submission.text).trim()
    if (answer) {
      intake.messages.push({ role: 'user', text: answer })
      clearPromptInput()
    }
    if (!intake.messages.some((message) => message.role === 'user')) {
      appendArtifactEditMessage('assistant', 'Tell me what kind of artifact you want first.')
      return
    }
    void runArtifactIntakeTurn({ forceReady: true })
  }

  async function enqueueArtifactEditPrompt(raw, attachmentUrls = []) {
    const normalizedRequest = asText(raw).trim()
    if (!normalizedRequest) {
      return
    }
    // Hosted URLs of the images attached inline to this edit. The request text already
    // carries the `[attached image: <url>]` markers; this list rides in attachedImageUrls
    // so the backend can re-fetch them as vision for style-matching on the edit.
    const editAttachmentUrls = (Array.isArray(attachmentUrls) ? attachmentUrls : [])
      .map((url) => asText(url).trim())
      .filter(Boolean)
    if (isArtifactQuestionRequest(normalizedRequest)) {
      const resolvedRequest = resolveArtifactEditRequest(
        normalizedRequest,
        state.artifact.editHistory
      )
      state.artifact.activeEditRequest = resolvedRequest || normalizedRequest
      state.artifact.autoRepairInFlight = false
      state.artifact.repairAttemptCount = 0
      state.artifact.lastRuntimeError = ''
      appendArtifactEditMessage('user', normalizedRequest)
      clearPromptInput()
      clearArtifactBuildReferenceUi()
      state.artifact.activeEditRequest = ''
      await submitArtifactQuestionRequest(normalizedRequest)
      return
    }
    if (state.artifact.editPromptQueue.length >= 12) {
      appendArtifactEditMessage(
        'assistant',
        'Artifact edit queue is full. Wait for pending edits to finish.'
      )
      return
    }
    state.artifact.editQueueSeq += 1
    state.artifact.editPromptQueue.push({
      id: state.artifact.editQueueSeq,
      prompt: normalizedRequest,
      attachedImageUrls: editAttachmentUrls
    })
    // Each submission consumes its attachments; clear chips + state so the next edit
    // starts fresh.
    clearArtifactBuildReferenceUi()
    appendArtifactEditMessage('user', normalizedRequest)
    clearPromptInput()
    renderArtifactPromptQueue()
    syncArtifactComposerBusyState()
    void processArtifactEditPromptQueue()
  }

  async function runQueuedArtifactEdit(normalizedRequest, attachedImageUrls = []) {
    const resolvedRequest = resolveArtifactEditRequest(
      normalizedRequest,
      state.artifact.editHistory
    )
    state.artifact.activeEditRequest = resolvedRequest || normalizedRequest
    state.artifact.autoRepairInFlight = false
    state.artifact.repairAttemptCount = 0
    state.artifact.lastRuntimeError = ''
    const prompt = buildArtifactEditPrompt(
      resolvedRequest || normalizedRequest,
      state.artifact.lastAnswers,
      state.activityKind
    )
    await submitArtifactPrompt(prompt, {
      conversationAnswers: state.artifact.lastAnswers,
      requestKind: 'edit',
      originalEditRequest: resolvedRequest || normalizedRequest,
      attachedImageUrls: Array.isArray(attachedImageUrls) ? attachedImageUrls : []
    })
  }

  async function processArtifactEditPromptQueue() {
    if (state.artifact.busy || state.artifact.editPromptQueue.length === 0 || state.isUnloading) {
      return
    }
    const next = state.artifact.editPromptQueue.shift()
    if (!next) {
      renderArtifactPromptQueue()
      syncArtifactComposerBusyState()
      return
    }
    state.artifact.editQueueActivePrompt = next.prompt
    renderArtifactPromptQueue()
    syncArtifactComposerBusyState()
    try {
      await runQueuedArtifactEdit(next.prompt, next.attachedImageUrls || [])
    } finally {
      state.artifact.editQueueActivePrompt = ''
      renderArtifactPromptQueue()
      syncArtifactComposerBusyState()
      if (state.artifact.editPromptQueue.length > 0) {
        window.setTimeout(() => {
          void processArtifactEditPromptQueue()
        }, 0)
      }
    }
  }

  async function submitArtifactQuestionRequest(request) {
    if (state.artifact.busy) {
      appendArtifactEditMessage(
        'assistant',
        'Artifact request is already running. Wait for it to finish.'
      )
      return
    }

    state.artifact.busy = true
    syncArtifactComposerBusyState()

    try {
      const context = buildAiEditorContext()
      context.artifact = buildArtifactContext(
        {
          prompt: request,
          answers: state.artifact.lastAnswers,
          mode: 'question'
        },
        context.poll
      )
      const answer = await requestAiArtifactAnswer(request, context)
      appendArtifactEditMessage('assistant', answer.text)
    } catch (error) {
      const message = `Artifact question failed: ${errorToMessage(error)}`
      appendArtifactEditMessage('assistant', message)
    } finally {
      state.artifact.busy = false
      syncArtifactComposerBusyState()
    }
  }

  return {
    submitArtifactConversationAnswer,
    handleArtifactIntakeBuildNowClick,
    enqueueArtifactEditPrompt,
    submitArtifactRuntimeRepairRequest,
    /** Exposed for tests: drive the queue without the composer UI. */
    processArtifactEditPromptQueue
  }
}

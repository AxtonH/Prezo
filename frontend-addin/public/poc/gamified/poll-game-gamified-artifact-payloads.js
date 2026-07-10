/**
 * Artifact payload + AI context builders for the gamified station.
 *
 * Two halves (see docs/gamified-station-modularization.md, Phase 3):
 * - the live state payloads the host pushes into the artifact iframe
 *   (poll options/votes or the ranked qna question list) plus their dedup
 *   keys and capacity heuristics;
 * - the model-facing build/edit context (current artifact markup, override
 *   summaries, per-kind runtime API and data endpoints).
 *
 * Extracted verbatim from the app.js closure; closure variables arrive as
 * factory deps (state, theme getter, override handlers, DOM getters). Pure
 * helpers are top-level exports so tests can lock them without a DOM.
 */
import {
  ARTIFACT_VISUAL_MODE,
  cloneArtifactConversationAnswers,
  createEmptyArtifactAnswers,
  mergeArtifactDesignGuidelines,
  normalizeArtifactActivityKind
} from './poll-game-gamified-artifact-mode.js'
import {
  buildSegmentedArtifactPackage,
  resolveArtifactHtmlFromPackage,
  sanitizeArtifactPackage
} from './poll-game-gamified-artifact-package.js'
import { extractCopyFromStyleOverrides } from './poll-game-gamified-artifact-copy.js'
import { normalizeArtifactMarkup } from './poll-game-gamified-artifact-runtime.js'
import { asText, clamp, extractPlainTextFromHtml, toInt, toWsBase } from './poll-game-gamified-utils.js'

/** How many question rows a 16:9 artifact board can show comfortably; the
    generation prompt tells the model to cap the visible list around this
    and express the rest as an overflow count. */
export const ARTIFACT_QNA_RECOMMENDED_VISIBLE_QUESTIONS = 6
/** Ceiling on questions shipped in a state payload. Boards render a top-N
    list anyway; totalQuestions still reports the real count so overflow
    indicators stay honest, and the runtime's per-frame interpolation stays
    bounded on very active sessions. */
export const ARTIFACT_QNA_MAX_PAYLOAD_QUESTIONS = 60

// Live-wiring tokens per contract family, mirroring the injected bridge and
// backend validation. The edit-context compressors below must keep the
// artifact's OWN wiring visible to the model, so they filter by kind.
const POLL_LIVE_HOOK_TOKENS = [
  'prezoSetPollRenderer',
  'prezoRenderPoll',
  'prezo:poll-update',
  '__PREZO_POLL_STATE',
  'prezoGetPollState'
]
const QNA_LIVE_HOOK_TOKENS = [
  'prezoSetQnaRenderer',
  'prezoRenderQna',
  'prezo:qna-update',
  '__PREZO_QNA_STATE',
  'prezoGetQnaState'
]

function liveHookTokensForActivityKind(activityKind) {
  return normalizeArtifactActivityKind(activityKind) === 'poll'
    ? POLL_LIVE_HOOK_TOKENS
    : QNA_LIVE_HOOK_TOKENS
}

export function estimateArtifactVoteCapacity(poll, answers = null) {
  const options = Array.isArray(poll?.options) ? poll.options : []
  const optionCount = Math.max(2, options.length || 0)
  const totalVotes = options.reduce((sum, option) => sum + toInt(option?.votes), 0)
  const explicitAudienceSize = parseArtifactAudienceSize(answers?.audienceSize)
  const expectedMaxVotes =
    explicitAudienceSize > 0
      ? explicitAudienceSize
      : roundArtifactCapacityUp(Math.max(100, optionCount * 20, totalVotes * 2))
  const recommendedVisibleUnits =
    expectedMaxVotes <= 10 ? expectedMaxVotes : expectedMaxVotes <= 40 ? 10 : expectedMaxVotes <= 100 ? 20 : 25
  const recommendedVotesPerUnit = Math.max(
    1,
    Math.ceil(expectedMaxVotes / recommendedVisibleUnits)
  )

  return {
    expectedMaxVotes,
    recommendedVisibleUnits,
    recommendedVotesPerUnit,
    avoidOneToOneVoteObjects: expectedMaxVotes > 24
  }
}

function parseArtifactAudienceSize(value) {
  const digits = asText(value).match(/\d+/)
  if (!digits) {
    return 0
  }
  return clamp(Number(digits[0]), 0, 100000, 0)
}

function roundArtifactCapacityUp(value) {
  const numeric = Math.max(1, toInt(value))
  const steps = [10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const step of steps) {
    if (numeric <= step) {
      return step
    }
  }
  return Math.ceil(numeric / 1000) * 1000
}

/** Single source of the qna sizing hints shared by the generation context
    (design-time) and the live state payload (runtime) — they must agree or
    the model designs overflow around numbers the artifact never receives. */
export function buildArtifactQnaCapacityMeta(view) {
  const totalQuestions = Array.isArray(view?.questions) ? view.questions.length : 0
  return {
    recommendedVisibleQuestions: ARTIFACT_QNA_RECOMMENDED_VISIBLE_QUESTIONS,
    expectedMaxQuestions: Math.max(20, totalQuestions * 2)
  }
}

export function buildArtifactPayloadKey(payload) {
  const poll = payload && typeof payload === 'object' ? payload.poll : {}
  const options = Array.isArray(poll?.options) ? poll.options : []
  const meta = payload && typeof payload.meta === 'object' ? payload.meta : {}
  const copy = meta.artifactCopy && typeof meta.artifactCopy === 'object' ? meta.artifactCopy : {}
  const stable = {
    poll: {
      id: asText(poll?.id),
      question: asText(poll?.question),
      status: asText(poll?.status),
      options: options.map((option, index) => ({
        id: asText(option?.id) || `option-${index}`,
        label: asText(option?.label),
        votes: toInt(option?.votes),
        percentage: toInt(option?.percentage)
      }))
    },
    totalVotes: toInt(payload?.totalVotes),
    artifactCopy: {
      subtitle: copy.subtitle || '',
      footerSuffix: copy.footerSuffix || '',
      textOverrides: copy.textOverrides && typeof copy.textOverrides === 'object' ? copy.textOverrides : null
    }
  }
  return JSON.stringify(stable)
}

export function buildArtifactQnaPayloadKey(payload) {
  const qna = payload && typeof payload === 'object' ? payload.qna : {}
  const questions = Array.isArray(qna?.questions) ? qna.questions : []
  const meta = payload && typeof payload.meta === 'object' ? payload.meta : {}
  const copy = meta.artifactCopy && typeof meta.artifactCopy === 'object' ? meta.artifactCopy : {}
  const stable = {
    kind: asText(payload?.kind),
    qna: {
      id: asText(qna?.id),
      title: asText(qna?.title),
      status: asText(qna?.status),
      questions: questions.map((question, index) => ({
        id: asText(question?.id) || `question-${index}`,
        text: asText(question?.text),
        votes: toInt(question?.votes)
      }))
    },
    totalVotes: toInt(payload?.totalVotes),
    artifactCopy: {
      subtitle: copy.subtitle || '',
      footerSuffix: copy.footerSuffix || '',
      textOverrides: copy.textOverrides && typeof copy.textOverrides === 'object' ? copy.textOverrides : null
    }
  }
  return JSON.stringify(stable)
}

/** Compress artifact markup for the model-facing edit context, always keeping
    the kind's live-wiring scripts visible even when the middle is cut. */
export function buildArtifactEditContextMarkup(markup, activityKind = 'poll') {
  const text = asText(markup)
  if (!text) {
    return ''
  }
  const normalized = text.trim()
  if (normalized.length <= 40000) {
    return normalized
  }
  const tokens = liveHookTokensForActivityKind(activityKind)
  const scriptMatches = [...normalized.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
  const hookScripts = scriptMatches
    .map((match) => asText(match?.[0]))
    .filter((scriptText) => tokens.some((token) => scriptText.includes(token)))
    .join('\n\n')
  const head = normalized.slice(0, 18000)
  const tail = normalized.slice(-6000)
  const combined = [head, hookScripts, tail].filter(Boolean).join('\n\n<!-- artifact-context-cut -->\n\n')
  return combined.length > 52000 ? `${combined.slice(0, 52000)}...` : combined
}

export function buildArtifactLiveHookContext(markup, activityKind = 'poll') {
  const text = asText(markup)
  if (!text) {
    return ''
  }
  const tokens = liveHookTokensForActivityKind(activityKind)
  const scriptMatches = [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
  const hookScripts = scriptMatches
    .map((match) => asText(match?.[0]).trim())
    .filter((scriptText) => tokens.some((token) => scriptText.includes(token)))
  if (hookScripts.length === 0) {
    return ''
  }
  return hookScripts.join('\n\n')
}

export function buildArtifactRecentEditRequests(history) {
  if (!Array.isArray(history)) {
    return []
  }
  return history
    .filter((entry) => entry && typeof entry === 'object' && asText(entry.tone) === 'user')
    .slice(-6)
    .map((entry) => asText(entry.text).trim())
    .filter(Boolean)
}

/**
 * Inject inline `style="transform: translate(...)"` into the HTML for
 * elements identified by saved position overrides. Best-effort: matches
 * are made via the override's role + optionId hints because the saved
 * HTML doesn't yet carry the runtime data-prezo-pos-id attribute.
 *
 * Used to feed the AI a representation of the artifact that REFLECTS the
 * user's manual position adjustments, so the model doesn't "fix" them
 * back to the original layout.
 *
 * @param {string} html
 * @param {Array<{stableId: string, dx: number, dy: number, role?: string, optionId?: string, label?: string}>} overrides
 * @returns {string}
 */
export function bakePositionOverridesIntoHtml(html, overrides) {
  let out = asText(html)
  if (!out || !Array.isArray(overrides) || overrides.length === 0) return out
  for (const ov of overrides) {
    if (!ov || typeof ov !== 'object') continue
    const dx = Number(ov.dx)
    const dy = Number(ov.dy)
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue
    if (dx === 0 && dy === 0) continue
    const transformPart = `transform: translate(${dx}px, ${dy}px);`
    out = injectInlineStyleByHint(out, ov, transformPart)
  }
  return out
}

/**
 * Inject an inline style fragment into the first element whose attributes
 * best match the override's hint. Returns the modified HTML, or the
 * original if no match was found.
 */
function injectInlineStyleByHint(html, override, stylePart) {
  const role = asText(override?.role).toLowerCase()
  const optionId = asText(override?.optionId)
  const stableId = asText(override?.stableId)
  const matchers = []
  if (role === 'option-row' && optionId) {
    matchers.push(new RegExp(`(<[a-z][^>]*?\\bdata-(?:option|opt|poll-option|lane|choice|answer)-id=\\"${escapeRegExp(optionId)}\\"[^>]*?)>`, 'i'))
  }
  if (role === 'poll-question') {
    matchers.push(/(<[a-z][^>]*?\bid=\"(?:poll-?question|question-?text|pollQ|question)\"[^>]*?)>/i)
    matchers.push(/(<[a-z][^>]*?\bclass=\"[^\"]*?\bpoll-question\b[^\"]*?\"[^>]*?)>/i)
  }
  if (role === 'poll-footer') {
    matchers.push(/(<[a-z][^>]*?\bid=\"(?:total-?votes(?:-?(?:display|text|bar))?|vote-?counter|poll-?footer)\"[^>]*?)>/i)
    matchers.push(/(<[a-z][^>]*?\bclass=\"[^\"]*?(?:total-?votes|vote-?counter|poll-?footer)[^\"]*?\"[^>]*?)>/i)
  }
  if (role === 'poll-subtitle') {
    matchers.push(/(<[a-z][^>]*?\bid=\"(?:poll-?subtitle|subtitle|sub-?title)\"[^>]*?)>/i)
    matchers.push(/(<[a-z][^>]*?\bclass=\"[^\"]*?\bsubtitle\b[^\"]*?\"[^>]*?)>/i)
  }
  if (role === 'background') {
    matchers.push(/(<[a-z][^>]*?\bdata-prezo-background-layer=\"true\"[^>]*?)>/i)
  }
  if (role === 'foreground') {
    matchers.push(/(<[a-z][^>]*?\bdata-prezo-foreground-layer=\"true\"[^>]*?)>/i)
  }
  if (stableId) {
    matchers.push(new RegExp(`(<[a-z][^>]*?\\bdata-prezo-text-id=\\"${escapeRegExp(stableId)}\\"[^>]*?)>`, 'i'))
  }
  for (const re of matchers) {
    const next = html.replace(re, (full, openTag) => `${appendInlineStyleToOpenTag(openTag, stylePart)}>`)
    if (next !== html) return next
  }
  return html
}

function appendInlineStyleToOpenTag(openTag, stylePart) {
  if (/\bstyle=\"[^\"]*\"/i.test(openTag)) {
    return openTag.replace(/\bstyle=\"([^\"]*)\"/i, (m, existing) => {
      const trimmed = (existing || '').trim()
      const sep = trimmed && !trimmed.endsWith(';') ? '; ' : (trimmed ? ' ' : '')
      return `style="${trimmed}${sep}${stylePart}"`
    })
  }
  return `${openTag} style="${stylePart}"`
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createArtifactPayloadBuilders({
  state,
  /** () => theme — currentTheme is a reassignable closure binding in app.js. */
  getCurrentTheme,
  artifactPosition,
  artifactSize,
  /** () => object — pending (unsaved) style overrides map. */
  getPendingStyleOverrides,
  /** () => object — pending (unsaved) copy overrides (subtitle/footer/text). */
  getPendingCopyOverrides,
  /** () => string — current eyebrow innerHTML (DOM stays in app.js). */
  getEyebrowHtml,
  /** () => string — current question innerHTML. */
  getQuestionHtml
}) {
  function getMergedArtifactCopyForPayload() {
    const savedOverrides = state.artifact.savedStyleOverrides || {}
    const saved = extractCopyFromStyleOverrides(savedOverrides)
    const pendingArtifactCopyOverrides = getPendingCopyOverrides()
    const subtitle = pendingArtifactCopyOverrides.subtitle ?? saved.subtitle
    const footerSuffix = pendingArtifactCopyOverrides.footerSuffix ?? saved.footerSuffix
    const mergedTextOverrides = {
      ...(saved.textOverrides || {}),
      ...(pendingArtifactCopyOverrides.textOverrides || {})
    }
    const hasTextOverrides = Object.keys(mergedTextOverrides).length > 0
    if (subtitle === undefined && footerSuffix === undefined && !hasTextOverrides) return null
    const result = {}
    if (subtitle !== undefined) result.subtitle = subtitle
    if (footerSuffix !== undefined) result.footerSuffix = footerSuffix
    if (hasTextOverrides) result.textOverrides = mergedTextOverrides
    return result
  }

  function buildArtifactPollPayload(poll, totalVotes) {
    const voteCapacity = estimateArtifactVoteCapacity(poll, state.artifact.lastAnswers)
    const options = Array.isArray(poll?.options)
      ? poll.options.map((option, index) => {
          const votes = toInt(option?.votes)
          const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
          return {
            id: asText(option?.id) || `option-${index}`,
            label: asText(option?.label) || `Option ${index + 1}`,
            votes,
            percentage
          }
        })
      : []

    const meta = {
      sessionId: asText(state.sessionId),
      code: asText(state.code),
      selector: asText(state.pollSelector?.descriptor),
      socketStatus: asText(state.socketStatus),
      expectedMaxVotes: voteCapacity.expectedMaxVotes,
      recommendedVisibleUnits: voteCapacity.recommendedVisibleUnits,
      recommendedVotesPerUnit: voteCapacity.recommendedVotesPerUnit,
      avoidOneToOneVoteObjects: voteCapacity.avoidOneToOneVoteObjects
    }
    const artifactCopy = getMergedArtifactCopyForPayload()
    if (artifactCopy) {
      meta.artifactCopy = artifactCopy
    }
    return {
      poll: {
        id: asText(poll?.id),
        question: asText(poll?.question),
        status: asText(poll?.status),
        options
      },
      totalVotes,
      meta
    }
  }

  function buildArtifactQnaPayload(view) {
    const source = Array.isArray(view?.questions) ? view.questions : []
    const totalVotes = source.reduce((sum, question) => sum + toInt(question?.votes), 0)
    const questions = source
      .slice(0, ARTIFACT_QNA_MAX_PAYLOAD_QUESTIONS)
      .map((question, index) => {
        const votes = toInt(question?.votes)
        return {
          id: asText(question?.id) || `question-${index}`,
          text: asText(question?.text),
          votes,
          percentage: totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0,
          rank: index + 1
        }
      })
    const meta = {
      sessionId: asText(state.sessionId),
      code: asText(state.code),
      activityKind: state.activityKind,
      selector:
        state.activityKind === 'discussion' ? asText(state.promptSelector?.descriptor) : 'session',
      socketStatus: asText(state.socketStatus),
      ...buildArtifactQnaCapacityMeta(view)
    }
    const artifactCopy = getMergedArtifactCopyForPayload()
    if (artifactCopy) {
      meta.artifactCopy = artifactCopy
    }
    return {
      kind: state.activityKind,
      qna: {
        id: asText(view?.id),
        title: asText(view?.title),
        prompt: asText(view?.title),
        status: asText(view?.status),
        questions,
        totalQuestions: source.length,
        totalVotes
      },
      totalQuestions: source.length,
      totalVotes,
      meta
    }
  }

  function buildArtifactContext(artifactInput, pollContext = null) {
    const sessionId = asText(state.sessionId)
    const code = asText(state.code)
    const apiBase = asText(state.apiBase)
    const encodedSession = sessionId ? encodeURIComponent(sessionId) : '{session_id}'
    const encodedCode = code ? encodeURIComponent(code) : '{code}'
    const wsBase = toWsBase(apiBase)
    const prompt =
      typeof artifactInput === 'string' ? artifactInput : asText(artifactInput?.prompt)
    const answers =
      artifactInput && typeof artifactInput === 'object'
        ? cloneArtifactConversationAnswers(artifactInput.answers)
        : createEmptyArtifactAnswers()
    const requestMode =
      artifactInput && typeof artifactInput === 'object' ? asText(artifactInput.mode) : ''
    const baseArtifactMarkupInput =
      artifactInput && typeof artifactInput === 'object'
        ? asText(artifactInput.baseMarkup) || state.artifact.html
        : state.artifact.html
    const baseArtifactPackageInput =
      artifactInput && typeof artifactInput === 'object'
        ? artifactInput.basePackage || state.artifact.package
        : state.artifact.package
    const baseArtifactPackage = buildSegmentedArtifactPackage(
      sanitizeArtifactPackage(baseArtifactPackageInput, baseArtifactMarkupInput) || baseArtifactMarkupInput
    )
    const baseArtifactMarkup =
      resolveArtifactHtmlFromPackage(baseArtifactPackage) || normalizeArtifactMarkup(baseArtifactMarkupInput)
    const failedArtifactMarkupInput =
      artifactInput && typeof artifactInput === 'object' ? asText(artifactInput.failedMarkup) : ''
    const failedArtifactPackageInput =
      artifactInput && typeof artifactInput === 'object' ? artifactInput.failedPackage : null
    const failedArtifactPackage = buildSegmentedArtifactPackage(
      sanitizeArtifactPackage(failedArtifactPackageInput, failedArtifactMarkupInput) ||
        failedArtifactMarkupInput
    )
    const failedArtifactMarkup =
      resolveArtifactHtmlFromPackage(failedArtifactPackage) ||
      normalizeArtifactMarkup(failedArtifactMarkupInput)
    const runtimeRenderError =
      artifactInput && typeof artifactInput === 'object'
        ? asText(artifactInput.runtimeRenderError)
        : ''
    const originalEditRequest =
      artifactInput && typeof artifactInput === 'object'
        ? asText(artifactInput.originalEditRequest)
        : ''
    const voteCapacity = estimateArtifactVoteCapacity(pollContext || state.currentPoll, answers)
    const savedOverridesView = extractCopyFromStyleOverrides(state.artifact.savedStyleOverrides || {})
    const savedPositionOverrides = savedOverridesView.positionOverrides || {}
    const savedSizeOverrides = savedOverridesView.sizeOverrides || {}
    const aiPositionOverrides = artifactPosition.buildAiPositionContext(
      artifactPosition.getMergedPositionOverrides(savedPositionOverrides)
    )
    const aiSizeOverrides = artifactSize.buildAiSizeContext(
      artifactSize.getMergedSizeOverrides(savedSizeOverrides)
    )
    // Bake transforms into the HTML the AI sees so the model perceives the
    // moved layout directly. The runtime DOM keeps overrides off the saved
    // HTML — this is only done for the model-facing copy.
    const baseArtifactMarkupForAi = bakePositionOverridesIntoHtml(baseArtifactMarkup, aiPositionOverrides)

    return {
      enabled: true,
      lastPrompt: prompt,
      requestMode: requestMode || (state.artifact.html ? 'edit' : 'build'),
      hasExistingArtifact: Boolean(baseArtifactMarkup),
      currentArtifactFullHtml: asText(baseArtifactMarkupForAi).trim(),
      currentArtifactHtml: buildArtifactEditContextMarkup(baseArtifactMarkupForAi, state.activityKind),
      currentArtifactPackage: baseArtifactPackage,
      currentArtifactLiveHooks: buildArtifactLiveHookContext(baseArtifactMarkup, state.activityKind),
      failedArtifactHtml: buildArtifactEditContextMarkup(failedArtifactMarkup, state.activityKind),
      failedArtifactPackage: failedArtifactPackage,
      runtimeRenderError,
      originalEditRequest: originalEditRequest || prompt,
      recentEditRequests: buildArtifactRecentEditRequests(state.artifact.editHistory),
      // Only stamp the kind for the new kinds: poll requests stay
      // byte-identical to the pre-kind era (the backend defaults to poll).
      ...(state.activityKind !== 'poll' ? { activityKind: state.activityKind } : {}),
      runtimeApi:
        state.activityKind !== 'poll'
          ? {
              setRenderer: 'window.prezoSetQnaRenderer(fn)',
              renderHook: 'window.prezoRenderQna(state)',
              getState: 'window.prezoGetQnaState()'
            }
          : {
              setRenderer: 'window.prezoSetPollRenderer(fn)',
              renderHook: 'window.prezoRenderPoll(state)',
              getState: 'window.prezoGetPollState()'
            },
      pollTitle:
        state.activityKind === 'poll'
          ? asText(state.currentPoll?.question) || asText(pollContext?.question) || ''
          : '',
      pollSelector: state.activityKind === 'poll' ? asText(state.pollSelector?.descriptor) : '',
      qnaTitle: state.activityKind !== 'poll' ? asText(state.currentQnaView?.title) : '',
      activitySelector:
        state.activityKind === 'discussion'
          ? asText(state.promptSelector?.descriptor)
          : state.activityKind === 'qna'
            ? 'session'
            : '',
      artifactType: answers.artifactType,
      brandProfileName: asText(answers?.brandProfileName).trim() || undefined,
      designGuidelines: mergeArtifactDesignGuidelines(answers),
      ...(state.activityKind === 'poll'
        ? {
            expectedMaxVotes: voteCapacity.expectedMaxVotes,
            recommendedVisibleUnits: voteCapacity.recommendedVisibleUnits,
            recommendedVotesPerUnit: voteCapacity.recommendedVotesPerUnit,
            avoidOneToOneVoteObjects: voteCapacity.avoidOneToOneVoteObjects
          }
        : buildArtifactQnaCapacityMeta(state.currentQnaView)),
      dataEndpoints:
        state.activityKind !== 'poll'
          ? {
              sessionByCode: `${apiBase}/sessions/code/${encodedCode}`,
              sessionSnapshot: `${apiBase}/sessions/${encodedSession}/snapshot`,
              questionsList: `${apiBase}/sessions/${encodedSession}/questions`,
              liveSocket: wsBase ? `${wsBase}/ws/sessions/${encodedSession}` : ''
            }
          : {
              sessionByCode: `${apiBase}/sessions/code/${encodedCode}`,
              sessionSnapshot: `${apiBase}/sessions/${encodedSession}/snapshot`,
              pollsList: `${apiBase}/sessions/${encodedSession}/polls`,
              pollOpen: `${apiBase}/sessions/${encodedSession}/polls/{poll_id}/open`,
              pollClose: `${apiBase}/sessions/${encodedSession}/polls/{poll_id}/close`,
              pollVote: `${apiBase}/sessions/${encodedSession}/polls/{poll_id}/vote`,
              liveSocket: wsBase ? `${wsBase}/ws/sessions/${encodedSession}` : ''
            },
      /** Merged saved + pending; backend turns this into styleOverridesSummary for the model. */
      styleOverrides: (() => {
        const merged = {
          ...(state.artifact.savedStyleOverrides || {}),
          ...getPendingStyleOverrides()
        }
        return Object.keys(merged).length > 0 ? merged : undefined
      })(),
      /**
       * Saved + pending element positions, surfaced to the AI so subsequent
       * edits preserve the user's layout. Each entry is {stableId, dx, dy,
       * label, role, optionId}. The backend should include these in the
       * system prompt as a "Do not revert these positions" clause and is
       * already reflected in currentArtifactFullHtml via inline transforms.
       */
      positionOverrides: aiPositionOverrides.length > 0 ? aiPositionOverrides : undefined,
      /**
       * Saved + pending element sizes (scale factors). Each entry is
       * {stableId, sx, sy, label?, role?, optionId?}. The backend should
       * preserve these unless the user prompt explicitly asks to resize
       * the affected element.
       */
      sizeOverrides: aiSizeOverrides.length > 0 ? aiSizeOverrides : undefined
    }
  }

  function buildAiEditorContext() {
    const currentTheme = getCurrentTheme()
    const poll = state.activityKind === 'poll' ? state.currentPoll : null
    const options = Array.isArray(poll?.options)
      ? poll.options.map((option, index) => ({
          index,
          id: asText(option?.id) || `index-${index}`,
          label: asText(option?.label) || '',
          votes: toInt(option?.votes)
        }))
      : []
    const qnaView = state.activityKind !== 'poll' ? state.currentQnaView : null
    return {
      ...(state.activityKind !== 'poll' ? { activityKind: state.activityKind } : {}),
      qna: qnaView
        ? {
            id: asText(qnaView.id),
            title: asText(qnaView.title),
            status: asText(qnaView.status),
            totalQuestions: qnaView.questions.length,
            // Capped sample for design context; the artifact receives the
            // full live list at runtime through the qna state channel.
            questions: qnaView.questions.slice(0, 12).map((question) => ({
              id: question.id,
              text: question.text,
              votes: question.votes
            }))
          }
        : undefined,
      visualMode: currentTheme.visualMode,
      artifact:
        currentTheme.visualMode === ARTIFACT_VISUAL_MODE
          ? buildArtifactContext(
              {
                prompt: state.artifact.lastPrompt || '',
                answers: state.artifact.lastAnswers
              },
              poll
            )
          : { enabled: false },
      currentText: {
        eyebrow: extractPlainTextFromHtml(getEyebrowHtml()),
        question: extractPlainTextFromHtml(getQuestionHtml())
      },
      poll: poll
        ? {
            id: asText(poll.id),
            question: asText(poll.question),
            options
          }
        : null,
      theme: {
        bgA: currentTheme.bgA,
        bgB: currentTheme.bgB,
        panelColor: currentTheme.panelColor,
        textMain: currentTheme.textMain,
        textSub: currentTheme.textSub,
        fillA: currentTheme.fillA,
        fillB: currentTheme.fillB,
        barHeight: currentTheme.barHeight,
        questionSize: currentTheme.questionSize,
        labelSize: currentTheme.labelSize,
        fontFamily: currentTheme.fontFamily
      }
    }
  }

  return {
    buildArtifactPollPayload,
    buildArtifactQnaPayload,
    buildArtifactContext,
    buildAiEditorContext
  }
}

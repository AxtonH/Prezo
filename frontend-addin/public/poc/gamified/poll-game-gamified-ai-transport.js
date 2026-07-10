/**
 * AI transport for the gamified station: the four backend /ai routes
 * (artifact build, conversational intake, artifact Q&A answers, and the
 * classic-canvas edit plan) plus their response normalization.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 4). The factory owns request
 * shaping, auth headers, timeouts, and payload normalization; it never
 * touches the DOM — the one DOM-derived input (saved brand profile names
 * from the composer dropdown) arrives as an injected callback.
 */
import {
  AI_DEFAULT_MODEL,
  ARTIFACT_BRAND_REFERENCE_VALUE,
  MAX_INLINE_ATTACHMENTS
} from './poll-game-gamified-constants.js'
import {
  buildSegmentedArtifactPackage,
  resolveArtifactHtmlFromPackage,
  sanitizeArtifactPackage
} from './poll-game-gamified-artifact-package.js'
import { normalizeArtifactMarkup } from './poll-game-gamified-artifact-runtime.js'
import {
  asText,
  extractApiErrorMessage,
  fetchWithTimeout,
  safeJsonParse
} from './poll-game-gamified-utils.js'

const ARTIFACT_BUILD_TIMEOUT_MS = 300000
const ARTIFACT_INTAKE_TIMEOUT_MS = 45000

export function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    return ''
  }
  return parts.map((part) => asText(part?.text)).filter(Boolean).join('\n')
}

export function parseAiJsonResponse(rawText) {
  const direct = safeJsonParse(rawText)
  if (direct && typeof direct === 'object') {
    return normalizeAiPlanResponse(direct, rawText)
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(rawText)
  if (fenced && fenced[1]) {
    const parsed = safeJsonParse(fenced[1])
    if (parsed && typeof parsed === 'object') {
      return normalizeAiPlanResponse(parsed, rawText)
    }
  }

  const start = rawText.indexOf('{')
  const end = rawText.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const sliced = rawText.slice(start, end + 1)
    const parsed = safeJsonParse(sliced)
    if (parsed && typeof parsed === 'object') {
      return normalizeAiPlanResponse(parsed, rawText)
    }
  }
  return normalizeAiPlanResponse(null, rawText)
}

function normalizeAiPlanResponse(value, rawText = '') {
  if (Array.isArray(value)) {
    return {
      assistantMessage: 'Applied parsed action list.',
      actions: value.filter((item) => item && typeof item === 'object')
    }
  }

  if (!value || typeof value !== 'object') {
    return {
      assistantMessage:
        'AI response was not valid JSON. No structured actions were applied.',
      actions: []
    }
  }

  const assistantMessage =
    asText(value.assistantMessage) ||
    asText(value.message) ||
    asText(rawText).slice(0, 220) ||
    'AI response parsed.'
  const actionCandidates = Array.isArray(value.actions)
    ? value.actions
    : Array.isArray(value.edits)
      ? value.edits
      : Array.isArray(value.operations)
        ? value.operations
        : []

  return {
    assistantMessage,
    actions: actionCandidates.filter((item) => item && typeof item === 'object')
  }
}

export function createAiTransport({
  state,
  /** () => string | null — current library-sync bearer token. */
  getLibraryAccessToken,
  /** () => string[] — saved brand profile names from the composer dropdown. */
  collectArtifactBrandProfileNames
}) {
  function libraryAuthHeaders() {
    const token = getLibraryAccessToken()
    if (!token) {
      return {}
    }
    return { Authorization: `Bearer ${token}` }
  }

  async function requestAiEditPlan(prompt, context) {
    const model = asText(state.ai.model) || AI_DEFAULT_MODEL
    const endpoint = `${state.apiBase}/ai/poll-game-edit-plan`
    const body = {
      prompt,
      context,
      model
    }
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        asText(payload?.detail) ||
        asText(payload?.error?.message) ||
        `Request failed (${response.status})`
      throw new Error(message)
    }
    const text = asText(payload?.text) || extractGeminiText(payload)
    if (!text) {
      throw new Error('AI service returned an empty response.')
    }
    return parseAiJsonResponse(text)
  }

  async function requestAiArtifactBuild(prompt, context, options = {}) {
    const model = asText(state.ai.model) || AI_DEFAULT_MODEL
    const endpoint = `${state.apiBase}/ai/poll-game-artifact-build`
    const brandProfileName = asText(state.artifact.lastAnswers?.brandProfileName).trim()
    const body = {
      prompt,
      context,
      model
    }
    if (brandProfileName) {
      body.brand_profile_name = brandProfileName
    }
    // Keep these caps in lockstep with the backend (ARTIFACT_REFERENCE_IMAGE_MAX_ITEMS /
    // ARTIFACT_ATTACHED_IMAGE_URL_LIMIT in backend/app/api/ai.py).
    const refImages = options.referenceImages
    if (Array.isArray(refImages) && refImages.length > 0) {
      body.reference_images = refImages.slice(0, MAX_INLINE_ATTACHMENTS).map((item) => ({
        media_type: asText(item?.media_type) || 'image/png',
        data: asText(item?.data)
      }))
    }
    // Hosted reference image URLs ride inside context.artifact (where the backend reads
    // them) so the AI can embed them or fetch them for style-matching.
    const attachedImageUrls = options.attachedImageUrls
    if (Array.isArray(attachedImageUrls) && attachedImageUrls.length > 0) {
      const urls = attachedImageUrls
        .map((item) => asText(item).trim())
        .filter((item) => item.startsWith('http://') || item.startsWith('https://'))
        .slice(0, MAX_INLINE_ATTACHMENTS)
      if (urls.length > 0 && body.context && typeof body.context === 'object') {
        if (!body.context.artifact || typeof body.context.artifact !== 'object') {
          body.context.artifact = {}
        }
        body.context.artifact.attachedImageUrls = urls
      }
    }
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...libraryAuthHeaders()
      },
      body: JSON.stringify(body)
    }, ARTIFACT_BUILD_TIMEOUT_MS)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = extractApiErrorMessage(payload, response.status)
      throw new Error(message)
    }

    const html = normalizeArtifactMarkup(asText(payload?.html) || asText(payload?.text))
    if (!html) {
      throw new Error('AI service returned empty artifact markup.')
    }
    const artifactPackage = buildSegmentedArtifactPackage(
      sanitizeArtifactPackage(payload?.artifact_package || payload?.artifactPackage, html) || html
    )
    const resolvedHtml = resolveArtifactHtmlFromPackage(artifactPackage) || html
    return {
      html: resolvedHtml,
      package: artifactPackage,
      assistantMessage: asText(payload?.assistantMessage),
      model: asText(payload?.model),
      debugPatchPlan: asText(payload?.debugPatchPlan)
    }
  }

  async function requestAiArtifactIntake(messages, options = {}) {
    const endpoint = `${state.apiBase}/ai/poll-game-artifact-intake`
    const body = {
      messages: messages.map((message) => ({
        role: message.role === 'user' ? 'user' : 'assistant',
        text: asText(message.text).slice(0, 2000)
      })),
      force_ready: Boolean(options.forceReady)
    }
    if (state.activityKind !== 'poll') {
      body.context = {
        activityKind: state.activityKind,
        qna: {
          title: asText(state.currentQnaView?.title),
          status: asText(state.currentQnaView?.status),
          approvedQuestionCount: state.currentQnaView?.questions?.length || 0
        }
      }
    } else {
      const poll = state.currentPoll
      if (poll) {
        body.context = {
          poll: {
            question: asText(poll.question),
            options: Array.isArray(poll.options)
              ? poll.options.map((option) => asText(option?.label)).filter(Boolean)
              : []
          }
        }
      }
    }
    const brandNames = collectArtifactBrandProfileNames()
    if (brandNames.length) {
      body.brand_profile_names = brandNames
    }
    const selectedBrand = asText(state.artifact.conversationAnswers?.brandProfileName).trim()
    if (selectedBrand && selectedBrand !== ARTIFACT_BRAND_REFERENCE_VALUE) {
      body.selected_brand_profile_name = selectedBrand
    }
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...libraryAuthHeaders()
        },
        body: JSON.stringify(body)
      },
      ARTIFACT_INTAKE_TIMEOUT_MS
    )
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = extractApiErrorMessage(payload, response.status)
      throw new Error(message)
    }
    const action = asText(payload?.action).trim().toLowerCase()
    return {
      action: action === 'ask' ? 'ask' : 'ready',
      question: asText(payload?.question).trim(),
      topic: asText(payload?.topic).trim().toLowerCase() || 'other',
      brief: payload?.brief && typeof payload.brief === 'object' ? payload.brief : null
    }
  }

  async function requestAiArtifactAnswer(prompt, context) {
    const model = asText(state.ai.model) || AI_DEFAULT_MODEL
    const endpoint = `${state.apiBase}/ai/poll-game-artifact-answer`
    const body = {
      prompt,
      context,
      model
    }
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...libraryAuthHeaders()
      },
      body: JSON.stringify(body)
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = extractApiErrorMessage(payload, response.status)
      throw new Error(message)
    }
    const text = asText(payload?.text)
    if (!text) {
      throw new Error('Artifact assistant returned an empty answer.')
    }
    return {
      text,
      assistantMessage: text
    }
  }

  return {
    libraryAuthHeaders,
    requestAiEditPlan,
    requestAiArtifactBuild,
    requestAiArtifactIntake,
    requestAiArtifactAnswer
  }
}

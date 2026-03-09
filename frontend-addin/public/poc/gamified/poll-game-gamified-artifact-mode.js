export const ARTIFACT_VISUAL_MODE = 'artifact'
export const ARTIFACT_LAYOUT_HORIZONTAL = 'horizontal'
export const ARTIFACT_LAYOUT_VERTICAL = 'vertical'

export const ARTIFACT_DEFAULT_PLACEHOLDER = 'Type your answer here.'
export const ARTIFACT_EDIT_PLACEHOLDER =
  'Example: make the title 20% smaller and keep the rest of the scene unchanged.'

export const ARTIFACT_WAITING_STATUS =
  'Artifact editor is ready. Answer the first question to begin.'
export const ARTIFACT_EDIT_READY_STATUS =
  'Edit mode is active. Ask for targeted changes, or say "redesign it" for a broader rework.'

export const ARTIFACT_EDIT_QUICK_ACTIONS = Object.freeze([
  {
    label: 'Improve Readability',
    prompt: 'Improve readability. Keep the current concept, layout, and scene style.'
  },
  {
    label: 'Tighten Layout',
    prompt: 'Tighten the layout and spacing. Do not redesign the artifact.'
  },
  {
    label: 'Soften Motion',
    prompt: 'Make the motion smoother and less distracting. Keep the current visuals.'
  },
  {
    label: 'Smaller Title',
    prompt: 'Make the title smaller and rebalance the composition without changing the overall concept.'
  },
  {
    label: 'Reduce Clutter',
    prompt: 'Reduce clutter and simplify decorative elements while keeping the same concept.'
  },
  {
    label: 'Broader Redesign',
    prompt: 'Redesign the artifact more broadly while preserving live poll functionality.'
  }
])

export const ARTIFACT_CONVERSATION_STEPS = Object.freeze([
  {
    key: 'artifactType',
    question: 'What kind of artifact would you like?',
    placeholder: 'Example: 1920s, cinematic, black and white poll'
  },
  {
    key: 'audienceSize',
    question: 'What is your expected audience size?',
    placeholder: 'Example: 5'
  },
  {
    key: 'designGuidelines',
    question: 'What design guidelines would you like me to use?',
    placeholder: 'Example: black and white'
  }
])

export function createEmptyArtifactAnswers() {
  return {
    artifactType: '',
    audienceSize: '',
    designGuidelines: ''
  }
}

export function buildArtifactConversationPrompt(answers = {}) {
  const artifactType =
    typeof answers.artifactType === 'string' ? answers.artifactType.trim() : ''
  const audienceSize =
    typeof answers.audienceSize === 'string' ? answers.audienceSize.trim() : ''
  const designGuidelines =
    typeof answers.designGuidelines === 'string' ? answers.designGuidelines.trim() : ''

  return [
    artifactType ? `Artifact type: ${artifactType}` : '',
    audienceSize ? `Expected audience size: ${audienceSize}` : '',
    designGuidelines ? `Design guidelines: ${designGuidelines}` : '',
    'Build a complete artifact experience that satisfies all of these requirements.'
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildArtifactEditPrompt(editRequest, answers = {}) {
  const artifactType =
    typeof answers.artifactType === 'string' ? answers.artifactType.trim() : ''
  const audienceSize =
    typeof answers.audienceSize === 'string' ? answers.audienceSize.trim() : ''
  const designGuidelines =
    typeof answers.designGuidelines === 'string' ? answers.designGuidelines.trim() : ''
  const request = typeof editRequest === 'string' ? editRequest.trim() : ''

  return [
    artifactType ? `Current artifact type: ${artifactType}` : '',
    audienceSize ? `Expected audience size: ${audienceSize}` : '',
    designGuidelines ? `Current design guidelines: ${designGuidelines}` : '',
    request ? `Edit request: ${request}` : '',
    'Revise the current artifact instead of starting from scratch.',
    'This is edit mode, not rebuild mode.',
    'Make the smallest viable change that satisfies the latest edit request.',
    'Preserve the existing live poll wiring, structure, scene concept, layout, and working design decisions unless the edit request explicitly asks for a broader redesign.',
    'If the request is local, such as color, spacing, title size, motion, or positioning, do not redesign unrelated parts of the artifact.',
    'Prefer surgical refinements over reinterpretation.',
    'Return the full updated artifact HTML.'
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildArtifactRepairPrompt(editRequest, runtimeError, answers = {}) {
  const artifactType =
    typeof answers.artifactType === 'string' ? answers.artifactType.trim() : ''
  const audienceSize =
    typeof answers.audienceSize === 'string' ? answers.audienceSize.trim() : ''
  const designGuidelines =
    typeof answers.designGuidelines === 'string' ? answers.designGuidelines.trim() : ''
  const request = typeof editRequest === 'string' ? editRequest.trim() : ''
  const errorText = typeof runtimeError === 'string' ? runtimeError.trim() : ''

  return [
    artifactType ? `Current artifact type: ${artifactType}` : '',
    audienceSize ? `Expected audience size: ${audienceSize}` : '',
    designGuidelines ? `Current design guidelines: ${designGuidelines}` : '',
    request ? `Edit request: ${request}` : '',
    errorText ? `Runtime failure to fix: ${errorText}` : '',
    'Repair the failed edit against the last stable working artifact.',
    'This is repair mode for a failed edit, not a full rebuild.',
    'Apply the requested edit while preserving the existing live poll wiring and working scene structure.',
    'Do not keep the broken selector logic from the failed edited artifact.',
    'Do not simply return the unchanged stable artifact unless the request is already satisfied.',
    'Make the smallest viable change that satisfies the edit request and avoids the runtime error.',
    'Return the full updated artifact HTML.'
  ]
    .filter(Boolean)
    .join('\n')
}

export function sanitizeArtifactLayout(value, fallback = ARTIFACT_LAYOUT_HORIZONTAL) {
  const layout = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (layout === ARTIFACT_LAYOUT_VERTICAL || layout === ARTIFACT_LAYOUT_HORIZONTAL) {
    return layout
  }
  return fallback
}

export function buildArtifactAiPrompt(userPrompt, artifactContext = {}) {
  const promptText = typeof userPrompt === 'string' ? userPrompt.trim() : ''
  const pollTitle =
    typeof artifactContext.pollTitle === 'string' ? artifactContext.pollTitle.trim() : ''
  const hasExistingArtifact = Boolean(artifactContext?.hasExistingArtifact)
  const requestMode =
    typeof artifactContext?.requestMode === 'string' ? artifactContext.requestMode.trim() : ''
  const runtimeRenderError =
    typeof artifactContext?.runtimeRenderError === 'string'
      ? artifactContext.runtimeRenderError.trim()
      : ''
  const hasFailedArtifact = Boolean(
    typeof artifactContext?.failedArtifactHtml === 'string' &&
      artifactContext.failedArtifactHtml.trim()
  )

  return [
    'Artifact mode is active.',
    'Generate a full creative artifact experience with complete control over layout, visuals, and motion.',
    'Do not constrain output to existing poll game shape/label templates.',
    'Assume default poll chrome can be ignored; render your own complete poll visuals from live state.',
    'Default to a genuinely gamified result, not a corporate dashboard or analytics UI.',
    'Avoid generic glass cards, KPI panels, admin-console boxes, and technical control labels unless the user explicitly asks for that style.',
    'Favor a bold game/show metaphor with one dominant visual mechanic instead of many informational boxes.',
    'Output should be raw HTML that can render from live poll state updates.',
    'Define window.prezoRenderPoll(state) and use state.poll.question, state.poll.options, state.totalVotes, state.meta.',
    'Do not fetch live poll data yourself. Do not open WebSockets, EventSource connections, or additional network requests for poll state.',
    'Treat host-delivered state updates as the only live data source.',
    hasExistingArtifact
      ? 'If context.artifact.currentArtifactHtml is provided, treat it as the current artifact to revise and return a full updated version rather than a brand-new unrelated concept.'
      : '',
    requestMode === 'edit'
      ? 'Edit mode is active. Apply the latest request as a targeted refinement. Do not redesign the full artifact unless the user explicitly asks for that.'
      : '',
    requestMode === 'repair'
      ? 'Repair mode is active. The previous edited artifact failed at runtime. Start from context.artifact.currentArtifactHtml as the last stable working artifact, satisfy the latest edit request, and avoid the reported runtime failure.'
      : '',
    requestMode === 'repair' && hasFailedArtifact
      ? 'If context.artifact.failedArtifactHtml is provided, use it only as a reference for what broke. Do not preserve its broken selector or mutation logic.'
      : '',
    'Assume the render viewport is fixed 16:9 widescreen (PowerPoint standard) and compose safely inside it.',
    'Keep all primary UI fully inside the viewport with safe padding (about 6-10%); no vertical or horizontal clipping.',
    'Treat the 16:9 frame as a hard boundary, not a suggestion.',
    'After the scene settles, the full composition including the lowest poll row, vote chips, labels, title, and decorative elements must remain fully visible inside the frame.',
    'If the concept would overflow, reduce scale, simplify, or reposition elements instead of allowing any part of the scene to be clipped.',
    'Poll updates must be smooth and flicker-free (200ms-500ms easing) without re-mounting the whole scene.',
    'Use keyed reconciliation by option id and update only changed nodes when possible.',
    'Do not expose raw technical metadata in the UI such as session ids, poll ids, request mode labels, selector labels, endpoint labels, "latest/open", "visible units", or "block scale" unless the user explicitly asks for a technical diagnostic display.',
    'Avoid markdown fences and explanations; return artifact HTML only.',
    pollTitle ? `Live poll title: ${pollTitle}` : '',
    runtimeRenderError ? `Latest runtime render failure: ${runtimeRenderError}` : '',
    `User request: ${promptText || 'Build a custom artifact-style poll experience around the live data.'}`
  ]
    .filter(Boolean)
    .join('\n')
}

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
    'Treat the current artifact as a working codebase. Patch it conservatively instead of reimagining it.',
    'Preserve the existing live poll wiring, including window.prezoSetPollRenderer(fn), window.prezoRenderPoll(state), and runtime poll-state helpers, unless the edit request explicitly asks to replace it with an equivalent working approach.',
    'Do not add your own window message listener or websocket logic for poll updates.',
    'Preserve the existing DOM structure, scene concept, layout, selector targets, and working design decisions unless the edit request explicitly asks for a broader redesign.',
    'Do not rewrite the full document, <body>, primary scene root, or option row structure unless the request explicitly requires a structural redesign.',
    'If the request is local, such as color, spacing, title size, motion, or positioning, do not redesign unrelated parts of the artifact.',
    'Prefer CSS, copy, spacing, animation tuning, and small targeted adjustments over rewriting containers or rebuilding sections.',
    'Do not use document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or any full-root reset for live poll updates.',
    'Keep existing nodes mounted during updates. Change text, classes, transforms, CSS variables, and inline styles in place whenever possible.',
    'If the request is about flicker, resets, or movement, preserve the current DOM tree and animate the existing visual elements forward with transform/transition updates keyed by option id.',
    'Do not rename, remove, or relocate existing containers, ids, classes, or data attributes that the current render logic may depend on unless you safely update that logic too.',
    'The result must remain immediately usable on first render: keep the title, option labels, and main poll visuals visible. Do not return an empty, hidden, or near-solid full-screen overlay scene unless the user explicitly asks for that.',
    'If you are unsure, keep more of the stable artifact and make a smaller change.',
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
    'Treat the stable artifact as a working codebase. Patch it conservatively instead of reimagining it.',
    'Apply the requested edit while preserving the existing live poll wiring, including window.prezoSetPollRenderer(fn), window.prezoRenderPoll(state), and runtime poll-state helpers.',
    'Do not add your own window message listener or websocket logic for poll updates.',
    'Preserve selector targets and the working scene structure.',
    'Do not keep the broken selector logic from the failed edited artifact.',
    'Prefer the smallest viable CSS/text/layout change over structural DOM rewrites.',
    'Do not rewrite the full document, <body>, primary scene root, or option row structure unless the request explicitly requires a structural redesign.',
    'Do not use document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or any full-root reset for live poll updates.',
    'Keep existing nodes mounted during updates. Change text, classes, transforms, CSS variables, and inline styles in place whenever possible.',
    'If the request is about flicker, resets, or movement, preserve the current DOM tree and animate the existing visual elements forward with transform/transition updates keyed by option id.',
    'Do not rename, remove, or relocate existing containers, ids, classes, or data attributes that the stable artifact depends on unless you safely update that logic too.',
    'Do not simply return the unchanged stable artifact unless the request is already satisfied.',
    'The repaired artifact must remain immediately usable on first render: keep the title, option labels, and main poll visuals visible. Do not return an empty, hidden, or near-solid full-screen overlay scene unless the user explicitly asks for that.',
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
  const selector =
    typeof artifactContext.pollSelector === 'string'
      ? artifactContext.pollSelector.trim()
      : ''
  const endpoints =
    artifactContext.dataEndpoints && typeof artifactContext.dataEndpoints === 'object'
      ? artifactContext.dataEndpoints
      : {}
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

  const endpointLines = Object.entries(endpoints)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => `- ${key}: ${value}`)

  return [
    'Artifact mode is active.',
    'Generate a full creative artifact experience with complete control over layout, visuals, and motion.',
    'Do not constrain output to existing poll game shape/label templates.',
    'Assume default poll chrome can be ignored; render your own complete poll visuals from live state.',
    'Output should be raw HTML that can render from live poll state updates.',
    'Prefer calling window.prezoSetPollRenderer(function (state) { ... }) to register your renderer.',
    'You may also define window.prezoRenderPoll(state), but do not rebuild host messaging yourself.',
    'Use state.poll.question, state.poll.options, state.totalVotes, state.meta, and window.prezoGetPollState() when needed.',
    'Do not fetch live poll data yourself. Do not open WebSockets, EventSource connections, or additional network requests for poll state.',
    'Treat host-delivered state updates as the only live data source.',
    'Build around a stable scene root and persistent option nodes keyed by option id.',
    'On poll updates, never clear and rebuild the whole scene, never blank the stage, and never use hard resets, flicker, hide-then-show, or blackout transitions as the normal update path.',
    'Never use document.body.innerHTML, document.documentElement.innerHTML, root.innerHTML, replaceChildren, or replaceWith as your poll-update strategy.',
    'Animate in place with CSS transitions, Web Animations API, or requestAnimationFrame; keep existing cars, bars, rows, and labels mounted and move them smoothly from prior state.',
    'If option ordering changes, reconcile existing nodes by option id instead of destroying and recreating the full list.',
    'Do not reinsert or reorder every existing lane/row node with appendChild/removeChild on each update. If rank changes, animate vertical movement with transforms on stable mounted nodes.',
    hasExistingArtifact
      ? 'If context.artifact.currentArtifactHtml is provided, treat it as the current artifact to revise and return a full updated version rather than a brand-new unrelated concept.'
      : '',
    requestMode === 'edit'
      ? 'Edit mode is active. Apply the latest request as a targeted refinement. Do not redesign the full artifact unless the user explicitly asks for that.'
      : '',
    requestMode === 'edit'
      ? 'In edit mode, preserve the current document/body/root structure and keep existing nodes mounted during live updates. Prefer transforms, style updates, and text changes over rebuilding sections.'
      : '',
    requestMode === 'repair'
      ? 'Repair mode is active. The previous edited artifact failed at runtime. Start from context.artifact.currentArtifactHtml as the last stable working artifact, satisfy the latest edit request, and avoid the reported runtime failure.'
      : '',
    requestMode === 'repair'
      ? 'In repair mode, preserve the current document/body/root structure and keep existing nodes mounted during live updates. Prefer transforms, style updates, and text changes over rebuilding sections.'
      : '',
    requestMode === 'repair' && hasFailedArtifact
      ? 'If context.artifact.failedArtifactHtml is provided, use it only as a reference for what broke. Do not preserve its broken selector or mutation logic.'
      : '',
    hasExistingArtifact
      ? 'Do not use document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, or replaceWith as your live-update strategy.'
      : '',
    hasExistingArtifact
      ? 'The returned artifact must stay usable immediately after load: visible poll scene, readable labels, and no near-empty full-screen overlay obscuring the content.'
      : '',
    'Assume the render viewport is fixed 16:9 widescreen (PowerPoint standard) and compose safely inside it.',
    'Keep all primary UI fully inside the viewport with safe padding (about 6-10%); no vertical or horizontal clipping.',
    'Treat the 16:9 frame as a hard boundary, not a suggestion.',
    'After the scene settles, the full composition including the lowest poll row, vote chips, labels, title, and decorative elements must remain fully visible inside the frame.',
    'If the concept would overflow, reduce scale, simplify, or reposition elements instead of allowing any part of the scene to be clipped.',
    'Poll updates must be smooth and flicker-free (200ms-500ms easing) without re-mounting the whole scene.',
    'Use keyed reconciliation by option id and update only changed nodes when possible.',
    'Avoid markdown fences and explanations; return artifact HTML only.',
    pollTitle ? `Live poll title: ${pollTitle}` : '',
    selector ? `Poll selector: ${selector}` : '',
    endpointLines.length > 0
      ? `Live poll data endpoints:\n${endpointLines.join('\n')}`
      : '',
    runtimeRenderError ? `Latest runtime render failure: ${runtimeRenderError}` : '',
    `User request: ${promptText || 'Build a custom artifact-style poll experience around the live data.'}`
  ]
    .filter(Boolean)
    .join('\n')
}

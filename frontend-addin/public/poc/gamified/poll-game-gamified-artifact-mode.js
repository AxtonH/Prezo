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
    key: 'designGuidelines',
    question: 'What design guidelines would you like me to use?',
    placeholder: 'Example: black and white'
  }
])

export function createEmptyArtifactAnswers() {
  return {
    artifactType: '',
    designGuidelines: '',
    /** Saved brand profile name when library auth is available; sent as brand_profile_name on artifact build. */
    brandProfileName: ''
  }
}

export function buildArtifactConversationPrompt(answers = {}) {
  const artifactType =
    typeof answers.artifactType === 'string' ? answers.artifactType.trim() : ''
  const designGuidelines =
    typeof answers.designGuidelines === 'string' ? answers.designGuidelines.trim() : ''
  const brandProfileName =
    typeof answers.brandProfileName === 'string' ? answers.brandProfileName.trim() : ''

  return [
    artifactType ? `Artifact type: ${artifactType}` : '',
    brandProfileName
      ? `Saved brand profile (mandatory — follow palette, type, logo, and voice from context): ${brandProfileName}`
      : '',
    designGuidelines ? formatDesignGuidelinesBlock(designGuidelines) : '',
    'Build a complete artifact experience that satisfies all of these requirements.'
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Wraps design guidelines text in a clearly delimited block so the AI model
 * treats it as an authoritative brand constraint, not a casual suggestion.
 */
function formatDesignGuidelinesBlock(text) {
  if (!text) {
    return ''
  }
  return [
    '--- BRAND / DESIGN GUIDELINES (non-negotiable unless the user prompt explicitly overrides) ---',
    text,
    '--- END GUIDELINES ---'
  ].join('\n')
}

function isBackgroundAtmosphereEditRequest(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!text) {
    return false
  }
  return /(background|backdrop|sky|track|road|ground|terrain|landscape|sunrise|sunset|daytime|nighttime|lighting|light|ambient|weather|day\b|night\b|city|cityscape|urban|skyline|downtown|building|buildings|skyscraper)/.test(
    text
  )
}

export function buildArtifactEditPrompt(editRequest, answers = {}) {
  const artifactType =
    typeof answers.artifactType === 'string' ? answers.artifactType.trim() : ''
  const designGuidelines =
    typeof answers.designGuidelines === 'string' ? answers.designGuidelines.trim() : ''
  const request = typeof editRequest === 'string' ? editRequest.trim() : ''
  const backgroundEdit = isBackgroundAtmosphereEditRequest(request)

  return [
    artifactType ? `Current artifact type: ${artifactType}` : '',
    typeof answers.brandProfileName === 'string' && answers.brandProfileName.trim()
      ? `Saved brand profile (mandatory): ${answers.brandProfileName.trim()}`
      : '',
    designGuidelines ? formatDesignGuidelinesBlock(designGuidelines) : '',
    request ? `Edit request: ${request}` : '',
    'Revise the current artifact instead of starting from scratch.',
    'This is edit mode, not rebuild mode.',
    'Make the smallest viable change that satisfies the latest edit request.',
    'Treat the current artifact as a working codebase. Patch it conservatively instead of reimagining it.',
    'Preserve the existing live poll wiring, including window.prezoSetPollRenderer(fn), window.prezoRenderPoll(state), and runtime poll-state helpers, unless the edit request explicitly asks to replace it with an equivalent working approach.',
    'Do not add your own window message listener or websocket logic for poll updates.',
    'Preserve the existing DOM structure, scene concept, layout, selector targets, and working design decisions unless the edit request explicitly asks for a broader redesign.',
    'Preserve detailed SVG or illustration markup, decorative assets, cars, characters, icons, labels, and non-targeted motion logic unless the edit request explicitly asks to change them.',
    'Do not rewrite the full document, <body>, primary scene root, or option row structure unless the request explicitly requires a structural redesign.',
    'If the request is local, such as color, spacing, title size, motion, or positioning, do not redesign unrelated parts of the artifact.',
    'If the request asks to change the layout direction of poll options (e.g. vertical to horizontal, side by side, stacked, etc.), treat it as a CSS-only change. Find the flex or grid container that wraps the poll option elements and change its flex-direction, grid-template, or equivalent layout property. Keep every existing option node, label, bar, and vote element intact. Only adjust the container direction and related spacing/sizing to fit the new orientation. Do not rewrite option markup, poll wiring, render logic, or the visual theme.',
    backgroundEdit
      ? 'This request targets background, time-of-day, lighting, or atmosphere. Modify only background/backdrop/sky/ambient layers and closely related color tokens. Do not redesign cars, foreground objects, labels, or other gameplay visuals.'
      : '',
    'Prefer CSS, copy, spacing, animation tuning, and small targeted adjustments over rewriting containers or rebuilding sections.',
    'Do not use document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or any full-root reset for live poll updates.',
    'Keep existing nodes mounted during updates. Change text, classes, transforms, CSS variables, and inline styles in place whenever possible.',
    'If the request is about flicker, resets, or movement, preserve the current DOM tree and animate the existing visual elements forward with transform/transition updates keyed by option id.',
    'Do not rename, remove, or relocate existing containers, ids, classes, or data attributes that the current render logic may depend on unless you safely update that logic too.',
    'Poll option elements (cards, rows, bars, labels, vote counts) are typically created dynamically by the renderer JavaScript at runtime — they do not exist in the static index.html. If the edit adds, removes, or changes per-option markup (e.g. adding decorations, badges, icons, or structural elements to each option), you must modify the renderer JS where option nodes are built (e.g. ensureOptionNode or equivalent), not use insert_html targeting selectors that only exist in the live DOM. insert_html only operates on the static index.html file and will silently fail on selectors that are JS-generated. New CSS rules for dynamically created elements are fine in the stylesheet.',
    'The result must remain immediately usable on first render: keep the title, option labels, and main poll visuals visible. Do not return an empty, hidden, or near-solid full-screen overlay scene unless the user explicitly asks for that.',
    'Never strip all poll content. The returned artifact must always contain a visible poll question or title, visible option labels or rows, and vote count or progress visuals. An artifact that renders as only a background color or empty container is a failed edit.',
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
  const designGuidelines =
    typeof answers.designGuidelines === 'string' ? answers.designGuidelines.trim() : ''
  const request = typeof editRequest === 'string' ? editRequest.trim() : ''
  const errorText = typeof runtimeError === 'string' ? runtimeError.trim() : ''
  const backgroundEdit = isBackgroundAtmosphereEditRequest(request)

  return [
    artifactType ? `Current artifact type: ${artifactType}` : '',
    typeof answers.brandProfileName === 'string' && answers.brandProfileName.trim()
      ? `Saved brand profile (mandatory): ${answers.brandProfileName.trim()}`
      : '',
    designGuidelines ? formatDesignGuidelinesBlock(designGuidelines) : '',
    request ? `Edit request: ${request}` : '',
    errorText ? `Runtime failure to fix: ${errorText}` : '',
    'Repair the failed edit against the last stable working artifact.',
    'This is repair mode for a failed edit, not a full rebuild.',
    'Treat the stable artifact as a working codebase. Patch it conservatively instead of reimagining it.',
    'Apply the requested edit while preserving the existing live poll wiring, including window.prezoSetPollRenderer(fn), window.prezoRenderPoll(state), and runtime poll-state helpers.',
    'Do not add your own window message listener or websocket logic for poll updates.',
    'Preserve selector targets and the working scene structure.',
    'Preserve detailed SVG or illustration markup, decorative assets, cars, characters, icons, labels, and non-targeted motion logic unless the edit request explicitly asks to change them.',
    'Do not keep the broken selector logic from the failed edited artifact.',
    'Prefer the smallest viable CSS/text/layout change over structural DOM rewrites.',
    'Do not rewrite the full document, <body>, primary scene root, or option row structure unless the request explicitly requires a structural redesign.',
    'If the request asks to change the layout direction of poll options (e.g. vertical to horizontal, side by side, stacked, etc.), treat it as a CSS-only change. Find the flex or grid container that wraps the poll option elements and change its flex-direction, grid-template, or equivalent layout property. Keep every existing option node, label, bar, and vote element intact. Only adjust the container direction and related spacing/sizing to fit the new orientation. Do not rewrite option markup, poll wiring, render logic, or the visual theme.',
    backgroundEdit
      ? 'This request targets background, time-of-day, lighting, or atmosphere. Modify only background/backdrop/sky/ambient layers and closely related color tokens. Do not redesign cars, foreground objects, labels, or other gameplay visuals.'
      : '',
    'Do not use document.body.innerHTML, document.documentElement.innerHTML, replaceChildren, replaceWith, or any full-root reset for live poll updates.',
    'Keep existing nodes mounted during updates. Change text, classes, transforms, CSS variables, and inline styles in place whenever possible.',
    'If the request is about flicker, resets, or movement, preserve the current DOM tree and animate the existing visual elements forward with transform/transition updates keyed by option id.',
    'Do not rename, remove, or relocate existing containers, ids, classes, or data attributes that the stable artifact depends on unless you safely update that logic too.',
    'Poll option elements (cards, rows, bars, labels, vote counts) are typically created dynamically by the renderer JavaScript at runtime — they do not exist in the static index.html. If the edit adds, removes, or changes per-option markup (e.g. adding decorations, badges, icons, or structural elements to each option), you must modify the renderer JS where option nodes are built (e.g. ensureOptionNode or equivalent), not use insert_html targeting selectors that only exist in the live DOM. insert_html only operates on the static index.html file and will silently fail on selectors that are JS-generated. New CSS rules for dynamically created elements are fine in the stylesheet.',
    'Do not simply return the unchanged stable artifact unless the request is already satisfied.',
    'The repaired artifact must remain immediately usable on first render: keep the title, option labels, and main poll visuals visible. Do not return an empty, hidden, or near-solid full-screen overlay scene unless the user explicitly asks for that.',
    'Never strip all poll content. The returned artifact must always contain a visible poll question or title, visible option labels or rows, and vote count or progress visuals. An artifact that renders as only a background color or empty container is a failed repair.',
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
  const originalEditRequest =
    typeof artifactContext?.originalEditRequest === 'string'
      ? artifactContext.originalEditRequest.trim()
      : ''
  const brandProfileName =
    typeof artifactContext?.brandProfileName === 'string'
      ? artifactContext.brandProfileName.trim()
      : ''
  const hasFailedArtifact = Boolean(
    typeof artifactContext?.failedArtifactHtml === 'string' &&
      artifactContext.failedArtifactHtml.trim()
  )
  const isEditLike = requestMode === 'edit' || requestMode === 'repair'
  const backgroundEdit = isBackgroundAtmosphereEditRequest(originalEditRequest || promptText)

  const endpointLines = Object.entries(endpoints)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => `- ${key}: ${value}`)

  return [
    'Artifact mode is active.',
    brandProfileName
      ? `Saved brand profile is linked (${brandProfileName}). Match promptBrandGuidelines and brandFacts in the server context: palette, fonts, logo, and voice are mandatory unless this user prompt explicitly contradicts them.`
      : '',
    isEditLike
      ? 'Edit mode: revise the existing artifact conservatively. Treat context.artifact.originalEditRequest as the source of truth. Keep unrelated parts unchanged. Preserve concept, composition, SVG, typography, palette, motion, and live poll behavior unless explicitly asked to change them. Prefer minimal diffs.'
      : 'Generate a full creative artifact experience with complete control over layout, visuals, and motion. Do not constrain to existing poll game templates.',
    'Output raw HTML. Register your renderer via window.prezoSetPollRenderer(function(state){...}). Use state.poll.question, state.poll.options, state.totalVotes, state.meta, and window.prezoGetPollState(). Do not fetch poll data yourself or open WebSockets/EventSource.',
    'Use data-prezo-scene-root="true" on the main container, data-prezo-background-layer="true" on backdrops, data-prezo-foreground-layer="true" on foreground content.',
    'Build around persistent option nodes keyed by option id. On updates, never clear/rebuild the scene or use innerHTML/replaceChildren/replaceWith resets. Animate in place with CSS transitions or requestAnimationFrame. Reconcile by option id; use transforms for rank changes.',
    'Poll option elements (cards, rows, bars, labels) are created dynamically by the renderer JS at runtime, not in static index.html. To add or change per-option markup (decorations, badges, icons), modify the renderer JS where option nodes are built, not static HTML.',
    'Layout direction changes (vertical/horizontal) are CSS-only: change flex-direction or grid-template on the options container. Keep all option nodes intact.',
    'Poll option columns must be distributed symmetrically across the full container width. Use CSS grid with grid-template-columns: repeat(auto, 1fr) or flexbox with flex: 1 on each option column so every option gets equal width regardless of label length. All option stacks, bars, or visual elements must share a common bottom baseline — use align-items: flex-end or equivalent on the options row. Center labels, vote counts, and visual elements within each equal-width column. Never use absolute positioning or manual pixel/percentage offsets for individual option placement.',
    backgroundEdit
      ? 'Background/atmosphere request: modify only backdrop layers and color tokens. Do not redesign foreground gameplay visuals.'
      : '',
    requestMode === 'edit'
      ? 'Apply the request as a targeted refinement. Preserve document structure and keep nodes mounted.'
      : '',
    requestMode === 'repair'
      ? 'Repair mode: the previous edit failed at runtime. Start from context.artifact.currentArtifactHtml, satisfy the edit request, and avoid the reported failure.'
      : '',
    requestMode === 'repair' && hasFailedArtifact
      ? 'Use context.artifact.failedArtifactHtml only as reference for what broke. Do not preserve its broken logic.'
      : '',
    hasExistingArtifact
      ? 'Revise context.artifact.currentArtifactHtml rather than creating a new unrelated concept. The result must be immediately usable: visible poll scene, readable labels, no empty overlays.'
      : '',
    'The artifact must always contain visible poll question/title, option labels/rows, and vote visuals. An empty or background-only artifact is a failure.',
    'Viewport is fixed 16:9 widescreen. Keep all UI inside with 6-10% safe padding. No clipping. Poll updates must be smooth (200-500ms easing).',
    'Avoid markdown fences and explanations; return artifact HTML only.',
    pollTitle ? `Live poll title: ${pollTitle}` : '',
    selector ? `Poll selector: ${selector}` : '',
    endpointLines.length > 0
      ? `Live poll data endpoints:\n${endpointLines.join('\n')}`
      : '',
    'Poll math: drive bars and labels from option.percentage and votes vs totalVotes (classic share of cast votes). The host may still send heuristic capacity hints in state.meta for clustered visuals; no fixed audience-size answer is collected.',
    runtimeRenderError ? `Latest runtime render failure: ${runtimeRenderError}` : '',
    `User request: ${promptText || 'Build a custom artifact-style poll experience around the live data.'}`
  ]
    .filter(Boolean)
    .join('\n')
}

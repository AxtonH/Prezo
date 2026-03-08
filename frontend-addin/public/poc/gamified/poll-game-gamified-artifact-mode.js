export const ARTIFACT_VISUAL_MODE = 'artifact'
export const ARTIFACT_LAYOUT_HORIZONTAL = 'horizontal'
export const ARTIFACT_LAYOUT_VERTICAL = 'vertical'

export const ARTIFACT_DEFAULT_PLACEHOLDER = 'Type your answer here.'
export const ARTIFACT_EDIT_PLACEHOLDER = 'Describe what to change in the artifact.'

export const ARTIFACT_WAITING_STATUS =
  'Artifact editor is ready. Answer the first question to begin.'
export const ARTIFACT_EDIT_READY_STATUS =
  'Artifact ready. Describe what to change to refine it.'

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
    'Preserve the existing live poll wiring, structure, and working design decisions unless the edit request explicitly asks for a broader redesign.',
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

  const endpointLines = Object.entries(endpoints)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => `- ${key}: ${value}`)

  return [
    'Artifact mode is active.',
    'Generate a full creative artifact experience with complete control over layout, visuals, and motion.',
    'Do not constrain output to existing poll game shape/label templates.',
    'Assume default poll chrome can be ignored; render your own complete poll visuals from live state.',
    'Output should be raw HTML that can render from live poll state updates.',
    'Define window.prezoRenderPoll(state) and use state.poll.question, state.poll.options, state.totalVotes, state.meta.',
    hasExistingArtifact
      ? 'If context.artifact.currentArtifactHtml is provided, treat it as the current artifact to revise and return a full updated version rather than a brand-new unrelated concept.'
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
    `User request: ${promptText || 'Build a custom artifact-style poll experience around the live data.'}`
  ]
    .filter(Boolean)
    .join('\n')
}

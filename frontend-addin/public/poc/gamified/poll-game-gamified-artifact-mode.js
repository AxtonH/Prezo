export const ARTIFACT_VISUAL_MODE = 'artifact'
export const ARTIFACT_LAYOUT_HORIZONTAL = 'horizontal'
export const ARTIFACT_LAYOUT_VERTICAL = 'vertical'

export const ARTIFACT_DEFAULT_PLACEHOLDER =
  'Describe your game concept (example: vertically aligned bars with floating labels and smooth transitions).'

export const ARTIFACT_WAITING_STATUS =
  'Artifact mode is waiting for your prompt. Describe the game style, then click Build.'

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
    'Assume the render viewport is fixed 16:9 widescreen (PowerPoint standard) and compose safely inside it.',
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

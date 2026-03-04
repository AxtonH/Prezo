export const ARTIFACT_VISUAL_MODE = 'artifact'

const ARTIFACT_PROFILES = Object.freeze({
  lego: Object.freeze({
    id: 'lego',
    displayName: 'Lego Build',
    keywords: Object.freeze(['lego', 'brick', 'blocks', 'blocky', 'stack']),
    placeholder:
      'Describe your build (example: falling lego bricks, vertical score towers, yellow/blue palette).',
    aiGuidance:
      'Prioritize playful block-based visuals, strong contrast, and stacking motion cues.',
    themePatch: Object.freeze({
      fillA: '#f4c542',
      fillB: '#f28d35',
      trackColor: '#fff4cf',
      trackOpacity: 0.92,
      panelColor: '#fffdf2',
      panelOpacity: 0.88,
      textMain: '#2a2f4f',
      textSub: '#5a6286',
      barHeight: 28,
      labelSize: 24
    })
  }),
  cats: Object.freeze({
    id: 'cats',
    displayName: 'Cat Parade',
    keywords: Object.freeze(['cat', 'cats', 'kitty', 'feline', 'paw']),
    placeholder:
      'Describe your cat theme (example: cats walking across each bar with soft pastel tones).',
    aiGuidance:
      'Use cozy playful styling with gentle color contrast and cat-walk motion cues.',
    themePatch: Object.freeze({
      fillA: '#ffb380',
      fillB: '#ff7f66',
      trackColor: '#ffe4da',
      trackOpacity: 0.9,
      panelColor: '#fff8f5',
      panelOpacity: 0.88,
      textMain: '#4a2f2b',
      textSub: '#8f665f',
      barHeight: 26,
      labelSize: 24
    })
  }),
  arcade: Object.freeze({
    id: 'arcade',
    displayName: 'Arcade Neon',
    keywords: Object.freeze(['arcade', 'neon', 'retro', 'pixel', 'cyber', 'synth']),
    placeholder:
      'Describe your arcade style (example: neon bars, pixel particles, high-energy score board).',
    aiGuidance:
      'Use high-energy arcade visual direction with punchy colors and animated HUD feeling.',
    themePatch: Object.freeze({
      fillA: '#49f3ff',
      fillB: '#527bff',
      trackColor: '#d8e9ff',
      trackOpacity: 0.86,
      panelColor: '#eef6ff',
      panelOpacity: 0.82,
      textMain: '#16375e',
      textSub: '#3f6d9f',
      barHeight: 24,
      labelSize: 24
    })
  })
})

const DEFAULT_PROFILE_ID = 'arcade'

export const ARTIFACT_PROFILE_IDS = Object.freeze(Object.keys(ARTIFACT_PROFILES))

export function getDefaultArtifactProfile() {
  return getArtifactProfileById(DEFAULT_PROFILE_ID)
}

export function getArtifactProfileById(profileId) {
  const id = typeof profileId === 'string' ? profileId.trim().toLowerCase() : ''
  const profile = ARTIFACT_PROFILES[id] || ARTIFACT_PROFILES[DEFAULT_PROFILE_ID]
  return cloneProfile(profile)
}

export function resolveArtifactProfile(prompt) {
  const text = typeof prompt === 'string' ? prompt.trim().toLowerCase() : ''
  if (!text) {
    return getDefaultArtifactProfile()
  }
  for (const profileId of ARTIFACT_PROFILE_IDS) {
    const profile = ARTIFACT_PROFILES[profileId]
    if (profile.keywords.some((keyword) => text.includes(keyword))) {
      return cloneProfile(profile)
    }
  }
  return getDefaultArtifactProfile()
}

export function buildArtifactThemePatch(profile) {
  const resolved =
    profile && typeof profile === 'object'
      ? getArtifactProfileById(profile.id)
      : getDefaultArtifactProfile()
  return {
    visualMode: ARTIFACT_VISUAL_MODE,
    ...resolved.themePatch
  }
}

export function buildArtifactAiPrompt(userPrompt, profile) {
  const promptText = typeof userPrompt === 'string' ? userPrompt.trim() : ''
  const resolved =
    profile && typeof profile === 'object'
      ? getArtifactProfileById(profile.id)
      : getDefaultArtifactProfile()
  return [
    'Artifact mode is active.',
    `Selected artifact profile: ${resolved.id} (${resolved.displayName}).`,
    resolved.aiGuidance,
    'Return only supported poll-game JSON actions.',
    `User request: ${promptText || 'Use a creative artifact game layout.'}`
  ].join('\n')
}

function cloneProfile(profile) {
  return {
    id: profile.id,
    displayName: profile.displayName,
    placeholder: profile.placeholder,
    aiGuidance: profile.aiGuidance,
    keywords: [...profile.keywords],
    themePatch: { ...profile.themePatch }
  }
}

import {
  buildSegmentedArtifactPackage,
  resolveArtifactHtmlFromPackage,
  sanitizeArtifactPackage
} from './poll-game-gamified-artifact-package.js'

export function createPollGameLibraryStorage({
  windowObj = window,
  themeLibraryKey,
  artifactLibraryKey,
  themeDraftKey,
  defaultTheme,
  clone,
  asText,
  safeJsonParse,
  safeStorageGet,
  normalizeThemeName,
  sanitizeTheme,
  normalizeArtifactMarkup,
  createEmptyArtifactAnswers,
  cloneArtifactConversationAnswers,
  artifactVisualMode
}) {
  function hasLegacyTitleThemeFields(theme) {
    if (!theme || typeof theme !== 'object') {
      return false
    }
    return (
      Object.prototype.hasOwnProperty.call(theme, 'titleX') ||
      Object.prototype.hasOwnProperty.call(theme, 'titleY') ||
      Object.prototype.hasOwnProperty.call(theme, 'titleBoxWidth') ||
      Object.prototype.hasOwnProperty.call(theme, 'titleBoxHeight') ||
      Object.prototype.hasOwnProperty.call(theme, 'titleScaleX') ||
      Object.prototype.hasOwnProperty.call(theme, 'titleScaleY')
    )
  }

  function isLegacyDarkTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      return false
    }
    return (
      asText(theme.bgA).toLowerCase() === '#04112b' &&
      asText(theme.bgB).toLowerCase() === '#0a2457' &&
      asText(theme.panelColor).toLowerCase() === '#040c20' &&
      asText(theme.textMain).toLowerCase() === '#e8f2ff'
    )
  }

  function saveThemeLibrary(library) {
    try {
      windowObj.localStorage?.setItem(themeLibraryKey, JSON.stringify(library))
    } catch {}
  }

  function saveArtifactLibrary(library) {
    try {
      windowObj.localStorage?.setItem(artifactLibraryKey, JSON.stringify(library))
    } catch {}
  }

  function saveThemeDraft(theme) {
    try {
      windowObj.localStorage?.setItem(themeDraftKey, JSON.stringify(theme))
    } catch {}
  }

  function loadThemeDraft() {
    const parsed = safeJsonParse(safeStorageGet(themeDraftKey))
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const sanitized = sanitizeTheme(parsed)
    if (hasLegacyTitleThemeFields(parsed)) {
      saveThemeDraft(sanitized)
    }
    return sanitized
  }

  function loadInitialTheme(library) {
    const draft = loadThemeDraft()
    if (library.activeName && library.themes[library.activeName]) {
      return sanitizeTheme(library.themes[library.activeName])
    }
    if (draft) {
      if (isLegacyDarkTheme(draft)) {
        saveThemeDraft(defaultTheme)
        return clone(defaultTheme)
      }
      return draft
    }
    return clone(defaultTheme)
  }

  function loadThemeLibrary() {
    const parsed = safeJsonParse(safeStorageGet(themeLibraryKey))
    if (!parsed || typeof parsed !== 'object') {
      return { themes: {}, activeName: null }
    }
    const incomingThemes =
      parsed.themes && typeof parsed.themes === 'object' ? parsed.themes : {}
    const themes = {}
    let migratedLegacyTheme = false
    for (const [name, theme] of Object.entries(incomingThemes)) {
      const normalizedName = normalizeThemeName(name)
      if (!normalizedName) {
        continue
      }
      if (hasLegacyTitleThemeFields(theme)) {
        migratedLegacyTheme = true
      }
      themes[normalizedName] = sanitizeTheme(theme)
    }
    const activeName =
      typeof parsed.activeName === 'string' && themes[parsed.activeName]
        ? parsed.activeName
        : null
    const library = { themes, activeName }
    if (migratedLegacyTheme) {
      saveThemeLibrary(library)
    }
    return library
  }

  function sanitizeSavedArtifactRecord(value) {
    if (!value || typeof value !== 'object') {
      return null
    }
    const rawHtml = normalizeArtifactMarkup(asText(value.html))
    const packageInput =
      value.package && typeof value.package === 'object'
        ? value.package
        : value.artifactPackage && typeof value.artifactPackage === 'object'
          ? value.artifactPackage
          : value.artifact_package && typeof value.artifact_package === 'object'
            ? value.artifact_package
            : null
    const html = rawHtml || resolveArtifactHtmlFromPackage(packageInput)
    if (!html) {
      return null
    }
    const artifactPackage = buildSegmentedArtifactPackage(
      sanitizeArtifactPackage(packageInput, html) || html
    )
    const materializedHtml = resolveArtifactHtmlFromPackage(artifactPackage) || html
    const lastPrompt = asText(value.lastPrompt ?? value.last_prompt)
    const lastAnswersInput =
      value.lastAnswers && typeof value.lastAnswers === 'object'
        ? value.lastAnswers
        : value.last_answers && typeof value.last_answers === 'object'
          ? value.last_answers
          : createEmptyArtifactAnswers()
    const themeSnapshotInput =
      value.themeSnapshot && typeof value.themeSnapshot === 'object'
        ? value.themeSnapshot
        : value.theme_snapshot && typeof value.theme_snapshot === 'object'
          ? value.theme_snapshot
          : null
    const styleOverridesInput =
      value.styleOverrides && typeof value.styleOverrides === 'object'
        ? value.styleOverrides
        : value.style_overrides && typeof value.style_overrides === 'object'
          ? value.style_overrides
          : null
    const styleOverrides =
      styleOverridesInput && Object.keys(styleOverridesInput).length > 0
        ? styleOverridesInput
        : null
    return {
      html: materializedHtml,
      package: artifactPackage,
      lastPrompt,
      lastAnswers: cloneArtifactConversationAnswers(lastAnswersInput),
      themeSnapshot: themeSnapshotInput
        ? sanitizeTheme({ ...themeSnapshotInput, visualMode: artifactVisualMode })
        : null,
      styleOverrides
    }
  }

  function loadArtifactLibrary() {
    const parsed = safeJsonParse(safeStorageGet(artifactLibraryKey))
    if (!parsed || typeof parsed !== 'object') {
      return { artifacts: {}, activeName: null }
    }
    const incomingArtifacts =
      parsed.artifacts && typeof parsed.artifacts === 'object' ? parsed.artifacts : {}
    const artifacts = {}
    for (const [name, artifact] of Object.entries(incomingArtifacts)) {
      const normalizedName = normalizeThemeName(name)
      const normalizedArtifact = sanitizeSavedArtifactRecord(artifact)
      if (!normalizedName || !normalizedArtifact) {
        continue
      }
      artifacts[normalizedName] = normalizedArtifact
    }
    const activeName =
      typeof parsed.activeName === 'string' && artifacts[parsed.activeName]
        ? parsed.activeName
        : null
    return { artifacts, activeName }
  }

  return {
    hasLegacyTitleThemeFields,
    isLegacyDarkTheme,
    loadInitialTheme,
    loadThemeLibrary,
    saveThemeLibrary,
    loadArtifactLibrary,
    saveArtifactLibrary,
    loadThemeDraft,
    saveThemeDraft,
    sanitizeSavedArtifactRecord
  }
}

/**
 * Library panel for the gamified station: saved theme + artifact selects,
 * save/load/delete flows, account version history + restore, theme
 * export/import/reset, remote-library merges, the sync status pill, and the
 * panel's feedback lines.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 6b). Per the ground rules
 * this panel owns its DOM: the shared `el` map is injected and used directly.
 * Two deliberate seams replace closure access to reassignable bindings:
 * getCurrentTheme()/setCurrentTheme(next) for the theme, and
 * getPending*Overrides()/clearPendingArtifactOverrides() for the unsaved
 * override maps. themeLibrary/artifactLibrary are mutation-only objects and
 * arrive by reference; the artifact version-history state lives here.
 */
import {
  ARTIFACT_CONVERSATION_STEPS,
  ARTIFACT_VISUAL_MODE,
  cloneArtifactConversationAnswers,
  createEmptyArtifactAnswers,
  normalizeArtifactActivityKind
} from './poll-game-gamified-artifact-mode.js'
import {
  buildSegmentedArtifactPackage,
  buildSingleFileArtifactPackage,
  resolveArtifactHtmlFromPackage
} from './poll-game-gamified-artifact-package.js'
import { mergeCopyIntoStyleOverrides } from './poll-game-gamified-artifact-copy.js'
import { normalizeArtifactMarkup } from './poll-game-gamified-artifact-runtime.js'
import { defaultTheme, sanitizeTheme } from './poll-game-gamified-theme.js'
import { asText, clone, errorToMessage, normalizeThemeName, toInt } from './poll-game-gamified-utils.js'

function feedbackColor(type) {
  if (type === 'success') {
    return '#216e43'
  }
  if (type === 'error') {
    return '#b53a4e'
  }
  if (type === 'warning') {
    return '#b54708'
  }
  return '#5f7ea3'
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function buildArtifactVersionLabel(record) {
  const version = Math.max(1, toInt(record?.version))
  const source = asText(record?.source)
  const createdAt = Date.parse(asText(record?.created_at))
  const timestamp = Number.isFinite(createdAt)
    ? new Date(createdAt).toLocaleString()
    : ''
  return [source ? `v${version} · ${source}` : `v${version}`, timestamp]
    .filter(Boolean)
    .join(' · ')
}

export function createLibraryPanel(deps) {
  const {
    state,
    el,
    themeLibrary,
    artifactLibrary,
    // Reassignable closure bindings arrive as accessors.
    getCurrentTheme,
    setCurrentTheme,
    getPendingStyleOverrides,
    getPendingCopyOverrides,
    /** Reset both pending override maps to fresh objects. */
    clearPendingArtifactOverrides,
    // Storage + account sync (library-storage / library-sync instances).
    saveThemeLibrary,
    saveArtifactLibrary,
    saveThemeDraft,
    sanitizeSavedArtifactRecord,
    persistThemeToAccount,
    deleteThemeFromAccount,
    persistArtifactToAccount,
    deleteArtifactFromAccount,
    listArtifactVersionsFromAccount,
    restoreArtifactVersionInAccount,
    reflectLibrarySyncResult,
    // Editor handler instances.
    artifactPosition,
    artifactSize,
    artifactDelete,
    artifactHistory,
    // App callbacks under their original closure names.
    updateTheme,
    applyTheme,
    syncThemeControls,
    postVisualModeToParent,
    postActiveArtifactToParent,
    recordHistoryCheckpoint,
    renderFromSnapshot,
    applyArtifactMarkup,
    clearArtifactMarkup,
    resetArtifactConversation,
    hideArtifactStage,
    showArtifactStagePlaceholder,
    showArtifactStageFrame,
    clearArtifactEditPromptQueue,
    syncArtifactConversationUi
  } = deps

  const artifactVersionState = {
    selectedName: '',
    versions: [],
    loading: false
  }

  function setLibrarySyncStatus(type, text, detail = '') {
    state.library.status = type
    state.library.detail = detail
    el.librarySyncStatus.classList.remove('status-pending', 'status-success', 'status-warning', 'status-error')
    el.librarySyncStatus.classList.add(
      type === 'success'
        ? 'status-success'
        : type === 'warning'
          ? 'status-warning'
          : type === 'error'
            ? 'status-error'
            : 'status-pending'
    )
    el.librarySyncStatusText.textContent = text
    el.librarySyncStatus.title = detail || text
  }

  function mergeRemoteThemeLibrary(records) {
    if (!Array.isArray(records)) {
      return
    }
    for (const record of records) {
      const name = normalizeThemeName(record?.name)
      if (!name || !record || typeof record.theme !== 'object' || !record.theme) {
        continue
      }
      themeLibrary.themes[name] = sanitizeTheme(record.theme)
    }
    saveThemeLibrary(themeLibrary)
    refreshThemeSelect(themeLibrary.activeName)
  }

  function mergeRemoteArtifactLibrary(records) {
    if (!Array.isArray(records)) {
      return
    }
    for (const record of records) {
      const name = normalizeThemeName(record?.name)
      const normalizedRecord = sanitizeSavedArtifactRecord(record)
      if (!name || !normalizedRecord) {
        continue
      }
      artifactLibrary.artifacts[name] = normalizedRecord
    }
    saveArtifactLibrary(artifactLibrary)
    refreshArtifactSelect(artifactLibrary.activeName)
    void refreshArtifactVersionHistory()
  }

  async function saveTheme() {
    const name = normalizeThemeName(el.themeName.value)
    if (!name) {
      showThemeFeedback('Theme name is required.', 'error')
      return
    }
    themeLibrary.themes[name] = clone(getCurrentTheme())
    themeLibrary.activeName = name
    saveThemeLibrary(themeLibrary)
    saveThemeDraft(getCurrentTheme())
    refreshThemeSelect(name)
    el.themeName.value = name
    const syncResult = await persistThemeToAccount(name, getCurrentTheme())
    showThemeFeedback(syncResult.message || `Theme "${name}" saved.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
  }

  function loadThemeFromSelect() {
    const name = asText(el.themeSelect.value)
    if (!name || !themeLibrary.themes[name]) {
      showThemeFeedback('Select a saved theme first.', 'error')
      return
    }
    setCurrentTheme(sanitizeTheme(themeLibrary.themes[name]))
    applyTheme(getCurrentTheme())
    postVisualModeToParent('theme-load')
    syncThemeControls()
    themeLibrary.activeName = name
    saveThemeLibrary(themeLibrary)
    saveThemeDraft(getCurrentTheme())
    el.themeName.value = name
    if (state.snapshot) {
      renderFromSnapshot(true)
    }
    recordHistoryCheckpoint('Load theme')
    showThemeFeedback(`Theme "${name}" loaded.`, 'success')
  }

  async function deleteThemeFromSelect() {
    const name = asText(el.themeSelect.value)
    if (!name || !themeLibrary.themes[name]) {
      showThemeFeedback('Nothing selected to delete.', 'error')
      return
    }
    delete themeLibrary.themes[name]
    if (themeLibrary.activeName === name) {
      themeLibrary.activeName = null
    }
    saveThemeLibrary(themeLibrary)
    refreshThemeSelect(themeLibrary.activeName)
    const syncResult = await deleteThemeFromAccount(name)
    showThemeFeedback(syncResult.message || `Theme "${name}" deleted.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
  }

  function startNewArtifact() {
    if (state.artifact.busy) {
      return
    }
    if (getCurrentTheme().visualMode !== ARTIFACT_VISUAL_MODE) {
      updateTheme({ visualMode: ARTIFACT_VISUAL_MODE }, { historyLabel: 'New artifact' })
      return
    }
    state.artifact.lastPrompt = ''
    state.artifact.lastAnswers = createEmptyArtifactAnswers()
    state.artifact.activeEditRequest = ''
    state.artifact.autoRepairInFlight = false
    state.artifact.repairAttemptCount = 0
    state.artifact.lastRuntimeError = ''
    clearArtifactMarkup()
    resetArtifactConversation({ preserveInput: false })
    hideArtifactStage()
    showArtifactStagePlaceholder(
      'Artifact wizard is ready. Answer the questions to generate your artifact.',
      'pending'
    )
    el.artifactName.value = ''
  }

  async function saveArtifactToLibrary() {
    const name = normalizeThemeName(el.artifactName.value)
    if (!name) {
      showArtifactFeedback('Artifact name is required.', 'error')
      return
    }
    const artifactRecord = buildSavedArtifactRecord()
    if (!artifactRecord) {
      showArtifactFeedback('Generate an artifact before saving it.', 'error')
      return
    }
    artifactLibrary.artifacts[name] = artifactRecord
    artifactLibrary.activeName = name
    state.artifact.savedStyleOverrides = artifactRecord.styleOverrides || {}
    clearPendingArtifactOverrides()
    artifactPosition.clearPendingPositionOverrides()
    artifactSize.clearPendingSizeOverrides()
    saveArtifactLibrary(artifactLibrary)
    postActiveArtifactToParent('artifact-saved')
    refreshArtifactSelect(name)
    el.artifactName.value = name
    const syncResult = await persistArtifactToAccount(name, artifactRecord)
    showArtifactFeedback(syncResult.message || `Artifact "${name}" saved.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
    void refreshArtifactVersionHistory({ force: true })
  }

  function applyArtifactLibraryRecord(name, artifactRecord, options = {}) {
    if (!name || !artifactRecord) {
      return false
    }
    if (!artifactRecordMatchesActivityKind(artifactRecord)) {
      showArtifactFeedback(
        `Artifact "${name}" was built for a different activity type and can't run on this slide.`,
        'error'
      )
      return false
    }
    clearPendingArtifactOverrides()
    artifactPosition.clearPendingPositionOverrides()
    artifactSize.clearPendingSizeOverrides()
    artifactHistory.clear()
    const nextTheme = sanitizeTheme({
      ...(artifactRecord.themeSnapshot || getCurrentTheme()),
      visualMode: ARTIFACT_VISUAL_MODE
    })
    setCurrentTheme(nextTheme)
    artifactLibrary.activeName = name
    saveArtifactLibrary(artifactLibrary)
    postActiveArtifactToParent('artifact-preset-load')
    saveThemeDraft(getCurrentTheme())
    applyTheme(getCurrentTheme())
    postVisualModeToParent('artifact-preset-load')
    syncThemeControls()
    state.artifact.lastPrompt = asText(artifactRecord.lastPrompt)
    state.artifact.savedStyleOverrides =
      artifactRecord.styleOverrides && typeof artifactRecord.styleOverrides === 'object'
        ? artifactRecord.styleOverrides
        : {}
    state.artifact.lastAnswers = cloneArtifactConversationAnswers(artifactRecord.lastAnswers)
    state.artifact.conversationAnswers = cloneArtifactConversationAnswers(
      artifactRecord.lastAnswers
    )
    state.artifact.conversationStepIndex = ARTIFACT_CONVERSATION_STEPS.length
    state.artifact.editHistory = []
    clearArtifactEditPromptQueue()
    state.artifact.activeEditRequest = ''
    state.artifact.autoRepairInFlight = false
    state.artifact.repairAttemptCount = 0
    state.artifact.lastRuntimeError = ''
    const applied = applyArtifactMarkup(artifactRecord.html, {
      requestKind: 'build',
      artifactPackage: artifactRecord.package || null
    })
    syncArtifactConversationUi()
    el.artifactName.value = name
    if (state.snapshot) {
      renderFromSnapshot(true)
    } else if (applied) {
      showArtifactStageFrame()
    }
    recordHistoryCheckpoint(asText(options.historyLabel) || 'Load artifact')
    const successMessage = asText(options.successMessage) || `Artifact "${name}" loaded.`
    const failureMessage =
      asText(options.failureMessage) || `Artifact "${name}" could not be loaded.`
    showArtifactFeedback(applied ? successMessage : failureMessage, applied ? 'success' : 'error')
    return applied
  }

  function loadArtifactFromSelect() {
    const name = asText(el.artifactSelect.value)
    const artifactRecord = name ? artifactLibrary.artifacts[name] : null
    if (!name || !artifactRecord) {
      showArtifactFeedback('Select a saved artifact first.', 'error')
      return
    }
    applyArtifactLibraryRecord(name, artifactRecord, {
      historyLabel: 'Load artifact',
      successMessage: `Artifact "${name}" loaded.`
    })
    void refreshArtifactVersionHistory()
  }

  async function deleteArtifactFromSelect() {
    const name = asText(el.artifactSelect.value)
    if (!name || !artifactLibrary.artifacts[name]) {
      showArtifactFeedback('Nothing selected to delete.', 'error')
      return
    }
    delete artifactLibrary.artifacts[name]
    const wasActive = artifactLibrary.activeName === name
    if (wasActive) {
      artifactLibrary.activeName = null
    }
    saveArtifactLibrary(artifactLibrary)
    if (wasActive) {
      postActiveArtifactToParent('artifact-deleted')
    }
    refreshArtifactSelect(artifactLibrary.activeName)
    const syncResult = await deleteArtifactFromAccount(name)
    showArtifactFeedback(syncResult.message || `Artifact "${name}" deleted.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
    void refreshArtifactVersionHistory({ force: true })
  }

  function handleArtifactSelectChange() {
    const selectedName = asText(el.artifactSelect.value)
    if (selectedName) {
      el.artifactName.value = selectedName
    }
    void refreshArtifactVersionHistory({ force: true })
  }

  function renderArtifactVersionSelect() {
    const selectedName = asText(el.artifactSelect.value)
    const versions = Array.isArray(artifactVersionState.versions) ? artifactVersionState.versions : []
    el.artifactVersionSelect.innerHTML = ''
    if (!selectedName) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'Select artifact'
      el.artifactVersionSelect.appendChild(option)
      el.restoreArtifactVersion.disabled = true
      return
    }
    if (artifactVersionState.loading) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'Loading versions…'
      el.artifactVersionSelect.appendChild(option)
      el.restoreArtifactVersion.disabled = true
      return
    }
    if (versions.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No account history'
      el.artifactVersionSelect.appendChild(option)
      el.restoreArtifactVersion.disabled = true
      return
    }
    for (const versionRecord of versions) {
      const option = document.createElement('option')
      const versionNumber = Math.max(1, toInt(versionRecord?.version))
      option.value = String(versionNumber)
      option.textContent = buildArtifactVersionLabel(versionRecord)
      el.artifactVersionSelect.appendChild(option)
    }
    el.artifactVersionSelect.value = String(Math.max(1, toInt(versions[0]?.version)))
    el.restoreArtifactVersion.disabled = false
  }

  async function refreshArtifactVersionHistory({ force = false } = {}) {
    const selectedName = asText(el.artifactSelect.value)
    if (!selectedName) {
      artifactVersionState.selectedName = ''
      artifactVersionState.versions = []
      artifactVersionState.loading = false
      renderArtifactVersionSelect()
      return
    }
    if (
      !force &&
      artifactVersionState.selectedName === selectedName &&
      Array.isArray(artifactVersionState.versions) &&
      artifactVersionState.versions.length > 0
    ) {
      renderArtifactVersionSelect()
      return
    }
    artifactVersionState.selectedName = selectedName
    artifactVersionState.loading = true
    renderArtifactVersionSelect()
    try {
      const rows = await listArtifactVersionsFromAccount(selectedName, 30)
      if (artifactVersionState.selectedName !== selectedName) {
        return
      }
      artifactVersionState.versions = Array.isArray(rows)
        ? rows
            .filter((row) => row && typeof row === 'object' && Number.isFinite(toInt(row.version)))
            .sort((left, right) => toInt(right?.version) - toInt(left?.version))
        : []
    } catch (error) {
      if (artifactVersionState.selectedName !== selectedName) {
        return
      }
      artifactVersionState.versions = []
      // Auth-related failures (no token, expired token, server rejected token)
      // are recoverable: the host taskpane refreshes the library-sync token
      // on a timer (see App.tsx) and the embed will catch up on the next
      // hydrateSavedLibraries cycle. We surface the "Local library only"
      // status via the sync manager already; logging here would just spam
      // the console for a state the embed handles gracefully. Match the
      // same predicate hydrateSavedLibraries uses so the two paths agree.
      const message = String(errorToMessage(error))
      const isAuthFailure =
        message.includes('Sign in through Prezo Host') ||
        message.includes('Invalid auth token') ||
        message.includes('Auth required')
      if (!isAuthFailure) {
        console.warn('Failed to load artifact version history', error)
      }
    } finally {
      if (artifactVersionState.selectedName === selectedName) {
        artifactVersionState.loading = false
        renderArtifactVersionSelect()
      }
    }
  }

  async function restoreArtifactFromVersionHistory() {
    const name = asText(el.artifactSelect.value)
    if (!name || !artifactLibrary.artifacts[name]) {
      showArtifactFeedback('Select a saved artifact first.', 'error')
      return
    }
    const version = Math.max(1, toInt(el.artifactVersionSelect.value))
    if (!version) {
      showArtifactFeedback('Select an artifact version first.', 'error')
      return
    }
    el.restoreArtifactVersion.disabled = true
    try {
      const restoredRecordRaw = await restoreArtifactVersionInAccount(name, version)
      const restoredRecord = sanitizeSavedArtifactRecord(restoredRecordRaw)
      if (!restoredRecord) {
        throw new Error('Restored artifact payload was invalid.')
      }
      artifactLibrary.artifacts[name] = restoredRecord
      artifactLibrary.activeName = name
      saveArtifactLibrary(artifactLibrary)
      refreshArtifactSelect(name)
      applyArtifactLibraryRecord(name, restoredRecord, {
        historyLabel: 'Restore artifact version',
        successMessage: `Artifact "${name}" restored to version v${version}.`,
        failureMessage: `Artifact "${name}" restore returned invalid markup.`
      })
      await refreshArtifactVersionHistory({ force: true })
    } catch (error) {
      showArtifactFeedback(`Artifact restore failed: ${errorToMessage(error)}`, 'error')
    } finally {
      renderArtifactVersionSelect()
    }
  }

  function exportCurrentTheme() {
    const preferredName =
      normalizeThemeName(el.themeName.value) ||
      asText(el.themeSelect.value) ||
      'prezo-theme'
    const payload = {
      version: 1,
      name: preferredName,
      exportedAt: new Date().toISOString(),
      theme: getCurrentTheme()
    }
    const filename = `${preferredName.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').toLowerCase()}.json`
    downloadText(filename, JSON.stringify(payload, null, 2))
    showThemeFeedback('Theme exported.', 'success')
  }

  async function importThemeFromFile(event) {
    const file = event.target?.files?.[0]
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const importedTheme = sanitizeTheme(
        parsed?.theme && typeof parsed.theme === 'object' ? parsed.theme : parsed
      )
      const importedName =
        normalizeThemeName(parsed?.name) ||
        normalizeThemeName(file.name.replace(/\.[^.]+$/, '')) ||
        `imported-${new Date().toISOString().slice(0, 10)}`

      setCurrentTheme(importedTheme)
      applyTheme(getCurrentTheme())
      syncThemeControls()
      saveThemeDraft(getCurrentTheme())
      themeLibrary.themes[importedName] = clone(getCurrentTheme())
      themeLibrary.activeName = importedName
      saveThemeLibrary(themeLibrary)
      refreshThemeSelect(importedName)
      el.themeName.value = importedName
      const syncResult = await persistThemeToAccount(importedName, getCurrentTheme())
      if (state.snapshot) {
        renderFromSnapshot(true)
      }
      recordHistoryCheckpoint('Import theme')
      showThemeFeedback(
        syncResult.message || `Theme "${importedName}" imported.`,
        syncResult.type
      )
    } catch {
      showThemeFeedback('Invalid theme file.', 'error')
    } finally {
      el.importTheme.value = ''
    }
  }

  function resetThemeDraft() {
    setCurrentTheme(clone(defaultTheme))
    applyTheme(getCurrentTheme())
    syncThemeControls()
    saveThemeDraft(getCurrentTheme())
    if (state.snapshot) {
      renderFromSnapshot(true)
    }
    recordHistoryCheckpoint('Reset theme')
    showThemeFeedback('Theme reset to defaults.', 'success')
  }

  function refreshThemeSelect(selectedName) {
    const names = Object.keys(themeLibrary.themes).sort((a, b) => a.localeCompare(b))
    el.themeSelect.innerHTML = ''

    if (names.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No saved themes'
      el.themeSelect.appendChild(option)
      return
    }

    for (const name of names) {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      el.themeSelect.appendChild(option)
    }

    const preferred =
      selectedName && themeLibrary.themes[selectedName] ? selectedName : names[0]
    el.themeSelect.value = preferred
    if (!el.themeName.value) {
      el.themeName.value = preferred
    }
  }

  function buildSavedArtifactRecord() {
    const html = normalizeArtifactMarkup(state.artifact.html)
    if (!html) {
      return null
    }
    const artifactPackage = buildSegmentedArtifactPackage(state.artifact.package || html)
    const materializedHtml = resolveArtifactHtmlFromPackage(artifactPackage) || html
    const existingOverrides = state.artifact.savedStyleOverrides || {}
    const mergedStyle = { ...existingOverrides, ...getPendingStyleOverrides() }
    const pendingCopyWithPositions = {
      ...getPendingCopyOverrides(),
      positionOverrides: artifactPosition.getPendingPositionOverrides(),
      sizeOverrides: artifactSize.getPendingSizeOverrides(),
      hiddenOverrides: artifactDelete.getPendingHiddenOverrides()
    }
    const styleOverrides = mergeCopyIntoStyleOverrides(mergedStyle, pendingCopyWithPositions)
    return sanitizeSavedArtifactRecord({
      kind: state.activityKind,
      html: materializedHtml,
      package: artifactPackage || buildSingleFileArtifactPackage(materializedHtml),
      lastPrompt: state.artifact.lastPrompt,
      lastAnswers: state.artifact.lastAnswers,
      themeSnapshot: {
        ...clone(getCurrentTheme()),
        visualMode: ARTIFACT_VISUAL_MODE
      },
      styleOverrides: Object.keys(styleOverrides).length > 0 ? styleOverrides : null
    })
  }

  /** A saved artifact is loadable here only when it renders this station's
      activity kind — a poll game can't consume the qna state channel and
      vice versa. Legacy records (no kind) are polls. */
  function artifactRecordMatchesActivityKind(record) {
    const normalized = normalizeArtifactActivityKind(asText(record?.kind))
    if (state.activityKind === 'poll') {
      return normalized === 'poll'
    }
    // qna and discussion share the runtime contract, so their artifacts are
    // interchangeable between the two kinds.
    return normalized !== 'poll'
  }

  function refreshArtifactSelect(selectedName) {
    const names = Object.keys(artifactLibrary.artifacts)
      .filter((name) => artifactRecordMatchesActivityKind(artifactLibrary.artifacts[name]))
      .sort((a, b) => a.localeCompare(b))
    el.artifactSelect.innerHTML = ''

    if (names.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No saved artifacts'
      el.artifactSelect.appendChild(option)
      renderArtifactVersionSelect()
      return
    }

    for (const name of names) {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      el.artifactSelect.appendChild(option)
    }

    const preferred =
      selectedName && artifactLibrary.artifacts[selectedName] && names.includes(selectedName)
        ? selectedName
        : names[0]
    el.artifactSelect.value = preferred
    if (!el.artifactName.value) {
      el.artifactName.value = preferred
    }
    renderArtifactVersionSelect()
  }

  function showThemeFeedback(text, type) {
    el.themeFeedback.textContent = text
    el.themeFeedback.style.color = feedbackColor(type)
  }

  function showArtifactFeedback(text, type) {
    el.artifactFeedback.textContent = text
    el.artifactFeedback.style.color = feedbackColor(type)
  }

  return {
    setLibrarySyncStatus,
    mergeRemoteThemeLibrary,
    mergeRemoteArtifactLibrary,
    saveTheme,
    loadThemeFromSelect,
    deleteThemeFromSelect,
    startNewArtifact,
    saveArtifactToLibrary,
    applyArtifactLibraryRecord,
    loadArtifactFromSelect,
    deleteArtifactFromSelect,
    handleArtifactSelectChange,
    renderArtifactVersionSelect,
    refreshArtifactVersionHistory,
    restoreArtifactFromVersionHistory,
    exportCurrentTheme,
    importThemeFromFile,
    resetThemeDraft,
    refreshThemeSelect,
    buildSavedArtifactRecord,
    artifactRecordMatchesActivityKind,
    refreshArtifactSelect,
    showThemeFeedback,
    showArtifactFeedback
  }
}

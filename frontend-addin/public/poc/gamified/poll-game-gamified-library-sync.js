export function createPollGameLibrarySyncManager({
  windowObj = window,
  librarySyncStorageKey,
  librarySyncMessageType,
  librarySyncRequestMessageType,
  normalizeApiBase,
  asText,
  errorToMessage,
  getSupabaseAccessToken,
  getApiBase,
  setApiBase,
  mergeRemoteThemeLibrary,
  mergeRemoteArtifactLibrary,
  setStatus,
  showArtifactFeedback
}) {
  let injectedLibrarySync = loadInjectedLibrarySync()
  let hydratedToken = ''
  let refreshTimerId = null

  function loadInjectedLibrarySync() {
    try {
      if (!windowObj.sessionStorage) {
        return null
      }
      const raw = windowObj.sessionStorage.getItem(librarySyncStorageKey)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw)
      const token = asText(parsed?.token)
      const expiresAt = asText(parsed?.expiresAt)
      if (!token || !expiresAt) {
        return null
      }
      const expiresAtMs = Date.parse(expiresAt)
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        return null
      }
      return {
        token,
        expiresAt,
        apiBaseUrl: asText(parsed?.apiBaseUrl)
      }
    } catch {
      return null
    }
  }

  function persistInjectedLibrarySync(payload) {
    const token = asText(payload?.token)
    const expiresAt = asText(payload?.expiresAt)
    if (!token || !expiresAt) {
      return
    }
    const expiresAtMs = Date.parse(expiresAt)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return
    }
    injectedLibrarySync = {
      token,
      expiresAt,
      apiBaseUrl: asText(payload?.apiBaseUrl)
    }
    try {
      windowObj.sessionStorage?.setItem(
        librarySyncStorageKey,
        JSON.stringify(injectedLibrarySync)
      )
    } catch {
      // Ignore storage failures for injected library sync tokens.
    }
  }

  function getLibraryAccessToken() {
    if (injectedLibrarySync?.token) {
      const expiresAtMs = Date.parse(injectedLibrarySync.expiresAt)
      if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) {
        return injectedLibrarySync.token
      }
    }
    return getSupabaseAccessToken()
  }

  function getLibraryAuthSource() {
    if (injectedLibrarySync?.token) {
      const expiresAtMs = Date.parse(injectedLibrarySync.expiresAt)
      if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) {
        return 'presentation'
      }
    }
    return getSupabaseAccessToken() ? 'browser' : 'none'
  }

  function clearRefreshTimer() {
    if (!refreshTimerId) {
      return
    }
    windowObj.clearTimeout(refreshTimerId)
    refreshTimerId = null
  }

  function setStatusForAvailability() {
    const source = getLibraryAuthSource()
    if (source === 'presentation') {
      setStatus(
        'pending',
        'Syncing account library…',
        'Using the PowerPoint presentation sync bridge to load your saved themes and artifacts.'
      )
      return
    }
    if (source === 'browser') {
      setStatus(
        'pending',
        'Syncing account library…',
        'Using your current browser sign-in to load saved themes and artifacts.'
      )
      return
    }
    hydratedToken = ''
    setStatus(
      'warning',
      'Local library only',
      'This surface is showing only items saved in its own storage. Open Prezo Host while signed in to sync with your account.'
    )
  }

  async function fetchAuthedJson(path, options = {}) {
    const token = getLibraryAccessToken()
    if (!token) {
      throw new Error('Sign in through Prezo Host to sync saved items.')
    }
    const headers = new Headers(options.headers || {})
    headers.set('Authorization', `Bearer ${token}`)
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    let response
    try {
      response = await windowObj.fetch(`${getApiBase()}${path}`, {
        ...options,
        headers
      })
    } catch (error) {
      const message = errorToMessage(error)
      throw new Error(`Unable to reach API base ${getApiBase()}: ${message}`)
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const detail =
        typeof payload?.detail === 'string' ? payload.detail : `Request failed (${response.status})`
      throw new Error(`${detail} [API ${getApiBase()}]`)
    }
    return payload
  }

  async function hydrateSavedLibraries({ force = false } = {}) {
    const token = getLibraryAccessToken()
    if (!token) {
      setStatusForAvailability()
      return
    }
    if (!force && hydratedToken === token) {
      setStatusSuccessIfNeeded()
      return
    }
    setStatusForAvailability()
    try {
      const [remoteThemes, remoteArtifacts] = await Promise.all([
        fetchAuthedJson('/library/poll-game/themes'),
        fetchAuthedJson('/library/poll-game/artifacts')
      ])
      mergeRemoteThemeLibrary(remoteThemes)
      mergeRemoteArtifactLibrary(remoteArtifacts)
      hydratedToken = token
      clearRefreshTimer()
      setStatusSuccessIfNeeded(true)
    } catch (error) {
      hydratedToken = ''
      const message = errorToMessage(error)
      if (
        message === 'Sign in through Prezo Host to sync saved items.' ||
        message.includes('Auth required') ||
        message.includes('Invalid auth token')
      ) {
        setStatus(
          'warning',
          'Local library only',
          'Account sync is unavailable in this surface right now. Open Prezo Host while signed in to refresh the shared library token.'
        )
        return
      }
      clearRefreshTimer()
      setStatus(
        'error',
        'Library sync unavailable',
        `Unable to load account-synced themes and artifacts: ${message}`
      )
      console.warn('Failed to hydrate saved theme/artifact libraries', error)
    }
  }

  function setStatusSuccessIfNeeded(force = false) {
    const source = getLibraryAuthSource()
    if ((force || hydratedToken) && (source === 'presentation' || source === 'browser')) {
      setStatus(
        'success',
        'Account sync active',
        source === 'presentation'
          ? 'Saved themes and artifacts are synced from your Prezo Host sign-in through this presentation.'
          : 'Saved themes and artifacts are synced from your browser sign-in.'
      )
    }
  }

  function handleLibrarySyncMessage(event) {
    const message = event?.data
    if (!message || typeof message !== 'object' || message.type !== librarySyncMessageType) {
      return
    }
    if (event.origin && event.origin !== windowObj.location.origin) {
      return
    }
    persistInjectedLibrarySync(message)
    const injectedApiBase = normalizeApiBase(message.apiBaseUrl)
    if (injectedApiBase) {
      setApiBase(injectedApiBase)
    }
    clearRefreshTimer()
    setStatusForAvailability()
    void hydrateSavedLibraries({ force: true })
  }

  function handleLibrarySyncStatusClick() {
    clearRefreshTimer()
    const source = getLibraryAuthSource()
    setStatus(
      'pending',
      source === 'none' ? 'Requesting account sync…' : 'Refreshing account sync…',
      source === 'presentation'
        ? 'Refreshing the shared library token from the presentation.'
        : source === 'browser'
          ? 'Refreshing the saved library from your browser sign-in.'
          : 'Requesting a shared library token from the current presentation or retrying browser sign-in.'
    )
    if (windowObj.parent && windowObj.parent !== windowObj) {
      try {
        windowObj.parent.postMessage(
          { type: librarySyncRequestMessageType },
          windowObj.location.origin
        )
      } catch {
        // Ignore parent postMessage failures.
      }
    }
    void hydrateSavedLibraries({ force: true })
    refreshTimerId = windowObj.setTimeout(() => {
      refreshTimerId = null
      if (getLibraryAccessToken()) {
        setStatus(
          'error',
          'Library sync unavailable',
          'A sync token was found, but the account library could not be loaded right now. Try again in a moment.'
        )
        showArtifactFeedback('Account library sync failed. Try again in a moment.', 'error')
        return
      }
      setStatus(
        'warning',
        'Local library only',
        'No shared account sync token was found for this session. Open Prezo Host while signed in, then click this badge again.'
      )
      showArtifactFeedback(
        'No shared account sync was found for this session. Open Prezo Host while signed in, then click the badge again.',
        'warning'
      )
    }, 1800)
  }

  function buildLibrarySyncFallback(localMessage, errorMessage) {
    if (
      errorMessage === 'Sign in through Prezo Host to sync saved items.' ||
      errorMessage.includes('Auth required') ||
      errorMessage.includes('Invalid auth token')
    ) {
      return {
        type: 'warning',
        message: `${localMessage} Saved only in this surface. Open Prezo Host to sync with your account.`
      }
    }
    return {
      type: 'error',
      message: `${localMessage} Sync failed: ${errorMessage}`
    }
  }

  function reflectLibrarySyncResult(syncResult) {
    if (!syncResult || typeof syncResult !== 'object') {
      return
    }
    if (syncResult.type === 'warning') {
      setStatus(
        'warning',
        'Local library only',
        syncResult.message ||
          'This surface is currently using local saved items only. Open Prezo Host while signed in to sync with your account.'
      )
      return
    }
    if (syncResult.type === 'error') {
      setStatus(
        'error',
        'Library sync unavailable',
        syncResult.message || 'Unable to sync the saved library right now.'
      )
      return
    }
    if (syncResult.type === 'success' && getLibraryAccessToken()) {
      setStatusSuccessIfNeeded(true)
    }
  }

  async function persistThemeToAccount(name, theme) {
    try {
      await fetchAuthedJson(`/library/poll-game/themes/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({ theme })
      })
      return {
        type: 'success',
        message: `Theme "${name}" saved. Synced to your account.`
      }
    } catch (error) {
      return buildLibrarySyncFallback(
        `Theme "${name}" saved locally.`,
        errorToMessage(error)
      )
    }
  }

  async function deleteThemeFromAccount(name) {
    try {
      await fetchAuthedJson(`/library/poll-game/themes/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      return {
        type: 'success',
        message: `Theme "${name}" deleted.`
      }
    } catch (error) {
      return buildLibrarySyncFallback(
        `Theme "${name}" deleted locally.`,
        errorToMessage(error)
      )
    }
  }

  async function persistArtifactToAccount(name, artifactRecord) {
    try {
      await fetchAuthedJson(`/library/poll-game/artifacts/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({
          html: artifactRecord.html,
          last_prompt: artifactRecord.lastPrompt || null,
          last_answers: artifactRecord.lastAnswers || {},
          theme_snapshot: artifactRecord.themeSnapshot || null
        })
      })
      return {
        type: 'success',
        message: `Artifact "${name}" saved. Synced to your account.`
      }
    } catch (error) {
      return buildLibrarySyncFallback(
        `Artifact "${name}" saved locally.`,
        errorToMessage(error)
      )
    }
  }

  async function deleteArtifactFromAccount(name) {
    try {
      await fetchAuthedJson(`/library/poll-game/artifacts/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      return {
        type: 'success',
        message: `Artifact "${name}" deleted.`
      }
    } catch (error) {
      return buildLibrarySyncFallback(
        `Artifact "${name}" deleted locally.`,
        errorToMessage(error)
      )
    }
  }

  function dispose() {
    clearRefreshTimer()
  }

  return {
    hydrateSavedLibraries,
    handleLibrarySyncMessage,
    handleLibrarySyncStatusClick,
    persistThemeToAccount,
    deleteThemeFromAccount,
    persistArtifactToAccount,
    deleteArtifactFromAccount,
    reflectLibrarySyncResult,
    dispose
  }
}

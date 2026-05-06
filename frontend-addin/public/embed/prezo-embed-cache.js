/*
 * Vanilla-JS embed-cache reader.
 *
 * The embed iframe (poll-game-content.html and the inner game surface)
 * is shipped as a static asset rather than a React component, so it
 * cannot import the TypeScript modules under src/lib/embed-cache. This
 * file mirrors the read path of the unified store so embeds can pick
 * up snapshots warmed by the host taskpane.
 *
 * Keys, value shape, and channel name MUST stay in sync with the TS
 * side (see src/lib/embed-cache/store-localstorage.ts,
 * store-document.ts, and broadcast.ts). Bumping the VERSION here
 * requires the same bump there or readers and writers diverge.
 *
 * The reader exposes a small global on `window.PrezoEmbedCache`. The
 * wrapper script in poll-game-content.html consumes it via that
 * global, the same pattern already used for embed-identity.js and
 * embed-state-client.js.
 */
;(() => {
  const VERSION = 1
  const KEY_PREFIX = `prezo:embed-cache:v${VERSION}`
  const CHANNEL_NAME = 'prezo:embed-cache'

  function fullKey(sessionId) {
    return `${KEY_PREFIX}:${sessionId}`
  }

  function isStorageAvailable() {
    try {
      return typeof window !== 'undefined' && Boolean(window.localStorage)
    } catch {
      return false
    }
  }

  function getOfficeSettings() {
    try {
      return (
        (typeof Office !== 'undefined' &&
          Office.context &&
          Office.context.document &&
          Office.context.document.settings) ||
        null
      )
    } catch {
      return null
    }
  }

  function parseEntry(raw) {
    if (!raw) {
      return null
    }
    let entry
    try {
      entry = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      return null
    }
    if (!entry || typeof entry.fetchedAt !== 'number') {
      return null
    }
    return entry
  }

  function readLocalSync(sessionId) {
    if (!isStorageAvailable()) {
      return null
    }
    try {
      return parseEntry(window.localStorage.getItem(fullKey(sessionId)))
    } catch {
      return null
    }
  }

  function readDocumentAsync(sessionId) {
    return new Promise((resolve) => {
      const settings = getOfficeSettings()
      if (!settings) {
        resolve(null)
        return
      }
      try {
        // settings.get is synchronous from the caller's perspective even
        // though the underlying data is loaded with the document. Wrapping
        // in a Promise keeps the API uniform with localStorage reads
        // (which we may want to async-ify later).
        resolve(parseEntry(settings.get(fullKey(sessionId))))
      } catch {
        resolve(null)
      }
    })
  }

  /**
   * Read the freshest cached entry for a session across both stores.
   * Returns null if neither tier has anything cached.
   */
  async function readFreshest(sessionId) {
    const localEntry = readLocalSync(sessionId)
    const docEntry = await readDocumentAsync(sessionId)
    if (localEntry && docEntry) {
      return localEntry.fetchedAt >= docEntry.fetchedAt ? localEntry : docEntry
    }
    return localEntry || docEntry || null
  }

  /**
   * Subscribe to live cache updates broadcast by the host taskpane.
   * Returns an unsubscribe function. No-op when BroadcastChannel is
   * unavailable (older browsers, sandboxed contexts).
   */
  function subscribe(sessionId, handler) {
    if (typeof BroadcastChannel === 'undefined') {
      return () => undefined
    }
    let channel
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
    } catch {
      return () => undefined
    }
    const onMessage = (event) => {
      const data = event.data
      if (
        !data ||
        data.v !== 1 ||
        data.type !== 'snapshot-update' ||
        data.sessionId !== sessionId
      ) {
        return
      }
      handler({
        payload: data.payload,
        fetchedAt: data.fetchedAt,
      })
    }
    channel.addEventListener('message', onMessage)
    return () => {
      try {
        channel.removeEventListener('message', onMessage)
        channel.close()
      } catch {
        // Already closed; ignored.
      }
    }
  }

  window.PrezoEmbedCache = {
    readLocalSync,
    readDocumentAsync,
    readFreshest,
    subscribe,
  }
})()

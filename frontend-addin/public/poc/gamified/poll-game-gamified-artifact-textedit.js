/**
 * Host-side handler for inline text edits originating from the artifact iframe.
 *
 * The bridge script (in poll-game-gamified-artifact-runtime.js) makes text
 * elements inside the artifact contenteditable and posts `prezo-text-edit`
 * messages back to the host whenever the user changes text.
 *
 * This module:
 *  1. Immediately updates local poll state so the UI stays responsive.
 *  2. Debounces a PATCH request to persist the edit on the backend.
 *  3. The backend broadcasts a `poll_updated` WebSocket event so every
 *     connected client (including the host console) picks up the change.
 */

const PERSIST_DEBOUNCE_MS = 600

export function createArtifactTextEditHandler({
  getState,
  getQuestionEl,
  getApiBase,
  getAccessToken,
  renderFromSnapshot
}) {
  /** Pending PATCH payload keyed by poll id. */
  let pendingPatch = null
  let debounceTimerId = null

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Entry point — called from handleArtifactFrameMessage when the
   * message type is `prezo-text-edit`.
   */
  function handleTextEdit(message) {
    const field = typeof message.field === 'string' ? message.field : ''
    const text = typeof message.text === 'string' ? message.text : ''
    const optionId = typeof message.optionId === 'string' ? message.optionId : ''
    console.log('[prezo-text-edit] received:', { field, text, optionId })
    if (!field) {
      console.warn('[prezo-text-edit] no field, ignoring')
      return
    }
    if (field === 'question') {
      applyQuestionEdit(text)
    } else if (field === 'option-label' && optionId) {
      applyOptionLabelEdit(optionId, text)
    } else {
      console.warn('[prezo-text-edit] unhandled field:', field, 'optionId:', optionId)
    }
  }

  // ── Local state updates (immediate) ─────────────────────────────

  function applyQuestionEdit(newText) {
    const state = getState()
    const poll = state.currentPoll
    if (!poll) {
      console.warn('[prezo-text-edit] applyQuestionEdit: no currentPoll')
      return
    }
    console.log('[prezo-text-edit] applyQuestionEdit:', { pollId: poll.id, newText, sessionId: state.sessionId })
    poll.question = newText
    if (poll.title !== undefined) {
      poll.title = newText
    }
    updateSnapshotPoll(state, poll.id, (p) => {
      p.question = newText
      if (p.title !== undefined) {
        p.title = newText
      }
    })
    const questionEl = getQuestionEl()
    if (questionEl) {
      questionEl.textContent = newText
    }
    schedulePersist(poll.id, { question: newText })
  }

  function applyOptionLabelEdit(optionId, newText) {
    const state = getState()
    const poll = state.currentPoll
    if (!poll) {
      return
    }
    const resolvedId = resolveOptionId(poll, optionId)
    if (!resolvedId) {
      return
    }
    updateOptionLabel(poll.options, resolvedId, newText)
    updateSnapshotPoll(state, poll.id, (p) => {
      if (Array.isArray(p.options)) {
        updateOptionLabel(p.options, resolvedId, newText)
      }
    })
    renderFromSnapshot(false)
    schedulePersist(poll.id, { optionId: resolvedId, label: newText })
  }

  // ── Helpers ─────────────────────────────────────────────────────

  function updateSnapshotPoll(state, pollId, mutator) {
    if (!state.snapshot || !Array.isArray(state.snapshot.polls)) {
      return
    }
    for (let i = 0; i < state.snapshot.polls.length; i++) {
      if (state.snapshot.polls[i] && state.snapshot.polls[i].id === pollId) {
        mutator(state.snapshot.polls[i])
      }
    }
  }

  function updateOptionLabel(options, targetId, newText) {
    if (!Array.isArray(options)) {
      return
    }
    for (let i = 0; i < options.length; i++) {
      if (options[i] && options[i].id === targetId) {
        options[i].label = newText
        if (options[i].text !== undefined) {
          options[i].text = newText
        }
        break
      }
    }
  }

  /**
   * Resolves an optionId that may be a positional key ("option-0") to
   * the real option id from the poll data.
   */
  function resolveOptionId(poll, rawId) {
    const options = Array.isArray(poll.options) ? poll.options : []
    // Direct id match
    for (let i = 0; i < options.length; i++) {
      if (options[i] && options[i].id === rawId) {
        return rawId
      }
    }
    // Positional match (option-N)
    const indexMatch = /^option-(\d+)$/.exec(rawId)
    if (indexMatch) {
      const idx = Number(indexMatch[1])
      if (idx >= 0 && idx < options.length && options[idx]) {
        return options[idx].id
      }
    }
    return null
  }

  // ── Persistence (debounced PATCH) ───────────────────────────────

  function schedulePersist(pollId, change) {
    console.log('[prezo-text-edit] schedulePersist:', { pollId, change })
    if (!pendingPatch || pendingPatch.pollId !== pollId) {
      pendingPatch = { pollId, question: null, options: {} }
    }
    if (change.question !== undefined) {
      pendingPatch.question = change.question
    }
    if (change.optionId && change.label !== undefined) {
      pendingPatch.options[change.optionId] = change.label
    }
    if (debounceTimerId) {
      clearTimeout(debounceTimerId)
    }
    debounceTimerId = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS)
  }

  async function flushPersist() {
    debounceTimerId = null
    const patch = pendingPatch
    if (!patch) {
      console.warn('[prezo-text-edit] flushPersist: no pending patch')
      return
    }
    pendingPatch = null

    const state = getState()
    const sessionId = state.sessionId
    if (!sessionId || !patch.pollId) {
      console.warn('[prezo-text-edit] flushPersist: missing sessionId or pollId', { sessionId, pollId: patch.pollId })
      return
    }

    const body = {}
    if (patch.question !== null) {
      body.question = patch.question
    }
    if (Object.keys(patch.options).length > 0) {
      body.options = patch.options
    }
    if (Object.keys(body).length === 0) {
      console.warn('[prezo-text-edit] flushPersist: empty body, nothing to persist')
      return
    }

    const apiBase = typeof getApiBase === 'function' ? getApiBase() : ''
    const token = typeof getAccessToken === 'function' ? getAccessToken() : ''
    const url = `${apiBase}/sessions/${encodeURIComponent(sessionId)}/polls/${encodeURIComponent(patch.pollId)}`

    console.log('[prezo-text-edit] PATCH', url, body, { hasToken: !!token })

    const headers = { 'Content-Type': 'application/json' }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else {
      console.warn('[prezo-text-edit] flushPersist: NO AUTH TOKEN — request will likely fail')
    }

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        console.warn('[prezo-text-edit] persist failed:', response.status, errBody)
      } else {
        console.log('[prezo-text-edit] persist success:', response.status)
      }
    } catch (error) {
      console.warn('[prezo-text-edit] persist error:', error)
    }
  }

  return { handleTextEdit }
}

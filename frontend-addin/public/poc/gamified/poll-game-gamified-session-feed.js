/**
 * Live session feed for the gamified station: WebSocket connect/reconnect,
 * snapshot fetch + fallback polling, embed-cache hydration, socket-patch
 * merging, and activity selection (poll / qna / discussion views).
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 2). The factory owns the
 * data layer and never touches the DOM: rendering, status chrome, and error
 * surfaces arrive as injected callbacks. Timer/socket handles stay on the
 * shared `state` object so the app's teardown keeps working unchanged.
 */
import { asText, errorToMessage, normalizeCode, toInt, toWsBase } from './poll-game-gamified-utils.js'

export const SOCKET_RECONNECT_INITIAL_DELAY_MS = 2800
const SOCKET_RECONNECT_MAX_DELAY_MS = 20000
const SNAPSHOT_POLL_DISCONNECTED_MS = 15000
// Initial paint prefers the WebSocket's first-message snapshot push (no
// HTTP round trip). If the socket hasn't delivered within this grace
// window — usually because the WS handshake is unusually slow or the
// connection failed — fall back to a one-shot HTTP /snapshot fetch so the
// user isn't stuck on the skeleton until the 15s disconnected-poll tick.
const INITIAL_SNAPSHOT_FALLBACK_MS = 800
const LIVE_SNAPSHOT_RENDER_BATCH_MS = 70

export function getTotalVotes(poll) {
  if (!poll || !Array.isArray(poll.options)) {
    return 0
  }
  return poll.options.reduce((sum, option) => sum + toInt(option.votes), 0)
}

export function getQnaTotalVotes(view) {
  if (!view || !Array.isArray(view.questions)) {
    return 0
  }
  return view.questions.reduce((sum, question) => sum + toInt(question.votes), 0)
}

/** Poll-shaped projection of a qna view so the shared chrome (meta, classic
    option rows, vote counter) renders ranked questions without new code. */
export function qnaViewAsPollShape(view) {
  if (!view) {
    return null
  }
  return {
    id: view.id,
    question: view.title,
    status: view.status,
    options: view.questions.map((question) => ({
      id: question.id,
      label: question.text,
      votes: question.votes
    }))
  }
}

/** Approved questions ranked the way the audience app ranks them:
    upvotes first, then newest. Timestamps are parsed once up front so the
    comparator stays allocation- and parse-free. */
export function sortQnaQuestions(list) {
  return list
    .map((question) => ({
      id: asText(question?.id),
      text: asText(question?.text),
      votes: toInt(question?.votes),
      createdAtMs: Date.parse(asText(question?.created_at)) || 0
    }))
    .sort((a, b) => {
      if (b.votes !== a.votes) {
        return b.votes - a.votes
      }
      return b.createdAtMs - a.createdAtMs
    })
}

export function createSessionFeed({
  state,
  /** (force: boolean) => void — repaint from state.snapshot. */
  onRenderSnapshot,
  /** () => void — refresh the status chip/meta after socket state changes. */
  onSocketStatusChange,
  /** () => void — no sessionId/code available at start. */
  onMissingSession,
  /** (message: string) => void — feed start failed. */
  onError,
  /** () => boolean — an inline text edit is in progress (skip echo renders). */
  isTextEditing
}) {
  async function startSessionFeed() {
    if (!state.sessionId && !state.code) {
      onMissingSession()
      return
    }

    try {
      if (!state.sessionId && state.code) {
        const resolvedSession = await fetchJson(
          `/sessions/code/${encodeURIComponent(state.code)}`
        )
        state.sessionId = asText(resolvedSession.id)
        state.code = normalizeCode(resolvedSession.code) || state.code
      }

      if (!state.sessionId) {
        onError('Unable to resolve session.')
        return
      }

      // Cache-first paint: if the host taskpane's prefetcher has warmed
      // either localStorage or document.settings for this session, render
      // immediately from the cached snapshot. WS still opens and replaces
      // any stale numbers within ~1s — see broadcast.ts and prefetcher.ts
      // for the writer side. Cold cache (no prior prefetch, or fresh
      // device opening a shared deck without bundled settings) is a no-op.
      await hydrateFromEmbedCache(state.sessionId)

      // Open the WebSocket; the server pushes a session_snapshot on
      // connect (see backend/app/main.py) which becomes our authoritative
      // paint. The HTTP /snapshot fetch is no longer awaited inline because
      // it duplicates the WS-delivered payload and adds a full round trip
      // to initial render. scheduleInitialSnapshotFallback() is the safety
      // net for when WS is slow or fails before delivering anything.
      connectSocket()
      scheduleInitialSnapshotFallback()
      startSnapshotPolling()
    } catch (error) {
      onError(errorToMessage(error))
    }
  }

  async function hydrateFromEmbedCache(sessionId) {
    // Fail-soft on every code path: a missing reader, a cache miss, or a
    // malformed payload should never prevent the WebSocket flow from
    // running. The reader exists only when /embed/prezo-embed-cache.js
    // loaded successfully; older browsers or sandboxed contexts without
    // it just skip this fast path.
    if (!sessionId || !window.PrezoEmbedCache) {
      return
    }
    try {
      const entry = await window.PrezoEmbedCache.readFreshest(sessionId)
      const cached = entry?.payload
      if (!cached || typeof cached !== 'object') {
        return
      }
      state.snapshot = cached
      const cachedCode =
        cached.session && typeof cached.session === 'object'
          ? cached.session.code
          : null
      if (cachedCode) {
        state.code = normalizeCode(cachedCode) || state.code
      }
      // Force a synchronous render so the first paint reflects the cached
      // snapshot before WS opens. Subsequent WS messages will overwrite
      // state.snapshot via the existing handleSocketMessage path.
      onRenderSnapshot(true)
    } catch {
      // Cache read failures are non-fatal; the WS path still runs.
    }
  }

  function scheduleInitialSnapshotFallback() {
    window.setTimeout(() => {
      // If the socket has already populated state.snapshot, the WS path won
      // and the HTTP fetch is unnecessary. We also bail when the user
      // navigated away (state.isUnloading) so we don't kick off a doomed
      // request during teardown.
      if (state.snapshot || state.isUnloading) {
        return
      }
      void refreshSnapshot(true)
    }, INITIAL_SNAPSHOT_FALLBACK_MS)
  }

  function startSnapshotPolling() {
    stopSnapshotPolling()
    state.pollTimer = window.setInterval(() => {
      if (state.socketStatus === 'connected') {
        return
      }
      void refreshSnapshot(false)
    }, SNAPSHOT_POLL_DISCONNECTED_MS)
  }

  function stopSnapshotPolling() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer)
      state.pollTimer = null
    }
  }

  async function refreshSnapshot(forceRender) {
    if (!state.sessionId) {
      return null
    }
    if (state.fetchPromise) {
      return state.fetchPromise
    }

    state.fetchPromise = fetchJson(`/sessions/${encodeURIComponent(state.sessionId)}/snapshot`)
      .then((snapshot) => {
        state.snapshot = snapshot
        if (snapshot?.session?.code) {
          state.code = normalizeCode(snapshot.session.code) || state.code
        }
        if (forceRender) {
          onRenderSnapshot(true)
        } else {
          scheduleSnapshotRender()
        }
        return snapshot
      })
      .catch((error) => {
        if (!state.snapshot) {
          throw error
        }
      })
      .finally(() => {
        state.fetchPromise = null
      })

    return state.fetchPromise
  }

  function scheduleSnapshotRender() {
    if (state.snapshotRenderTimer) {
      return
    }
    state.snapshotRenderTimer = window.setTimeout(() => {
      state.snapshotRenderTimer = null
      onRenderSnapshot(false)
    }, LIVE_SNAPSHOT_RENDER_BATCH_MS)
  }

  function connectSocket() {
    if (!state.sessionId) {
      return
    }

    disconnectSocket()
    state.socketStatus = 'connecting'
    onSocketStatusChange()

    const url = `${toWsBase(state.apiBase)}/ws/sessions/${encodeURIComponent(state.sessionId)}`
    let socket
    try {
      socket = new WebSocket(url)
    } catch {
      state.socketStatus = 'error'
      onSocketStatusChange()
      return
    }

    state.socket = socket
    socket.addEventListener('open', () => {
      if (state.socket !== socket) {
        return
      }
      state.socketStatus = 'connected'
      state.reconnectDelayMs = SOCKET_RECONNECT_INITIAL_DELAY_MS
      onSocketStatusChange()
    })

    socket.addEventListener('message', (event) => {
      handleSocketMessage(event.data)
    })

    socket.addEventListener('close', () => {
      if (state.socket !== socket) {
        return
      }
      state.socket = null
      if (state.isUnloading) {
        return
      }
      state.socketStatus = 'disconnected'
      onSocketStatusChange()
      scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (state.socket !== socket) {
        return
      }
      state.socketStatus = 'error'
      onSocketStatusChange()
    })
  }

  function scheduleReconnect() {
    if (state.reconnectTimer || state.isUnloading) {
      return
    }
    const delay = Math.min(
      Number.isFinite(state.reconnectDelayMs) ? state.reconnectDelayMs : SOCKET_RECONNECT_INITIAL_DELAY_MS,
      SOCKET_RECONNECT_MAX_DELAY_MS
    )
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null
      connectSocket()
    }, delay)
    state.reconnectDelayMs = Math.min(delay * 2, SOCKET_RECONNECT_MAX_DELAY_MS)
  }

  function disconnectSocket() {
    if (!state.socket) {
      return
    }
    const activeSocket = state.socket
    state.socket = null
    try {
      activeSocket.close()
    } catch {}
  }

  function handleSocketMessage(raw) {
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object') {
      return
    }

    const eventPayload = payload.payload && typeof payload.payload === 'object' ? payload.payload : {}
    if (payload.type === 'session_snapshot' && eventPayload.snapshot) {
      state.snapshot = eventPayload.snapshot
      if (state.snapshot?.session?.code) {
        state.code = normalizeCode(state.snapshot.session.code) || state.code
      }
      scheduleSnapshotRender()
      return
    }

    let hasPatch = false
    if (eventPayload.session && typeof eventPayload.session === 'object') {
      ensureSnapshotContainer()
      state.snapshot.session = eventPayload.session
      if (eventPayload.session.code) {
        state.code = normalizeCode(eventPayload.session.code) || state.code
      }
      hasPatch = true
    }
    let isPollPatch = false
    let isQnaPatch = false
    if (eventPayload.poll && typeof eventPayload.poll === 'object') {
      ensureSnapshotContainer()
      mergePoll(eventPayload.poll)
      hasPatch = true
      isPollPatch = true
    }
    if (eventPayload.question && typeof eventPayload.question === 'object') {
      ensureSnapshotContainer()
      mergeQuestion(eventPayload.question)
      hasPatch = true
      isQnaPatch = true
    }
    if (eventPayload.prompt && typeof eventPayload.prompt === 'object') {
      ensureSnapshotContainer()
      mergePrompt(eventPayload.prompt)
      hasPatch = true
      isQnaPatch = true
    }
    if (payload.type === 'qna_prompt_deleted' && eventPayload.prompt_id) {
      ensureSnapshotContainer()
      state.snapshot.prompts = (Array.isArray(state.snapshot.prompts) ? state.snapshot.prompts : []).filter(
        (prompt) => asText(prompt?.id) !== asText(eventPayload.prompt_id)
      )
      hasPatch = true
      isQnaPatch = true
    }
    if (payload.type === 'audience_questions_deleted' && Array.isArray(eventPayload.question_ids)) {
      ensureSnapshotContainer()
      const removed = new Set(eventPayload.question_ids.map((id) => asText(id)))
      state.snapshot.questions = (Array.isArray(state.snapshot.questions) ? state.snapshot.questions : []).filter(
        (question) => !removed.has(asText(question?.id))
      )
      hasPatch = true
      isQnaPatch = true
    }

    if (hasPatch) {
      // When an inline text edit is in progress, skip the render so the
      // echo from our own PATCH broadcast doesn't cause the artifact to
      // flutter between old and new text.  The data is already merged
      // into the snapshot — the next render after editing ends will
      // pick it up.
      if (isPollPatch && isTextEditing()) {
        return
      }
      // The patch is merged into the snapshot either way; only spend a
      // render when the event can affect this station's activity view
      // (session patches affect all kinds — qna_open lives on the session).
      const renderRelevant =
        Boolean(eventPayload.session) ||
        (state.activityKind === 'poll' ? isPollPatch : isQnaPatch)
      if (!renderRelevant) {
        return
      }
      scheduleSnapshotRender()
      return
    }

    void refreshSnapshot(false)
  }

  function ensureSnapshotContainer() {
    if (state.snapshot) {
      return
    }
    state.snapshot = {
      session: {
        id: state.sessionId || '',
        code: state.code || '',
        status: 'active'
      },
      questions: [],
      polls: [],
      prompts: []
    }
  }

  /** Upsert-by-id into a snapshot collection (shared by poll, question, and
      prompt socket patches). */
  function upsertSnapshotItem(collectionKey, item) {
    if (!Array.isArray(state.snapshot[collectionKey])) {
      state.snapshot[collectionKey] = []
    }
    const list = state.snapshot[collectionKey]
    const index = list.findIndex((entry) => entry.id === item.id)
    if (index >= 0) {
      list[index] = item
      return
    }
    list.push(item)
  }

  function mergePoll(nextPoll) {
    upsertSnapshotItem('polls', nextPoll)
  }

  function mergeQuestion(nextQuestion) {
    upsertSnapshotItem('questions', nextQuestion)
  }

  function mergePrompt(nextPrompt) {
    upsertSnapshotItem('prompts', nextPrompt)
  }

  function selectPoll(polls) {
    if (!Array.isArray(polls) || polls.length === 0) {
      return null
    }
    const sorted = [...polls].sort((a, b) => {
      const left = Date.parse(asText(a.created_at)) || 0
      const right = Date.parse(asText(b.created_at)) || 0
      return right - left
    })

    if (state.pollSelector.mode === 'id') {
      return sorted.find((poll) => poll.id === state.pollSelector.explicitId) || null
    }
    if (state.pollSelector.mode === 'open') {
      return sorted.find((poll) => poll.status === 'open') || null
    }
    if (state.pollSelector.mode === 'latest') {
      return sorted[0] || null
    }
    return sorted.find((poll) => poll.status === 'open') || sorted[0] || null
  }

  function selectPrompt(prompts) {
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return null
    }
    const sorted = [...prompts].sort((a, b) => {
      const left = Date.parse(asText(a.created_at)) || 0
      const right = Date.parse(asText(b.created_at)) || 0
      return right - left
    })
    if (state.promptSelector.mode === 'id') {
      return sorted.find((prompt) => prompt.id === state.promptSelector.explicitId) || null
    }
    return sorted.find((prompt) => prompt.status === 'open') || sorted[0] || null
  }

  function buildQnaActivityView() {
    const questions = Array.isArray(state.snapshot?.questions) ? state.snapshot.questions : []
    if (state.activityKind === 'discussion') {
      const prompts = Array.isArray(state.snapshot?.prompts) ? state.snapshot.prompts : []
      const prompt = selectPrompt(prompts)
      if (!prompt) {
        return null
      }
      return {
        id: asText(prompt.id),
        title: asText(prompt.prompt) || 'Open discussion',
        status: asText(prompt.status) || 'closed',
        questions: sortQnaQuestions(
          questions.filter(
            (question) =>
              question?.status === 'approved' && asText(question?.prompt_id) === asText(prompt.id)
          )
        )
      }
    }
    const session = state.snapshot?.session
    if (!session || typeof session !== 'object') {
      return null
    }
    return {
      id: asText(session.id) || asText(state.sessionId),
      title: asText(session.qna_prompt) || 'Audience Q&A',
      status: session.qna_open ? 'open' : 'closed',
      questions: sortQnaQuestions(
        questions.filter((question) => question?.status === 'approved' && !question?.prompt_id)
      )
    }
  }

  async function fetchJson(path) {
    let response
    try {
      response = await fetch(`${state.apiBase}${path}`)
    } catch (error) {
      const message = errorToMessage(error)
      throw new Error(`Unable to reach API base ${state.apiBase}: ${message}`)
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status})`
      throw new Error(`${detail} [API ${state.apiBase}]`)
    }
    return response.json()
  }

  return {
    startSessionFeed,
    refreshSnapshot,
    scheduleSnapshotRender,
    disconnectSocket,
    stopSnapshotPolling,
    selectPoll,
    selectPrompt,
    buildQnaActivityView,
    fetchJson,
    /** Exposed for tests: feed the socket dispatcher a raw frame. */
    handleSocketMessage
  }
}

;(() => {
  const DEFAULT_API_BASE = 'https://prezo-backend-production.up.railway.app'
  const DEFAULT_POLL_SELECTOR = 'latest/open'
  const THEME_LIBRARY_KEY = 'prezo.poll-game-poc.themes.v1'
  const THEME_DRAFT_KEY = 'prezo.poll-game-poc.theme-draft.v1'

  const query = new URLSearchParams(window.location.search)

  const parsePollSelector = (raw) => {
    const value = asText(raw)
    if (!value) {
      return { mode: 'latestOpen', descriptor: DEFAULT_POLL_SELECTOR, explicitId: '' }
    }
    const lower = value.toLowerCase()
    if (lower === 'latest/open' || lower === 'open/latest' || lower === 'latestopen') {
      return { mode: 'latestOpen', descriptor: 'latest/open', explicitId: '' }
    }
    if (lower === 'latest') {
      return { mode: 'latest', descriptor: 'latest', explicitId: '' }
    }
    if (lower === 'open') {
      return { mode: 'open', descriptor: 'open', explicitId: '' }
    }
    return { mode: 'id', descriptor: value, explicitId: value }
  }

  const pollSelector = parsePollSelector(query.get('pollId'))
  const state = {
    apiBase: normalizeApiBase(query.get('apiBase')) || DEFAULT_API_BASE,
    sessionId: asText(query.get('sessionId')),
    code: normalizeCode(query.get('code')),
    pollSelector,
    snapshot: null,
    currentPoll: null,
    socket: null,
    socketStatus: 'connecting',
    reconnectTimer: null,
    pollTimer: null,
    fetchPromise: null,
    isUnloading: false,
    lastRenderKey: '',
    raceRows: new Map(),
    racePollId: null
  }

  const el = {
    bgImage: must('bg-image'),
    bgOverlay: must('bg-overlay'),
    gridBg: must('grid-bg'),
    wrap: must('canvas-wrap'),
    settingsToggle: must('settings-toggle'),
    settingsBackdrop: must('settings-backdrop'),
    settingsPanel: must('settings-panel'),
    settingsClose: must('settings-close'),
    dragModeEnabled: must('drag-mode-enabled'),
    themeName: must('theme-name'),
    themeSelect: must('theme-select'),
    saveTheme: must('save-theme'),
    loadTheme: must('load-theme'),
    deleteTheme: must('delete-theme'),
    exportTheme: must('export-theme'),
    importTheme: must('import-theme'),
    resetTheme: must('reset-theme'),
    themeFeedback: must('theme-feedback'),
    question: must('question'),
    status: must('status'),
    votes: must('votes'),
    options: must('options'),
    footer: must('footer'),
    dot: document.querySelector('.dot'),
    customLogo: must('custom-logo'),
    customAsset: must('custom-asset')
  }

  const defaultTheme = Object.freeze({
    bgImageUrl: '',
    bgImageOpacity: 0,
    bgA: '#04112b',
    bgB: '#0a2457',
    overlayColor: '#04112b',
    overlayOpacity: 0.3,
    gridVisible: true,
    gridOpacity: 0.14,
    panelColor: '#040c20',
    panelOpacity: 0.76,
    panelBorder: '#79beff',
    textMain: '#e8f2ff',
    textSub: '#90a5c3',
    trackColor: '#cfddf0',
    trackOpacity: 0.2,
    fillA: '#37d0ff',
    fillB: '#2d6bff',
    barHeight: 24,
    barRadius: 999,
    questionSize: 62,
    labelSize: 24,
    visualMode: 'classic',
    raceCar: '🏎️',
    raceCarImageUrl: '',
    raceCarSize: 30,
    raceTrackColor: '#adcfff',
    raceTrackOpacity: 0.2,
    raceSpeed: 0.78,
    logoUrl: '',
    logoWidth: 140,
    logoOpacity: 1,
    logoX: 88,
    logoY: 10,
    assetUrl: '',
    assetWidth: 320,
    assetOpacity: 0.45,
    assetX: 50,
    assetY: 50,
    fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif'
  })

  const themeControls = [
    { id: 'theme-bg-image-url', key: 'bgImageUrl', type: 'text' },
    { id: 'theme-bg-a', key: 'bgA', type: 'color' },
    { id: 'theme-bg-b', key: 'bgB', type: 'color' },
    { id: 'theme-overlay-color', key: 'overlayColor', type: 'color' },
    { id: 'theme-bg-image-opacity', key: 'bgImageOpacity', type: 'number' },
    { id: 'theme-overlay-opacity', key: 'overlayOpacity', type: 'number' },
    { id: 'theme-grid-visible', key: 'gridVisible', type: 'checkbox' },
    { id: 'theme-grid-opacity', key: 'gridOpacity', type: 'number' },
    { id: 'theme-panel-color', key: 'panelColor', type: 'color' },
    { id: 'theme-panel-opacity', key: 'panelOpacity', type: 'number' },
    { id: 'theme-panel-border', key: 'panelBorder', type: 'color' },
    { id: 'theme-text-main', key: 'textMain', type: 'color' },
    { id: 'theme-text-sub', key: 'textSub', type: 'color' },
    { id: 'theme-track-color', key: 'trackColor', type: 'color' },
    { id: 'theme-track-opacity', key: 'trackOpacity', type: 'number' },
    { id: 'theme-fill-a', key: 'fillA', type: 'color' },
    { id: 'theme-fill-b', key: 'fillB', type: 'color' },
    { id: 'theme-bar-height', key: 'barHeight', type: 'number' },
    { id: 'theme-bar-radius', key: 'barRadius', type: 'number' },
    { id: 'theme-question-size', key: 'questionSize', type: 'number' },
    { id: 'theme-label-size', key: 'labelSize', type: 'number' },
    { id: 'theme-visual-mode', key: 'visualMode', type: 'select' },
    { id: 'theme-race-car', key: 'raceCar', type: 'text' },
    { id: 'theme-race-car-image-url', key: 'raceCarImageUrl', type: 'text' },
    { id: 'theme-race-car-size', key: 'raceCarSize', type: 'number' },
    { id: 'theme-race-track-color', key: 'raceTrackColor', type: 'color' },
    { id: 'theme-race-track-opacity', key: 'raceTrackOpacity', type: 'number' },
    { id: 'theme-race-speed', key: 'raceSpeed', type: 'number' },
    { id: 'theme-logo-url', key: 'logoUrl', type: 'text' },
    { id: 'theme-logo-width', key: 'logoWidth', type: 'number' },
    { id: 'theme-logo-opacity', key: 'logoOpacity', type: 'number' },
    { id: 'theme-logo-x', key: 'logoX', type: 'number' },
    { id: 'theme-logo-y', key: 'logoY', type: 'number' },
    { id: 'theme-asset-url', key: 'assetUrl', type: 'text' },
    { id: 'theme-asset-width', key: 'assetWidth', type: 'number' },
    { id: 'theme-asset-opacity', key: 'assetOpacity', type: 'number' },
    { id: 'theme-asset-x', key: 'assetX', type: 'number' },
    { id: 'theme-asset-y', key: 'assetY', type: 'number' },
    { id: 'theme-font-family', key: 'fontFamily', type: 'text' }
  ]

  const controlElements = Object.fromEntries(
    themeControls.map((spec) => [spec.id, document.getElementById(spec.id)])
  )

  let themeLibrary = loadThemeLibrary()
  let currentTheme = loadInitialTheme(themeLibrary)
  const dragState = {
    enabled: false,
    active: null
  }

  init()

  function init() {
    setupSettingsPanel()
    setupThemeEditor()
    setupDragInteractions()
    applyTheme(currentTheme)
    syncThemeControls()
    refreshThemeSelect(themeLibrary.activeName)
    renderInitialState()
    void startSessionFeed()
    window.addEventListener('beforeunload', handleUnload)
  }

  function setupSettingsPanel() {
    const open = () => {
      el.settingsPanel.classList.add('open')
      el.settingsBackdrop.classList.add('visible')
    }
    const close = () => {
      el.settingsPanel.classList.remove('open')
      el.settingsBackdrop.classList.remove('visible')
    }
    el.settingsToggle.addEventListener('click', () => {
      const isOpen = el.settingsPanel.classList.contains('open')
      if (isOpen) {
        close()
        return
      }
      open()
    })
    el.settingsClose.addEventListener('click', close)
    el.settingsBackdrop.addEventListener('click', close)
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        close()
      }
    })
  }

  function setupThemeEditor() {
    for (const spec of themeControls) {
      const input = controlElements[spec.id]
      if (!input) {
        continue
      }
      const eventName =
        spec.type === 'checkbox' || spec.type === 'select' ? 'change' : 'input'
      input.addEventListener(eventName, () => {
        const value = readControlValue(input, spec.type)
        updateTheme({ [spec.key]: value })
        if (spec.key === 'visualMode' && state.snapshot) {
          renderFromSnapshot(true)
        }
      })
    }

    el.saveTheme.addEventListener('click', saveTheme)
    el.loadTheme.addEventListener('click', loadThemeFromSelect)
    el.deleteTheme.addEventListener('click', deleteThemeFromSelect)
    el.exportTheme.addEventListener('click', exportCurrentTheme)
    el.importTheme.addEventListener('change', importThemeFromFile)
    el.resetTheme.addEventListener('click', resetThemeDraft)

    bindImageUpload('theme-bg-image-upload', 'bgImageUrl', 'Background image applied.')
    bindImageUpload('theme-race-car-upload', 'raceCarImageUrl', 'Race car image applied.')
    bindImageUpload('theme-logo-upload', 'logoUrl', 'Logo applied.')
    bindImageUpload('theme-asset-upload', 'assetUrl', 'Overlay asset applied.')
  }

  function setupDragInteractions() {
    el.dragModeEnabled.addEventListener('change', () => {
      setDragMode(Boolean(el.dragModeEnabled.checked))
    })

    window.addEventListener('pointermove', handleDragPointerMove)
    window.addEventListener('pointerup', handleDragPointerRelease)
    window.addEventListener('pointercancel', handleDragPointerRelease)

    attachDragBehavior(el.customLogo, 'logoX', 'logoY')
    attachDragBehavior(el.customAsset, 'assetX', 'assetY')
  }

  function setDragMode(enabled) {
    dragState.enabled = Boolean(enabled)
    el.dragModeEnabled.checked = dragState.enabled
    document.body.classList.toggle('drag-mode', dragState.enabled)
    if (!dragState.enabled && dragState.active) {
      dragState.active.node.classList.remove('dragging')
      dragState.active = null
    }
    showThemeFeedback(
      dragState.enabled
        ? 'Drag mode enabled. Drag logo/asset on canvas, then Save theme.'
        : 'Drag mode disabled.',
      'success'
    )
  }

  function attachDragBehavior(node, xKey, yKey) {
    node.addEventListener('pointerdown', (event) => {
      if (!dragState.enabled || node.classList.contains('hidden')) {
        return
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return
      }
      const wrapRect = getWrapRect()
      if (!wrapRect || wrapRect.width <= 0 || wrapRect.height <= 0) {
        return
      }

      event.preventDefault()
      dragState.active = {
        node,
        xKey,
        yKey,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: clamp(currentTheme[xKey], 0, 100, 50),
        startY: clamp(currentTheme[yKey], 0, 100, 50)
      }
      node.classList.add('dragging')
      try {
        node.setPointerCapture(event.pointerId)
      } catch {}
    })
  }

  function handleDragPointerMove(event) {
    const active = dragState.active
    if (!active || active.pointerId !== event.pointerId) {
      return
    }
    const wrapRect = getWrapRect()
    if (!wrapRect || wrapRect.width <= 0 || wrapRect.height <= 0) {
      return
    }

    if (event.cancelable) {
      event.preventDefault()
    }
    const deltaXPercent = ((event.clientX - active.startClientX) / wrapRect.width) * 100
    const deltaYPercent = ((event.clientY - active.startClientY) / wrapRect.height) * 100
    const nextX = clamp(active.startX + deltaXPercent, 0, 100, active.startX)
    const nextY = clamp(active.startY + deltaYPercent, 0, 100, active.startY)

    updateTheme(
      {
        [active.xKey]: nextX,
        [active.yKey]: nextY
      },
      { persist: false }
    )
    syncSingleControlValue(active.xKey, nextX)
    syncSingleControlValue(active.yKey, nextY)
  }

  function handleDragPointerRelease(event) {
    const active = dragState.active
    if (!active || active.pointerId !== event.pointerId) {
      return
    }

    active.node.classList.remove('dragging')
    try {
      active.node.releasePointerCapture(event.pointerId)
    } catch {}
    dragState.active = null
    saveThemeDraft(currentTheme)
    showThemeFeedback('Object position updated. Save theme to keep it in a named preset.', 'success')
  }

  function getWrapRect() {
    return el.wrap.getBoundingClientRect()
  }

  function renderInitialState() {
    el.question.textContent = 'Waiting for poll data...'
    el.options.innerHTML = ''
    el.footer.textContent = `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, poll: ${state.pollSelector.descriptor}`
    updateMeta(null, 0)
  }

  async function startSessionFeed() {
    if (!state.sessionId && !state.code) {
      renderMissingSession()
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
        renderError('Unable to resolve session.')
        return
      }

      connectSocket()
      await refreshSnapshot(true)
      startSnapshotPolling()
    } catch (error) {
      renderError(errorToMessage(error))
    }
  }

  function startSnapshotPolling() {
    stopSnapshotPolling()
    state.pollTimer = window.setInterval(() => {
      void refreshSnapshot(false)
    }, 6000)
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
        renderFromSnapshot(forceRender)
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

  function connectSocket() {
    if (!state.sessionId) {
      return
    }

    disconnectSocket()
    state.socketStatus = 'connecting'
    updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))

    const url = `${toWsBase(state.apiBase)}/ws/sessions/${encodeURIComponent(state.sessionId)}`
    let socket
    try {
      socket = new WebSocket(url)
    } catch {
      state.socketStatus = 'error'
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
      return
    }

    state.socket = socket
    socket.addEventListener('open', () => {
      if (state.socket !== socket) {
        return
      }
      state.socketStatus = 'connected'
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
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
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
      scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (state.socket !== socket) {
        return
      }
      state.socketStatus = 'error'
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
    })
  }

  function scheduleReconnect() {
    if (state.reconnectTimer || state.isUnloading) {
      return
    }
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null
      connectSocket()
      void refreshSnapshot(false)
    }, 2800)
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
      renderFromSnapshot(false)
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
    if (eventPayload.poll && typeof eventPayload.poll === 'object') {
      ensureSnapshotContainer()
      mergePoll(eventPayload.poll)
      hasPatch = true
    }

    if (hasPatch) {
      renderFromSnapshot(false)
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

  function mergePoll(nextPoll) {
    const polls = Array.isArray(state.snapshot?.polls) ? state.snapshot.polls : []
    const index = polls.findIndex((poll) => poll.id === nextPoll.id)
    if (index >= 0) {
      polls[index] = nextPoll
      return
    }
    polls.push(nextPoll)
  }

  function renderFromSnapshot(forceRender) {
    const polls = Array.isArray(state.snapshot?.polls) ? state.snapshot.polls : []
    const poll = selectPoll(polls)
    state.currentPoll = poll

    const renderKey = getRenderKey(poll)
    if (!forceRender && renderKey === state.lastRenderKey) {
      updateFooter()
      updateMeta(poll, getTotalVotes(poll))
      return
    }
    state.lastRenderKey = renderKey

    if (!poll) {
      renderMissingPoll()
      return
    }

    const totalVotes = getTotalVotes(poll)
    el.question.textContent = asText(poll.question) || 'Untitled poll'
    if (currentTheme.visualMode === 'race') {
      renderRaceOptions(poll, totalVotes)
    } else {
      renderClassicOptions(poll, totalVotes)
    }
    updateMeta(poll, totalVotes)
    updateFooter()
  }

  function renderClassicOptions(poll, totalVotes) {
    if (el.options.classList.contains('race-mode') || state.raceRows.size > 0) {
      clearRaceRows()
    }
    const fragment = document.createDocumentFragment()
    for (const option of poll.options || []) {
      const votes = toInt(option.votes)
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0

      const optionNode = document.createElement('div')
      optionNode.className = 'option'

      const labelRow = document.createElement('div')
      labelRow.className = 'label-row'

      const label = document.createElement('span')
      label.className = 'label'
      label.textContent = asText(option.label) || 'Option'

      const stats = document.createElement('span')
      stats.className = 'stats'
      stats.textContent = `${votes} (${pct}%)`

      labelRow.append(label, stats)

      const track = document.createElement('div')
      track.className = 'track'

      const fill = document.createElement('div')
      fill.className = 'fill'
      fill.style.width = `${pct}%`

      track.appendChild(fill)
      optionNode.append(labelRow, track)
      fragment.appendChild(optionNode)
    }

    el.options.replaceChildren(fragment)
  }

  function renderRaceOptions(poll, totalVotes) {
    const pollId = asText(poll?.id)
    if (state.racePollId && pollId && state.racePollId !== pollId) {
      clearRaceRows()
      el.options.replaceChildren()
    }
    if (!el.options.classList.contains('race-mode')) {
      el.options.replaceChildren()
      state.raceRows.clear()
    }

    el.options.classList.add('race-mode')
    state.racePollId = pollId || state.racePollId

    const foreignNodes = [...el.options.children].filter(
      (node) => !(node instanceof HTMLElement) || !node.classList.contains('race-option')
    )
    for (const node of foreignNodes) {
      node.remove()
    }

    const options = Array.isArray(poll.options) ? poll.options : []
    const sorted = [...options].sort((left, right) => {
      const voteDiff = toInt(right.votes) - toInt(left.votes)
      if (voteDiff !== 0) {
        return voteDiff
      }
      return asText(left.label).localeCompare(asText(right.label))
    })

    const firstTops = new Map()
    for (const row of state.raceRows.values()) {
      firstTops.set(row.root, row.root.getBoundingClientRect().top)
    }

    const orderedIds = []
    const liveIds = new Set()
    for (let index = 0; index < sorted.length; index += 1) {
      const option = sorted[index]
      const optionId = asText(option.id) || `option-${index}`
      liveIds.add(optionId)
      orderedIds.push(optionId)
      const votes = toInt(option.votes)
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0

      let row = state.raceRows.get(optionId)
      if (!row) {
        row = createRaceRow()
        state.raceRows.set(optionId, row)
      }
      row.label.textContent = asText(option.label) || 'Option'
      row.stats.textContent = `${votes} (${pct}%)`
      row.fill.style.width = `${pct}%`
      row.car.style.left = `${pct}%`
      row.root.classList.toggle('leading', index === 0)
      applyRaceCarContent(row.car)
    }

    for (const [optionId, row] of state.raceRows) {
      if (liveIds.has(optionId)) {
        continue
      }
      row.root.remove()
      state.raceRows.delete(optionId)
    }

    for (const optionId of orderedIds) {
      const row = state.raceRows.get(optionId)
      if (!row) {
        continue
      }
      el.options.appendChild(row.root)
    }

    for (const optionId of orderedIds) {
      const row = state.raceRows.get(optionId)
      if (!row) {
        continue
      }
      const firstTop = firstTops.get(row.root)
      if (firstTop == null) {
        continue
      }
      const lastTop = row.root.getBoundingClientRect().top
      const deltaY = firstTop - lastTop
      if (Math.abs(deltaY) < 0.5) {
        row.root.style.transform = ''
        continue
      }
      row.root.style.transition = 'none'
      row.root.style.transform = `translateY(${deltaY}px)`
      row.root.getBoundingClientRect()
      row.root.style.transition =
        'transform var(--race-speed-ms) cubic-bezier(0.2, 0.9, 0.25, 1)'
      row.root.style.transform = 'translateY(0)'
    }

    el.options.style.height = ''
  }

  function createRaceRow() {
    const root = document.createElement('article')
    root.className = 'race-option'

    const top = document.createElement('div')
    top.className = 'race-top'

    const label = document.createElement('span')
    label.className = 'race-label'

    const stats = document.createElement('span')
    stats.className = 'stats'

    const track = document.createElement('div')
    track.className = 'race-track'

    const fill = document.createElement('div')
    fill.className = 'race-fill'

    const car = document.createElement('div')
    car.className = 'race-car'

    top.append(label, stats)
    track.append(fill, car)
    root.append(top, track)

    return { root, label, stats, fill, car }
  }

  function clearRaceRows() {
    for (const row of state.raceRows.values()) {
      row.root.remove()
    }
    state.raceRows.clear()
    state.racePollId = null
    const orphanRows = el.options.querySelectorAll('.race-option')
    for (const row of orphanRows) {
      row.remove()
    }
    el.options.classList.remove('race-mode')
    el.options.style.height = ''
  }

  function renderMissingSession() {
    clearRaceRows()
    state.currentPoll = null
    state.lastRenderKey = ''
    el.question.textContent = 'Missing required query param'
    el.options.innerHTML = ''
    const note = document.createElement('p')
    note.className = 'empty'
    note.innerHTML = 'Open with <code>?sessionId=&lt;id&gt;</code> or <code>?code=&lt;join_code&gt;</code>'
    el.options.appendChild(note)
    updateMeta(null, 0, 'missing session', 'error')
    updateFooter()
  }

  function renderMissingPoll() {
    clearRaceRows()
    const message =
      state.pollSelector.mode === 'id'
        ? `Poll "${state.pollSelector.explicitId}" was not found in this session.`
        : 'No poll is available in this session yet.'
    el.question.textContent = message
    el.options.innerHTML = ''
    const note = document.createElement('p')
    note.className = 'empty'
    note.textContent = 'Create and open a poll in Host Console to render it here.'
    el.options.appendChild(note)
    updateMeta(null, 0)
    updateFooter()
  }

  function renderError(message) {
    clearRaceRows()
    state.currentPoll = null
    state.lastRenderKey = ''
    el.question.textContent = 'Unable to load poll data'
    el.options.innerHTML = ''
    const note = document.createElement('p')
    note.className = 'empty'
    note.textContent = message
    el.options.appendChild(note)
    updateMeta(null, 0, 'error', 'error')
    updateFooter()
  }

  function updateFooter() {
    el.footer.textContent =
      `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, poll: ${state.pollSelector.descriptor}`
  }

  function updateMeta(poll, totalVotes, forcedStatusText, forcedTone) {
    const tone =
      forcedTone ||
      (forcedStatusText
        ? 'error'
        : poll
          ? poll.status === 'open'
            ? state.socketStatus === 'connected'
              ? 'live'
              : 'connecting'
            : 'closed'
          : state.socketStatus === 'connected'
            ? 'connected'
            : state.socketStatus === 'error'
              ? 'error'
              : 'connecting')

    const statusText =
      forcedStatusText ||
      (poll
        ? poll.status === 'open'
          ? state.socketStatus === 'connected'
            ? 'live'
            : 'syncing'
          : 'closed'
        : state.socketStatus === 'connected'
          ? 'connected'
          : state.socketStatus === 'error'
            ? 'error'
            : 'connecting')

    el.status.textContent = statusText
    el.votes.textContent = `${totalVotes} votes`
    applyDotTone(tone)
  }

  function applyDotTone(tone) {
    if (!el.dot) {
      return
    }
    if (tone === 'live' || tone === 'connected') {
      el.dot.style.background = '#58f08c'
      el.dot.style.animation = 'pulse 1.8s infinite'
      return
    }
    if (tone === 'closed') {
      el.dot.style.background = '#f1be53'
      el.dot.style.animation = 'none'
      return
    }
    if (tone === 'error') {
      el.dot.style.background = '#ff6078'
      el.dot.style.animation = 'none'
      return
    }
    el.dot.style.background = '#84b4ff'
    el.dot.style.animation = 'pulse 1.8s infinite'
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

  function getRenderKey(poll) {
    if (!poll) {
      return 'no-poll'
    }
    return JSON.stringify({
      id: poll.id,
      status: poll.status,
      question: poll.question,
      options: (poll.options || []).map((option) => [
        option.id,
        option.label,
        toInt(option.votes)
      ])
    })
  }

  function getTotalVotes(poll) {
    if (!poll || !Array.isArray(poll.options)) {
      return 0
    }
    return poll.options.reduce((sum, option) => sum + toInt(option.votes), 0)
  }

  async function fetchJson(path) {
    const response = await fetch(`${state.apiBase}${path}`)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status})`
      throw new Error(detail)
    }
    return response.json()
  }

  function bindImageUpload(inputId, themeKey, successText) {
    const input = document.getElementById(inputId)
    if (!input) {
      return
    }
    input.addEventListener('change', async (event) => {
      const target = event.target
      const file = target?.files?.[0]
      if (!file) {
        return
      }
      try {
        const dataUrl = await readFileAsDataUrl(file)
        updateTheme({ [themeKey]: dataUrl })
        showThemeFeedback(successText, 'success')
      } catch {
        showThemeFeedback('File upload failed.', 'error')
      } finally {
        input.value = ''
      }
    })
  }

  function saveTheme() {
    const name = normalizeThemeName(el.themeName.value)
    if (!name) {
      showThemeFeedback('Theme name is required.', 'error')
      return
    }
    themeLibrary.themes[name] = clone(currentTheme)
    themeLibrary.activeName = name
    saveThemeLibrary(themeLibrary)
    saveThemeDraft(currentTheme)
    refreshThemeSelect(name)
    el.themeName.value = name
    showThemeFeedback(`Theme "${name}" saved.`, 'success')
  }

  function loadThemeFromSelect() {
    const name = asText(el.themeSelect.value)
    if (!name || !themeLibrary.themes[name]) {
      showThemeFeedback('Select a saved theme first.', 'error')
      return
    }
    currentTheme = sanitizeTheme(themeLibrary.themes[name])
    applyTheme(currentTheme)
    syncThemeControls()
    themeLibrary.activeName = name
    saveThemeLibrary(themeLibrary)
    saveThemeDraft(currentTheme)
    el.themeName.value = name
    if (state.snapshot) {
      renderFromSnapshot(true)
    }
    showThemeFeedback(`Theme "${name}" loaded.`, 'success')
  }

  function deleteThemeFromSelect() {
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
    showThemeFeedback(`Theme "${name}" deleted.`, 'success')
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
      theme: currentTheme
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

      currentTheme = importedTheme
      applyTheme(currentTheme)
      syncThemeControls()
      saveThemeDraft(currentTheme)
      themeLibrary.themes[importedName] = clone(currentTheme)
      themeLibrary.activeName = importedName
      saveThemeLibrary(themeLibrary)
      refreshThemeSelect(importedName)
      el.themeName.value = importedName
      if (state.snapshot) {
        renderFromSnapshot(true)
      }
      showThemeFeedback(`Theme "${importedName}" imported.`, 'success')
    } catch {
      showThemeFeedback('Invalid theme file.', 'error')
    } finally {
      el.importTheme.value = ''
    }
  }

  function resetThemeDraft() {
    currentTheme = clone(defaultTheme)
    applyTheme(currentTheme)
    syncThemeControls()
    saveThemeDraft(currentTheme)
    if (state.snapshot) {
      renderFromSnapshot(true)
    }
    showThemeFeedback('Theme reset to defaults.', 'success')
  }

  function updateTheme(partialTheme, options = {}) {
    const persist = options.persist !== false
    const nextTheme = {
      ...currentTheme,
      ...partialTheme
    }
    const includesBgUrl =
      partialTheme &&
      Object.prototype.hasOwnProperty.call(partialTheme, 'bgImageUrl') &&
      asText(partialTheme.bgImageUrl)
    const includesBgOpacity =
      partialTheme &&
      Object.prototype.hasOwnProperty.call(partialTheme, 'bgImageOpacity')
    if (includesBgUrl && !includesBgOpacity && Number(nextTheme.bgImageOpacity) <= 0.01) {
      nextTheme.bgImageOpacity = 0.55
    }

    currentTheme = sanitizeTheme(nextTheme)
    applyTheme(currentTheme)
    if (
      partialTheme &&
      Object.prototype.hasOwnProperty.call(partialTheme, 'visualMode') &&
      state.snapshot
    ) {
      renderFromSnapshot(true)
    }
    if (persist) {
      saveThemeDraft(currentTheme)
    }
  }

  function applyTheme(theme) {
    const root = document.documentElement.style
    root.setProperty('--font-family', theme.fontFamily)
    root.setProperty('--bg-a', theme.bgA)
    root.setProperty('--bg-b', theme.bgB)
    root.setProperty('--panel-color', theme.panelColor)
    root.setProperty('--panel-opacity', `${theme.panelOpacity}`)
    root.setProperty('--panel-bg', hexToRgba(theme.panelColor, theme.panelOpacity))
    root.setProperty('--panel-border-color', theme.panelBorder)
    root.setProperty('--panel-border', hexToRgba(theme.panelBorder, 0.36))
    root.setProperty('--text-main', theme.textMain)
    root.setProperty('--text-sub', theme.textSub)
    root.setProperty('--track', hexToRgba(theme.trackColor, theme.trackOpacity))
    root.setProperty('--fill-a', theme.fillA)
    root.setProperty('--fill-b', theme.fillB)
    root.setProperty('--bar-height', `${theme.barHeight}px`)
    root.setProperty('--bar-radius', `${theme.barRadius}px`)
    root.setProperty('--question-size', `${theme.questionSize}px`)
    root.setProperty('--label-size', `${theme.labelSize}px`)
    root.setProperty('--grid-opacity', `${theme.gridOpacity}`)
    root.setProperty('--race-track', hexToRgba(theme.raceTrackColor, theme.raceTrackOpacity))
    root.setProperty('--race-car-size', `${theme.raceCarSize}px`)
    root.setProperty('--race-speed-ms', `${Math.round(theme.raceSpeed * 1000)}ms`)

    el.bgImage.style.backgroundImage = theme.bgImageUrl
      ? `url("${theme.bgImageUrl.replace(/"/g, '\\"')}")`
      : 'none'
    el.bgImage.style.opacity = `${theme.bgImageOpacity}`
    el.bgOverlay.style.backgroundColor = theme.overlayColor
    el.bgOverlay.style.opacity = `${theme.overlayOpacity}`
    el.gridBg.style.display = theme.gridVisible ? 'block' : 'none'
    el.gridBg.style.opacity = `${theme.gridOpacity}`

    applyImageAsset(el.customLogo, {
      url: theme.logoUrl,
      width: `${theme.logoWidth}px`,
      opacity: `${theme.logoOpacity}`,
      left: `${theme.logoX}%`,
      top: `${theme.logoY}%`
    })

    applyImageAsset(el.customAsset, {
      url: theme.assetUrl,
      width: `${theme.assetWidth}px`,
      opacity: `${theme.assetOpacity}`,
      left: `${theme.assetX}%`,
      top: `${theme.assetY}%`
    })
    syncRaceThemeVisuals()
  }

  function applyImageAsset(node, options) {
    if (!options.url) {
      node.classList.add('hidden')
      node.removeAttribute('src')
      return
    }
    if (node.getAttribute('src') !== options.url) {
      node.setAttribute('src', options.url)
    }
    node.classList.remove('hidden')
    if (options.width) {
      node.style.width = options.width
    }
    if (options.opacity) {
      node.style.opacity = options.opacity
    }
    if (options.left) {
      node.style.left = options.left
    }
    if (options.top) {
      node.style.top = options.top
    }
  }

  function syncRaceThemeVisuals() {
    const cars = el.options.querySelectorAll('.race-car')
    for (const car of cars) {
      applyRaceCarContent(car)
    }
  }

  function applyRaceCarContent(carNode) {
    const imageUrl = asText(currentTheme.raceCarImageUrl)
    if (imageUrl) {
      carNode.textContent = ''
      carNode.style.backgroundImage = `url("${imageUrl.replace(/"/g, '\\"')}")`
      carNode.classList.add('image-car')
      return
    }
    carNode.style.backgroundImage = 'none'
    carNode.classList.remove('image-car')
    carNode.textContent = normalizeRaceCar(currentTheme.raceCar)
  }

  function syncThemeControls() {
    for (const spec of themeControls) {
      const input = controlElements[spec.id]
      if (!input) {
        continue
      }
      const value = currentTheme[spec.key]
      if (spec.type === 'checkbox') {
        input.checked = Boolean(value)
      } else {
        input.value = value == null ? '' : String(value)
      }
    }
  }

  function syncSingleControlValue(themeKey, value) {
    const spec = themeControls.find((entry) => entry.key === themeKey)
    if (!spec) {
      return
    }
    const input = controlElements[spec.id]
    if (!input) {
      return
    }
    if (spec.type === 'checkbox') {
      input.checked = Boolean(value)
      return
    }
    input.value = value == null ? '' : String(Math.round(Number(value)))
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

  function loadInitialTheme(library) {
    const draft = loadThemeDraft()
    if (library.activeName && library.themes[library.activeName]) {
      return sanitizeTheme(library.themes[library.activeName])
    }
    if (draft) {
      return draft
    }
    return clone(defaultTheme)
  }

  function loadThemeLibrary() {
    const parsed = safeJsonParse(safeStorageGet(THEME_LIBRARY_KEY))
    if (!parsed || typeof parsed !== 'object') {
      return { themes: {}, activeName: null }
    }
    const incomingThemes =
      parsed.themes && typeof parsed.themes === 'object' ? parsed.themes : {}
    const themes = {}
    for (const [name, theme] of Object.entries(incomingThemes)) {
      const normalizedName = normalizeThemeName(name)
      if (!normalizedName) {
        continue
      }
      themes[normalizedName] = sanitizeTheme(theme)
    }
    const activeName =
      typeof parsed.activeName === 'string' && themes[parsed.activeName]
        ? parsed.activeName
        : null
    return { themes, activeName }
  }

  function saveThemeLibrary(library) {
    try {
      localStorage.setItem(THEME_LIBRARY_KEY, JSON.stringify(library))
    } catch {}
  }

  function loadThemeDraft() {
    const parsed = safeJsonParse(safeStorageGet(THEME_DRAFT_KEY))
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return sanitizeTheme(parsed)
  }

  function saveThemeDraft(theme) {
    try {
      localStorage.setItem(THEME_DRAFT_KEY, JSON.stringify(theme))
    } catch {}
  }

  function showThemeFeedback(text, type) {
    el.themeFeedback.textContent = text
    if (type === 'success') {
      el.themeFeedback.style.color = '#95f2b7'
      return
    }
    if (type === 'error') {
      el.themeFeedback.style.color = '#ff91a4'
      return
    }
    el.themeFeedback.style.color = '#a6c0e2'
  }

  function readControlValue(input, type) {
    if (type === 'checkbox') {
      return Boolean(input.checked)
    }
    if (type === 'number') {
      return Number(input.value)
    }
    return input.value
  }

  function sanitizeTheme(theme) {
    const incoming = theme && typeof theme === 'object' ? theme : {}
    return {
      bgImageUrl: sanitizeUrl(incoming.bgImageUrl, defaultTheme.bgImageUrl),
      bgImageOpacity: clamp(incoming.bgImageOpacity, 0, 1, defaultTheme.bgImageOpacity),
      bgA: sanitizeHex(incoming.bgA, defaultTheme.bgA),
      bgB: sanitizeHex(incoming.bgB, defaultTheme.bgB),
      overlayColor: sanitizeHex(incoming.overlayColor, defaultTheme.overlayColor),
      overlayOpacity: clamp(incoming.overlayOpacity, 0, 1, defaultTheme.overlayOpacity),
      gridVisible: Boolean(incoming.gridVisible ?? defaultTheme.gridVisible),
      gridOpacity: clamp(incoming.gridOpacity, 0, 0.5, defaultTheme.gridOpacity),
      panelColor: sanitizeHex(incoming.panelColor, defaultTheme.panelColor),
      panelOpacity: clamp(incoming.panelOpacity, 0, 1, defaultTheme.panelOpacity),
      panelBorder: sanitizeHex(incoming.panelBorder, defaultTheme.panelBorder),
      textMain: sanitizeHex(incoming.textMain, defaultTheme.textMain),
      textSub: sanitizeHex(incoming.textSub, defaultTheme.textSub),
      trackColor: sanitizeHex(incoming.trackColor, defaultTheme.trackColor),
      trackOpacity: clamp(incoming.trackOpacity, 0, 1, defaultTheme.trackOpacity),
      fillA: sanitizeHex(incoming.fillA, defaultTheme.fillA),
      fillB: sanitizeHex(incoming.fillB, defaultTheme.fillB),
      barHeight: clamp(incoming.barHeight, 8, 44, defaultTheme.barHeight),
      barRadius: clamp(incoming.barRadius, 0, 999, defaultTheme.barRadius),
      questionSize: clamp(incoming.questionSize, 42, 90, defaultTheme.questionSize),
      labelSize: clamp(incoming.labelSize, 14, 36, defaultTheme.labelSize),
      visualMode: sanitizeVisualMode(incoming.visualMode, defaultTheme.visualMode),
      raceCar: normalizeRaceCar(incoming.raceCar),
      raceCarImageUrl: sanitizeUrl(incoming.raceCarImageUrl, defaultTheme.raceCarImageUrl),
      raceCarSize: clamp(incoming.raceCarSize, 20, 56, defaultTheme.raceCarSize),
      raceTrackColor: sanitizeHex(incoming.raceTrackColor, defaultTheme.raceTrackColor),
      raceTrackOpacity: clamp(incoming.raceTrackOpacity, 0, 1, defaultTheme.raceTrackOpacity),
      raceSpeed: clamp(incoming.raceSpeed, 0.35, 1.8, defaultTheme.raceSpeed),
      logoUrl: sanitizeUrl(incoming.logoUrl, defaultTheme.logoUrl),
      logoWidth: clamp(incoming.logoWidth, 40, 280, defaultTheme.logoWidth),
      logoOpacity: clamp(incoming.logoOpacity, 0, 1, defaultTheme.logoOpacity),
      logoX: clamp(incoming.logoX, 0, 100, defaultTheme.logoX),
      logoY: clamp(incoming.logoY, 0, 100, defaultTheme.logoY),
      assetUrl: sanitizeUrl(incoming.assetUrl, defaultTheme.assetUrl),
      assetWidth: clamp(incoming.assetWidth, 60, 720, defaultTheme.assetWidth),
      assetOpacity: clamp(incoming.assetOpacity, 0, 1, defaultTheme.assetOpacity),
      assetX: clamp(incoming.assetX, 0, 100, defaultTheme.assetX),
      assetY: clamp(incoming.assetY, 0, 100, defaultTheme.assetY),
      fontFamily: sanitizeFontFamily(incoming.fontFamily, defaultTheme.fontFamily)
    }
  }

  function sanitizeFontFamily(value, fallback) {
    const text = asText(value)
    if (!text) {
      return fallback
    }
    return text.replace(/[{};]/g, '').slice(0, 120)
  }

  function sanitizeVisualMode(value, fallback) {
    const mode = asText(value).toLowerCase()
    if (mode === 'race' || mode === 'classic') {
      return mode
    }
    return fallback
  }

  function normalizeRaceCar(value) {
    const text = asText(value)
    if (!text) {
      return defaultTheme.raceCar
    }
    return Array.from(text).slice(0, 2).join('')
  }

  function sanitizeUrl(value, fallback) {
    const text = asText(value)
    if (!text) {
      return fallback
    }
    return text
  }

  function sanitizeHex(value, fallback) {
    const text = asText(value)
    if (!text) {
      return fallback
    }
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
    return match ? text : fallback
  }

  function hexToRgba(hex, alpha) {
    const clean = sanitizeHex(hex, '#000000').replace('#', '')
    const full = clean.length === 3 ? clean.split('').map((ch) => `${ch}${ch}`).join('') : clean
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    const a = clamp(alpha, 0, 1, 1)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  function clamp(value, min, max, fallback) {
    const num = Number(value)
    if (!Number.isFinite(num)) {
      return fallback
    }
    return Math.min(max, Math.max(min, num))
  }

  function toInt(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) {
      return 0
    }
    return Math.max(0, Math.round(num))
  }

  function normalizeApiBase(value) {
    const text = asText(value)
    if (!text) {
      return ''
    }
    return text.replace(/\/+$/, '')
  }

  function toWsBase(apiBase) {
    try {
      const parsed = new URL(apiBase)
      const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${parsed.host}`
    } catch {
      return ''
    }
  }

  function normalizeCode(value) {
    const text = asText(value)
    return text ? text.toUpperCase() : ''
  }

  function normalizeThemeName(value) {
    const text = asText(value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64)
    return text
  }

  function asText(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function must(id) {
    const node = document.getElementById(id)
    if (!node) {
      throw new Error(`Missing element: ${id}`)
    }
    return node
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function safeJsonParse(value) {
    if (!value) {
      return null
    }
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function errorToMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message
    }
    return 'Unexpected error'
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('read_failed'))
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.readAsDataURL(file)
    })
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

  function handleUnload() {
    state.isUnloading = true
    stopSnapshotPolling()
    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer)
      state.reconnectTimer = null
    }
    disconnectSocket()
  }
})()

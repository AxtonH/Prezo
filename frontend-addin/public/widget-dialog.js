/* global Office */
(() => {
  document.title = 'Prezo Widgets'
  const el = (id) => document.getElementById(id)
  const selectView = () => el('view-select')
  const qnaView = () => el('view-qna')
  const discussionView = () => el('view-discussion')
  const pollView = () => el('view-poll')
  const openQnaButton = () => el('open-qna')
  const backQnaButton = () => el('back-qna')
  const insertQnaButton = () => el('insert-qna')
  const openDiscussionButton = () => el('open-discussion')
  const backDiscussionButton = () => el('back-discussion')
  const insertDiscussionButton = () => el('insert-discussion')
  const openPollButton = () => el('open-poll')
  const backPollButton = () => el('back-poll')
  const insertPollButton = () => el('insert-poll')
  const insertGameButton = () => el('insert-game')
  const statusEl = () => el('status')
  const errorEl = () => el('error')
  const discussionStatusEl = () => el('discussion-status')
  const discussionErrorEl = () => el('discussion-error')
  const pollStatusEl = () => el('poll-status')
  const pollErrorEl = () => el('poll-error')
  const gameStatusEl = () => el('game-status')
  const gameErrorEl = () => el('game-error')
  const debugEl = () => el('debug')
  const discussionDebugEl = () => el('discussion-debug')
  const pollDebugEl = () => el('poll-debug')
  const previewEl = () => el('qna-preview')
  const discussionPreviewEl = () => el('discussion-preview')
  const pollPreviewEl = () => el('poll-preview')
  const pollLinkedSelect = () => el('poll-linked')
  const pollLinkHint = () => el('poll-link-hint')

  const queryDebug = () => {
    try {
      const data = sessionStorage.getItem('prezo-widget-debug')
      return data ? JSON.parse(data) : {}
    } catch {
      return {}
    }
  }

  const renderDebug = () => {
    const debug = queryDebug()
    if (!debug || (!debug.openMessage && !debug.openAt)) {
      return
    }
    const lines = []
    if (debug.openMessage) {
      lines.push(`Dialog: ${debug.openMessage}`)
    }
    if (debug.openAt) {
      lines.push(`Attempt: ${debug.openAt}`)
    }
    const value = lines.join(' | ')
    if (debugEl()) debugEl().textContent = value
    if (discussionDebugEl()) discussionDebugEl().textContent = value
    if (pollDebugEl()) pollDebugEl().textContent = value
  }

  const qnaInputs = {
    font: () => el('qna-font'),
    text: () => el('qna-text'),
    muted: () => el('qna-muted'),
    accent: () => el('qna-accent'),
    panel: () => el('qna-panel'),
    card: () => el('qna-card'),
    border: () => el('qna-border'),
    shadow: () => el('qna-shadow'),
    spacing: () => el('qna-spacing'),
    max: () => el('qna-max')
  }
  const discussionInputs = {
    font: () => el('discussion-font'),
    text: () => el('discussion-text'),
    muted: () => el('discussion-muted'),
    accent: () => el('discussion-accent'),
    panel: () => el('discussion-panel'),
    card: () => el('discussion-card'),
    border: () => el('discussion-border'),
    shadow: () => el('discussion-shadow'),
    spacing: () => el('discussion-spacing'),
    max: () => el('discussion-max')
  }
  const pollInputs = {
    font: () => el('poll-font'),
    text: () => el('poll-text'),
    muted: () => el('poll-muted'),
    accent: () => el('poll-accent'),
    panel: () => el('poll-panel'),
    bar: () => el('poll-bar'),
    border: () => el('poll-border'),
    spacing: () => el('poll-spacing'),
    width: () => el('poll-width'),
    orientation: () => el('poll-orientation')
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

  const hexToRgb = (hex) => {
    const normalized = hex.replace('#', '')
    if (normalized.length === 3) {
      const r = parseInt(normalized[0] + normalized[0], 16)
      const g = parseInt(normalized[1] + normalized[1], 16)
      const b = parseInt(normalized[2] + normalized[2], 16)
      return { r, g, b }
    }
    if (normalized.length === 6) {
      const r = parseInt(normalized.slice(0, 2), 16)
      const g = parseInt(normalized.slice(2, 4), 16)
      const b = parseInt(normalized.slice(4, 6), 16)
      return { r, g, b }
    }
    return { r: 0, g: 0, b: 0 }
  }

  const rgbToHex = ({ r, g, b }) => {
    const toHex = (value) => value.toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  const mixColors = (a, b, ratio) => {
    const colorA = hexToRgb(a)
    const colorB = hexToRgb(b)
    const mix = (v1, v2) => Math.round(v1 * (1 - ratio) + v2 * ratio)
    return rgbToHex({
      r: mix(colorA.r, colorB.r),
      g: mix(colorA.g, colorB.g),
      b: mix(colorA.b, colorB.b)
    })
  }

  const lighten = (hex, ratio) => mixColors(hex, '#ffffff', ratio)

  const setStatus = (text) => {
    if (statusEl()) statusEl().textContent = text || ''
  }

  const setError = (text) => {
    if (errorEl()) errorEl().textContent = text || ''
  }

  const setDiscussionStatus = (text) => {
    if (discussionStatusEl()) discussionStatusEl().textContent = text || ''
  }

  const setDiscussionError = (text) => {
    if (discussionErrorEl()) discussionErrorEl().textContent = text || ''
  }

  const setPollStatus = (text) => {
    if (pollStatusEl()) pollStatusEl().textContent = text || ''
  }

  const setPollError = (text) => {
    if (pollErrorEl()) pollErrorEl().textContent = text || ''
  }

  // Freeze the button's rendered width while busy so swapping to the
  // shorter "Inserting..." label never resizes it.
  const setInsertButtonBusy = (btn, busy, idleText) => {
    if (!btn) return
    if (busy && !btn.disabled) btn.style.width = `${btn.offsetWidth}px`
    btn.disabled = busy
    btn.textContent = busy ? 'Inserting...' : idleText
    if (!busy) btn.style.width = ''
  }

  const setBusy = (busy) => {
    setInsertButtonBusy(insertQnaButton(), busy, 'Insert widget')
  }

  const setDiscussionBusy = (busy) => {
    setInsertButtonBusy(insertDiscussionButton(), busy, 'Insert widget')
  }

  const setPollBusy = (busy) => {
    setInsertButtonBusy(insertPollButton(), busy, 'Insert poll')
  }

  const setGameStatus = (text) => {
    if (gameStatusEl()) gameStatusEl().textContent = text || ''
  }

  const setGameError = (text) => {
    if (gameErrorEl()) gameErrorEl().textContent = text || ''
  }

  const setGameBusy = (busy) => {
    setInsertButtonBusy(insertGameButton(), busy, 'Insert game slide')
  }

  const readQnaConfig = () => ({
    fontFamily: (qnaInputs.font()?.value || '').trim() || null,
    textColor: qnaInputs.text()?.value || '#0f172a',
    mutedColor: qnaInputs.muted()?.value || '#64748b',
    accentColor: qnaInputs.accent()?.value || '#2563eb',
    panelColor: qnaInputs.panel()?.value || '#ffffff',
    cardColor: qnaInputs.card()?.value || '#f8fafc',
    borderColor: qnaInputs.border()?.value || '#e2e8f0',
    shadowOpacity: clamp(parseFloat(qnaInputs.shadow()?.value || '0.4'), 0, 0.6),
    spacingScale: clamp(parseFloat(qnaInputs.spacing()?.value || '1'), 0.8, 1.3),
    maxQuestions: clamp(parseInt(qnaInputs.max()?.value || '3', 10), 1, 5)
  })


  const updatePreview = () => {
    const preview = previewEl()
    if (!preview) return
    const config = readQnaConfig()
    preview.style.setProperty('--panel-bg', config.panelColor)
    preview.style.setProperty('--card-bg', config.cardColor)
    preview.style.setProperty('--border', config.borderColor)
    preview.style.setProperty('--text', config.textColor)
    preview.style.setProperty('--muted', config.mutedColor)
    preview.style.setProperty('--badge-bg', lighten(config.accentColor, 0.82))
    preview.style.setProperty('--badge-text', config.accentColor)
    preview.style.setProperty('--shadow-alpha', config.shadowOpacity.toString())
    preview.style.setProperty('--spacing', config.spacingScale.toString())
    preview.style.setProperty(
      '--font-family',
      config.fontFamily ? `'${config.fontFamily}', 'Sora', sans-serif` : `'Sora', sans-serif`
    )

    const items = preview.querySelectorAll('.preview-item')
    items.forEach((item, index) => {
      item.style.display = index < config.maxQuestions ? 'flex' : 'none'
    })

  }

  const readDiscussionConfig = () => ({
    fontFamily: (discussionInputs.font()?.value || '').trim() || null,
    textColor: discussionInputs.text()?.value || '#0f172a',
    mutedColor: discussionInputs.muted()?.value || '#64748b',
    accentColor: discussionInputs.accent()?.value || '#2563eb',
    panelColor: discussionInputs.panel()?.value || '#ffffff',
    cardColor: discussionInputs.card()?.value || '#f8fafc',
    borderColor: discussionInputs.border()?.value || '#e2e8f0',
    shadowOpacity: clamp(parseFloat(discussionInputs.shadow()?.value || '0.4'), 0, 0.6),
    spacingScale: clamp(parseFloat(discussionInputs.spacing()?.value || '1'), 0.8, 1.3),
    maxQuestions: clamp(parseInt(discussionInputs.max()?.value || '3', 10), 1, 5)
  })

  const updateDiscussionPreview = () => {
    const preview = discussionPreviewEl()
    if (!preview) return
    const config = readDiscussionConfig()
    preview.style.setProperty('--panel-bg', config.panelColor)
    preview.style.setProperty('--card-bg', config.cardColor)
    preview.style.setProperty('--border', config.borderColor)
    preview.style.setProperty('--text', config.textColor)
    preview.style.setProperty('--muted', config.mutedColor)
    preview.style.setProperty('--badge-bg', lighten(config.accentColor, 0.82))
    preview.style.setProperty('--badge-text', config.accentColor)
    preview.style.setProperty('--shadow-alpha', config.shadowOpacity.toString())
    preview.style.setProperty('--spacing', config.spacingScale.toString())
    preview.style.setProperty(
      '--font-family',
      config.fontFamily ? `'${config.fontFamily}', 'Sora', sans-serif` : `'Sora', sans-serif`
    )

    const items = preview.querySelectorAll('.preview-item')
    items.forEach((item, index) => {
      item.style.display = index < config.maxQuestions ? 'flex' : 'none'
    })
  }

  /**
   * Linked-poll state, pushed by the parent (function-file) in response to
   * request-poll-state. The dialog itself never talks to the API — dialog
   * webviews don't reliably share the add-in's auth storage.
   */
  let pollState = { loaded: false, hasSession: false, polls: [], error: null }
  let lastPollStateSignature = null
  let defaultPollPreview = null

  const selectedLinkedPoll = () => {
    const select = pollLinkedSelect()
    if (!select || !select.value) return null
    return pollState.polls.find((poll) => poll.id === select.value) || null
  }

  const updatePollLinkHint = () => {
    const hint = pollLinkHint()
    if (!hint) return
    if (pollState.loaded && pollState.error) {
      hint.textContent = 'Could not load polls — insert now and link from the Prezo panel.'
    } else if (pollState.loaded && pollState.hasSession && pollState.polls.length === 0) {
      hint.textContent =
        'No polls yet — create one in the Prezo panel, or insert now and link later.'
    } else {
      /** Checking / no-session / pick-a-poll guidance all live inside the
       * dropdown as its placeholder option; a linked selection speaks for
       * itself (the preview shows the poll). */
      hint.textContent = ''
    }
  }

  const renderPollLinkState = () => {
    const select = pollLinkedSelect()
    if (!select) return
    const previous = select.value
    select.innerHTML = ''
    const hasPolls = pollState.polls.length > 0
    const addOption = (value, text, isPlaceholder) => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = text
      if (isPlaceholder) {
        /** Placeholders show in the closed control but never in the open
         * list — guidance the user reads, not a choice they can commit to. */
        option.disabled = true
        option.hidden = true
        option.selected = true
      }
      select.appendChild(option)
    }
    if (!pollState.loaded) {
      addOption('', 'Checking for a connected session...', true)
    } else if (!pollState.hasSession && !pollState.error) {
      addOption(
        '',
        'Connect a session in the Prezo panel to link a poll. You can insert now and link later.',
        true
      )
    } else if (!hasPolls) {
      /** Session without polls (or a failed poll fetch): plain link-later
       * default — the hint line explains why the list is empty. */
      addOption('', 'None — link later', false)
    } else {
      addOption('', 'Pick a poll to insert the widget already linked, or link later.', true)
      /** "none" (not '') so an explicit link-later choice is distinct from
       * the placeholder; selectedLinkedPoll treats both as unlinked. */
      addOption('none', 'None — link later', false)
      pollState.polls.forEach((poll) => {
        addOption(
          poll.id,
          poll.status === 'open' ? `${poll.question} (live)` : poll.question,
          false
        )
      })
      if (
        previous &&
        (previous === 'none' || pollState.polls.some((poll) => poll.id === previous))
      ) {
        select.value = previous
      }
    }
    select.disabled = !hasPolls
    updatePollLinkHint()
    updatePollPreview()
  }

  const readPollConfig = () => ({
    fontFamily: (pollInputs.font()?.value || '').trim() || null,
    textColor: pollInputs.text()?.value || '#0f172a',
    mutedColor: pollInputs.muted()?.value || '#64748b',
    accentColor: pollInputs.accent()?.value || '#2563eb',
    panelColor: pollInputs.panel()?.value || '#ffffff',
    barColor: pollInputs.bar()?.value || '#e2e8f0',
    borderColor: pollInputs.border()?.value || '#e2e8f0',
    /** Poll widgets insert flat since 18/08/2026 — no shadow shape, no
     * control; the key stays so the engines' style normalizers see an
     * explicit value instead of backfilling the old 0.35 default. */
    shadowOpacity: 0,
    spacingScale: clamp(parseFloat(pollInputs.spacing()?.value || '1'), 0.8, 1.3),
    barThicknessScale: clamp(parseFloat(pollInputs.width()?.value || '1'), 0.4, 2),
    orientation: pollInputs.orientation()?.value || 'horizontal',
    /** Linked inserts size the skeleton from the poll itself; unlinked
     * inserts always get the full 5-option skeleton (the picker was
     * removed 19/08/2026). */
    maxOptions: selectedLinkedPoll()
      ? clamp(selectedLinkedPoll().options.length || 5, 1, 5)
      : 5
  })

  const updatePollPreview = () => {
    const preview = pollPreviewEl()
    if (!preview) return
    const config = readPollConfig()
    preview.style.setProperty('--panel-bg', config.panelColor)
    preview.style.setProperty('--border', config.borderColor)
    preview.style.setProperty('--text', config.textColor)
    preview.style.setProperty('--muted', config.mutedColor)
    preview.style.setProperty('--accent', config.accentColor)
    preview.style.setProperty('--bar-bg', config.barColor)
    preview.style.setProperty('--spacing', config.spacingScale.toString())
    preview.style.setProperty('--bar-thickness', config.barThicknessScale.toString())
    preview.style.setProperty(
      '--font-family',
      config.fontFamily ? `'${config.fontFamily}', 'Sora', sans-serif` : `'Sora', sans-serif`
    )
    preview.classList.toggle('preview-vertical', config.orientation === 'vertical')

    /** Linked polls preview the real question and options; the static
     * markup is kept aside so "link later" restores the sample content. */
    const questionEl = preview.querySelector('.preview-poll-question')
    const optionsEl = preview.querySelector('.preview-poll-options')
    if (defaultPollPreview === null && questionEl && optionsEl) {
      defaultPollPreview = {
        question: questionEl.textContent,
        optionsHtml: optionsEl.innerHTML
      }
    }
    const linked = selectedLinkedPoll()
    if (linked && questionEl && optionsEl) {
      const prefix = linked.status === 'open' ? 'Live poll' : 'Poll'
      questionEl.textContent = `${prefix}: ${linked.question}`
      const shownOptions = linked.options.slice(0, 5)
      const totalVotes = shownOptions.reduce((sum, option) => sum + (option.votes || 0), 0)
      optionsEl.innerHTML = ''
      shownOptions.forEach((option, index) => {
        const ratio =
          totalVotes > 0
            ? (option.votes || 0) / totalVotes
            : Math.max(0.08, 0.7 - index * 0.15)
        const item = document.createElement('div')
        item.className = 'preview-poll-option'
        const label = document.createElement('div')
        label.className = 'preview-poll-label'
        label.textContent = option.label
        const bar = document.createElement('div')
        bar.className = 'preview-poll-bar'
        const fill = document.createElement('div')
        fill.className = 'preview-poll-fill'
        fill.style.setProperty('--fill', ratio.toFixed(2))
        bar.appendChild(fill)
        item.appendChild(label)
        item.appendChild(bar)
        optionsEl.appendChild(item)
      })
    } else if (defaultPollPreview && questionEl && optionsEl) {
      questionEl.textContent = defaultPollPreview.question
      optionsEl.innerHTML = defaultPollPreview.optionsHtml
    }
    const items = preview.querySelectorAll('.preview-poll-option')
    items.forEach((item, index) => {
      item.style.display = index < config.maxOptions ? 'flex' : 'none'
    })
  }

  const showView = (view) => {
    if (selectView()) selectView().classList.add('hidden')
    if (qnaView()) qnaView().classList.add('hidden')
    if (discussionView()) discussionView().classList.add('hidden')
    if (pollView()) pollView().classList.add('hidden')
    if (view === 'qna' && qnaView()) {
      qnaView().classList.remove('hidden')
      updatePreview()
      return
    }
    if (view === 'discussion' && discussionView()) {
      discussionView().classList.remove('hidden')
      updateDiscussionPreview()
      return
    }
    if (view === 'poll' && pollView()) {
      pollView().classList.remove('hidden')
      updatePollPreview()
      return
    }
    if (selectView()) {
      selectView().classList.remove('hidden')
    }
  }

  const sendInsert = (replace) => {
    setError('')
    setStatus('')
    setBusy(true)
    Office.context.ui.messageParent(
      JSON.stringify({
        type: 'insert-qna',
        style: readQnaConfig(),
        replace: replace === true
      })
    )
  }

  const sendDiscussionInsert = (replace) => {
    setDiscussionError('')
    setDiscussionStatus('')
    setDiscussionBusy(true)
    Office.context.ui.messageParent(
      JSON.stringify({
        type: 'insert-discussion',
        style: readDiscussionConfig(),
        replace: replace === true
      })
    )
  }

  const sendPollInsert = (replace) => {
    setPollError('')
    setPollStatus('')
    setPollBusy(true)
    const linked = selectedLinkedPoll()
    Office.context.ui.messageParent(
      JSON.stringify({
        type: 'insert-poll',
        style: readPollConfig(),
        pollId: linked ? linked.id : null,
        replace: replace === true
      })
    )
  }

  /**
   * Explicit widget lifecycle: the host never silently replaces an existing
   * widget (PowerPoint has no undo transactions for add-ins, so an
   * overwritten widget is unrecoverable). It answers `confirm-replace`, we
   * ask here; Remove goes through the same confirm bar.
   */
  const families = {
    qna: {
      label: 'Q&A',
      setStatus,
      setError,
      setBusy,
      send: sendInsert,
      removeType: 'remove-qna',
      ids: {
        remove: 'remove-qna',
        bar: 'qna-confirm',
        text: 'qna-confirm-text',
        accept: 'qna-confirm-accept',
        cancel: 'qna-confirm-cancel'
      }
    },
    discussion: {
      label: 'open discussion',
      setStatus: setDiscussionStatus,
      setError: setDiscussionError,
      setBusy: setDiscussionBusy,
      send: sendDiscussionInsert,
      removeType: 'remove-discussion',
      ids: {
        remove: 'remove-discussion',
        bar: 'discussion-confirm',
        text: 'discussion-confirm-text',
        accept: 'discussion-confirm-accept',
        cancel: 'discussion-confirm-cancel'
      }
    },
    poll: {
      label: 'poll',
      setStatus: setPollStatus,
      setError: setPollError,
      setBusy: setPollBusy,
      send: sendPollInsert,
      removeType: 'remove-poll',
      ids: {
        remove: 'remove-poll',
        bar: 'poll-confirm',
        text: 'poll-confirm-text',
        accept: 'poll-confirm-accept',
        cancel: 'poll-confirm-cancel'
      }
    }
  }

  const familyFromSource = (source) =>
    source === 'poll' || source === 'discussion' ? source : 'qna'

  const pendingConfirm = { qna: null, discussion: null, poll: null }

  const hideConfirm = (key) => {
    pendingConfirm[key] = null
    const bar = el(families[key].ids.bar)
    if (bar) bar.classList.add('hidden')
  }

  const showConfirm = (key, action) => {
    pendingConfirm[key] = action
    const family = families[key]
    const bar = el(family.ids.bar)
    const text = el(family.ids.text)
    const accept = el(family.ids.accept)
    if (text) {
      text.textContent =
        action === 'replace'
          ? `This slide already has a ${family.label} widget. Replace it? Its design customizations will be lost.`
          : `Remove the ${family.label} widget from this slide? Its design customizations will be lost.`
    }
    if (accept) accept.textContent = action === 'replace' ? 'Replace' : 'Remove'
    if (bar) bar.classList.remove('hidden')
  }

  const acceptConfirm = (key) => {
    const family = families[key]
    const action = pendingConfirm[key]
    hideConfirm(key)
    if (action === 'replace') {
      family.send(true)
      return
    }
    if (action === 'remove') {
      family.setError('')
      family.setStatus('Removing widget...')
      Office.context.ui.messageParent(JSON.stringify({ type: family.removeType }))
    }
  }

  const sendGameInsert = () => {
    setGameError('')
    setGameStatus('')
    setGameBusy(true)
    Office.context.ui.messageParent(JSON.stringify({ type: 'insert-game' }))
  }

  Office.onReady(() => {
    if (openQnaButton()) {
      openQnaButton().addEventListener('click', () => showView('qna'))
    }
    if (backQnaButton()) {
      backQnaButton().addEventListener('click', () => showView('select'))
    }
    if (openDiscussionButton()) {
      openDiscussionButton().addEventListener('click', () => showView('discussion'))
    }
    if (backDiscussionButton()) {
      backDiscussionButton().addEventListener('click', () => showView('select'))
    }
    if (openPollButton()) {
      openPollButton().addEventListener('click', () => showView('poll'))
    }
    if (backPollButton()) {
      backPollButton().addEventListener('click', () => showView('select'))
    }
    if (insertQnaButton()) {
      insertQnaButton().addEventListener('click', () => sendInsert(false))
    }
    if (insertDiscussionButton()) {
      insertDiscussionButton().addEventListener('click', () => sendDiscussionInsert(false))
    }
    if (insertPollButton()) {
      insertPollButton().addEventListener('click', () => sendPollInsert(false))
    }
    if (insertGameButton()) {
      insertGameButton().addEventListener('click', sendGameInsert)
    }

    Object.keys(families).forEach((key) => {
      const family = families[key]
      const removeButton = el(family.ids.remove)
      const accept = el(family.ids.accept)
      const cancel = el(family.ids.cancel)
      if (removeButton) {
        removeButton.addEventListener('click', () => {
          family.setError('')
          family.setStatus('')
          showConfirm(key, 'remove')
        })
      }
      if (accept) {
        accept.addEventListener('click', () => acceptConfirm(key))
      }
      if (cancel) {
        cancel.addEventListener('click', () => {
          hideConfirm(key)
          family.setStatus('')
          family.setBusy(false)
        })
      }
    })

    Object.values(qnaInputs).forEach((getter) => {
      const input = getter()
      if (!input) return
      input.addEventListener('input', updatePreview)
      input.addEventListener('change', updatePreview)
    })
    Object.values(discussionInputs).forEach((getter) => {
      const input = getter()
      if (!input) return
      input.addEventListener('input', updateDiscussionPreview)
      input.addEventListener('change', updateDiscussionPreview)
    })
    Object.values(pollInputs).forEach((getter) => {
      const input = getter()
      if (!input) return
      input.addEventListener('input', updatePollPreview)
      input.addEventListener('change', updatePollPreview)
    })
    if (pollLinkedSelect()) {
      pollLinkedSelect().addEventListener('change', () => {
        updatePollLinkHint()
        updatePollPreview()
      })
    }

    Office.context.ui.addHandlerAsync(
      Office.EventType.DialogParentMessageReceived,
      (arg) => {
        let message = arg.message
        try {
          message = JSON.parse(arg.message)
        } catch {
          // allow raw string
        }
        if (message && message.type === 'inserted') {
          setStatus('')
          setBusy(false)
        } else if (message && message.type === 'discussion-inserted') {
          setDiscussionStatus('')
          setDiscussionBusy(false)
        } else if (message && message.type === 'poll-inserted') {
          setPollStatus('')
          setPollBusy(false)
        } else if (message && message.type === 'game-inserted') {
          setGameStatus('')
          setGameBusy(false)
        } else if (message && message.type === 'poll-state') {
          pollState = {
            loaded: true,
            hasSession: Boolean(message.hasSession),
            polls: Array.isArray(message.polls) ? message.polls : [],
            error: message.error || null
          }
          /** State is re-requested on an interval while the dialog is open
           * (joining/leaving a session must reflect without reopening).
           * Only a STRUCTURAL change rebuilds the select — rebuilding
           * closes an open dropdown, so votes-only ticks just refresh the
           * preview fills. */
          const signature = JSON.stringify([
            pollState.hasSession,
            Boolean(pollState.error),
            pollState.polls.map((poll) => [poll.id, poll.question, poll.status])
          ])
          if (signature !== lastPollStateSignature) {
            lastPollStateSignature = signature
            renderPollLinkState()
          } else {
            updatePollPreview()
          }
        } else if (message && message.type === 'confirm-replace') {
          const key = familyFromSource(message.source)
          families[key].setStatus('')
          families[key].setBusy(false)
          showConfirm(key, 'replace')
        } else if (message && message.type === 'removed') {
          const key = familyFromSource(message.source)
          families[key].setStatus('Widget removed from the slide.')
          families[key].setBusy(false)
        } else if (message && message.type === 'error') {
          if (message.source === 'game') {
            setGameStatus('')
            setGameError(message.message || 'Failed to insert the game slide.')
            setGameBusy(false)
          } else if (message.source === 'poll') {
            setPollStatus('')
            setPollError(message.message || 'Failed to insert poll widget.')
            setPollBusy(false)
          } else if (message.source === 'discussion') {
            setDiscussionStatus('')
            setDiscussionError(
              message.message || 'Failed to insert open discussion widget.'
            )
            setDiscussionBusy(false)
          } else {
            setStatus('')
            setError(message.message || 'Failed to insert widget.')
            setBusy(false)
          }
        }
      }
    )

    updatePreview()
    updateDiscussionPreview()
    updatePollPreview()
    updatePollLinkHint()
    renderDebug()

    /** Ask the parent for session + poll state (handler above must already
     * be registered so the response can't race past us), then keep asking
     * while the dialog is open so joining or leaving a session in the
     * panel reflects here without a reopen. */
    const requestPollState = () => {
      try {
        Office.context.ui.messageParent(JSON.stringify({ type: 'request-poll-state' }))
      } catch {
        // Opened outside a dialog host — the link picker stays in its empty state.
      }
    }
    requestPollState()
    window.setInterval(requestPollState, 5000)
  })
})()

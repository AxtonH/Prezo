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

  // Freeze the button's rendered width while busy so swapping to a
  // shorter busy label never resizes it.
  const setActionButtonBusy = (btn, busy, busyText, idleText) => {
    if (!btn) return
    if (busy && !btn.disabled) btn.style.width = `${btn.offsetWidth}px`
    btn.disabled = busy
    btn.textContent = busy ? busyText : idleText
    if (!busy) btn.style.width = ''
  }

  const setBusy = (busy) => {
    setActionButtonBusy(insertQnaButton(), busy, 'Inserting...', 'Insert widget')
  }

  const setDiscussionBusy = (busy) => {
    setActionButtonBusy(insertDiscussionButton(), busy, 'Inserting...', 'Insert widget')
  }

  const setPollBusy = (busy) => {
    setActionButtonBusy(insertPollButton(), busy, 'Inserting...', 'Insert poll')
  }

  const setRemoveBusy = (key, busy) => {
    setActionButtonBusy(
      el(families[key].ids.remove),
      busy,
      'Removing...',
      'Remove widget from slide'
    )
  }

  const setGameStatus = (text) => {
    if (gameStatusEl()) gameStatusEl().textContent = text || ''
  }

  const setGameError = (text) => {
    if (gameErrorEl()) gameErrorEl().textContent = text || ''
  }

  const setGameBusy = (busy) => {
    setActionButtonBusy(insertGameButton(), busy, 'Inserting...', 'Insert game slide')
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
        addOption(poll.id, poll.question, false)
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
    const votesEl = preview.querySelector('.preview-poll-votes')
    const linked = selectedLinkedPoll()
    if (linked && questionEl && optionsEl) {
      questionEl.textContent = linked.question
      const shownOptions = linked.options.slice(0, 5)
      const totalVotes = shownOptions.reduce((sum, option) => sum + (option.votes || 0), 0)
      if (votesEl) {
        votesEl.textContent = `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}`
      }
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
      if (votesEl) {
        votesEl.textContent = '0 votes'
      }
    }
    const items = preview.querySelectorAll('.preview-poll-option')
    items.forEach((item, index) => {
      item.style.display = index < config.maxOptions ? 'flex' : 'none'
    })
  }

  /* ------------------------------------------------------------------ */
  /* Saved design presets (poll editor). Storage lives with the parent   */
  /* (function-file) because dialog webviews have no reliable storage —  */
  /* same channel pattern as the linked-poll picker.                     */
  /* ------------------------------------------------------------------ */

  const DEFAULT_POLL_DESIGN = {
    fontFamily: null,
    textColor: '#0f172a',
    mutedColor: '#64748b',
    accentColor: '#2563eb',
    panelColor: '#ffffff',
    barColor: '#e2e8f0',
    borderColor: '#e2e8f0',
    spacingScale: 1,
    barThicknessScale: 1,
    orientation: 'horizontal'
  }
  const POLL_DESIGN_KEYS = Object.keys(DEFAULT_POLL_DESIGN)
  const BUILTIN_PRESET_ID = '__default__'

  let pollPresetState = { loaded: false, presets: [], defaultId: null }
  /** BUILTIN_PRESET_ID, a preset id, or null (unsaved custom design). */
  let pollSelectedPresetId = BUILTIN_PRESET_ID
  let pollPresetBaseline = null
  let pollControlsTouched = false
  let pollDefaultApplied = false
  /** What the in-flight parent call was for — picks the success hint. */
  let pollPendingAction = null
  let pollNamerMode = null

  /** The design half of the poll config: everything a preset captures.
   * maxOptions stays out — it follows the linked poll, not the design. */
  const readPollDesign = () => {
    const config = readPollConfig()
    const design = {}
    POLL_DESIGN_KEYS.forEach((key) => {
      design[key] = config[key] !== undefined ? config[key] : DEFAULT_POLL_DESIGN[key]
    })
    return design
  }

  const designSignature = (style) =>
    JSON.stringify(
      POLL_DESIGN_KEYS.map((key) =>
        style && style[key] !== undefined && style[key] !== null
          ? style[key]
          : DEFAULT_POLL_DESIGN[key]
      )
    )

  const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

  const applyPollDesign = (style) => {
    const design = { ...DEFAULT_POLL_DESIGN, ...(style || {}) }
    const fontSelect = pollInputs.font()
    if (fontSelect) {
      const value = design.fontFamily ? String(design.fontFamily) : ''
      if (
        value &&
        !Array.prototype.some.call(fontSelect.options, (option) => option.value === value)
      ) {
        /** A design can carry a font outside the stock list (e.g. copied
         * from a slide) — surface it instead of silently dropping it. */
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        fontSelect.appendChild(option)
      }
      fontSelect.value = value
    }
    const colorTargets = {
      textColor: pollInputs.text(),
      mutedColor: pollInputs.muted(),
      accentColor: pollInputs.accent(),
      panelColor: pollInputs.panel(),
      barColor: pollInputs.bar(),
      borderColor: pollInputs.border()
    }
    Object.keys(colorTargets).forEach((key) => {
      const input = colorTargets[key]
      if (input && isHexColor(design[key])) {
        input.value = design[key].toLowerCase()
      }
    })
    if (pollInputs.spacing()) {
      pollInputs.spacing().value = String(clamp(Number(design.spacingScale) || 1, 0.8, 1.3))
    }
    if (pollInputs.width()) {
      pollInputs.width().value = String(clamp(Number(design.barThicknessScale) || 1, 0.4, 2))
    }
    if (pollInputs.orientation()) {
      pollInputs.orientation().value =
        design.orientation === 'vertical' ? 'vertical' : 'horizontal'
    }
    updatePollPreview()
  }

  const setPollPresetHint = (text, isError) => {
    const hint = el('poll-preset-hint')
    if (!hint) return
    hint.textContent = text || ''
    hint.classList.toggle('error', Boolean(isError))
  }

  const hidePollPresetNamer = () => {
    pollNamerMode = null
    const namer = el('poll-preset-namer')
    if (namer) namer.classList.add('hidden')
  }

  const showPollPresetNamer = (mode, initialName) => {
    pollNamerMode = mode
    const namer = el('poll-preset-namer')
    const input = el('poll-preset-name')
    const choice = el('poll-preset-choice')
    if (choice) choice.classList.add('hidden')
    if (namer) namer.classList.remove('hidden')
    if (input) {
      input.value = initialName || ''
      input.focus()
      input.select()
    }
  }

  const sendPresetMessage = (payload, action) => {
    try {
      pollPendingAction = action
      Office.context.ui.messageParent(JSON.stringify(payload))
      updatePollPresetUi()
    } catch {
      pollPendingAction = null
      setPollPresetHint('Saved designs are unavailable outside PowerPoint.', true)
    }
  }

  /* Floating per-card menu, appended to <body> so the strip cannot clip it. */
  let presetMenuEl = null
  let presetMenuDeleteArmed = false

  const closePresetMenu = () => {
    if (presetMenuEl && presetMenuEl.parentNode) {
      presetMenuEl.parentNode.removeChild(presetMenuEl)
    }
    presetMenuEl = null
    presetMenuDeleteArmed = false
  }

  const openPresetMenu = (preset, anchor) => {
    closePresetMenu()
    const menu = document.createElement('div')
    menu.className = 'preset-menu'

    const addItem = (label, onClick, danger) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      if (danger) button.classList.add('danger')
      button.addEventListener('click', onClick)
      menu.appendChild(button)
      return button
    }

    const isDefault = pollPresetState.defaultId === preset.id
    addItem(isDefault ? 'Stop using for new widgets' : 'Use for new widgets', () => {
      closePresetMenu()
      sendPresetMessage(
        {
          type: 'set-default-widget-preset',
          kind: 'poll',
          id: isDefault ? null : preset.id
        },
        'default'
      )
    })
    addItem('Rename', () => {
      closePresetMenu()
      setPollPresetHint('')
      showPollPresetNamer(`rename:${preset.id}`, preset.name)
    })
    const deleteButton = addItem(
      'Delete',
      () => {
        /** Two-step: first click arms, second click deletes. */
        if (!presetMenuDeleteArmed) {
          presetMenuDeleteArmed = true
          deleteButton.textContent = 'Really delete?'
          return
        }
        closePresetMenu()
        sendPresetMessage(
          { type: 'delete-widget-preset', kind: 'poll', id: preset.id },
          'delete'
        )
      },
      true
    )

    document.body.appendChild(menu)
    const rect = anchor.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    let left = Math.min(rect.left, window.innerWidth - menuRect.width - 8)
    let top = rect.bottom + 4
    if (top + menuRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuRect.height - 4)
    }
    menu.style.left = `${Math.max(8, left)}px`
    menu.style.top = `${top}px`
    presetMenuEl = menu
  }

  document.addEventListener('mousedown', (event) => {
    if (!presetMenuEl) return
    if (presetMenuEl.contains(event.target)) return
    /** Reopening from the same ⋯ button is handled by the button itself. */
    closePresetMenu()
  })

  const selectPollPreset = (preset) => {
    closePresetMenu()
    hidePollPresetNamer()
    const choice = el('poll-preset-choice')
    if (choice) choice.classList.add('hidden')
    setPollPresetHint('')
    if (preset === BUILTIN_PRESET_ID) {
      pollSelectedPresetId = BUILTIN_PRESET_ID
      pollPresetBaseline = designSignature(DEFAULT_POLL_DESIGN)
      applyPollDesign(DEFAULT_POLL_DESIGN)
    } else {
      pollSelectedPresetId = preset.id
      pollPresetBaseline = designSignature(preset.style)
      applyPollDesign(preset.style)
    }
    renderPollPresetStrip()
  }

  const makePresetThumb = (style) => {
    const design = { ...DEFAULT_POLL_DESIGN, ...(style || {}) }
    const thumb = document.createElement('div')
    thumb.className = 'preset-thumb'
    if (design.orientation === 'vertical') thumb.classList.add('vertical')
    thumb.style.setProperty('--pt-panel', design.panelColor)
    thumb.style.setProperty('--pt-border', design.borderColor)
    thumb.style.setProperty('--pt-bar', design.barColor)
    thumb.style.setProperty('--pt-accent', design.accentColor)
    thumb.style.setProperty('--pt-text', design.textColor)
    const q = document.createElement('div')
    q.className = 'pt-q'
    thumb.appendChild(q)
    const bars = document.createElement('div')
    bars.className = 'pt-bars'
    ;[72, 45, 24].forEach((fill) => {
      const bar = document.createElement('div')
      bar.className = 'pt-bar'
      bar.style.setProperty('--pt-fill', `${fill}%`)
      const inner = document.createElement('i')
      bar.appendChild(inner)
      bars.appendChild(bar)
    })
    thumb.appendChild(bars)
    return thumb
  }

  const pollDesignEdited = () =>
    pollPresetBaseline !== null && designSignature(readPollDesign()) !== pollPresetBaseline

  const renderPollPresetStrip = () => {
    const strip = el('poll-preset-strip')
    if (!strip) return
    strip.innerHTML = ''
    if (!pollPresetState.loaded) {
      for (let index = 0; index < 2; index += 1) {
        const skeleton = document.createElement('div')
        skeleton.className = 'preset-skeleton'
        skeleton.setAttribute('aria-hidden', 'true')
        strip.appendChild(skeleton)
      }
      return
    }

    const addCard = (options) => {
      const card = document.createElement('div')
      card.className = 'preset-card'
      card.tabIndex = 0
      card.setAttribute('role', 'button')
      const selected = options.selected
      if (selected) card.classList.add('selected')
      card.setAttribute('aria-pressed', selected ? 'true' : 'false')
      if (options.chip) {
        const chip = document.createElement('span')
        chip.className = `preset-chip${options.chip === 'Edited' ? ' edited' : ''}`
        chip.textContent = options.chip
        card.appendChild(chip)
      }
      card.appendChild(makePresetThumb(options.style))
      const footer = document.createElement('div')
      footer.className = 'preset-card-footer'
      const name = document.createElement('span')
      name.className = 'preset-card-name'
      name.textContent = options.name
      name.title = options.name
      footer.appendChild(name)
      if (selected) {
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        check.setAttribute('viewBox', '0 0 24 24')
        check.setAttribute('fill', 'none')
        check.setAttribute('stroke', 'currentColor')
        check.setAttribute('stroke-width', '3')
        check.setAttribute('stroke-linecap', 'round')
        check.setAttribute('stroke-linejoin', 'round')
        check.setAttribute('class', 'preset-card-check')
        check.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', 'M20 6 9 17l-5-5')
        check.appendChild(path)
        footer.appendChild(check)
      }
      if (options.onMenu) {
        const menuButton = document.createElement('button')
        menuButton.type = 'button'
        menuButton.className = 'preset-menu-btn'
        menuButton.title = 'Design options'
        menuButton.setAttribute('aria-label', `Options for ${options.name}`)
        menuButton.innerHTML =
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
        menuButton.addEventListener('click', (event) => {
          event.stopPropagation()
          if (presetMenuEl) {
            closePresetMenu()
            return
          }
          options.onMenu(menuButton)
        })
        footer.appendChild(menuButton)
      }
      card.appendChild(footer)
      card.addEventListener('click', options.onSelect)
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          options.onSelect()
        }
      })
      strip.appendChild(card)
    }

    const edited = pollDesignEdited()
    addCard({
      name: 'Standard',
      style: DEFAULT_POLL_DESIGN,
      selected: pollSelectedPresetId === BUILTIN_PRESET_ID,
      chip:
        pollSelectedPresetId === BUILTIN_PRESET_ID && edited ? 'Edited' : null,
      onSelect: () => selectPollPreset(BUILTIN_PRESET_ID)
    })
    pollPresetState.presets.forEach((preset) => {
      const selected = pollSelectedPresetId === preset.id
      addCard({
        name: preset.name,
        style: preset.style,
        selected,
        chip:
          selected && edited
            ? 'Edited'
            : pollPresetState.defaultId === preset.id
              ? 'Default'
              : null,
        onSelect: () => selectPollPreset(preset),
        onMenu: (anchor) => openPresetMenu(preset, anchor)
      })
    })

    if (pollPresetState.presets.length === 0) {
      /** Teach the flow, but never stomp on live feedback ("Design
       * deleted.", "Design copied…") — only fill an empty hint. */
      const hint = el('poll-preset-hint')
      if (hint && !hint.textContent) {
        setPollPresetHint(
          'No saved designs yet. Style the widget below, then save it here.'
        )
      }
    }
  }

  const updatePollPresetUi = () => {
    const saveButton = el('poll-preset-save')
    if (saveButton) {
      saveButton.disabled = !pollPresetState.loaded || pollPendingAction !== null
    }
    const copyButton = el('poll-preset-copy')
    if (copyButton) {
      copyButton.disabled = pollPendingAction !== null
    }
    renderPollPresetStrip()
  }

  const selectedPollPreset = () =>
    pollPresetState.presets.find((preset) => preset.id === pollSelectedPresetId) || null

  const handlePollPresetSave = () => {
    setPollPresetHint('')
    hidePollPresetNamer()
    const selected = selectedPollPreset()
    const choice = el('poll-preset-choice')
    if (selected && pollDesignEdited() && choice) {
      const text = el('poll-preset-choice-text')
      if (text) {
        text.textContent = `Update "${selected.name}" with the current style?`
      }
      choice.classList.remove('hidden')
      return
    }
    if (choice) choice.classList.add('hidden')
    showPollPresetNamer('new', '')
  }

  const submitPollPresetName = () => {
    const input = el('poll-preset-name')
    const name = input ? input.value.trim() : ''
    if (!name) {
      setPollPresetHint('Give the design a name.', true)
      return
    }
    if (pollNamerMode && pollNamerMode.indexOf('rename:') === 0) {
      const id = pollNamerMode.slice('rename:'.length)
      const preset = pollPresetState.presets.find((entry) => entry.id === id)
      if (preset) {
        sendPresetMessage(
          {
            type: 'save-widget-preset',
            kind: 'poll',
            preset: { id, name, style: preset.style }
          },
          'rename'
        )
      }
    } else {
      sendPresetMessage(
        {
          type: 'save-widget-preset',
          kind: 'poll',
          preset: { name, style: readPollDesign() }
        },
        'save'
      )
    }
    hidePollPresetNamer()
  }

  const handlePollPresetsMessage = (message) => {
    const firstLoad = !pollPresetState.loaded
    pollPresetState = {
      loaded: true,
      presets: Array.isArray(message.presets) ? message.presets : [],
      defaultId: typeof message.defaultId === 'string' ? message.defaultId : null
    }
    const action = pollPendingAction
    pollPendingAction = null

    if (action === 'save' && message.savedId) {
      pollSelectedPresetId = message.savedId
      pollPresetBaseline = designSignature(readPollDesign())
      setPollPresetHint(
        message.synced
          ? 'Design saved to your account.'
          : 'Design saved on this device. Sign in to the Prezo panel to sync it to your account.'
      )
    } else if (action === 'rename') {
      setPollPresetHint('Design renamed.')
    } else if (action === 'delete') {
      if (!pollPresetState.presets.some((entry) => entry.id === pollSelectedPresetId)) {
        /** The controls keep the deleted design; it's simply unsaved now. */
        if (
          pollSelectedPresetId !== BUILTIN_PRESET_ID &&
          pollSelectedPresetId !== null
        ) {
          pollSelectedPresetId = null
          pollPresetBaseline = null
        }
      }
      setPollPresetHint('Design deleted.')
    } else if (action === 'default') {
      setPollPresetHint(
        pollPresetState.defaultId
          ? 'New poll widgets will start from this design.'
          : 'New poll widgets will start from the standard design.'
      )
    }

    if (firstLoad) {
      /** Open with the user's chosen default design — but never clobber
       * controls they already touched while presets were loading. */
      if (!pollControlsTouched && !pollDefaultApplied && pollPresetState.defaultId) {
        const preset = pollPresetState.presets.find(
          (entry) => entry.id === pollPresetState.defaultId
        )
        if (preset) {
          pollDefaultApplied = true
          pollSelectedPresetId = preset.id
          pollPresetBaseline = designSignature(preset.style)
          applyPollDesign(preset.style)
        }
      }
    }
    updatePollPresetUi()
  }

  const showView = (view) => {
    closePresetMenu()
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
      family.setStatus('')
      setRemoveBusy(key, true)
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
      /** Preset bookkeeping: hand edits mark the selection "Edited" and
       * block the auto-apply of the default preset at load. */
      input.addEventListener('input', () => {
        pollControlsTouched = true
        updatePollPresetUi()
      })
    })

    if (el('poll-preset-save')) {
      el('poll-preset-save').addEventListener('click', handlePollPresetSave)
    }
    if (el('poll-preset-copy')) {
      el('poll-preset-copy').addEventListener('click', () => {
        setPollPresetHint('')
        hidePollPresetNamer()
        sendPresetMessage({ type: 'request-slide-widget-style', kind: 'poll' }, 'copy')
      })
    }
    if (el('poll-preset-choice-update')) {
      el('poll-preset-choice-update').addEventListener('click', () => {
        const choice = el('poll-preset-choice')
        if (choice) choice.classList.add('hidden')
        const selected = selectedPollPreset()
        if (selected) {
          sendPresetMessage(
            {
              type: 'save-widget-preset',
              kind: 'poll',
              preset: { id: selected.id, name: selected.name, style: readPollDesign() }
            },
            'save'
          )
        }
      })
    }
    if (el('poll-preset-choice-new')) {
      el('poll-preset-choice-new').addEventListener('click', () => {
        const choice = el('poll-preset-choice')
        if (choice) choice.classList.add('hidden')
        showPollPresetNamer('new', '')
      })
    }
    if (el('poll-preset-choice-cancel')) {
      el('poll-preset-choice-cancel').addEventListener('click', () => {
        const choice = el('poll-preset-choice')
        if (choice) choice.classList.add('hidden')
      })
    }
    if (el('poll-preset-name-save')) {
      el('poll-preset-name-save').addEventListener('click', submitPollPresetName)
    }
    if (el('poll-preset-name')) {
      el('poll-preset-name').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          submitPollPresetName()
        } else if (event.key === 'Escape') {
          hidePollPresetNamer()
        }
      })
    }
    if (el('poll-preset-name-cancel')) {
      el('poll-preset-name-cancel').addEventListener('click', hidePollPresetNamer)
    }
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
        } else if (message && message.type === 'widget-presets') {
          if (message.kind === 'poll') {
            handlePollPresetsMessage(message)
          }
        } else if (message && message.type === 'slide-widget-style') {
          if (message.kind === 'poll') {
            pollPendingAction = null
            /** Copied designs arrive unselected: the controls now hold a
             * design that exists on a slide but not in the library. */
            pollSelectedPresetId = null
            pollPresetBaseline = null
            applyPollDesign(message.style)
            setPollPresetHint('Design copied from the selected slide. Save design to keep it.')
            updatePollPresetUi()
          }
        } else if (message && message.type === 'widget-preset-error') {
          if (message.kind === 'poll') {
            pollPendingAction = null
            setPollPresetHint(message.message || 'Something went wrong with saved designs.', true)
            updatePollPresetUi()
          }
        } else if (message && message.type === 'confirm-replace') {
          const key = familyFromSource(message.source)
          families[key].setStatus('')
          families[key].setBusy(false)
          showConfirm(key, 'replace')
        } else if (message && message.type === 'removed') {
          const key = familyFromSource(message.source)
          families[key].setStatus('')
          families[key].setBusy(false)
          setRemoveBusy(key, false)
        } else if (message && message.type === 'error') {
          if (message.source === 'game') {
            setGameStatus('')
            setGameError(message.message || 'Failed to insert the game slide.')
            setGameBusy(false)
          } else if (message.source === 'poll') {
            setPollStatus('')
            setPollError(message.message || 'Failed to insert poll widget.')
            setPollBusy(false)
            setRemoveBusy('poll', false)
          } else if (message.source === 'discussion') {
            setDiscussionStatus('')
            setDiscussionError(
              message.message || 'Failed to insert open discussion widget.'
            )
            setDiscussionBusy(false)
            setRemoveBusy('discussion', false)
          } else {
            setStatus('')
            setError(message.message || 'Failed to insert widget.')
            setBusy(false)
            setRemoveBusy('qna', false)
          }
        }
      }
    )

    updatePreview()
    updateDiscussionPreview()
    updatePollPreview()
    updatePollLinkHint()
    pollPresetBaseline = designSignature(DEFAULT_POLL_DESIGN)
    updatePollPresetUi()
    renderDebug()

    /** Saved designs load once per dialog open (the handler above is
     * already registered, so the response can't race past us). */
    try {
      Office.context.ui.messageParent(
        JSON.stringify({ type: 'request-widget-presets', kind: 'poll' })
      )
    } catch {
      // Opened outside a dialog host — the strip keeps its skeleton state.
    }

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

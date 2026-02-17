/* global Office */
(() => {
  document.title = 'Prezo Widget'
  const el = (id) => document.getElementById(id)
  const selectView = () => el('view-select')
  const qnaView = () => el('view-qna')
  const pollView = () => el('view-poll')
  const openQnaButton = () => el('open-qna')
  const backQnaButton = () => el('back-qna')
  const insertQnaButton = () => el('insert-qna')
  const openPollButton = () => el('open-poll')
  const backPollButton = () => el('back-poll')
  const insertPollButton = () => el('insert-poll')
  const statusEl = () => el('status')
  const errorEl = () => el('error')
  const pollStatusEl = () => el('poll-status')
  const pollErrorEl = () => el('poll-error')
  const debugEl = () => el('debug')
  const pollDebugEl = () => el('poll-debug')
  const previewEl = () => el('qna-preview')
  const pollPreviewEl = () => el('poll-preview')
  const qnaModeInput = () => el('qna-mode')
  const qnaPromptInput = () => el('qna-prompt')
  const qnaPromptField = () => el('qna-prompt-field')
  const qnaModeHint = () => el('qna-mode-hint')
  const qnaPreviewEyebrow = () => el('qna-preview-eyebrow')
  const qnaPreviewTitle = () => el('qna-preview-title')
  const qnaPreviewBadge = () => el('qna-preview-badge')

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
  const pollInputs = {
    font: () => el('poll-font'),
    text: () => el('poll-text'),
    muted: () => el('poll-muted'),
    accent: () => el('poll-accent'),
    panel: () => el('poll-panel'),
    bar: () => el('poll-bar'),
    border: () => el('poll-border'),
    shadow: () => el('poll-shadow'),
    spacing: () => el('poll-spacing'),
    width: () => el('poll-width'),
    orientation: () => el('poll-orientation'),
    max: () => el('poll-max')
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

  const setPollStatus = (text) => {
    if (pollStatusEl()) pollStatusEl().textContent = text || ''
  }

  const setPollError = (text) => {
    if (pollErrorEl()) pollErrorEl().textContent = text || ''
  }

  const setBusy = (busy) => {
    const btn = insertQnaButton()
    if (!btn) return
    btn.disabled = busy
    btn.textContent = busy ? 'Inserting...' : 'Insert widget'
  }

  const setPollBusy = (busy) => {
    const btn = insertPollButton()
    if (!btn) return
    btn.disabled = busy
    btn.textContent = busy ? 'Inserting...' : 'Insert poll'
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

  const readQnaMode = () => ({
    mode: qnaModeInput()?.value || 'audience',
    prompt: (qnaPromptInput()?.value || '').trim()
  })

  const updateModePreview = () => {
    const { mode, prompt } = readQnaMode()
    const isPrompt = mode === 'prompt'
    if (qnaPromptField()) {
      qnaPromptField().style.display = isPrompt ? 'flex' : 'none'
    }
    if (qnaModeHint()) {
      qnaModeHint().textContent = isPrompt
        ? 'Audience submits answers and votes on the best ones.'
        : 'Audience submits questions that you can approve and upvote.'
    }
    if (qnaPreviewEyebrow()) {
      qnaPreviewEyebrow().textContent = isPrompt ? 'PREZO LIVE PROMPT' : 'PREZO LIVE Q&A'
    }
    if (qnaPreviewTitle()) {
      qnaPreviewTitle().textContent = isPrompt ? (prompt || 'Audience answers') : 'Questions from your audience'
    }
    if (qnaPreviewBadge()) {
      qnaPreviewBadge().textContent = isPrompt ? 'Answers 2' : 'Pending 2'
    }
  }

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

    updateModePreview()
  }

  const readPollConfig = () => ({
    fontFamily: (pollInputs.font()?.value || '').trim() || null,
    textColor: pollInputs.text()?.value || '#0f172a',
    mutedColor: pollInputs.muted()?.value || '#64748b',
    accentColor: pollInputs.accent()?.value || '#2563eb',
    panelColor: pollInputs.panel()?.value || '#ffffff',
    barColor: pollInputs.bar()?.value || '#e2e8f0',
    borderColor: pollInputs.border()?.value || '#e2e8f0',
    shadowOpacity: clamp(parseFloat(pollInputs.shadow()?.value || '0.35'), 0, 0.6),
    spacingScale: clamp(parseFloat(pollInputs.spacing()?.value || '1'), 0.8, 1.3),
    barThicknessScale: clamp(parseFloat(pollInputs.width()?.value || '1'), 0.4, 2),
    orientation: pollInputs.orientation()?.value || 'horizontal',
    maxOptions: clamp(parseInt(pollInputs.max()?.value || '5', 10), 2, 5)
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
    preview.style.setProperty('--shadow-alpha', config.shadowOpacity.toString())
    preview.style.setProperty('--spacing', config.spacingScale.toString())
    preview.style.setProperty('--bar-thickness', config.barThicknessScale.toString())
    preview.style.setProperty(
      '--font-family',
      config.fontFamily ? `'${config.fontFamily}', 'Sora', sans-serif` : `'Sora', sans-serif`
    )
    preview.classList.toggle('preview-vertical', config.orientation === 'vertical')

    const items = preview.querySelectorAll('.preview-poll-option')
    items.forEach((item, index) => {
      item.style.display = index < config.maxOptions ? 'flex' : 'none'
    })
  }

  const showView = (view) => {
    if (selectView()) selectView().classList.add('hidden')
    if (qnaView()) qnaView().classList.add('hidden')
    if (pollView()) pollView().classList.add('hidden')
    if (view === 'qna' && qnaView()) {
      qnaView().classList.remove('hidden')
      updatePreview()
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

  const sendInsert = () => {
    setError('')
    const qna = readQnaMode()
    if (qna.mode === 'prompt' && !qna.prompt) {
      setError('Enter a prompt question to use prompt mode.')
      return
    }
    setStatus('Sending request...')
    setBusy(true)
    Office.context.ui.messageParent(
      JSON.stringify({ type: 'insert-qna', style: readQnaConfig(), qna })
    )
  }

  const sendPollInsert = () => {
    setPollError('')
    setPollStatus('Sending request...')
    setPollBusy(true)
    Office.context.ui.messageParent(
      JSON.stringify({ type: 'insert-poll', style: readPollConfig() })
    )
  }

  Office.onReady(() => {
    if (openQnaButton()) {
      openQnaButton().addEventListener('click', () => showView('qna'))
    }
    if (backQnaButton()) {
      backQnaButton().addEventListener('click', () => showView('select'))
    }
    if (openPollButton()) {
      openPollButton().addEventListener('click', () => showView('poll'))
    }
    if (backPollButton()) {
      backPollButton().addEventListener('click', () => showView('select'))
    }
    if (insertQnaButton()) {
      insertQnaButton().addEventListener('click', sendInsert)
    }
    if (insertPollButton()) {
      insertPollButton().addEventListener('click', sendPollInsert)
    }

    Object.values(qnaInputs).forEach((getter) => {
      const input = getter()
      if (!input) return
      input.addEventListener('input', updatePreview)
      input.addEventListener('change', updatePreview)
    })
    if (qnaModeInput()) {
      qnaModeInput().addEventListener('change', updatePreview)
    }
    if (qnaPromptInput()) {
      qnaPromptInput().addEventListener('input', updatePreview)
      qnaPromptInput().addEventListener('change', updatePreview)
    }
    Object.values(pollInputs).forEach((getter) => {
      const input = getter()
      if (!input) return
      input.addEventListener('input', updatePollPreview)
      input.addEventListener('change', updatePollPreview)
    })

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
          setStatus('Widget inserted.')
          setBusy(false)
        } else if (message && message.type === 'poll-inserted') {
          setPollStatus('Poll widget inserted.')
          setPollBusy(false)
        } else if (message && message.type === 'error') {
          if (message.source === 'poll') {
            setPollStatus('')
            setPollError(message.message || 'Failed to insert poll widget.')
            setPollBusy(false)
          } else {
            setStatus('')
            setError(message.message || 'Failed to insert widget.')
            setBusy(false)
          }
        }
      }
    )

    updatePreview()
    updatePollPreview()
    renderDebug()
  })
})()

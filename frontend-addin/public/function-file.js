/* global Office, PowerPoint */
(() => {
  const DIALOG_URL = `${window.location.origin}/widget-dialog/`
  const PREZO_NAMESPACE = 'https://prezo.app/session-binding'
  const WIDGET_TAG = 'PrezoWidget'
  const SESSION_TAG = 'PrezoWidgetSessionId'
  const SHAPES_TAG = 'PrezoWidgetShapeIds'
  const WIDGET_PENDING_TAG = 'PrezoWidgetPending'
  const WIDGET_STYLE_TAG = 'PrezoWidgetStyle'
  const LEGACY_QNA_MODE_TAG = 'PrezoWidgetQnaMode'
  const LEGACY_QNA_PROMPT_TAG = 'PrezoWidgetQnaPrompt'
  const QNA_PROMPT_BINDING_TAG = 'PrezoWidgetPromptId'
  const DISCUSSION_WIDGET_TAG = 'PrezoDiscussionWidget'
  const DISCUSSION_SESSION_TAG = 'PrezoDiscussionWidgetSessionId'
  const DISCUSSION_SHAPES_TAG = 'PrezoDiscussionWidgetShapeIds'
  const DISCUSSION_PENDING_TAG = 'PrezoDiscussionWidgetPending'
  const DISCUSSION_STYLE_TAG = 'PrezoDiscussionWidgetStyle'
  const DISCUSSION_PROMPT_BINDING_TAG = 'PrezoDiscussionWidgetPromptId'
  const POLL_WIDGET_TAG = 'PrezoPollWidget'
  const POLL_SESSION_TAG = 'PrezoPollWidgetSessionId'
  const POLL_SHAPES_TAG = 'PrezoPollWidgetShapeIds'
  const POLL_PENDING_TAG = 'PrezoPollWidgetPending'
  const POLL_STYLE_TAG = 'PrezoPollWidgetStyle'
  const POLL_BINDING_TAG = 'PrezoPollWidgetPollId'
  const DEFAULT_API_BASE_URL = 'http://localhost:8000'
  const MAX_QNA_ITEMS = 4
  const MAX_POLL_OPTIONS = 5
  const PANEL_TITLE = 'Questions from your audience'
  const PROMPT_PANEL_TITLE = 'Audience answers'
  const EYEBROW_TEXT = 'PREZO LIVE Q&A'
  const PROMPT_EYEBROW_TEXT = 'PREZO LIVE PROMPT'
  const DISCUSSION_PANEL_TITLE = 'Open discussion'
  const DISCUSSION_EYEBROW_TEXT = 'PREZO OPEN DISCUSSION'
  const DISCUSSION_EMPTY_BODY = 'Select a prompt to show answers.'
  const PLACEHOLDER_SUBTITLE = 'Connect a Prezo session to go live.'
  const PLACEHOLDER_BODY = 'Connect a Prezo session to populate this slide.'

  /** Serialize PowerPoint batches — overlapping runs often throw RichApi GeneralException on Win32. */
  let pptRunTail = Promise.resolve()
  const runPowerPoint = (batch) => {
    const job = pptRunTail.then(() => PowerPoint.run(batch))
    pptRunTail = job.then(
      () => undefined,
      () => undefined
    )
    return job
  }

  let activeDialog = null
  const addinDebug = {
    insertMessage: '',
    openMessage: '',
    openAt: ''
  }

  const updateDebugState = (next) => {
    try {
      const current = sessionStorage.getItem('prezo-widget-debug')
      const parsed = current ? JSON.parse(current) : {}
      const merged = { ...parsed, ...next }
      sessionStorage.setItem('prezo-widget-debug', JSON.stringify(merged))
    } catch {
      // ignore storage failures
    }
  }

  const parseBinding = (xml) => {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xml, 'application/xml')
      const sessionNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'sessionId')[0]
      if (!sessionNode || !sessionNode.textContent) {
        return null
      }
      const codeNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'code')[0]
      const apiBaseNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'apiBaseUrl')[0]
      const joinUrlNode = doc.getElementsByTagNameNS(PREZO_NAMESPACE, 'joinUrl')[0]
      return {
        sessionId: sessionNode.textContent,
        code: codeNode ? codeNode.textContent : null,
        apiBaseUrl: apiBaseNode ? apiBaseNode.textContent : null,
        joinUrl: joinUrlNode ? joinUrlNode.textContent : null
      }
    } catch {
      return null
    }
  }

  const getBinding = () =>
    runPowerPoint(async (context) => {
      const parts = context.presentation.customXmlParts.getByNamespace(PREZO_NAMESPACE)
      parts.load('items')
      await context.sync()
      if (!parts.items.length) {
        return null
      }
      const xmlResult = parts.items[0].getXml()
      await context.sync()
      return parseBinding(xmlResult.value)
    })

  const buildTitle = (code, mode, prompt) => {
    if (mode === 'prompt') {
      const safePrompt = prompt && String(prompt).trim()
      return safePrompt || PROMPT_PANEL_TITLE
    }
    return code ? `Prezo Live Q&A • ${code}` : 'Prezo Live Q&A'
  }
  const buildMeta = (code) =>
    code ? `Join code ${code}` : 'Waiting for new questions.'
  const buildBadge = (pendingCount, approvedCount, mode) =>
    mode === 'prompt' ? `Answers ${approvedCount}` : `Pending ${pendingCount}`
  const buildDiscussionTitle = (code, prompt) => {
    const safePrompt = prompt && String(prompt).trim()
    if (safePrompt) {
      return safePrompt
    }
    return code ? `Open discussion • ${code}` : DISCUSSION_PANEL_TITLE
  }
  const DEFAULT_QNA_STYLE = {
    fontFamily: null,
    textColor: '#0f172a',
    mutedColor: '#64748b',
    accentColor: '#2563eb',
    panelColor: '#ffffff',
    cardColor: '#f8fafc',
    borderColor: '#e2e8f0',
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.4,
    spacingScale: 1,
    maxQuestions: 3
  }
  const DEFAULT_POLL_STYLE = {
    fontFamily: null,
    textColor: '#0f172a',
    mutedColor: '#64748b',
    accentColor: '#2563eb',
    panelColor: '#ffffff',
    barColor: '#e2e8f0',
    borderColor: '#e2e8f0',
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.35,
    spacingScale: 1,
    orientation: 'horizontal',
    barThicknessScale: 1,
    maxOptions: 5
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
  const normalizeQnaStyle = (style) => {
    const next = { ...DEFAULT_QNA_STYLE, ...(style || {}) }
    return {
      ...next,
      fontFamily: next.fontFamily ? String(next.fontFamily) : null,
      textColor: next.textColor || DEFAULT_QNA_STYLE.textColor,
      mutedColor: next.mutedColor || DEFAULT_QNA_STYLE.mutedColor,
      accentColor: next.accentColor || DEFAULT_QNA_STYLE.accentColor,
      panelColor: next.panelColor || DEFAULT_QNA_STYLE.panelColor,
      cardColor: next.cardColor || DEFAULT_QNA_STYLE.cardColor,
      borderColor: next.borderColor || DEFAULT_QNA_STYLE.borderColor,
      shadowColor: next.shadowColor || DEFAULT_QNA_STYLE.shadowColor,
      shadowOpacity: clamp(Number(next.shadowOpacity ?? DEFAULT_QNA_STYLE.shadowOpacity), 0, 0.8),
      spacingScale: clamp(Number(next.spacingScale ?? DEFAULT_QNA_STYLE.spacingScale), 0.8, 1.3),
      maxQuestions: clamp(Math.round(Number(next.maxQuestions ?? DEFAULT_QNA_STYLE.maxQuestions)), 1, 5)
    }
  }
  const normalizePollStyle = (style) => {
    const next = { ...DEFAULT_POLL_STYLE, ...(style || {}) }
    const legacyWidth =
      style && style.barWidthScale !== undefined ? style.barWidthScale : style?.widthScale
    const barThickness =
      next.barThicknessScale ?? legacyWidth ?? DEFAULT_POLL_STYLE.barThicknessScale
    const orientation =
      next.orientation === 'vertical'
        ? next.orientation
        : 'horizontal'
    return {
      ...next,
      fontFamily: next.fontFamily ? String(next.fontFamily) : null,
      textColor: next.textColor || DEFAULT_POLL_STYLE.textColor,
      mutedColor: next.mutedColor || DEFAULT_POLL_STYLE.mutedColor,
      accentColor: next.accentColor || DEFAULT_POLL_STYLE.accentColor,
      panelColor: next.panelColor || DEFAULT_POLL_STYLE.panelColor,
      barColor: next.barColor || DEFAULT_POLL_STYLE.barColor,
      borderColor: next.borderColor || DEFAULT_POLL_STYLE.borderColor,
      shadowColor: next.shadowColor || next.borderColor || DEFAULT_POLL_STYLE.shadowColor,
      shadowOpacity: clamp(Number(next.shadowOpacity ?? DEFAULT_POLL_STYLE.shadowOpacity), 0, 0.8),
      spacingScale: clamp(Number(next.spacingScale ?? DEFAULT_POLL_STYLE.spacingScale), 0.8, 1.3),
      orientation,
      barThicknessScale: clamp(Number(barThickness), 0.4, 2),
      maxOptions: clamp(Math.round(Number(next.maxOptions ?? DEFAULT_POLL_STYLE.maxOptions)), 1, 5)
    }
  }
  const badgeFillFor = (style) => lighten(style.accentColor, 0.82)
  const applyFont = (target, style, options) => {
    const font = target && target.font ? target.font : target
    const next = options || {}
    if (style.fontFamily) {
      font.name = style.fontFamily
    }
    if (next.size) {
      font.size = next.size
    }
    if (next.bold !== undefined) {
      font.bold = next.bold
    }
    if (next.color) {
      font.color = next.color
    }
  }
  const buildPollTitle = (code) => (code ? `Prezo Poll • ${code}` : 'Prezo Poll')
  /** Session join QR square (points) in the poll widget's top-right corner. */
  const POLL_QR_SIZE = 76
  const resolveApiBaseUrl = (binding) =>
    (binding && binding.apiBaseUrl) || window.PREZO_API_BASE_URL || DEFAULT_API_BASE_URL

  const resolveQnaMode = (qna) => {
    const mode = qna && qna.mode === 'prompt' ? 'prompt' : 'audience'
    const prompt = qna && typeof qna.prompt === 'string' ? qna.prompt.trim() : ''
    return { mode, prompt }
  }

  const getSupabaseAccessToken = () => {
    try {
      if (!window.localStorage) return null
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) {
          continue
        }
        const raw = localStorage.getItem(key)
        if (!raw) continue
        try {
          const data = JSON.parse(raw)
          const token =
            data && (data.access_token || (data.currentSession && data.currentSession.access_token))
          if (token) {
            return token
          }
        } catch {
          // ignore JSON parse errors
        }
      }
    } catch {
      return null
    }
    return null
  }

  /**
   * The taskpane mirrors its live session id into localStorage (written by
   * persistHostSession in App.tsx — sessionStorage is per-webview, so this
   * is the only signal that crosses into this runtime). The deck's session
   * binding is deliberately persistent so widgets keep rendering after
   * panel navigation; the Linked poll picker, though, should only offer
   * polls while the panel actually has the session live.
   */
  const getLiveHostSessionId = () => {
    try {
      return window.localStorage ? localStorage.getItem('prezo.hostLiveSessionId') : null
    } catch {
      return null
    }
  }

  const updateQnaConfig = async (binding, qna) => {
    if (!binding || !binding.sessionId || !qna) {
      return null
    }
    const { mode, prompt } = resolveQnaMode(qna)
    if (mode === 'prompt' && !prompt) {
      throw new Error('Enter a prompt question to use prompt mode.')
    }
    const token = getSupabaseAccessToken()
    if (!token) {
      throw new Error('Sign in to update Q&A mode.')
    }
    const apiBaseUrl = resolveApiBaseUrl(binding)
    const response = await fetch(
      `${apiBaseUrl}/sessions/${encodeURIComponent(binding.sessionId)}/qna/config`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mode, prompt: mode === 'prompt' ? prompt : null })
      }
    )
    if (!response.ok) {
      let detail = `Request failed (${response.status})`
      try {
        const body = await response.json()
        if (body && body.detail) {
          detail = body.detail
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(detail)
    }
    return response.json()
  }

  const buildBody = (questions, mode) => {
    const approved = (questions || []).filter((question) => question.status === 'approved')
    if (approved.length === 0) {
      return mode === 'prompt' ? 'No answers yet.' : 'No approved questions yet.'
    }
    const sorted =
      mode === 'prompt' ? [...approved].sort((a, b) => b.votes - a.votes) : approved
    return sorted
      .slice(0, 6)
      .map((question, index) => `${index + 1}. ${question.text}`)
      .join('\n')
  }

  /** Mirrors src/office/widgetShapes.ts: unbound poll widgets never
   * auto-follow a poll — they hold this placeholder until the host binds
   * one from the poll card. Keep the wording in sync with the taskpane. */
  const POLL_BIND_PLACEHOLDER = 'Link this widget to a poll from the Prezo panel.'

  const buildPollQuestion = (poll) => {
    if (!poll) {
      return 'No polls yet.'
    }
    const prefix = poll.status === 'open' ? 'Live poll' : 'Poll'
    return `${prefix}: ${poll.question}`
  }

  const buildPollOptions = (poll) => {
    if (!poll) {
      return []
    }
    const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0)
    return poll.options.map((option) => {
      const ratio = totalVotes > 0 ? option.votes / totalVotes : 0
      const percent = Math.round(ratio * 100)
      return {
        label: `${option.label} (${option.votes}) • ${percent}%`,
        ratio
      }
    })
  }

  const fetchSnapshot = async (binding) => {
    const apiBaseUrl = resolveApiBaseUrl(binding)
    const response = await fetch(
      `${apiBaseUrl}/sessions/${encodeURIComponent(binding.sessionId)}/snapshot`
    )
    if (!response.ok) {
      let detail = `Request failed (${response.status})`
      try {
        const body = await response.json()
        if (body && body.detail) {
          detail = body.detail
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(detail)
    }
    return response.json()
  }

  const updateQnaWidget = async (sessionId, code, questions, prompts) => {
    const promptMap = new Map((prompts || []).map((entry) => [entry.id, entry]))
    await runPowerPoint(async (context) => {
      const slides = context.presentation.slides
      slides.load('items')
      await context.sync()

      const slideInfos = slides.items.map((slide) => {
        const sessionTag = slide.tags.getItemOrNullObject(SESSION_TAG)
        const pendingTag = slide.tags.getItemOrNullObject(WIDGET_PENDING_TAG)
        const styleTag = slide.tags.getItemOrNullObject(WIDGET_STYLE_TAG)
        const shapeTag = slide.tags.getItemOrNullObject(SHAPES_TAG)
        const promptBindingTag = slide.tags.getItemOrNullObject(QNA_PROMPT_BINDING_TAG)
        sessionTag.load('value')
        pendingTag.load('value')
        styleTag.load('value')
        shapeTag.load('value')
        promptBindingTag.load('value')
        return { slide, sessionTag, pendingTag, styleTag, shapeTag, promptBindingTag }
      })

      await context.sync()

      for (const info of slideInfos) {
        const isPending =
          !info.pendingTag.isNullObject && info.pendingTag.value === 'true'
        if (!isPending && (info.sessionTag.isNullObject || info.sessionTag.value !== sessionId)) {
          continue
        }
        if (info.shapeTag.isNullObject || !info.shapeTag.value) {
          continue
        }

        let shapeIds = null
        try {
          shapeIds = JSON.parse(info.shapeTag.value)
        } catch {
          shapeIds = null
        }
        if (!shapeIds) {
          continue
        }

        let style = DEFAULT_QNA_STYLE
        let applyStyle = false
        if (!info.styleTag.isNullObject && info.styleTag.value) {
          try {
            const parsed = JSON.parse(info.styleTag.value)
            style = normalizeQnaStyle(parsed)
            applyStyle = Boolean(parsed.lockStyle)
          } catch {
            style = DEFAULT_QNA_STYLE
          }
        }

        const containerShape = shapeIds.container
          ? info.slide.shapes.getItemOrNullObject(shapeIds.container)
          : null
        const shadowShape = shapeIds.shadow
          ? info.slide.shapes.getItemOrNullObject(shapeIds.shadow)
          : null
        const title = shapeIds.title
          ? info.slide.shapes.getItemOrNullObject(shapeIds.title)
          : null
        const body = shapeIds.body
          ? info.slide.shapes.getItemOrNullObject(shapeIds.body)
          : null
        const subtitle = shapeIds.subtitle
          ? info.slide.shapes.getItemOrNullObject(shapeIds.subtitle)
          : null
        const meta = shapeIds.meta ? info.slide.shapes.getItemOrNullObject(shapeIds.meta) : null
        const badge = shapeIds.badge
          ? info.slide.shapes.getItemOrNullObject(shapeIds.badge)
          : null
        const counterShape = shapeIds.counter
          ? info.slide.shapes.getItemOrNullObject(shapeIds.counter)
          : null
        const itemShapes = (shapeIds.items || []).map((item) => {
          const container = info.slide.shapes.getItemOrNullObject(item.container)
          const text = info.slide.shapes.getItemOrNullObject(item.text)
          const votes = info.slide.shapes.getItemOrNullObject(item.votes)
          container.load('id')
          text.load('id')
          votes.load('id')
          return { container, text, votes }
        })
        if (containerShape) containerShape.load('id')
        if (shadowShape) shadowShape.load('id')
        if (title) title.load('id')
        if (body) body.load('id')
        if (subtitle) subtitle.load('id')
        if (meta) meta.load('id')
        if (badge) badge.load('id')
        if (counterShape) counterShape.load('id')
        await context.sync()

        if (applyStyle) {
          if (shadowShape && !shadowShape.isNullObject) {
            shadowShape.fill.setSolidColor(style.shadowColor)
            shadowShape.fill.transparency = style.shadowOpacity
            shadowShape.lineFormat.visible = false
          }
          if (containerShape && !containerShape.isNullObject) {
            containerShape.fill.setSolidColor(style.panelColor)
            containerShape.lineFormat.color = style.borderColor
            containerShape.lineFormat.weight = 1
          }
          if (meta && !meta.isNullObject) {
            applyFont(meta.textFrame.textRange, style, { size: 11, color: style.mutedColor })
          }
          if (title && !title.isNullObject) {
            applyFont(title.textFrame.textRange, style, {
              size: 18,
              bold: true,
              color: style.textColor
            })
          }
          if (subtitle && !subtitle.isNullObject) {
            applyFont(subtitle.textFrame.textRange, style, { size: 13, color: style.mutedColor })
          }
          if (badge && !badge.isNullObject) {
            badge.fill.setSolidColor(badgeFillFor(style))
            badge.lineFormat.visible = false
            applyFont(badge.textFrame.textRange, style, {
              size: 11,
              bold: true,
              color: style.accentColor
            })
          }
          if (body && !body.isNullObject) {
            applyFont(body.textFrame.textRange, style, { size: 14, color: style.mutedColor })
          }
          itemShapes.forEach((item) => {
            if (item.container.isNullObject || item.text.isNullObject || item.votes.isNullObject) {
              return
            }
            item.container.fill.setSolidColor(style.cardColor)
            item.container.lineFormat.color = style.borderColor
            item.container.lineFormat.weight = 1
            applyFont(item.text.textFrame.textRange, style, {
              size: 14,
              color: style.textColor
            })
            applyFont(item.votes.textFrame.textRange, style, {
              size: 12,
              color: style.mutedColor
            })
          })
        }

        const boundPromptId =
          !info.promptBindingTag.isNullObject && info.promptBindingTag.value
            ? info.promptBindingTag.value.trim()
            : ''
        const boundPrompt = boundPromptId ? promptMap.get(boundPromptId) || null : null
        const resolvedMode = boundPromptId ? 'prompt' : 'audience'
        const filteredQuestions = boundPromptId
          ? (questions || []).filter((question) => question.prompt_id === boundPromptId)
          : (questions || []).filter((question) => !question.prompt_id)
        const pendingCount = filteredQuestions.filter((question) => question.status === 'pending')
          .length
        const approvedRaw = filteredQuestions.filter((question) => question.status === 'approved')
        const approved =
          resolvedMode === 'prompt'
            ? [...approvedRaw].sort((a, b) => b.votes - a.votes)
            : approvedRaw
        const bodyText = buildBody(filteredQuestions, resolvedMode)
        const promptTitle = boundPrompt && boundPrompt.prompt ? boundPrompt.prompt.trim() : ''
        const panelTitle =
          resolvedMode === 'prompt'
            ? promptTitle || (boundPromptId ? 'Prompt not found.' : PROMPT_PANEL_TITLE)
            : PANEL_TITLE
        if (title && !title.isNullObject) {
          const hasNewLayout = Boolean(
            (shapeIds.items && shapeIds.items.length > 0) ||
              shapeIds.subtitle ||
              shapeIds.meta ||
              shapeIds.badge
          )
          title.textFrame.textRange.text = hasNewLayout
            ? panelTitle
            : buildTitle(code, resolvedMode, promptTitle || null)
        }
        if (meta && !meta.isNullObject) {
          meta.textFrame.textRange.text =
            resolvedMode === 'prompt' ? PROMPT_EYEBROW_TEXT : EYEBROW_TEXT
        }
        if (subtitle && !subtitle.isNullObject) {
          subtitle.textFrame.textRange.text = buildMeta(code)
        }
        if (badge && !badge.isNullObject) {
          badge.textFrame.textRange.text = buildBadge(
            pendingCount,
            approved.length,
            resolvedMode
          )
        }
        await updateCounterShape(
          context,
          counterShape,
          filteredQuestions.length,
          'question',
          'questions'
        )
        if (itemShapes.length > 0) {
          const hasApproved = approved.length > 0
          if (body && !body.isNullObject) {
            body.textFrame.textRange.text = hasApproved
              ? ''
              : resolvedMode === 'prompt'
                ? 'No answers yet.'
                : 'No approved questions yet.'
          }
          itemShapes.forEach((item, index) => {
            if (item.container.isNullObject || item.text.isNullObject || item.votes.isNullObject) {
              return
            }
            const question = approved[index]
            if (!question) {
              item.container.fill.transparency = 1
              item.container.lineFormat.visible = false
              item.text.textFrame.textRange.text = ''
              item.votes.textFrame.textRange.text = ''
              return
            }
            item.container.fill.transparency = 0
            item.container.lineFormat.visible = true
            item.text.textFrame.textRange.text = question.text
            item.votes.textFrame.textRange.text = `${question.votes} votes`
          })
        } else if (body && !body.isNullObject) {
          body.textFrame.textRange.text = bodyText
        }

        if (isPending) {
          info.slide.tags.add(SESSION_TAG, sessionId)
          info.slide.tags.delete(WIDGET_PENDING_TAG)
        }
      }

      await context.sync()
    })
  }

  /** Counter shapes: template-preserving number update (classic mirror of
   * widgetShapes.ts syncCounterText). Auto state (empty, or text still equal
   * to our last default write) -> fresh default + auto tag; user template ->
   * swap the first number and leave the tag alone so the template survives;
   * number removed by the user -> hands off. Best-effort: failures never
   * break the surrounding widget update. */
  const updateCounterShape = async (context, counterShape, count, singular, plural) => {
    if (!counterShape || counterShape.isNullObject) {
      return
    }
    /** Never write a non-number — a NaN would poison the auto tag and stick
     * until the next healthy update. */
    if (!Number.isFinite(count)) {
      return
    }
    try {
      const autoTag = counterShape.tags.getItemOrNullObject('PrezoPollWidgetAutoText')
      autoTag.load('value')
      counterShape.textFrame.textRange.load('text')
      await context.sync()
      const defaultText = `${count} ${count === 1 ? singular : plural}`
      const currentText = counterShape.textFrame.textRange.text || ''
      const lastAutoText = autoTag.isNullObject ? '' : autoTag.value || ''
      const isAuto =
        !currentText.trim() || (!autoTag.isNullObject && currentText === lastAutoText)
      if (isAuto) {
        if (currentText !== defaultText) {
          counterShape.textFrame.textRange.text = defaultText
        }
        counterShape.tags.delete('PrezoPollWidgetAutoText')
        counterShape.tags.add('PrezoPollWidgetAutoText', defaultText)
        return
      }
      const numberRe = /\d[\d,]*/
      if (!numberRe.test(currentText)) {
        return
      }
      const nextText = currentText.replace(numberRe, String(count))
      if (currentText !== nextText) {
        counterShape.textFrame.textRange.text = nextText
      }
    } catch {
      // Counter updates are best-effort.
    }
  }

  const updatePollWidget = async (sessionId, code, polls) => {
    const pollMap = new Map((polls || []).map((poll) => [poll.id, poll]))
    const titleText = buildPollTitle(code)

    await runPowerPoint(async (context) => {
      const slides = context.presentation.slides
      slides.load('items')
      await context.sync()

      const recoverPollShapeIds = async (slide, isVerticalLayout) => {
        const scope = slide.shapes
        scope.load('items')
        await context.sync()
        const tagged = scope.items.map((shape) => {
          const pollTag = shape.tags.getItemOrNullObject(POLL_WIDGET_TAG)
          const roleTag = shape.tags.getItemOrNullObject('PrezoWidgetRole')
          pollTag.load('value')
          roleTag.load('value')
          shape.load(['id', 'left', 'top', 'width', 'height'])
          return { shape, pollTag, roleTag }
        })
        await context.sync()

        const labels = []
        const bars = []
        const fills = []
        let container = null
        let shadow = null
        let title = null
        let question = null
        let body = null
        let qrShape = null
        tagged.forEach(({ shape, pollTag, roleTag }) => {
          const hasPollTag = !pollTag.isNullObject && pollTag.value === 'true'
          const roleValue = !roleTag.isNullObject ? roleTag.value : null
          if (!hasPollTag && !roleValue) {
            return
          }
          if (roleValue) {
            switch (roleValue) {
              case 'poll-container':
                container = shape
                return
              case 'poll-shadow':
                shadow = shape
                return
              case 'poll-title':
                title = shape
                return
              case 'poll-question':
                question = shape
                return
              case 'poll-body':
                body = shape
                return
              case 'poll-qr':
                qrShape = shape
                return
              case 'poll-label':
                labels.push(shape)
                return
              case 'poll-bar-bg':
                bars.push(shape)
                return
              case 'poll-bar-fill':
                fills.push(shape)
                return
              default:
                return
            }
          }
        })

        /** Title is NOT an essential — widgets inserted since 19/08/2026
         * have no branded title shape (the question is the heading). */
        if (!container || labels.length === 0 || bars.length === 0 || fills.length === 0) {
          return null
        }

        const sortKey = (shape) => (isVerticalLayout ? shape.left : shape.top)
        labels.sort((a, b) => sortKey(a) - sortKey(b))
        bars.sort((a, b) => sortKey(a) - sortKey(b))
        fills.sort((a, b) => sortKey(a) - sortKey(b))
        const itemCount = Math.min(labels.length, bars.length, fills.length)
        const items = Array.from({ length: itemCount }, (_, index) => ({
          label: labels[index].id,
          bg: bars[index].id,
          fill: fills[index].id
        }))

        return {
          shadow: shadow ? shadow.id : undefined,
          container: container.id,
          title: title ? title.id : undefined,
          question: question ? question.id : undefined,
          body: body ? body.id : undefined,
          qr: qrShape ? qrShape.id : undefined,
          items
        }
      }

      const slideInfos = slides.items.map((slide) => {
        const sessionTag = slide.tags.getItemOrNullObject(POLL_SESSION_TAG)
        const pendingTag = slide.tags.getItemOrNullObject(POLL_PENDING_TAG)
        const shapeTag = slide.tags.getItemOrNullObject(POLL_SHAPES_TAG)
        const styleTag = slide.tags.getItemOrNullObject(POLL_STYLE_TAG)
        const bindingTag = slide.tags.getItemOrNullObject(POLL_BINDING_TAG)
        sessionTag.load('value')
        pendingTag.load('value')
        shapeTag.load('value')
        styleTag.load('value')
        bindingTag.load('value')
        return { slide, sessionTag, pendingTag, shapeTag, styleTag, bindingTag }
      })

      await context.sync()

      for (const info of slideInfos) {
        const isPending =
          !info.pendingTag.isNullObject && info.pendingTag.value === 'true'
        const hasSessionMatch =
          !info.sessionTag.isNullObject && info.sessionTag.value === sessionId

        let shapeIds = null
        let recovered = false
        if (!info.shapeTag.isNullObject && info.shapeTag.value) {
          try {
            shapeIds = JSON.parse(info.shapeTag.value)
          } catch {
            shapeIds = null
          }
        }

        let style = DEFAULT_POLL_STYLE
        let applyStyle = false
        if (info.styleTag && !info.styleTag.isNullObject && info.styleTag.value) {
          try {
            const parsed = JSON.parse(info.styleTag.value)
            style = normalizePollStyle(parsed)
            applyStyle = Boolean(parsed.lockStyle)
          } catch {
            style = DEFAULT_POLL_STYLE
          }
        }
        const boundPollId =
          !info.bindingTag.isNullObject && info.bindingTag.value
            ? info.bindingTag.value.trim()
            : ''
        const poll = boundPollId ? pollMap.get(boundPollId) || null : null
        const optionData = buildPollOptions(poll)
        const questionText = boundPollId
          ? poll
            ? buildPollQuestion(poll)
            : 'Poll not found.'
          : POLL_BIND_PLACEHOLDER
        const isVertical = style.orientation === 'vertical'
        const visibleOptions = poll
          ? Math.max(1, Math.min(optionData.length, MAX_POLL_OPTIONS))
          : style.maxOptions
        const hasPollData = Boolean(poll)
        /** Mirrors src/office/widgetShapes.ts: the taskpane hides surplus
         * rows via Shape.visible (PowerPointApi 1.10) — this path must be
         * able to reveal them again when an edit grows the option set. */
        const useShapeVisibility =
          typeof Office !== 'undefined' &&
          Boolean(
            Office?.context?.requirements?.isSetSupported?.('PowerPointApi', '1.10')
          )

        if (!shapeIds) {
          shapeIds = await recoverPollShapeIds(info.slide, isVertical)
          recovered = Boolean(shapeIds)
          if (shapeIds) {
            info.slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(shapeIds))
          }
        }

        if (!shapeIds) {
          continue
        }

        if (!isPending && !hasSessionMatch && !recovered) {
          continue
        }

        const groupShape = shapeIds.group
          ? info.slide.shapes.getItemOrNullObject(shapeIds.group)
          : null
        if (groupShape) {
          groupShape.load('id')
        }

        await context.sync()

        const shapeScope =
          groupShape && !groupShape.isNullObject ? groupShape.group.shapes : null
        const resolveShape = (id) =>
          shapeScope ? shapeScope.getItemOrNullObject(id) : info.slide.shapes.getItemOrNullObject(id)

        let shadowShape = shapeIds.shadow ? resolveShape(shapeIds.shadow) : null
        if (shadowShape) shadowShape.load('id')

        let container = shapeIds.container ? resolveShape(shapeIds.container) : null
        if (container) container.load(['id', 'width', 'left', 'top', 'height'])

        let title = shapeIds.title ? resolveShape(shapeIds.title) : null
        if (title) title.load('id')

        let questionShape = shapeIds.question ? resolveShape(shapeIds.question) : null
        if (questionShape) {
          questionShape.load('id')
        }

        let bodyShape = shapeIds.body ? resolveShape(shapeIds.body) : null
        if (bodyShape) {
          bodyShape.load('id')
        }

        let counterShape = shapeIds.counter ? resolveShape(shapeIds.counter) : null
        if (counterShape) {
          counterShape.load('id')
        }

        let itemShapes = (shapeIds.items || []).map((item) => {
          const label = resolveShape(item.label)
          const bg = resolveShape(item.bg)
          const fill = resolveShape(item.fill)
          const group = item.group ? resolveShape(item.group) : null
          label.load('id')
          bg.load(['id', 'width', 'left'])
          fill.load('id')
          if (group) group.load('id')
          return { label, bg, fill, group }
        })

        await context.sync()

        const needsFallback =
          (title && title.isNullObject) ||
          (questionShape && questionShape.isNullObject) ||
          itemShapes.length === 0 ||
          itemShapes.every(
            (item) => item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject
          )

        if (needsFallback) {
          const fallbackScope =
            groupShape && !groupShape.isNullObject ? groupShape.group.shapes : info.slide.shapes
          fallbackScope.load('items')
          await context.sync()
          const tagged = fallbackScope.items.map((shape) => {
            const roleTag = shape.tags.getItemOrNullObject('PrezoWidgetRole')
            roleTag.load('value')
            shape.load(['id', 'left', 'top', 'width', 'height'])
            return { shape, roleTag }
          })
          await context.sync()

          const labels = []
          const bars = []
          const fills = []
          let taggedContainer = null
          let taggedShadow = null
          let taggedTitle = null
          let taggedQuestion = null
          let taggedBody = null
          let taggedCounter = null
          let taggedQr = null
          tagged.forEach(({ shape, roleTag }) => {
            if (roleTag.isNullObject || !roleTag.value) {
              return
            }
            switch (roleTag.value) {
              case 'poll-container':
                taggedContainer = shape
                break
              case 'poll-shadow':
                taggedShadow = shape
                break
              case 'poll-title':
                taggedTitle = shape
                break
              case 'poll-question':
                taggedQuestion = shape
                break
              case 'poll-body':
                taggedBody = shape
                break
              case 'poll-counter':
                taggedCounter = shape
                break
              case 'poll-qr':
                taggedQr = shape
                break
              case 'poll-label':
                labels.push(shape)
                break
              case 'poll-bar-bg':
                bars.push(shape)
                break
              case 'poll-bar-fill':
                fills.push(shape)
                break
              default:
                break
            }
          })

          const sortKey = (shape) => (isVertical ? shape.left : shape.top)
          labels.sort((a, b) => sortKey(a) - sortKey(b))
          bars.sort((a, b) => sortKey(a) - sortKey(b))
          fills.sort((a, b) => sortKey(a) - sortKey(b))
          const itemCount = Math.min(labels.length, bars.length, fills.length)
          const taggedItems = Array.from({ length: itemCount }, (_, index) => ({
            label: labels[index],
            bg: bars[index],
            fill: fills[index]
          }))

          if (taggedContainer) container = taggedContainer
          if (taggedShadow) shadowShape = taggedShadow
          if (taggedTitle) title = taggedTitle
          if (taggedQuestion) questionShape = taggedQuestion
          if (taggedBody) bodyShape = taggedBody
          if (taggedCounter) counterShape = taggedCounter
          if (taggedItems.length > 0) {
            itemShapes = taggedItems.map((item) => {
              item.label.load('id')
              item.bg.load(['id', 'width', 'left', 'height', 'top'])
              item.fill.load('id')
              return item
            })
            await context.sync()
          }

          if (
            taggedContainer ||
            taggedShadow ||
            taggedTitle ||
            taggedQuestion ||
            taggedItems.length
          ) {
            const resolvedShapeIds = {
              group: groupShape && !groupShape.isNullObject ? groupShape.id : undefined,
              shadow: taggedShadow && !taggedShadow.isNullObject ? taggedShadow.id : shapeIds.shadow,
              container:
                taggedContainer && !taggedContainer.isNullObject
                  ? taggedContainer.id
                  : shapeIds.container,
              title: taggedTitle && !taggedTitle.isNullObject ? taggedTitle.id : shapeIds.title,
              question:
                taggedQuestion && !taggedQuestion.isNullObject
                  ? taggedQuestion.id
                  : shapeIds.question,
              body: taggedBody && !taggedBody.isNullObject ? taggedBody.id : shapeIds.body,
              /** Preserving the counter here matters: omitting the field
               * would clobber it out of the tag and orphan the shape. */
              counter:
                taggedCounter && !taggedCounter.isNullObject
                  ? taggedCounter.id
                  : shapeIds.counter,
              /** Same for the QR picture and the layout-generation marker —
               * dropping layoutV would re-lay v3 rows at the 76 offset. */
              qr: taggedQr && !taggedQr.isNullObject ? taggedQr.id : shapeIds.qr,
              layoutV: shapeIds.layoutV,
              items:
                taggedItems.length > 0
                  ? taggedItems.map((item) => ({
                      label: item.label.id,
                      bg: item.bg.id,
                      fill: item.fill.id
                    }))
                  : shapeIds.items
            }
            info.slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(resolvedShapeIds))
          }
        }

        if (applyStyle) {
          if (shadowShape && !shadowShape.isNullObject) {
            shadowShape.fill.setSolidColor(style.shadowColor)
            shadowShape.fill.transparency = style.shadowOpacity
            shadowShape.lineFormat.visible = false
          }
          if (container && !container.isNullObject) {
            container.fill.setSolidColor(style.panelColor)
            container.lineFormat.color = style.borderColor
            container.lineFormat.weight = 1
          }
          if (title && !title.isNullObject) {
            applyFont(title.textFrame.textRange, style, {
              size: 20,
              bold: true,
              color: style.textColor
            })
          }
          if (questionShape && !questionShape.isNullObject) {
            /** No title shape (19/08/2026+ inserts) → the question IS the
             * heading; legacy widgets keep the muted secondary line. */
            applyFont(
              questionShape.textFrame.textRange,
              style,
              !title || title.isNullObject
                ? { size: 20, bold: true, color: style.textColor }
                : { size: 14, color: style.mutedColor }
            )
          }
          if (bodyShape && !bodyShape.isNullObject) {
            applyFont(bodyShape.textFrame.textRange, style, {
              size: 13,
              color: style.mutedColor
            })
          }
        }
        const scale = style.spacingScale
        const paddingX = 24
        /** Row re-layout must match the widget's structure: legacy widgets
         * (branded title) AND v3 widgets (question + votes + QR header) use
         * the 108 offset; only the short-lived titleless generation between
         * them (no marker, no QR) sits at 76. */
        const optionStartOffset =
          (shapeIds.title || shapeIds.qr || (shapeIds.layoutV || 0) >= 3 ? 108 : 76) * scale
        const barThickness = 10 * scale * style.barThicknessScale
        const rowHeight = Math.max(34 * scale, barThickness + 18)
        const verticalLabelHeight = 16 * scale
        let fullBarWidth = null
        let optionStartTop = null
        let columnWidth = null
        let verticalBarWidth = null
        let verticalBarAreaHeight = null
        if (container && !container.isNullObject) {
          fullBarWidth = container.width - paddingX * 2
          optionStartTop = container.top + optionStartOffset
          const columnCount = Math.max(1, visibleOptions)
          columnWidth = fullBarWidth / columnCount
          const baseBarWidth = columnWidth * 0.85
          verticalBarWidth = Math.min(
            columnWidth * 0.95,
            Math.max(6, baseBarWidth * style.barThicknessScale)
          )
          verticalBarAreaHeight = Math.max(
            60 * scale,
            container.height - optionStartOffset - verticalLabelHeight - 24
          )
        }
        const columnCount = Math.max(1, visibleOptions)
        itemShapes.forEach((item, index) => {
          if (item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject) {
            return
          }
          applyFont(item.label.textFrame.textRange, style, {
            size: 13,
            color: style.textColor
          })
          if (container && !container.isNullObject && fullBarWidth !== null && optionStartTop !== null) {
            if (isVertical) {
            const safeColumnWidth = columnWidth || fullBarWidth
            const safeBarWidth = verticalBarWidth || Math.max(6, safeColumnWidth * 0.85)
            const safeIndex = Math.min(index, columnCount - 1)
            const columnLeft = container.left + paddingX + safeColumnWidth * safeIndex
              const barLeft = columnLeft + (safeColumnWidth - safeBarWidth) / 2
              const barTop = optionStartTop
              const barHeight = verticalBarAreaHeight || 60 * scale
              item.label.left = columnLeft
              item.label.top = barTop + barHeight + 6
              item.label.width = safeColumnWidth
              item.label.height = verticalLabelHeight
              item.label.textFrame.textRange.paragraphFormat.alignment = 'Center'
              item.bg.left = barLeft
              item.bg.top = barTop
              item.bg.width = safeBarWidth
              item.bg.height = barHeight
              item.fill.left = barLeft
              item.fill.width = safeBarWidth
            } else {
              const barLeft = container.left + paddingX
              const rowTop = optionStartTop + rowHeight * index
              item.label.left = barLeft
              item.label.top = rowTop
              item.label.width = fullBarWidth
              item.label.height = 16
              item.label.textFrame.textRange.paragraphFormat.alignment = 'Left'
              item.bg.left = barLeft
              item.bg.top = rowTop + 18
              item.bg.width = fullBarWidth
              item.bg.height = barThickness
              item.fill.left = barLeft
              item.fill.top = rowTop + 18
              item.fill.width = fullBarWidth
              item.fill.height = barThickness
            }
          }
          if (applyStyle) {
            item.bg.fill.setSolidColor(style.barColor)
            item.bg.lineFormat.visible = false
            item.fill.fill.setSolidColor(style.accentColor)
            item.fill.lineFormat.visible = false
          }
        })
        if (groupShape && !groupShape.isNullObject) {
          groupShape.rotation = 0
        }

        if (title && !title.isNullObject) {
          title.textFrame.textRange.text = titleText
        }

        if (questionShape && !questionShape.isNullObject) {
          questionShape.textFrame.textRange.text = questionText
        } else if (bodyShape && !bodyShape.isNullObject) {
        bodyShape.textFrame.textRange.text = `${questionText}\n${optionData
          .map((option, index) => `${index + 1}. ${option.label}`)
          .join('\n')}`
        }

        /** Sum from poll.options directly — this file's buildPollOptions
         * returns only {label, ratio}, so summing optionData.votes is NaN. */
        const totalVotes =
          poll && Array.isArray(poll.options)
            ? poll.options.reduce((sum, option) => sum + (option.votes || 0), 0)
            : 0
        await updateCounterShape(context, counterShape, totalVotes, 'vote', 'votes')

        /** Row show/hide via Shape.visible, mirroring widgetShapes.ts —
         * grouped rows toggle the group, ungrouped rows toggle bg+fill. */
        const setRowVisibility = (item, visible) => {
          try {
            item.label.visible = visible
            if (item.group && !item.group.isNullObject) {
              item.group.visible = visible
            } else {
              item.bg.visible = visible
              item.fill.visible = visible
            }
          } catch {
            /* host rejected visibility writes — transparency still applies */
          }
        }

        itemShapes.forEach((item, index) => {
          const data = optionData[index]
          if (item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject) {
            return
          }
          if (!data || index >= visibleOptions) {
            if (useShapeVisibility && hasPollData) {
              /** Surplus row for the bound poll: hide it outright and keep
               * the designer styling (including label text) for a reveal. */
              setRowVisibility(item, false)
              return
            }
            if (useShapeVisibility) {
              /** No poll bound: the designable placeholder skeleton — rows
               * previously hidden under a binding must come back. */
              setRowVisibility(item, true)
            }
            /** Skeleton rows keep an insert-style "Option N" label; rows
             * beyond the skeleton (and surplus rows on legacy hosts) clear. */
            const isSkeletonRow = !hasPollData && index < visibleOptions
            item.label.textFrame.textRange.text = isSkeletonRow ? `Option ${index + 1}` : ''
            /** Skeleton rows keep the insert-time partial fill (35%) so the
             * fill shapes stay visible and designable while unbound. */
            if (isVertical) {
              const barHeight = item.bg.height
              const fillHeight = isSkeletonRow ? Math.max(2, barHeight * 0.35) : 2
              item.fill.height = fillHeight
              item.fill.top = item.bg.top + Math.max(0, barHeight - fillHeight)
              item.fill.width = item.bg.width
              item.fill.left = item.bg.left
            } else {
              item.fill.width = isSkeletonRow ? Math.max(2, item.bg.width * 0.35) : 2
              item.fill.height = item.bg.height
              item.fill.left = item.bg.left
              item.fill.top = item.bg.top
            }
            item.fill.fill.transparency = isSkeletonRow ? 0 : 1
            item.bg.fill.transparency = hasPollData ? 1 : isSkeletonRow ? 0 : 0.35
            return
          }
          if (useShapeVisibility) {
            /** Rows hidden while the bound poll had fewer options must
             * reappear when an edit grows the option set. */
            setRowVisibility(item, true)
          }
          item.label.textFrame.textRange.text = data.label
          if (isVertical) {
            const barHeight = item.bg.height
            const fillHeight = Math.max(2, barHeight * data.ratio)
            item.fill.height = fillHeight
            item.fill.top = item.bg.top + (barHeight - fillHeight)
            item.fill.width = item.bg.width
            item.fill.left = item.bg.left
          } else {
            const barWidth = item.bg.width
            const left = item.bg.left
            item.fill.left = left
            item.fill.width = Math.max(2, barWidth * data.ratio)
            item.fill.top = item.bg.top
            item.fill.height = item.bg.height
          }
          item.fill.fill.transparency = data.ratio === 0 ? 1 : 0
          item.bg.fill.transparency = 0
        })

        if (isPending || recovered) {
          info.slide.tags.add(POLL_SESSION_TAG, sessionId)
          info.slide.tags.delete(POLL_PENDING_TAG)
        }
      }

      await context.sync()
    })
  }
  const updateDiscussionWidget = async (sessionId, code, questions, prompts) => {
    const promptMap = new Map((prompts || []).map((entry) => [entry.id, entry]))
    await runPowerPoint(async (context) => {
      const slides = context.presentation.slides
      slides.load('items')
      await context.sync()

      const slideInfos = slides.items.map((slide) => {
        const sessionTag = slide.tags.getItemOrNullObject(DISCUSSION_SESSION_TAG)
        const pendingTag = slide.tags.getItemOrNullObject(DISCUSSION_PENDING_TAG)
        const styleTag = slide.tags.getItemOrNullObject(DISCUSSION_STYLE_TAG)
        const shapeTag = slide.tags.getItemOrNullObject(DISCUSSION_SHAPES_TAG)
        const promptBindingTag = slide.tags.getItemOrNullObject(DISCUSSION_PROMPT_BINDING_TAG)
        sessionTag.load('value')
        pendingTag.load('value')
        styleTag.load('value')
        shapeTag.load('value')
        promptBindingTag.load('value')
        return { slide, sessionTag, pendingTag, styleTag, shapeTag, promptBindingTag }
      })

      await context.sync()

      for (const info of slideInfos) {
        const isPending =
          !info.pendingTag.isNullObject && info.pendingTag.value === 'true'
        if (!isPending && (info.sessionTag.isNullObject || info.sessionTag.value !== sessionId)) {
          continue
        }
        if (info.shapeTag.isNullObject || !info.shapeTag.value) {
          continue
        }

        let shapeIds = null
        try {
          shapeIds = JSON.parse(info.shapeTag.value)
        } catch {
          shapeIds = null
        }
        if (!shapeIds) {
          continue
        }

        let style = DEFAULT_QNA_STYLE
        let applyStyle = false
        if (!info.styleTag.isNullObject && info.styleTag.value) {
          try {
            const parsed = JSON.parse(info.styleTag.value)
            style = normalizeQnaStyle(parsed)
            applyStyle = Boolean(parsed.lockStyle)
          } catch {
            style = DEFAULT_QNA_STYLE
          }
        }

        const containerShape = shapeIds.container
          ? info.slide.shapes.getItemOrNullObject(shapeIds.container)
          : null
        const shadowShape = shapeIds.shadow
          ? info.slide.shapes.getItemOrNullObject(shapeIds.shadow)
          : null
        const title = shapeIds.title
          ? info.slide.shapes.getItemOrNullObject(shapeIds.title)
          : null
        const body = shapeIds.body
          ? info.slide.shapes.getItemOrNullObject(shapeIds.body)
          : null
        const subtitle = shapeIds.subtitle
          ? info.slide.shapes.getItemOrNullObject(shapeIds.subtitle)
          : null
        const meta = shapeIds.meta ? info.slide.shapes.getItemOrNullObject(shapeIds.meta) : null
        const badge = shapeIds.badge
          ? info.slide.shapes.getItemOrNullObject(shapeIds.badge)
          : null
        const counterShape = shapeIds.counter
          ? info.slide.shapes.getItemOrNullObject(shapeIds.counter)
          : null
        const itemShapes = (shapeIds.items || []).map((item) => {
          const container = info.slide.shapes.getItemOrNullObject(item.container)
          const text = info.slide.shapes.getItemOrNullObject(item.text)
          const votes = info.slide.shapes.getItemOrNullObject(item.votes)
          container.load('id')
          text.load('id')
          votes.load('id')
          return { container, text, votes }
        })
        if (containerShape) containerShape.load('id')
        if (shadowShape) shadowShape.load('id')
        if (title) title.load('id')
        if (body) body.load('id')
        if (subtitle) subtitle.load('id')
        if (meta) meta.load('id')
        if (badge) badge.load('id')
        if (counterShape) counterShape.load('id')
        await context.sync()

        if (applyStyle) {
          if (shadowShape && !shadowShape.isNullObject) {
            shadowShape.fill.setSolidColor(style.shadowColor)
            shadowShape.fill.transparency = style.shadowOpacity
            shadowShape.lineFormat.visible = false
          }
          if (containerShape && !containerShape.isNullObject) {
            containerShape.fill.setSolidColor(style.panelColor)
            containerShape.lineFormat.color = style.borderColor
            containerShape.lineFormat.weight = 1
          }
          if (meta && !meta.isNullObject) {
            applyFont(meta.textFrame.textRange, style, { size: 11, color: style.mutedColor })
          }
          if (title && !title.isNullObject) {
            applyFont(title.textFrame.textRange, style, {
              size: 18,
              bold: true,
              color: style.textColor
            })
          }
          if (subtitle && !subtitle.isNullObject) {
            applyFont(subtitle.textFrame.textRange, style, { size: 13, color: style.mutedColor })
          }
          if (badge && !badge.isNullObject) {
            badge.fill.setSolidColor(badgeFillFor(style))
            badge.lineFormat.visible = false
            applyFont(badge.textFrame.textRange, style, {
              size: 11,
              bold: true,
              color: style.accentColor
            })
          }
          if (body && !body.isNullObject) {
            applyFont(body.textFrame.textRange, style, { size: 14, color: style.mutedColor })
          }
          itemShapes.forEach((item) => {
            if (item.container.isNullObject || item.text.isNullObject || item.votes.isNullObject) {
              return
            }
            item.container.fill.setSolidColor(style.cardColor)
            item.container.lineFormat.color = style.borderColor
            item.container.lineFormat.weight = 1
            applyFont(item.text.textFrame.textRange, style, {
              size: 14,
              color: style.textColor
            })
            applyFont(item.votes.textFrame.textRange, style, {
              size: 12,
              color: style.mutedColor
            })
          })
        }

        const boundPromptId =
          !info.promptBindingTag.isNullObject && info.promptBindingTag.value
            ? info.promptBindingTag.value.trim()
            : ''
        const boundPrompt = boundPromptId ? promptMap.get(boundPromptId) || null : null
        const filteredQuestions = boundPromptId
          ? (questions || []).filter((q) => q.prompt_id === boundPromptId)
          : []
        const approvedRaw = filteredQuestions.filter((q) => q.status === 'approved')
        const approved = [...approvedRaw].sort((a, b) => b.votes - a.votes)
        const promptTitle = boundPrompt && boundPrompt.prompt ? boundPrompt.prompt.trim() : ''
        const panelTitle =
          promptTitle || (boundPromptId ? 'Prompt not found.' : DISCUSSION_PANEL_TITLE)

        if (title && !title.isNullObject) {
          const hasNewLayout = Boolean(
            (shapeIds.items && shapeIds.items.length > 0) ||
              shapeIds.subtitle ||
              shapeIds.meta ||
              shapeIds.badge
          )
          title.textFrame.textRange.text = hasNewLayout
            ? panelTitle
            : buildDiscussionTitle(code, promptTitle)
        }
        if (meta && !meta.isNullObject) {
          meta.textFrame.textRange.text = DISCUSSION_EYEBROW_TEXT
        }
        if (subtitle && !subtitle.isNullObject) {
          subtitle.textFrame.textRange.text = buildMeta(code)
        }
        if (badge && !badge.isNullObject) {
          badge.textFrame.textRange.text = `Answers ${approved.length}`
        }
        await updateCounterShape(
          context,
          counterShape,
          filteredQuestions.length,
          'answer',
          'answers'
        )
        if (itemShapes.length > 0) {
          const hasApproved = approved.length > 0
          const emptyBody = boundPromptId ? 'No answers yet.' : DISCUSSION_EMPTY_BODY
          if (body && !body.isNullObject) {
            body.textFrame.textRange.text = hasApproved ? '' : emptyBody
          }
          itemShapes.forEach((item, index) => {
            if (item.container.isNullObject || item.text.isNullObject || item.votes.isNullObject) {
              return
            }
            const question = approved[index]
            if (!question) {
              item.container.fill.transparency = 1
              item.container.lineFormat.visible = false
              item.text.textFrame.textRange.text = ''
              item.votes.textFrame.textRange.text = ''
              return
            }
            item.container.fill.transparency = 0
            item.container.lineFormat.visible = true
            item.text.textFrame.textRange.text = question.text
            item.votes.textFrame.textRange.text = `${question.votes} votes`
          })
        } else if (body && !body.isNullObject) {
          body.textFrame.textRange.text = boundPromptId
            ? buildBody(filteredQuestions, 'prompt')
            : DISCUSSION_EMPTY_BODY
        }

        if (isPending) {
          info.slide.tags.add(DISCUSSION_SESSION_TAG, sessionId)
          info.slide.tags.delete(DISCUSSION_PENDING_TAG)
        }
      }

      await context.sync()
    })
  }

  const insertWidget = async (styleOverrides, qna) => {
    const style = normalizeQnaStyle(styleOverrides)
    const scale = style.spacingScale
    const maxQuestions = style.maxQuestions
    const binding = await getBinding()
    const sessionId = binding && binding.sessionId ? binding.sessionId : null
    const code = binding ? binding.code : null
    const hasSession = Boolean(sessionId)
    const { mode, prompt } = resolveQnaMode(qna)
    const panelTitle =
      mode === 'prompt' ? (prompt && String(prompt).trim()) || PROMPT_PANEL_TITLE : PANEL_TITLE
    const eyebrowText = mode === 'prompt' ? PROMPT_EYEBROW_TEXT : EYEBROW_TEXT
    const emptyBody = mode === 'prompt' ? 'No answers yet.' : 'No approved questions yet.'

    await runPowerPoint(async (context) => {
      const slides = context.presentation.getSelectedSlides()
      slides.load('items')
      const pageSetup = context.presentation.pageSetup
      pageSetup.load(['slideWidth', 'slideHeight'])
      await context.sync()

      const slide = slides.items[0]
      if (!slide) {
        throw new Error('Select a slide before inserting a widget.')
      }

      const existingSessionTag = slide.tags.getItemOrNullObject(SESSION_TAG)
      const existingPendingTag = slide.tags.getItemOrNullObject(WIDGET_PENDING_TAG)
      const existingStyleTag = slide.tags.getItemOrNullObject(WIDGET_STYLE_TAG)
      const existingShapesTag = slide.tags.getItemOrNullObject(SHAPES_TAG)
      existingSessionTag.load('value')
      existingPendingTag.load('value')
      existingStyleTag.load('value')
      existingShapesTag.load('value')
      await context.sync()

      if (!existingShapesTag.isNullObject && existingShapesTag.value) {
        try {
          const parsed = JSON.parse(existingShapesTag.value)
          const itemIds = (parsed.items || []).flatMap((item) => [
            item.container,
            item.text,
            item.votes
          ])
          const ids = [
            parsed.shadow,
            parsed.container,
            parsed.title,
            parsed.subtitle,
            parsed.meta,
            parsed.badge,
            parsed.body,
            parsed.counter,
            ...itemIds
          ].filter(Boolean)
          const shapes = ids.map((id) => slide.shapes.getItemOrNullObject(id))
          shapes.forEach((shape) => shape.load('id'))
          await context.sync()
          shapes.forEach((shape) => {
            if (!shape.isNullObject) {
              shape.delete()
            }
          })
          await context.sync()
        } catch {
          // ignore cleanup errors
        }
        slide.tags.delete(SESSION_TAG)
        slide.tags.delete(WIDGET_PENDING_TAG)
        slide.tags.delete(WIDGET_STYLE_TAG)
        slide.tags.delete(SHAPES_TAG)
        slide.tags.delete(LEGACY_QNA_MODE_TAG)
        slide.tags.delete(LEGACY_QNA_PROMPT_TAG)
        slide.tags.delete(QNA_PROMPT_BINDING_TAG)
      }

      const width = Math.max(360, pageSetup.slideWidth * 0.68)
      const height = Math.max(280, pageSetup.slideHeight * 0.52)
      const left = (pageSetup.slideWidth - width) / 2
      const top = pageSetup.slideHeight * 0.12
      const paddingX = 24
      const headerTop = top + 18 * scale
      const badgeWidth = 98
      const badgeHeight = 22
      const textWidth = width - paddingX * 2 - badgeWidth - 12
      const eyebrowHeight = 12 * scale
      const titleHeight = 22 * scale
      const subtitleHeight = 16 * scale
      const rowGap = 6 * scale
      const bodyGap = 12 * scale
      const titleTop = headerTop + eyebrowHeight + rowGap
      const subtitleTop = titleTop + titleHeight + rowGap
      const bodyTop = subtitleTop + subtitleHeight + bodyGap
      const availableHeight = height - (bodyTop - top) - 16
      const bodyHeight = availableHeight
      const itemHeight = 48 * scale
      const itemGap = 12 * scale
      const itemWidth = width - paddingX * 2
      const maxItems = Math.max(
        1,
        Math.min(
          maxQuestions,
          Math.floor((availableHeight + itemGap) / (itemHeight + itemGap))
        )
      )

      const shadow = slide.shapes.addGeometricShape('RoundRectangle', {
        left: left + 4,
        top: top + 6,
        width,
        height
      })
      shadow.fill.setSolidColor(style.shadowColor)
      shadow.fill.transparency = style.shadowOpacity
      shadow.lineFormat.visible = false
      shadow.tags.add(WIDGET_TAG, 'true')
      shadow.tags.add('PrezoWidgetRole', 'shadow')

      const container = slide.shapes.addGeometricShape('RoundRectangle', {
        left,
        top,
        width,
        height
      })
      container.fill.setSolidColor(style.panelColor)
      container.lineFormat.color = style.borderColor
      container.lineFormat.weight = 1
      container.tags.add(WIDGET_TAG, 'true')
      container.tags.add('PrezoWidgetRole', 'container')

      const meta = slide.shapes.addTextBox(eyebrowText, {
        left: left + paddingX,
        top: headerTop,
        width: Math.max(160, textWidth),
        height: eyebrowHeight
      })
      meta.textFrame.wordWrap = true
      applyFont(meta.textFrame.textRange.font, style, {
        size: 11,
        color: style.mutedColor
      })
      meta.tags.add(WIDGET_TAG, 'true')
      meta.tags.add('PrezoWidgetRole', 'meta')

      const title = slide.shapes.addTextBox(panelTitle, {
        left: left + paddingX,
        top: titleTop,
        width: Math.max(160, textWidth),
        height: titleHeight
      })
      title.textFrame.wordWrap = true
      applyFont(title.textFrame.textRange.font, style, {
        size: 18,
        bold: true,
        color: style.textColor
      })
      title.tags.add(WIDGET_TAG, 'true')
      title.tags.add('PrezoWidgetRole', 'title')

      const subtitle = slide.shapes.addTextBox(
        hasSession ? buildMeta(code) : PLACEHOLDER_SUBTITLE,
        {
        left: left + paddingX,
        top: subtitleTop,
        width: Math.max(180, textWidth),
        height: subtitleHeight
        }
      )
      subtitle.textFrame.wordWrap = true
      applyFont(subtitle.textFrame.textRange.font, style, {
        size: 13,
        color: style.mutedColor
      })
      subtitle.tags.add(WIDGET_TAG, 'true')
      subtitle.tags.add('PrezoWidgetRole', 'subtitle')

      const badge = slide.shapes.addGeometricShape('RoundRectangle', {
        left: left + width - paddingX - badgeWidth,
        top: titleTop,
        width: badgeWidth,
        height: badgeHeight
      })
      badge.fill.setSolidColor(badgeFillFor(style))
      badge.lineFormat.visible = false
      badge.textFrame.textRange.text = buildBadge(0, 0, mode)
      applyFont(badge.textFrame.textRange.font, style, {
        size: 11,
        bold: true,
        color: style.accentColor
      })
      badge.tags.add(WIDGET_TAG, 'true')
      badge.tags.add('PrezoWidgetRole', 'badge')

      const counter = slide.shapes.addTextBox('0 questions', {
        left: left + width - paddingX - 150,
        top: titleTop + badgeHeight + 6,
        width: 150,
        height: 14
      })
      counter.textFrame.wordWrap = true
      applyFont(counter.textFrame.textRange.font, style, {
        size: 11,
        color: style.mutedColor
      })
      counter.textFrame.textRange.paragraphFormat.horizontalAlignment = 'Right'
      counter.name = 'Prezo Q&A Interaction Counter'
      counter.tags.add(WIDGET_TAG, 'true')
      counter.tags.add('PrezoWidgetRole', 'counter')
      counter.tags.add('PrezoPollWidgetAutoText', '0 questions')
      counter.load('id')

      const body = slide.shapes.addTextBox(
        hasSession ? emptyBody : PLACEHOLDER_BODY,
        {
        left: left + paddingX,
        top: bodyTop,
        width: width - paddingX * 2,
        height: Math.max(80, bodyHeight)
        }
      )
      body.textFrame.wordWrap = true
      applyFont(body.textFrame.textRange.font, style, {
        size: 14,
        color: style.mutedColor
      })
      body.tags.add(WIDGET_TAG, 'true')
      body.tags.add('PrezoWidgetRole', 'body')

      const itemShapes = []
      for (let index = 0; index < maxItems; index += 1) {
        const itemTop = bodyTop + index * (itemHeight + itemGap)
        const item = slide.shapes.addGeometricShape('RoundRectangle', {
          left: left + paddingX,
          top: itemTop,
          width: itemWidth,
          height: itemHeight
        })
        item.fill.setSolidColor(style.cardColor)
        item.lineFormat.color = style.borderColor
        item.lineFormat.weight = 1
        item.fill.transparency = 1
        item.lineFormat.visible = false
        item.tags.add(WIDGET_TAG, 'true')
        item.tags.add('PrezoWidgetRole', 'item')

        const question = slide.shapes.addTextBox('', {
          left: left + paddingX + 12,
          top: itemTop + 10 * scale,
          width: itemWidth - 24,
          height: 20 * scale
        })
        question.textFrame.wordWrap = true
        applyFont(question.textFrame.textRange.font, style, {
          size: 14,
          color: style.textColor
        })
        question.tags.add(WIDGET_TAG, 'true')
        question.tags.add('PrezoWidgetRole', 'item-text')

        const votes = slide.shapes.addTextBox('', {
          left: left + paddingX + 12,
          top: itemTop + 30 * scale,
          width: itemWidth - 24,
          height: 14 * scale
        })
        votes.textFrame.wordWrap = true
        applyFont(votes.textFrame.textRange.font, style, {
          size: 12,
          color: style.mutedColor
        })
        votes.tags.add(WIDGET_TAG, 'true')
        votes.tags.add('PrezoWidgetRole', 'item-votes')

        itemShapes.push({ container: item, text: question, votes })
      }

      shadow.load('id')
      container.load('id')
      title.load('id')
      subtitle.load('id')
      meta.load('id')
      badge.load('id')
      body.load('id')
      itemShapes.forEach((item) => {
        item.container.load('id')
        item.text.load('id')
        item.votes.load('id')
      })
      await context.sync()

      const shapeIds = {
        shadow: shadow.id,
        container: container.id,
        title: title.id,
        subtitle: subtitle.id,
        meta: meta.id,
        badge: badge.id,
        body: body.id,
        counter: counter.id,
        items: itemShapes.map((item) => ({
          container: item.container.id,
          text: item.text.id,
          votes: item.votes.id
        }))
      }

      if (hasSession && sessionId) {
        slide.tags.add(SESSION_TAG, sessionId)
        slide.tags.delete(WIDGET_PENDING_TAG)
      } else {
        slide.tags.add(WIDGET_PENDING_TAG, 'true')
        slide.tags.delete(SESSION_TAG)
      }
      slide.tags.delete(LEGACY_QNA_MODE_TAG)
      slide.tags.delete(LEGACY_QNA_PROMPT_TAG)
      slide.tags.delete(QNA_PROMPT_BINDING_TAG)
      slide.tags.add(WIDGET_STYLE_TAG, JSON.stringify(style))
      slide.tags.add(SHAPES_TAG, JSON.stringify(shapeIds))
      await context.sync()
    })

    if (hasSession && sessionId) {
      try {
        const snapshot = await fetchSnapshot(binding)
        await updateQnaWidget(
          sessionId,
          code,
          snapshot.questions || [],
          snapshot.prompts || []
        )
      } catch (error) {
        console.warn('Failed to refresh Q&A widget', error)
      }
    }
  }

  const insertDiscussionWidget = async (styleOverrides) => {
    const style = normalizeQnaStyle(styleOverrides)
    const scale = style.spacingScale
    const maxQuestions = style.maxQuestions
    const binding = await getBinding()
    const sessionId = binding && binding.sessionId ? binding.sessionId : null
    const code = binding ? binding.code : null
    const hasSession = Boolean(sessionId)
    const panelTitle = DISCUSSION_PANEL_TITLE
    const eyebrowText = DISCUSSION_EYEBROW_TEXT
    const emptyBody = DISCUSSION_EMPTY_BODY

    await runPowerPoint(async (context) => {
      const slides = context.presentation.getSelectedSlides()
      slides.load('items')
      const pageSetup = context.presentation.pageSetup
      pageSetup.load(['slideWidth', 'slideHeight'])
      await context.sync()

      const slide = slides.items[0]
      if (!slide) {
        throw new Error('Select a slide before inserting a widget.')
      }

      const existingSessionTag = slide.tags.getItemOrNullObject(DISCUSSION_SESSION_TAG)
      const existingPendingTag = slide.tags.getItemOrNullObject(DISCUSSION_PENDING_TAG)
      const existingStyleTag = slide.tags.getItemOrNullObject(DISCUSSION_STYLE_TAG)
      const existingShapesTag = slide.tags.getItemOrNullObject(DISCUSSION_SHAPES_TAG)
      existingSessionTag.load('value')
      existingPendingTag.load('value')
      existingStyleTag.load('value')
      existingShapesTag.load('value')
      await context.sync()

      if (!existingShapesTag.isNullObject && existingShapesTag.value) {
        try {
          const parsed = JSON.parse(existingShapesTag.value)
          const itemIds = (parsed.items || []).flatMap((item) => [
            item.container,
            item.text,
            item.votes
          ])
          const ids = [
            parsed.shadow,
            parsed.container,
            parsed.title,
            parsed.subtitle,
            parsed.meta,
            parsed.badge,
            parsed.body,
            parsed.counter,
            ...itemIds
          ].filter(Boolean)
          const shapes = ids.map((id) => slide.shapes.getItemOrNullObject(id))
          shapes.forEach((shape) => shape.load('id'))
          await context.sync()
          shapes.forEach((shape) => {
            if (!shape.isNullObject) {
              shape.delete()
            }
          })
          await context.sync()
        } catch {
          // ignore cleanup errors
        }
        slide.tags.delete(DISCUSSION_SESSION_TAG)
        slide.tags.delete(DISCUSSION_PENDING_TAG)
        slide.tags.delete(DISCUSSION_STYLE_TAG)
        slide.tags.delete(DISCUSSION_SHAPES_TAG)
        slide.tags.delete(DISCUSSION_PROMPT_BINDING_TAG)
      }

      const width = Math.max(360, pageSetup.slideWidth * 0.68)
      const height = Math.max(280, pageSetup.slideHeight * 0.52)
      const left = (pageSetup.slideWidth - width) / 2
      const top = pageSetup.slideHeight * 0.12
      const paddingX = 24
      const headerTop = top + 18 * scale
      const badgeWidth = 98
      const badgeHeight = 22
      const textWidth = width - paddingX * 2 - badgeWidth - 12
      const eyebrowHeight = 12 * scale
      const titleHeight = 22 * scale
      const subtitleHeight = 16 * scale
      const rowGap = 6 * scale
      const bodyGap = 12 * scale
      const titleTop = headerTop + eyebrowHeight + rowGap
      const subtitleTop = titleTop + titleHeight + rowGap
      const bodyTop = subtitleTop + subtitleHeight + bodyGap
      const availableHeight = height - (bodyTop - top) - 16
      const bodyHeight = availableHeight
      const itemHeight = 48 * scale
      const itemGap = 12 * scale
      const itemWidth = width - paddingX * 2
      const maxItems = Math.max(
        1,
        Math.min(
          maxQuestions,
          Math.floor((availableHeight + itemGap) / (itemHeight + itemGap))
        )
      )

      const shadow = slide.shapes.addGeometricShape('RoundRectangle', {
        left: left + 4,
        top: top + 6,
        width,
        height
      })
      shadow.fill.setSolidColor(style.shadowColor)
      shadow.fill.transparency = style.shadowOpacity
      shadow.lineFormat.visible = false
      shadow.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      shadow.tags.add('PrezoWidgetRole', 'shadow')

      const container = slide.shapes.addGeometricShape('RoundRectangle', {
        left,
        top,
        width,
        height
      })
      container.fill.setSolidColor(style.panelColor)
      container.lineFormat.color = style.borderColor
      container.lineFormat.weight = 1
      container.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      container.tags.add('PrezoWidgetRole', 'container')

      const meta = slide.shapes.addTextBox(eyebrowText, {
        left: left + paddingX,
        top: headerTop,
        width: Math.max(160, textWidth),
        height: eyebrowHeight
      })
      meta.textFrame.wordWrap = true
      applyFont(meta.textFrame.textRange.font, style, {
        size: 11,
        color: style.mutedColor
      })
      meta.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      meta.tags.add('PrezoWidgetRole', 'meta')

      const title = slide.shapes.addTextBox(panelTitle, {
        left: left + paddingX,
        top: titleTop,
        width: Math.max(160, textWidth),
        height: titleHeight
      })
      title.textFrame.wordWrap = true
      applyFont(title.textFrame.textRange.font, style, {
        size: 18,
        bold: true,
        color: style.textColor
      })
      title.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      title.tags.add('PrezoWidgetRole', 'title')

      const subtitle = slide.shapes.addTextBox(
        hasSession ? buildMeta(code) : PLACEHOLDER_SUBTITLE,
        {
        left: left + paddingX,
        top: subtitleTop,
        width: Math.max(180, textWidth),
        height: subtitleHeight
        }
      )
      subtitle.textFrame.wordWrap = true
      applyFont(subtitle.textFrame.textRange.font, style, {
        size: 13,
        color: style.mutedColor
      })
      subtitle.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      subtitle.tags.add('PrezoWidgetRole', 'subtitle')

      const badge = slide.shapes.addGeometricShape('RoundRectangle', {
        left: left + width - paddingX - badgeWidth,
        top: titleTop,
        width: badgeWidth,
        height: badgeHeight
      })
      badge.fill.setSolidColor(badgeFillFor(style))
      badge.lineFormat.visible = false
      badge.textFrame.textRange.text = 'Answers 0'
      applyFont(badge.textFrame.textRange.font, style, {
        size: 11,
        bold: true,
        color: style.accentColor
      })
      badge.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      badge.tags.add('PrezoWidgetRole', 'badge')

      const counter = slide.shapes.addTextBox('0 answers', {
        left: left + width - paddingX - 150,
        top: titleTop + badgeHeight + 6,
        width: 150,
        height: 14
      })
      counter.textFrame.wordWrap = true
      applyFont(counter.textFrame.textRange.font, style, {
        size: 11,
        color: style.mutedColor
      })
      counter.textFrame.textRange.paragraphFormat.horizontalAlignment = 'Right'
      counter.name = 'Prezo Discussion Interaction Counter'
      counter.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      counter.tags.add('PrezoWidgetRole', 'counter')
      counter.tags.add('PrezoPollWidgetAutoText', '0 answers')
      counter.load('id')

      const body = slide.shapes.addTextBox(
        hasSession ? emptyBody : PLACEHOLDER_BODY,
        {
        left: left + paddingX,
        top: bodyTop,
        width: width - paddingX * 2,
        height: Math.max(80, bodyHeight)
        }
      )
      body.textFrame.wordWrap = true
      applyFont(body.textFrame.textRange.font, style, {
        size: 14,
        color: style.mutedColor
      })
      body.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      body.tags.add('PrezoWidgetRole', 'body')

      const itemShapes = []
      for (let index = 0; index < maxItems; index += 1) {
        const itemTop = bodyTop + index * (itemHeight + itemGap)
        const item = slide.shapes.addGeometricShape('RoundRectangle', {
          left: left + paddingX,
          top: itemTop,
          width: itemWidth,
          height: itemHeight
        })
        item.fill.setSolidColor(style.cardColor)
        item.lineFormat.color = style.borderColor
        item.lineFormat.weight = 1
        item.fill.transparency = 1
        item.lineFormat.visible = false
        item.tags.add(DISCUSSION_WIDGET_TAG, 'true')
        item.tags.add('PrezoWidgetRole', 'item')

        const question = slide.shapes.addTextBox('', {
          left: left + paddingX + 12,
          top: itemTop + 10 * scale,
          width: itemWidth - 24,
          height: 20 * scale
        })
        question.textFrame.wordWrap = true
        applyFont(question.textFrame.textRange.font, style, {
          size: 14,
          color: style.textColor
        })
        question.tags.add(DISCUSSION_WIDGET_TAG, 'true')
        question.tags.add('PrezoWidgetRole', 'item-text')

        const votes = slide.shapes.addTextBox('', {
          left: left + paddingX + 12,
          top: itemTop + 30 * scale,
          width: itemWidth - 24,
          height: 14 * scale
        })
        votes.textFrame.wordWrap = true
        applyFont(votes.textFrame.textRange.font, style, {
          size: 12,
          color: style.mutedColor
        })
        votes.tags.add(DISCUSSION_WIDGET_TAG, 'true')
        votes.tags.add('PrezoWidgetRole', 'item-votes')

        itemShapes.push({ container: item, text: question, votes })
      }

      shadow.load('id')
      container.load('id')
      title.load('id')
      subtitle.load('id')
      meta.load('id')
      badge.load('id')
      body.load('id')
      itemShapes.forEach((item) => {
        item.container.load('id')
        item.text.load('id')
        item.votes.load('id')
      })
      await context.sync()

      const shapeIds = {
        shadow: shadow.id,
        container: container.id,
        title: title.id,
        subtitle: subtitle.id,
        meta: meta.id,
        badge: badge.id,
        body: body.id,
        counter: counter.id,
        items: itemShapes.map((item) => ({
          container: item.container.id,
          text: item.text.id,
          votes: item.votes.id
        }))
      }

      if (hasSession && sessionId) {
        slide.tags.add(DISCUSSION_SESSION_TAG, sessionId)
        slide.tags.delete(DISCUSSION_PENDING_TAG)
      } else {
        slide.tags.add(DISCUSSION_PENDING_TAG, 'true')
        slide.tags.delete(DISCUSSION_SESSION_TAG)
      }
      slide.tags.delete(DISCUSSION_PROMPT_BINDING_TAG)
      slide.tags.add(DISCUSSION_STYLE_TAG, JSON.stringify(style))
      slide.tags.add(DISCUSSION_SHAPES_TAG, JSON.stringify(shapeIds))
      await context.sync()
    })

    if (hasSession && sessionId) {
      try {
        const snapshot = await fetchSnapshot(binding)
        await updateDiscussionWidget(
          sessionId,
          code,
          snapshot.questions || [],
          snapshot.prompts || []
        )
      } catch (error) {
        console.warn('Failed to refresh open discussion widget', error)
      }
    }
  }
  const insertPollWidget = async (styleOverrides, boundPollId) => {
    const style = normalizePollStyle(styleOverrides)
    const scale = style.spacingScale
    const maxOptions = style.maxOptions
    const binding = await getBinding()
    const sessionId = binding && binding.sessionId ? binding.sessionId : null
    const code = binding ? binding.code : null
    const hasSession = Boolean(sessionId)
    if (boundPollId && !hasSession) {
      throw new Error('Connect a Prezo session before inserting a linked poll widget.')
    }
    const linkPollId = boundPollId ? String(boundPollId) : null
    /** Filled by the shape batch below (header geometry); consumed by the
     * QR insert once the batch has committed. */
    let qrBox = null

    await runPowerPoint(async (context) => {
      const slides = context.presentation.getSelectedSlides()
      slides.load('items')
      const pageSetup = context.presentation.pageSetup
      pageSetup.load(['slideWidth', 'slideHeight'])
      await context.sync()

      const slide = slides.items[0]
      if (!slide) {
        throw new Error('Select a slide before inserting a widget.')
      }

      const existingSessionTag = slide.tags.getItemOrNullObject(POLL_SESSION_TAG)
      const existingShapesTag = slide.tags.getItemOrNullObject(POLL_SHAPES_TAG)
      const existingStyleTag = slide.tags.getItemOrNullObject(POLL_STYLE_TAG)
      existingSessionTag.load('value')
      existingShapesTag.load('value')
      existingStyleTag.load('value')
      await context.sync()

      if (!existingSessionTag.isNullObject && existingSessionTag.value) {
        if (!existingShapesTag.isNullObject && existingShapesTag.value) {
          try {
            const parsed = JSON.parse(existingShapesTag.value)
            const itemIds = (parsed.items || []).flatMap((item) => [
              item.label,
              item.bg,
              item.fill
            ])
            const ids = (parsed.group
              ? [parsed.group, parsed.counter, parsed.qr]
              : [
                  parsed.shadow,
                  parsed.container,
                  parsed.title,
                  parsed.question,
                  parsed.body,
                  parsed.counter,
                  parsed.qr,
                  ...itemIds
                ]
            ).filter(Boolean)
            const shapes = ids.map((id) => slide.shapes.getItemOrNullObject(id))
            shapes.forEach((shape) => shape.load('id'))
            await context.sync()
            shapes.forEach((shape) => {
              if (!shape.isNullObject) {
                shape.delete()
              }
            })
            await context.sync()
          } catch {
            // ignore cleanup errors
          }
        }
        slide.tags.delete(POLL_SESSION_TAG)
        slide.tags.delete(POLL_SHAPES_TAG)
        slide.tags.delete(POLL_STYLE_TAG)
        slide.tags.delete(POLL_BINDING_TAG)
      }

      const isVertical = style.orientation === 'vertical'
      const width = Math.max(360, pageSetup.slideWidth * 0.6)
      const paddingX = 24
      /** Header block: question (heading) + votes under it on the left, QR
       * code on the right — rows clear both at the 108 offset. */
      const optionStartOffset = 108 * scale
      const barThickness = 10 * scale * style.barThicknessScale
      const rowHeight = Math.max(34 * scale, barThickness + 18)
      const verticalLabelHeight = 16 * scale
      const verticalMinBarArea = 120 * scale
      const contentHeight = isVertical
        ? optionStartOffset + verticalMinBarArea + verticalLabelHeight + 32
        : optionStartOffset + rowHeight * MAX_POLL_OPTIONS + 40
      const height = Math.max(220, pageSetup.slideHeight * 0.4, contentHeight)
      const left = (pageSetup.slideWidth - width) / 2
      const top = Math.max(24, (pageSetup.slideHeight - height) / 2)

      /** No shadow shape since 18/08/2026 (mirrors widgetShapes.ts) — new
       * poll widgets insert flat; update passes still tolerate and style
       * shadows on decks that have them. */
      const container = slide.shapes.addGeometricShape('RoundRectangle', {
        left,
        top,
        width,
        height
      })
      container.fill.setSolidColor(style.panelColor)
      container.lineFormat.color = style.borderColor
      container.lineFormat.weight = 1
      container.tags.add(POLL_WIDGET_TAG, 'true')
      container.tags.add('PrezoWidgetRole', 'poll-container')

      /** Simplified header (19/08/2026, mirrors widgetShapes.ts): no branded
       * title line — the bound poll's QUESTION is the heading, the vote
       * counter sits under it, and the session join QR (inserted after this
       * batch, see below) fills the top-right corner. */
      const question = slide.shapes.addTextBox(POLL_BIND_PLACEHOLDER, {
        left: left + 24,
        top: top + 18 * scale,
        width: width - 48 - POLL_QR_SIZE - 12,
        height: 40
      })
      question.textFrame.wordWrap = true
      applyFont(question.textFrame.textRange, style, {
        size: 20,
        bold: true,
        color: style.textColor
      })
      question.tags.add(POLL_WIDGET_TAG, 'true')
      question.tags.add('PrezoWidgetRole', 'poll-question')

      const counter = slide.shapes.addTextBox('0 votes', {
        left: left + 24,
        top: top + 64 * scale,
        width: 200,
        height: 16
      })
      counter.textFrame.wordWrap = true
      applyFont(counter.textFrame.textRange, style, { size: 12, color: style.mutedColor })
      counter.textFrame.textRange.paragraphFormat.horizontalAlignment = 'Left'
      counter.name = 'Prezo Poll Vote Counter'
      counter.tags.add(POLL_WIDGET_TAG, 'true')
      counter.tags.add('PrezoWidgetRole', 'poll-counter')
      counter.tags.add('PrezoPollWidgetAutoText', '0 votes')
      counter.load('id')

      qrBox = {
        left: left + width - 24 - POLL_QR_SIZE,
        top: top + 18 * scale,
        size: POLL_QR_SIZE
      }

      const optionStartTop = top + optionStartOffset
      const fullBarWidth = width - paddingX * 2
      const barLeft = left + paddingX
      const itemShapes = []

      for (let index = 0; index < MAX_POLL_OPTIONS; index += 1) {
        const rowTop = optionStartTop + index * rowHeight
        const columnWidth = fullBarWidth / Math.max(1, maxOptions)
        const baseBarWidth = columnWidth * 0.85
        const verticalBarWidth = Math.min(
          columnWidth * 0.95,
          Math.max(6, baseBarWidth * style.barThicknessScale)
        )
        const columnLeft = left + paddingX + index * columnWidth
        const verticalBarLeft = columnLeft + (columnWidth - verticalBarWidth) / 2
        const verticalBarAreaHeight = Math.max(
          60 * scale,
          height - optionStartOffset - verticalLabelHeight - 24
        )
        const verticalBarTop = optionStartTop
        const showItem = index < maxOptions
        const label = slide.shapes.addTextBox(showItem ? `Option ${index + 1}` : '', {
          left: isVertical ? columnLeft : barLeft,
          top: isVertical ? verticalBarTop + verticalBarAreaHeight + 6 : rowTop,
          width: isVertical ? columnWidth : fullBarWidth,
          height: isVertical ? verticalLabelHeight : 16
        })
        label.textFrame.wordWrap = true
        applyFont(label.textFrame.textRange, style, { size: 13, color: style.textColor })
        label.textFrame.textRange.paragraphFormat.alignment = isVertical ? 'Center' : 'Left'
        label.tags.add(POLL_WIDGET_TAG, 'true')
        label.tags.add('PrezoWidgetRole', 'poll-label')

        const barTop = isVertical ? verticalBarTop : rowTop + 18
        const bg = slide.shapes.addGeometricShape('Rectangle', {
          left: isVertical ? verticalBarLeft : barLeft,
          top: barTop,
          width: isVertical ? verticalBarWidth : fullBarWidth,
          height: isVertical ? verticalBarAreaHeight : barThickness
        })
        bg.fill.setSolidColor(style.barColor)
        bg.fill.transparency = showItem ? 0 : 0.35
        bg.lineFormat.visible = false
        bg.tags.add(POLL_WIDGET_TAG, 'true')
        bg.tags.add('PrezoWidgetRole', 'poll-bar-bg')

        const fillHeight = isVertical
          ? Math.max(2, verticalBarAreaHeight * 0.35)
          : barThickness
        const fill = slide.shapes.addGeometricShape('Rectangle', {
          left: isVertical ? verticalBarLeft : barLeft,
          top: isVertical ? barTop + (verticalBarAreaHeight - fillHeight) : barTop,
          width: isVertical ? verticalBarWidth : showItem ? Math.max(2, fullBarWidth * 0.35) : 2,
          height: isVertical ? fillHeight : barThickness
        })
        fill.fill.setSolidColor(style.accentColor)
        fill.fill.transparency = showItem ? 0 : 1
        fill.lineFormat.visible = false
        fill.tags.add(POLL_WIDGET_TAG, 'true')
        fill.tags.add('PrezoWidgetRole', 'poll-bar-fill')

        itemShapes.push({ label, bg, fill, group: null })
      }

      /** PLATFORM FACT: addGroup throws InvalidArgument on desktop hosts
       * when the grouped shapes were created in the SAME un-synced batch
       * (and the abort leaves shapes stranded) — flush creation first. */
      await context.sync()

      itemShapes.forEach((item, index) => {
        /** Rows group as label + track + fill (17/08/2026, mirrors
         * widgetShapes.ts): the label moves with its bars so a designer
         * can't accidentally pair a label with the wrong option; ungroup
         * is the deliberate escape hatch. */
        const rowGroup = slide.shapes.addGroup([item.label, item.bg, item.fill])
        rowGroup.name = `Prezo Poll Option ${index + 1} Row`
        rowGroup.tags.add(POLL_WIDGET_TAG, 'true')
        rowGroup.tags.add('PrezoWidgetRole', 'poll-bar-group')
        item.group = rowGroup
        item.label.load('id')
        rowGroup.load('id')
        item.bg.load('id')
        item.fill.load('id')
      })

      container.load('id')
      question.load('id')
      await context.sync()

      const shapeIds = {
        container: container.id,
        question: question.id,
        counter: counter.id,
        /** Header-layout generation marker: v3 = question heading + votes
         * under it + QR corner, rows at the 108 offset. The short-lived
         * titleless generation before it (rows at 76) has no marker. */
        layoutV: 3,
        items: itemShapes.map((item) => ({
          label: item.label.id,
          group: item.group.id,
          bg: item.bg.id,
          fill: item.fill.id
        }))
      }

      if (hasSession && sessionId) {
        slide.tags.add(POLL_SESSION_TAG, sessionId)
        slide.tags.delete(POLL_PENDING_TAG)
      } else {
        slide.tags.add(POLL_PENDING_TAG, 'true')
        slide.tags.delete(POLL_SESSION_TAG)
      }
      /** Linked insert: write the explicit binding here so the post-insert
       * refresh below renders the poll immediately — same contract as the
       * panel's Link widget action, just fused into the insert. Unlinked
       * inserts stay bind-explicit (no auto-follow). */
      if (linkPollId) {
        slide.tags.add(POLL_BINDING_TAG, linkPollId)
      } else {
        slide.tags.delete(POLL_BINDING_TAG)
      }
      slide.tags.add(POLL_STYLE_TAG, JSON.stringify(style))
      slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(shapeIds))
      await context.sync()
    })

    /** QR code: PowerPoint's shape API cannot insert pictures, so the join
     * QR goes in via setSelectedDataAsync (image coercion) on the still-
     * selected slide, then one adopt pass finds the fresh untagged picture
     * at the requested spot to tag it and record its id. Best-effort — no
     * session (no join URL) or no encoder simply means no QR. */
    const joinUrl = binding && binding.joinUrl ? String(binding.joinUrl) : ''
    if (hasSession && joinUrl && typeof window.qrcode === 'function' && qrBox) {
      try {
        /** Level L + navy modules match the taskpane's copy-paste QR
         * (SessionAudienceAccessCard) so the two never look mismatched. */
        const qr = window.qrcode(0, 'L')
        qr.addData(joinUrl)
        qr.make()
        const base64 = qrPngBase64(qr, 300)
        if (base64 && (await insertImageOnSelectedSlide(base64, qrBox))) {
          await adoptPollQrPicture(qrBox)
        }
      } catch (error) {
        console.warn('Poll widget QR insert failed', error)
      }
    }

    if (hasSession && sessionId) {
      try {
        const snapshot = await fetchSnapshot(binding)
        await updatePollWidget(sessionId, code, snapshot.polls || [])
      } catch (error) {
        console.warn('Failed to refresh poll widget', error)
      }
    }
  }

  /** Rasterize a made QR to base64 PNG (white quiet zone, black modules) —
   * setSelectedDataAsync is happiest with PNG; the encoder's own
   * createDataURL emits GIF. */
  const qrPngBase64 = (qr, sizePx) => {
    try {
      const count = qr.getModuleCount()
      const cell = Math.max(2, Math.floor(sizePx / (count + 8)))
      const margin = cell * 4
      const canvasSize = count * cell + margin * 2
      const canvas = document.createElement('canvas')
      canvas.width = canvasSize
      canvas.height = canvasSize
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return null
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvasSize, canvasSize)
      ctx.fillStyle = '#0f172a'
      for (let row = 0; row < count; row += 1) {
        for (let col = 0; col < count; col += 1) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(margin + col * cell, margin + row * cell, cell, cell)
          }
        }
      }
      const dataUrl = canvas.toDataURL('image/png')
      return dataUrl.slice(dataUrl.indexOf(',') + 1)
    } catch {
      return null
    }
  }

  /** Insert a base64 image on the currently selected slide at the given box
   * (points). The Common API is the only picture-insert path PowerPoint's
   * add-in surface offers — it returns no shape reference. */
  const insertImageOnSelectedSlide = (base64, box) =>
    new Promise((resolve) => {
      try {
        Office.context.document.setSelectedDataAsync(
          base64,
          {
            coercionType: Office.CoercionType.Image,
            imageLeft: box.left,
            imageTop: box.top,
            imageWidth: box.size,
            imageHeight: box.size
          },
          (result) =>
            resolve(Boolean(result) && result.status === Office.AsyncResultStatus.Succeeded)
        )
      } catch {
        resolve(false)
      }
    })

  /** Tag the picture setSelectedDataAsync just dropped: the untagged
   * Image-type shape at the requested box on the selected slide is ours.
   * Records its id into POLL_SHAPES_TAG so replace-cleanup can delete it. */
  const adoptPollQrPicture = async (box) => {
    await runPowerPoint(async (context) => {
      const slides = context.presentation.getSelectedSlides()
      slides.load('items')
      await context.sync()
      const slide = slides.items[0]
      if (!slide) {
        return
      }
      const scope = slide.shapes
      scope.load('items')
      await context.sync()
      const candidates = scope.items.map((shape) => {
        const pollTag = shape.tags.getItemOrNullObject(POLL_WIDGET_TAG)
        pollTag.load('value')
        shape.load(['id', 'left', 'top', 'type'])
        return { shape, pollTag }
      })
      await context.sync()
      const near = (a, b) => Math.abs(a - b) <= 8
      const found = candidates.find(
        ({ shape, pollTag }) =>
          pollTag.isNullObject &&
          (shape.type === 'Image' || shape.type === 'Picture') &&
          near(shape.left, box.left) &&
          near(shape.top, box.top)
      )
      if (!found) {
        return
      }
      found.shape.name = 'Prezo Poll Join QR'
      found.shape.tags.add(POLL_WIDGET_TAG, 'true')
      found.shape.tags.add('PrezoWidgetRole', 'poll-qr')
      const shapesTag = slide.tags.getItemOrNullObject(POLL_SHAPES_TAG)
      shapesTag.load('value')
      await context.sync()
      try {
        const parsed =
          shapesTag.isNullObject || !shapesTag.value ? null : JSON.parse(shapesTag.value)
        if (parsed) {
          parsed.qr = found.shape.id
          slide.tags.delete(POLL_SHAPES_TAG)
          slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(parsed))
        }
      } catch {
        // Tag unreadable — the QR stays visible, just untracked.
      }
      await context.sync()
    })
  }

  /**
   * Inserts the pre-embedded game slide (public/game-slide.pptx, sanitized so
   * it ships with no embedId — each inserted copy mints its own identity on
   * first load). Spike note: insertSlidesFromBase64 is documented for slide
   * reuse; whether the slide's webextension (content add-in) survives and
   * loads live is exactly what this path exists to prove.
   */
  const GAME_SLIDE_TEMPLATE_URL = `${window.location.origin}/game-slide.pptx`

  const fetchGameSlideBase64 = async () => {
    const response = await fetch(GAME_SLIDE_TEMPLATE_URL, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? 'The game slide template is not on the server yet (game-slide.pptx).'
          : `Could not download the game slide template (HTTP ${response.status}).`
      )
    }
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // Chunked conversion: String.fromCharCode.apply on the whole buffer
    // overflows the argument limit for files beyond ~100KB.
    let binary = ''
    const CHUNK_SIZE = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))
    }
    return btoa(binary)
  }

  /** Resolves the selected slide as an insertSlidesFromBase64 target id, or null to use the default position. */
  const getSelectedSlideTargetId = () =>
    new Promise((resolve) => {
      try {
        Office.context.document.getSelectedDataAsync(
          Office.CoercionType.SlideRange,
          (result) => {
            const slide =
              result.status === Office.AsyncResultStatus.Succeeded &&
              result.value &&
              Array.isArray(result.value.slides)
                ? result.value.slides[0]
                : null
            if (slide && slide.id !== undefined && slide.id !== null) {
              resolve(`${slide.id}#`)
              return
            }
            resolve(null)
          }
        )
      } catch (error) {
        resolve(null)
      }
    })

  const insertGameSlide = async () => {
    if (
      typeof PowerPoint === 'undefined' ||
      !Office.context.requirements.isSetSupported('PowerPointApi', '1.2')
    ) {
      throw new Error(
        'Inserting slides needs a newer PowerPoint version (PowerPointApi 1.2).'
      )
    }
    const base64 = await fetchGameSlideBase64()
    const targetSlideId = await getSelectedSlideTargetId()
    await PowerPoint.run(async (context) => {
      // Snapshot slide ids so the inserted slide can be found and selected.
      const slidesBefore = context.presentation.slides
      slidesBefore.load('items/id')
      await context.sync()
      const beforeIds = {}
      slidesBefore.items.forEach((slide) => {
        beforeIds[slide.id] = true
      })

      // UseDestinationTheme: the inserted slide adopts the host deck's
      // theme/master instead of dragging the seed deck's along, so the game
      // slide blends with the presentation it lands in.
      const options = { formatting: 'UseDestinationTheme' }
      if (targetSlideId) {
        options.targetSlideId = targetSlideId
      }
      context.presentation.insertSlidesFromBase64(base64, options)
      await context.sync()

      // Land the user on the new slide (best effort; needs PowerPointApi 1.5).
      if (Office.context.requirements.isSetSupported('PowerPointApi', '1.5')) {
        const slidesAfter = context.presentation.slides
        slidesAfter.load('items/id')
        await context.sync()
        const added = slidesAfter.items.find((slide) => !beforeIds[slide.id])
        if (added) {
          context.presentation.setSelectedSlides([added.id])
          await context.sync()
        }
      }
    })
  }

  /**
   * Widget lifecycle helpers. PowerPoint gives add-ins no undo transactions —
   * a widget insert is dozens of shape operations across several batches, so
   * Ctrl+Z can never cleanly reverse it. Lifecycle is therefore explicit:
   * inserts never silently delete an existing widget (the dialog asks first)
   * and removal is a dedicated action rather than a doomed undo hunt.
   */
  const WIDGET_FAMILIES = {
    poll: {
      widgetTag: POLL_WIDGET_TAG,
      shapesTag: POLL_SHAPES_TAG,
      slideTags: [
        POLL_SESSION_TAG,
        POLL_PENDING_TAG,
        POLL_STYLE_TAG,
        POLL_SHAPES_TAG,
        POLL_BINDING_TAG
      ],
      collectIds: (parsed) => {
        const itemIds = (parsed.items || []).flatMap((item) => [
          item.label,
          item.group,
          item.bg,
          item.fill
        ])
        return [
          parsed.group,
          parsed.shadow,
          parsed.container,
          parsed.title,
          parsed.question,
          parsed.body,
          parsed.counter,
          ...itemIds
        ]
      }
    },
    qna: {
      widgetTag: WIDGET_TAG,
      shapesTag: SHAPES_TAG,
      slideTags: [
        SESSION_TAG,
        WIDGET_PENDING_TAG,
        WIDGET_STYLE_TAG,
        SHAPES_TAG,
        LEGACY_QNA_MODE_TAG,
        LEGACY_QNA_PROMPT_TAG,
        QNA_PROMPT_BINDING_TAG
      ],
      collectIds: (parsed) => {
        const itemIds = (parsed.items || []).flatMap((item) => [
          item.container,
          item.text,
          item.votes
        ])
        return [
          parsed.shadow,
          parsed.container,
          parsed.title,
          parsed.subtitle,
          parsed.meta,
          parsed.badge,
          parsed.body,
          parsed.counter,
          ...itemIds
        ]
      }
    },
    discussion: {
      widgetTag: DISCUSSION_WIDGET_TAG,
      shapesTag: DISCUSSION_SHAPES_TAG,
      slideTags: [
        DISCUSSION_SESSION_TAG,
        DISCUSSION_PENDING_TAG,
        DISCUSSION_STYLE_TAG,
        DISCUSSION_SHAPES_TAG,
        DISCUSSION_PROMPT_BINDING_TAG
      ],
      collectIds: (parsed) => {
        const itemIds = (parsed.items || []).flatMap((item) => [
          item.container,
          item.text,
          item.votes
        ])
        return [
          parsed.shadow,
          parsed.container,
          parsed.title,
          parsed.subtitle,
          parsed.meta,
          parsed.badge,
          parsed.body,
          parsed.counter,
          ...itemIds
        ]
      }
    }
  }

  const getSelectedSlideForLifecycle = async (context) => {
    const slides = context.presentation.getSelectedSlides()
    slides.load('items')
    await context.sync()
    const slide = slides.items[0]
    if (!slide) {
      throw new Error('Select a slide first.')
    }
    return slide
  }

  /** Shapes carrying the family tag on the slide. NOTE: slide.shapes can
   * surface a group AND the tagged children inside it — callers must treat
   * the returned list as containing potential group/child duplicates. */
  const loadTaggedFamilyShapes = async (context, slide, family) => {
    const shapes = slide.shapes
    shapes.load('items')
    await context.sync()
    const tagged = shapes.items.map((shape) => {
      const tag = shape.tags.getItemOrNullObject(family.widgetTag)
      tag.load('value')
      shape.load(['id', 'type'])
      return { shape, tag }
    })
    await context.sync()
    return tagged
      .filter(({ tag }) => !tag.isNullObject && tag.value === 'true')
      .map(({ shape }) => shape)
  }

  const selectedSlideHasWidget = async (familyKey) => {
    const family = WIDGET_FAMILIES[familyKey]
    let found = false
    await runPowerPoint(async (context) => {
      const slide = await getSelectedSlideForLifecycle(context)
      const shapesTag = slide.tags.getItemOrNullObject(family.shapesTag)
      shapesTag.load('value')
      await context.sync()
      if (!shapesTag.isNullObject && shapesTag.value) {
        /** Manually deleting the widget shapes leaves the slide tags behind,
         * so a stale shapes tag alone must not count as "has widget" (it
         * used to trigger a bogus replace warning). Trust it only if at
         * least one referenced shape is still on the slide; otherwise fall
         * through to the live tag scan. */
        try {
          const parsed = JSON.parse(shapesTag.value)
          const ids = family.collectIds(parsed).filter(Boolean)
          const stored = ids.map((id) => slide.shapes.getItemOrNullObject(id))
          stored.forEach((shape) => shape.load('id'))
          await context.sync()
          if (stored.some((shape) => !shape.isNullObject)) {
            found = true
            return
          }
        } catch {
          // Unparseable tag — the tag scan below decides.
        }
      }
      const taggedShapes = await loadTaggedFamilyShapes(context, slide, family)
      found = taggedShapes.length > 0
    })
    return found
  }

  /** Delete every shape of the family on the selected slide (stored ids plus
   * tag scan, deduped) and clear its slide tags. Returns true if anything was
   * actually removed. */
  const removeWidgetFromSelectedSlide = async (familyKey) => {
    const family = WIDGET_FAMILIES[familyKey]
    let removed = false
    await runPowerPoint(async (context) => {
      const slide = await getSelectedSlideForLifecycle(context)
      const shapesTag = slide.tags.getItemOrNullObject(family.shapesTag)
      shapesTag.load('value')
      await context.sync()

      let storedShapes = []
      if (!shapesTag.isNullObject && shapesTag.value) {
        try {
          const parsed = JSON.parse(shapesTag.value)
          const ids = family.collectIds(parsed).filter(Boolean)
          storedShapes = ids.map((id) => slide.shapes.getItemOrNullObject(id))
          storedShapes.forEach((shape) => shape.load(['id', 'type']))
          await context.sync()
        } catch {
          storedShapes = []
        }
      }

      const taggedShapes = await loadTaggedFamilyShapes(context, slide, family)
      const seenIds = {}
      const deletable = []
      storedShapes.concat(taggedShapes).forEach((shape) => {
        if (shape.isNullObject) {
          return
        }
        if (seenIds[shape.id]) {
          return
        }
        seenIds[shape.id] = true
        deletable.push(shape)
      })

      /**
       * Delete groups first and give EVERY delete its own isolated sync.
       * The candidate list can contain a bar group and the child shapes
       * inside it (both carry the family tag, and slide.shapes surfaces
       * both); deleting the group kills its children, and a second delete
       * on a dead child throws GeneralException. RichApi batches are not
       * atomic — that mid-batch throw used to leave the widget
       * half-deleted. Isolation turns it into a harmless no-op.
       */
      const groups = deletable.filter((shape) => shape.type === 'Group')
      const loose = deletable.filter((shape) => shape.type !== 'Group')
      for (const shape of groups.concat(loose)) {
        try {
          shape.delete()
          await context.sync()
          removed = true
        } catch {
          // Already gone (child of a group deleted above) — fine.
        }
      }
      family.slideTags.forEach((tagName) => slide.tags.delete(tagName))
      await context.sync()
    })
    return removed
  }

  /**
   * Saved widget design presets, owned here because the dialog webview has
   * no reliable storage of its own (same reason the poll picker asks us for
   * poll state). Kind-generic storage; the dialog UI adopts kinds one at a
   * time (poll first).
   */
  const PRESET_STORE_KEY = 'prezo.widgetStylePresets.v1'
  const PRESET_LIMIT = 30
  const PRESET_KINDS = {
    poll: { normalize: normalizePollStyle, styleTag: POLL_STYLE_TAG, label: 'poll' },
    qna: { normalize: normalizeQnaStyle, styleTag: WIDGET_STYLE_TAG, label: 'Q&A' },
    discussion: {
      normalize: normalizeQnaStyle,
      styleTag: DISCUSSION_STYLE_TAG,
      label: 'open discussion'
    }
  }

  const readPresetStore = () => {
    try {
      if (!window.localStorage) return {}
      const raw = localStorage.getItem(PRESET_STORE_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  const writePresetStore = (store) => {
    try {
      if (!window.localStorage) return false
      localStorage.setItem(PRESET_STORE_KEY, JSON.stringify(store))
      return true
    } catch {
      return false
    }
  }

  const presetsForKind = (store, kind) => {
    const bucket = store[kind]
    const presets = bucket && Array.isArray(bucket.presets) ? bucket.presets : []
    const defaultId =
      bucket && typeof bucket.defaultId === 'string' ? bucket.defaultId : null
    return {
      presets: presets.filter(
        (preset) =>
          preset &&
          typeof preset.id === 'string' &&
          typeof preset.name === 'string' &&
          preset.style &&
          typeof preset.style === 'object'
      ),
      defaultId
    }
  }

  const sendWidgetPresets = (kind, savedId) => {
    if (!activeDialog) return
    const { presets, defaultId } = presetsForKind(readPresetStore(), kind)
    activeDialog.messageChild(
      JSON.stringify({
        type: 'widget-presets',
        kind,
        presets,
        defaultId,
        savedId: savedId || null
      })
    )
  }

  const sendPresetError = (kind, message) => {
    if (!activeDialog) return
    activeDialog.messageChild(
      JSON.stringify({ type: 'widget-preset-error', kind, message })
    )
  }

  const newPresetId = () =>
    `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  const handleDialogMessage = async (arg) => {
    if (!activeDialog) {
      return
    }
    let message = arg.message
    try {
      message = JSON.parse(arg.message)
    } catch {
      // allow raw string
    }
    if (message && message.type === 'insert-qna') {
      try {
        /** Never silently destroy an existing (possibly designer-customized)
         * widget: without an explicit replace flag, bounce back to the dialog
         * for confirmation. Checked before the Q&A config save so a canceled
         * insert has no side effects. */
        if (!message.replace && (await selectedSlideHasWidget('qna'))) {
          activeDialog.messageChild(
            JSON.stringify({ type: 'confirm-replace', source: 'qna' })
          )
          return
        }
        const binding = await getBinding()
        if (
          message.qna &&
          message.qna.mode === 'prompt' &&
          (!binding || !binding.sessionId)
        ) {
          throw new Error('Start a session in the host add-in before using prompt mode.')
        }
        if (message.qna && binding && binding.sessionId) {
          await updateQnaConfig(binding, message.qna)
        }
        if (message.replace) {
          await removeWidgetFromSelectedSlide('qna')
        }
        await insertWidget(message.style, message.qna)
        activeDialog.messageChild(JSON.stringify({ type: 'inserted' }))
        activeDialog.close()
        activeDialog = null
      } catch (error) {
        const detail = error && error.message ? error.message : 'Failed to insert widget'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'qna', message: detail })
        )
      }
    }
    if (message && message.type === 'request-poll-state') {
      /** The dialog's "Linked poll" picker: it cannot reach the API itself
       * (dialog webviews don't reliably share auth storage), so the poll
       * list is fetched here and pushed back over the message channel. */
      let binding = null
      try {
        binding = await getBinding()
      } catch {
        binding = null
      }
      /** A deck binding for a session the panel already left reads as
       * "no session" here — otherwise the picker serves stale polls. */
      const liveSessionId = getLiveHostSessionId()
      if (!binding || !binding.sessionId || binding.sessionId !== liveSessionId) {
        activeDialog.messageChild(
          JSON.stringify({ type: 'poll-state', hasSession: false, polls: [] })
        )
        return
      }
      try {
        const snapshot = await fetchSnapshot(binding)
        const polls = (snapshot.polls || []).map((poll) => ({
          id: poll.id,
          question: poll.question,
          status: poll.status,
          options: (poll.options || []).map((option) => ({
            label: option.label,
            votes: option.votes || 0
          }))
        }))
        activeDialog.messageChild(
          JSON.stringify({ type: 'poll-state', hasSession: true, polls })
        )
      } catch (error) {
        const detail = error && error.message ? error.message : 'Failed to load polls'
        activeDialog.messageChild(
          JSON.stringify({ type: 'poll-state', hasSession: true, polls: [], error: detail })
        )
      }
      return
    }
    if (message && message.type === 'insert-poll') {
      try {
        if (!message.replace && (await selectedSlideHasWidget('poll'))) {
          activeDialog.messageChild(
            JSON.stringify({ type: 'confirm-replace', source: 'poll' })
          )
          return
        }
        if (message.replace) {
          await removeWidgetFromSelectedSlide('poll')
        }
        await insertPollWidget(message.style, message.pollId || null)
        activeDialog.messageChild(JSON.stringify({ type: 'poll-inserted' }))
        activeDialog.close()
        activeDialog = null
      } catch (error) {
        const detail = error && error.message ? error.message : 'Failed to insert poll widget'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'poll', message: detail })
        )
      }
    }
    if (message && message.type === 'insert-discussion') {
      try {
        if (!message.replace && (await selectedSlideHasWidget('discussion'))) {
          activeDialog.messageChild(
            JSON.stringify({ type: 'confirm-replace', source: 'discussion' })
          )
          return
        }
        if (message.replace) {
          await removeWidgetFromSelectedSlide('discussion')
        }
        await insertDiscussionWidget(message.style)
        activeDialog.messageChild(JSON.stringify({ type: 'discussion-inserted' }))
        activeDialog.close()
        activeDialog = null
      } catch (error) {
        const detail =
          error && error.message ? error.message : 'Failed to insert open discussion widget'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'discussion', message: detail })
        )
      }
    }
    if (message && message.type === 'remove-qna') {
      try {
        if (!(await selectedSlideHasWidget('qna'))) {
          throw new Error('No Q&A widget found on the selected slide.')
        }
        await removeWidgetFromSelectedSlide('qna')
        activeDialog.messageChild(JSON.stringify({ type: 'removed', source: 'qna' }))
      } catch (error) {
        const detail = error && error.message ? error.message : 'Failed to remove widget'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'qna', message: detail })
        )
      }
    }
    if (message && message.type === 'remove-poll') {
      try {
        if (!(await selectedSlideHasWidget('poll'))) {
          throw new Error('No poll widget found on the selected slide.')
        }
        await removeWidgetFromSelectedSlide('poll')
        activeDialog.messageChild(JSON.stringify({ type: 'removed', source: 'poll' }))
      } catch (error) {
        const detail = error && error.message ? error.message : 'Failed to remove poll widget'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'poll', message: detail })
        )
      }
    }
    if (message && message.type === 'remove-discussion') {
      try {
        if (!(await selectedSlideHasWidget('discussion'))) {
          throw new Error('No open discussion widget found on the selected slide.')
        }
        await removeWidgetFromSelectedSlide('discussion')
        activeDialog.messageChild(
          JSON.stringify({ type: 'removed', source: 'discussion' })
        )
      } catch (error) {
        const detail =
          error && error.message ? error.message : 'Failed to remove open discussion widget'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'discussion', message: detail })
        )
      }
    }
    if (message && message.type === 'request-widget-presets') {
      const kind = PRESET_KINDS[message.kind] ? message.kind : null
      if (kind) {
        sendWidgetPresets(kind)
      }
      return
    }
    if (message && message.type === 'save-widget-preset') {
      const kind = PRESET_KINDS[message.kind] ? message.kind : null
      if (!kind) return
      try {
        const preset = message.preset || {}
        const name = String(preset.name || '').trim().slice(0, 60)
        if (!name) {
          throw new Error('Give the design a name.')
        }
        const style = PRESET_KINDS[kind].normalize(preset.style || {})
        const store = readPresetStore()
        const bucket = presetsForKind(store, kind)
        const id = typeof preset.id === 'string' && preset.id ? preset.id : newPresetId()
        const existingIndex = bucket.presets.findIndex((entry) => entry.id === id)
        if (existingIndex === -1 && bucket.presets.length >= PRESET_LIMIT) {
          throw new Error(
            `Preset limit reached (${PRESET_LIMIT}). Delete a design you no longer use.`
          )
        }
        const record = { id, name, style, updatedAt: new Date().toISOString() }
        if (existingIndex === -1) {
          bucket.presets.push(record)
        } else {
          bucket.presets[existingIndex] = record
        }
        store[kind] = bucket
        if (!writePresetStore(store)) {
          throw new Error('Could not save the design on this machine.')
        }
        sendWidgetPresets(kind, id)
      } catch (error) {
        sendPresetError(kind, error && error.message ? error.message : 'Could not save the design.')
      }
      return
    }
    if (message && message.type === 'delete-widget-preset') {
      const kind = PRESET_KINDS[message.kind] ? message.kind : null
      if (!kind) return
      const store = readPresetStore()
      const bucket = presetsForKind(store, kind)
      bucket.presets = bucket.presets.filter((entry) => entry.id !== message.id)
      if (bucket.defaultId === message.id) {
        bucket.defaultId = null
      }
      store[kind] = bucket
      if (!writePresetStore(store)) {
        sendPresetError(kind, 'Could not update saved designs on this machine.')
        return
      }
      sendWidgetPresets(kind)
      return
    }
    if (message && message.type === 'set-default-widget-preset') {
      const kind = PRESET_KINDS[message.kind] ? message.kind : null
      if (!kind) return
      const store = readPresetStore()
      const bucket = presetsForKind(store, kind)
      bucket.defaultId =
        typeof message.id === 'string' &&
        bucket.presets.some((entry) => entry.id === message.id)
          ? message.id
          : null
      store[kind] = bucket
      if (!writePresetStore(store)) {
        sendPresetError(kind, 'Could not update saved designs on this machine.')
        return
      }
      sendWidgetPresets(kind)
      return
    }
    if (message && message.type === 'request-slide-widget-style') {
      const kind = PRESET_KINDS[message.kind] ? message.kind : null
      if (!kind) return
      try {
        let styleValue = null
        await runPowerPoint(async (context) => {
          const slide = await getSelectedSlideForLifecycle(context)
          const styleTag = slide.tags.getItemOrNullObject(PRESET_KINDS[kind].styleTag)
          styleTag.load('value')
          await context.sync()
          if (!styleTag.isNullObject && styleTag.value) {
            styleValue = styleTag.value
          }
        })
        if (!styleValue) {
          throw new Error(
            `No ${PRESET_KINDS[kind].label} widget design found on the selected slide.`
          )
        }
        const style = PRESET_KINDS[kind].normalize(JSON.parse(styleValue))
        activeDialog.messageChild(
          JSON.stringify({ type: 'slide-widget-style', kind, style })
        )
      } catch (error) {
        sendPresetError(
          kind,
          error && error.message
            ? error.message
            : 'Could not read the design from the selected slide.'
        )
      }
      return
    }
    if (message && message.type === 'insert-game') {
      try {
        await insertGameSlide()
        activeDialog.messageChild(JSON.stringify({ type: 'game-inserted' }))
        activeDialog.close()
        activeDialog = null
      } catch (error) {
        const detail =
          error && error.message ? error.message : 'Failed to insert the game slide'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'game', message: detail })
        )
      }
    }
  }

  function openWidgetsDialog(event) {
    addinDebug.openAt = new Date().toISOString()
    addinDebug.openMessage = 'Attempting to open dialog...'
    updateDebugState({
      openAt: addinDebug.openAt,
      openMessage: addinDebug.openMessage
    })
    if (event && event.completed) {
      event.completed()
    }
    const tryOpen = (options, fallback) => {
      Office.context.ui.displayDialogAsync(DIALOG_URL, options, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          activeDialog = result.value
          addinDebug.openMessage = 'Dialog opened.'
          updateDebugState({ openMessage: addinDebug.openMessage })
          activeDialog.addEventHandler(
            Office.EventType.DialogMessageReceived,
            handleDialogMessage
          )
          activeDialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
            activeDialog = null
          })
          return
        }

        const errorMessage =
          (result.error && (result.error.message || result.error.code)) ||
          'Failed to open widget dialog.'
        console.warn('Prezo dialog failed', errorMessage)
        addinDebug.openMessage = `Dialog failed: ${errorMessage}`
        updateDebugState({ openMessage: addinDebug.openMessage })
        if (fallback) {
          fallback()
        }
      })
    }

    tryOpen(
      { height: 70, width: 60, displayInIframe: true },
      () => tryOpen({ height: 70, width: 60 })
    )

  }

  Office.onReady(() => {
    if (Office.actions && Office.actions.associate) {
      Office.actions.associate('Prezo.OpenWidgetsDialog', openWidgetsDialog)
    }
  })
})()


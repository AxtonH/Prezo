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
      return {
        sessionId: sessionNode.textContent,
        code: codeNode ? codeNode.textContent : null,
        apiBaseUrl: apiBaseNode ? apiBaseNode.textContent : null
      }
    } catch {
      return null
    }
  }

  const getBinding = () =>
    PowerPoint.run(async (context) => {
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

  const pickPoll = (polls) => {
    if (!polls || polls.length === 0) {
      return null
    }
    const open = polls.find((poll) => poll.status === 'open')
    if (open) {
      return open
    }
    const sorted = [...polls].sort((a, b) => {
      const aTime = Date.parse(a.created_at)
      const bTime = Date.parse(b.created_at)
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0
      }
      return bTime - aTime
    })
    return sorted[0] || polls[0]
  }

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
    await PowerPoint.run(async (context) => {
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

  const updatePollWidget = async (sessionId, code, polls) => {
    const pollMap = new Map((polls || []).map((poll) => [poll.id, poll]))
    const titleText = buildPollTitle(code)

    await PowerPoint.run(async (context) => {
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

        if (!title || !container || labels.length === 0 || bars.length === 0 || fills.length === 0) {
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
          title: title.id,
          question: question ? question.id : undefined,
          body: body ? body.id : undefined,
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
        const poll = boundPollId ? pollMap.get(boundPollId) || null : pickPoll(polls || [])
        const optionData = buildPollOptions(poll)
        const questionText =
          boundPollId && !poll ? 'Poll not found.' : buildPollQuestion(poll)
        const isVertical = style.orientation === 'vertical'
        const visibleOptions = poll
          ? Math.max(1, Math.min(optionData.length, MAX_POLL_OPTIONS))
          : style.maxOptions
        const hasPollData = Boolean(poll)

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

        let itemShapes = (shapeIds.items || []).map((item) => {
          const label = resolveShape(item.label)
          const bg = resolveShape(item.bg)
          const fill = resolveShape(item.fill)
          label.load('id')
          bg.load(['id', 'width', 'left'])
          fill.load('id')
          return { label, bg, fill }
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
            applyFont(questionShape.textFrame.textRange, style, {
              size: 14,
              color: style.mutedColor
            })
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
        const optionStartOffset = 108 * scale
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

        itemShapes.forEach((item, index) => {
          const data = optionData[index]
          if (item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject) {
            return
          }
          if (!data || index >= visibleOptions) {
            item.label.textFrame.textRange.text = ''
            if (isVertical) {
              const barHeight = item.bg.height
              item.fill.height = 2
              item.fill.top = item.bg.top + Math.max(0, barHeight - 2)
              item.fill.width = item.bg.width
              item.fill.left = item.bg.left
            } else {
              item.fill.width = 2
              item.fill.height = item.bg.height
              item.fill.left = item.bg.left
              item.fill.top = item.bg.top
            }
            item.fill.fill.transparency = 1
            item.bg.fill.transparency = hasPollData ? 1 : 0.35
            return
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
    await PowerPoint.run(async (context) => {
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

    await PowerPoint.run(async (context) => {
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

    await PowerPoint.run(async (context) => {
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
  const insertPollWidget = async (styleOverrides) => {
    const style = normalizePollStyle(styleOverrides)
    const scale = style.spacingScale
    const maxOptions = style.maxOptions
    const binding = await getBinding()
    const sessionId = binding && binding.sessionId ? binding.sessionId : null
    const code = binding ? binding.code : null
    const hasSession = Boolean(sessionId)

    await PowerPoint.run(async (context) => {
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
              ? [parsed.group]
              : [
                  parsed.shadow,
                  parsed.container,
                  parsed.title,
                  parsed.question,
                  parsed.body,
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

      const shadow = slide.shapes.addGeometricShape('RoundRectangle', {
        left: left + 4,
        top: top + 6,
        width,
        height
      })
      shadow.fill.setSolidColor(style.shadowColor)
      shadow.fill.transparency = style.shadowOpacity
      shadow.lineFormat.visible = false
      shadow.tags.add(POLL_WIDGET_TAG, 'true')
      shadow.tags.add('PrezoWidgetRole', 'poll-shadow')

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

      const title = slide.shapes.addTextBox(buildPollTitle(code), {
        left: left + 24,
        top: top + 18 * scale,
        width: width - 48,
        height: 40
      })
      title.textFrame.wordWrap = true
      applyFont(title.textFrame.textRange, style, {
        size: 20,
        bold: true,
        color: style.textColor
      })
      title.tags.add(POLL_WIDGET_TAG, 'true')
      title.tags.add('PrezoWidgetRole', 'poll-title')

      const question = slide.shapes.addTextBox('No polls yet.', {
        left: left + 24,
        top: top + 62 * scale,
        width: width - 48,
        height: 40
      })
      question.textFrame.wordWrap = true
      applyFont(question.textFrame.textRange, style, { size: 14, color: style.mutedColor })
      question.tags.add(POLL_WIDGET_TAG, 'true')
      question.tags.add('PrezoWidgetRole', 'poll-question')

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

        label.load('id')
        bg.load('id')
        fill.load('id')
        itemShapes.push({ label, bg, fill })
      }

      shadow.load('id')
      container.load('id')
      title.load('id')
      question.load('id')
      await context.sync()

      const shapeIds = {
        shadow: shadow.id,
        container: container.id,
        title: title.id,
        question: question.id,
        items: itemShapes.map((item) => ({
          label: item.label.id,
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
      slide.tags.delete(POLL_BINDING_TAG)
      slide.tags.add(POLL_STYLE_TAG, JSON.stringify(style))
      slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(shapeIds))
      await context.sync()
    })

    if (hasSession && sessionId) {
      try {
        const snapshot = await fetchSnapshot(binding)
        await updatePollWidget(sessionId, code, snapshot.polls || [])
      } catch (error) {
        console.warn('Failed to refresh poll widget', error)
      }
    }
  }

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
    if (message && message.type === 'insert-poll') {
      try {
        await insertPollWidget(message.style)
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


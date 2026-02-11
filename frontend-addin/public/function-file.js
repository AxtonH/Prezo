/* global Office, PowerPoint */
(() => {
  const DIALOG_URL = `${window.location.origin}/widget-dialog/`
  const PREZO_NAMESPACE = 'https://prezo.app/session-binding'
  const WIDGET_TAG = 'PrezoWidget'
  const SESSION_TAG = 'PrezoWidgetSessionId'
  const SHAPES_TAG = 'PrezoWidgetShapeIds'
  const WIDGET_PENDING_TAG = 'PrezoWidgetPending'
  const WIDGET_STYLE_TAG = 'PrezoWidgetStyle'
  const POLL_WIDGET_TAG = 'PrezoPollWidget'
  const POLL_SESSION_TAG = 'PrezoPollWidgetSessionId'
  const POLL_SHAPES_TAG = 'PrezoPollWidgetShapeIds'
  const POLL_PENDING_TAG = 'PrezoPollWidgetPending'
  const POLL_STYLE_TAG = 'PrezoPollWidgetStyle'
  const WORD_CLOUD_WIDGET_TAG = 'PrezoWordCloudWidget'
  const WORD_CLOUD_SESSION_TAG = 'PrezoWordCloudSessionId'
  const WORD_CLOUD_SHAPES_TAG = 'PrezoWordCloudShapeIds'
  const WORD_CLOUD_PENDING_TAG = 'PrezoWordCloudPending'
  const WORD_CLOUD_STYLE_TAG = 'PrezoWordCloudStyle'
  const WORD_CLOUD_STATE_TAG = 'PrezoWordCloudState'
  const WORD_CLOUD_WORD_INDEX_TAG = 'PrezoWordCloudWordIndex'
  const DEFAULT_API_BASE_URL = 'http://localhost:8000'
  const MAX_QNA_ITEMS = 4
  const MAX_POLL_OPTIONS = 5
  const MAX_WORD_CLOUD_WORDS = 5
  const MAX_SLIDE_TAG_VALUE_LENGTH = 250
  const PANEL_TITLE = 'Questions from your audience'
  const EYEBROW_TEXT = 'PREZO LIVE Q&A'
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

  const buildTitle = (code) => (code ? `Prezo Live Q&A • ${code}` : 'Prezo Live Q&A')
  const buildMeta = (code) =>
    code ? `Join code ${code}` : 'Waiting for new questions.'
  const buildBadge = (pendingCount) => `Pending ${pendingCount}`
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
  const DEFAULT_WORD_CLOUD_STYLE = {
    fontFamily: null,
    textColor: '#0f172a',
    mutedColor: '#64748b',
    accentColor: '#2563eb',
    panelColor: '#ffffff',
    borderColor: '#e2e8f0',
    shadowColor: '#e2e8f0',
    shadowOpacity: 0.35,
    spacingScale: 1,
    minFontSize: 20,
    maxFontSize: 56,
    maxWords: 5
  }
  const EMPTY_WORD_CLOUD_STATE = {
    cloudId: null,
    ratios: {}
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
  const normalizeWordCloudStyle = (style) => {
    const next = { ...DEFAULT_WORD_CLOUD_STYLE, ...(style || {}) }
    const minFont = clamp(
      Math.round(Number(next.minFontSize ?? DEFAULT_WORD_CLOUD_STYLE.minFontSize)),
      14,
      64
    )
    const maxFont = clamp(
      Math.round(Number(next.maxFontSize ?? DEFAULT_WORD_CLOUD_STYLE.maxFontSize)),
      minFont + 2,
      96
    )
    return {
      ...next,
      fontFamily: next.fontFamily ? String(next.fontFamily) : null,
      textColor: next.textColor || DEFAULT_WORD_CLOUD_STYLE.textColor,
      mutedColor: next.mutedColor || DEFAULT_WORD_CLOUD_STYLE.mutedColor,
      accentColor: next.accentColor || DEFAULT_WORD_CLOUD_STYLE.accentColor,
      panelColor: next.panelColor || DEFAULT_WORD_CLOUD_STYLE.panelColor,
      borderColor: next.borderColor || DEFAULT_WORD_CLOUD_STYLE.borderColor,
      shadowColor: next.shadowColor || DEFAULT_WORD_CLOUD_STYLE.shadowColor,
      shadowOpacity: clamp(
        Number(next.shadowOpacity ?? DEFAULT_WORD_CLOUD_STYLE.shadowOpacity),
        0,
        0.8
      ),
      spacingScale: clamp(
        Number(next.spacingScale ?? DEFAULT_WORD_CLOUD_STYLE.spacingScale),
        0.8,
        1.3
      ),
      minFontSize: minFont,
      maxFontSize: maxFont,
      maxWords: clamp(Math.round(Number(next.maxWords ?? DEFAULT_WORD_CLOUD_STYLE.maxWords)), 1, 5)
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
  const buildPollTitle = (code) => (code ? `Prezo Poll - ${code}` : 'Prezo Poll')
  const buildWordCloudTitle = (code) =>
    code ? `Prezo Word Cloud - ${code}` : 'Prezo Word Cloud'
  const resolveApiBaseUrl = (binding) =>
    (binding && binding.apiBaseUrl) || window.PREZO_API_BASE_URL || DEFAULT_API_BASE_URL
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const normalizeSessionId = (value) => String(value ?? '').trim()
  const setSlideTag = (slide, key, value) => {
    slide.tags.add(key, value)
  }
  const setSlideTagIfFits = (slide, key, value) => {
    const normalizedValue = String(value ?? '')
    if (normalizedValue.length > MAX_SLIDE_TAG_VALUE_LENGTH) {
      setSlideTag(slide, key, '')
      return false
    }
    setSlideTag(slide, key, normalizedValue)
    return true
  }

  const buildBody = (questions) => {
    const approved = (questions || []).filter((question) => question.status === 'approved')
    if (approved.length === 0) {
      return 'No approved questions yet.'
    }
    return approved
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

  const pickWordCloud = (wordClouds) => {
    if (!wordClouds || wordClouds.length === 0) {
      return null
    }
    const openCloud = wordClouds.find((cloud) => cloud.status === 'open')
    if (openCloud) {
      return openCloud
    }
    const sorted = [...wordClouds].sort((a, b) => {
      const aTime = Date.parse(a.created_at)
      const bTime = Date.parse(b.created_at)
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return 0
      }
      return bTime - aTime
    })
    return sorted[0] || wordClouds[0]
  }

  const buildWordCloudSubtitle = (cloud) => {
    if (!cloud) {
      return 'No active word cloud yet.'
    }
    return cloud.prompt || 'Pick a word to shape the cloud.'
  }

  const buildWordCloudMeta = (cloud) => {
    if (!cloud) {
      return 'Create and open a word cloud in the host console.'
    }
    return cloud.status === 'open' ? 'Voting is live.' : 'Voting is closed.'
  }

  const normalizeWordKey = (label) => (label || '').trim().toLocaleLowerCase()
  const parseWordCloudState = (value) => {
    if (!value) {
      return EMPTY_WORD_CLOUD_STATE
    }
    try {
      const parsed = JSON.parse(value)
      const ratios =
        parsed && parsed.ratios && typeof parsed.ratios === 'object'
          ? Object.entries(parsed.ratios).reduce((acc, [key, raw]) => {
              const ratio = Number(raw)
              if (Number.isFinite(ratio)) {
                acc[key] = clamp(ratio, 0, 1)
              }
              return acc
            }, {})
          : {}
      return {
        cloudId: parsed && typeof parsed.cloudId === 'string' ? parsed.cloudId : null,
        ratios
      }
    } catch {
      return EMPTY_WORD_CLOUD_STATE
    }
  }
  const createWordCloudState = (cloud, words) => {
    const safeWords = words || []
    const maxVotes = safeWords.reduce((max, word) => Math.max(max, word.votes), 0)
    const ratios = safeWords.reduce((acc, word) => {
      const ratio = maxVotes > 0 ? word.votes / maxVotes : 0
      acc[normalizeWordKey(word.label)] = clamp(ratio, 0, 1)
      return acc
    }, {})
    return {
      cloudId: cloud && cloud.id ? cloud.id : null,
      ratios
    }
  }
  const easeOutCubic = (value) => 1 - Math.pow(1 - clamp(value, 0, 1), 3)
  const interpolate = (from, to, progress) => from + (to - from) * progress

  const WORD_CLOUD_ANCHORS = [
    { cx: 0.5, cy: 0.43, width: 0.34, height: 0.22 },
    { cx: 0.34, cy: 0.6, width: 0.27, height: 0.18 },
    { cx: 0.66, cy: 0.6, width: 0.27, height: 0.18 },
    { cx: 0.42, cy: 0.77, width: 0.24, height: 0.16 },
    { cx: 0.58, cy: 0.77, width: 0.24, height: 0.16 }
  ]
  const WORD_CLOUD_SHAPE_TYPES = ['Cloud', 'CloudCallout', 'RoundRectangle']
  const WORD_CLOUD_COLOR_SEEDS = [0.14, 0.22, 0.18, 0.27, 0.2]
  let cachedWordCloudShapeType = null
  const wordAreaRect = (widgetRect, scale) => {
    const sidePadding = Math.round(30 * scale)
    const topOffset = Math.round(122 * scale)
    const bottomPadding = Math.round(24 * scale)
    return {
      left: widgetRect.left + sidePadding,
      top: widgetRect.top + topOffset,
      width: Math.max(200, widgetRect.width - sidePadding * 2),
      height: Math.max(120, widgetRect.height - topOffset - bottomPadding)
    }
  }
  const baseWordFrame = (areaRect, anchor) => ({
    left: areaRect.left + areaRect.width * (anchor.cx - anchor.width / 2),
    top: areaRect.top + areaRect.height * (anchor.cy - anchor.height / 2),
    width: areaRect.width * anchor.width,
    height: areaRect.height * anchor.height
  })
  const fitFontSizeForLabel = (label, preferred, frame, maxFontSize) => {
    const chars = Math.max(1, (label || '').trim().length)
    const widthCap = Math.floor(frame.width / Math.max(2, chars * 0.53))
    const heightCap = Math.floor(frame.height * 0.7)
    return clamp(Math.min(preferred, widthCap, heightCap, maxFontSize), 12, maxFontSize)
  }
  const labelFrameForWord = (bubbleFrame, label, fontSize) => {
    const chars = Math.max(1, (label || '').trim().length)
    const estimatedWidth = fontSize * (chars * 0.56 + 1.1)
    const width = clamp(estimatedWidth + 8, 24, bubbleFrame.width * 0.8)
    const height = clamp(fontSize * 1.45, 18, bubbleFrame.height * 0.58)
    return {
      left: bubbleFrame.left + (bubbleFrame.width - width) / 2,
      top: bubbleFrame.top + (bubbleFrame.height - height) / 2,
      width,
      height
    }
  }
  const scaledWordFrame = (areaRect, anchor, ratio, label, style) => {
    const base = baseWordFrame(areaRect, anchor)
    const clamped = clamp(ratio, 0, 1)
    const widthScale = 0.9 + clamped * 0.28
    const heightScale = 0.94 + clamped * 0.22
    let width = base.width * widthScale
    let height = base.height * heightScale
    const preferredFont = fontSizeForRatio(style, clamped)
    const minWidthForWord = Math.min(
      areaRect.width * 0.52,
      Math.max(base.width * 0.7, preferredFont * ((label || '').trim().length * 0.58 + 1.5) + 36)
    )
    width = Math.max(width, minWidthForWord)
    height = Math.max(height, preferredFont * 2.1)
    height = Math.min(height, areaRect.height * 0.48)
    width = Math.min(width, areaRect.width * 0.56)
    const centerX = base.left + base.width / 2
    const centerY = base.top + base.height / 2
    return {
      left: centerX - width / 2,
      top: centerY - height / 2,
      width,
      height
    }
  }
  const buildCloudVisual = (style, ratio, index) => {
    const clamped = clamp(ratio, 0, 1)
    const seed = WORD_CLOUD_COLOR_SEEDS[index % WORD_CLOUD_COLOR_SEEDS.length]
    const baseFill = mixColors(style.panelColor, style.accentColor, seed)
    const fillColor = mixColors(baseFill, style.accentColor, 0.16 + clamped * 0.56)
    const borderColor = mixColors(style.borderColor, style.accentColor, 0.28 + clamped * 0.45)
    return {
      fillColor,
      borderColor,
      textColor: clamped > 0.6 ? '#ffffff' : style.textColor,
      transparency: clamp(0.18 - clamped * 0.1, 0.04, 0.22),
      lineWeight: 1 + clamped * 0.85,
      bold: clamped >= 0.4
    }
  }
  const fontSizeForRatio = (style, ratio) => {
    const clamped = clamp(ratio, 0, 1)
    const eased = Math.pow(clamped, 0.7)
    return Math.round(style.minFontSize + (style.maxFontSize - style.minFontSize) * eased)
  }
  const setWordShapeHidden = (pair, areaRect, anchor, style) => {
    pair.label.textFrame.textRange.text = ''
    if (areaRect) {
      const frame = baseWordFrame(areaRect, anchor)
      pair.bubble.left = frame.left
      pair.bubble.top = frame.top
      pair.bubble.width = frame.width
      pair.bubble.height = frame.height
      const labelFrame = labelFrameForWord(frame, 'word', style.minFontSize)
      pair.label.left = labelFrame.left
      pair.label.top = labelFrame.top
      pair.label.width = labelFrame.width
      pair.label.height = labelFrame.height
    }
    pair.bubble.fill.setSolidColor(style.panelColor)
    pair.bubble.fill.transparency = 1
    pair.bubble.lineFormat.visible = false
    pair.label.fill.transparency = 1
    pair.label.lineFormat.visible = false
  }
  const renderWordShape = (
    pair,
    wordLabel,
    ratio,
    style,
    areaRect,
    anchor,
    index
  ) => {
    const clampedRatio = clamp(ratio, 0, 1)
    pair.label.textFrame.textRange.text = wordLabel
    pair.label.textFrame.wordWrap = false

    if (areaRect) {
      const frame = scaledWordFrame(areaRect, anchor, clampedRatio, wordLabel, style)
      const visual = buildCloudVisual(style, clampedRatio, index)
      pair.bubble.left = frame.left
      pair.bubble.top = frame.top
      pair.bubble.width = frame.width
      pair.bubble.height = frame.height
      pair.bubble.fill.setSolidColor(visual.fillColor)
      pair.bubble.fill.transparency = visual.transparency
      pair.bubble.lineFormat.visible = true
      pair.bubble.lineFormat.color = visual.borderColor
      pair.bubble.lineFormat.weight = visual.lineWeight

      const preferredFontSize = fontSizeForRatio(style, clampedRatio)
      const firstPassFrame = labelFrameForWord(frame, wordLabel, preferredFontSize)
      const fittedFontSize = fitFontSizeForLabel(
        wordLabel,
        preferredFontSize,
        firstPassFrame,
        style.maxFontSize
      )
      const labelFrame = labelFrameForWord(frame, wordLabel, fittedFontSize)
      pair.label.left = labelFrame.left
      pair.label.top = labelFrame.top
      pair.label.width = labelFrame.width
      pair.label.height = labelFrame.height
      pair.label.fill.transparency = 1
      pair.label.lineFormat.visible = false
      applyFont(pair.label.textFrame.textRange, style, {
        size: fittedFontSize,
        bold: visual.bold,
        color: visual.textColor
      })
    }
  }
  const resolveWordCloudShapeType = async () => {
    if (cachedWordCloudShapeType) {
      return cachedWordCloudShapeType
    }
    for (const candidate of WORD_CLOUD_SHAPE_TYPES) {
      try {
        await PowerPoint.run(async (context) => {
          const slides = context.presentation.getSelectedSlides()
          slides.load('items')
          await context.sync()
          const slide = slides.items[0]
          if (!slide) {
            throw new Error('Select a slide before inserting a widget.')
          }
          const probe = slide.shapes.addGeometricShape(candidate, {
            left: -2000,
            top: -2000,
            width: 12,
            height: 12
          })
          probe.load('id')
          await context.sync()
          probe.delete()
          await context.sync()
        })
        cachedWordCloudShapeType = candidate
        return candidate
      } catch {
        // Try next candidate shape type.
      }
    }
    cachedWordCloudShapeType = 'RoundRectangle'
    return cachedWordCloudShapeType
  }
  const normalizeWordShapeEntries = (entries) => {
    if (!Array.isArray(entries)) {
      return []
    }
    return entries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }
        const bubble = entry.bubble
        const label = entry.label
        if (typeof bubble !== 'string' || typeof label !== 'string') {
          return null
        }
        return { bubble, label }
      })
      .filter((entry) => Boolean(entry))
  }
  const extractLegacyWordShapeIds = (entries) => {
    if (!Array.isArray(entries)) {
      return []
    }
    return entries.filter((entry) => typeof entry === 'string')
  }
  const upgradeLegacyWordShapeEntries = async (slide, context, legacyIds, style) => {
    const limited = legacyIds.slice(0, MAX_WORD_CLOUD_WORDS)
    if (!limited.length) {
      return []
    }
    const bubbles = limited.map((id) => slide.shapes.getItemOrNullObject(id))
    bubbles.forEach((shape) => shape.load(['id', 'left', 'top', 'width', 'height']))
    await context.sync()

    const pairs = []
    bubbles.forEach((bubble, index) => {
      if (bubble.isNullObject) {
        return
      }
      const label = slide.shapes.addTextBox('', {
        left: bubble.left + bubble.width * 0.12,
        top: bubble.top + bubble.height * 0.18,
        width: Math.max(24, bubble.width * 0.76),
        height: Math.max(16, bubble.height * 0.64)
      })
      label.fill.transparency = 1
      label.lineFormat.visible = false
      label.textFrame.wordWrap = false
      applyFont(label.textFrame.textRange, style, {
        size: style.minFontSize,
        bold: false,
        color: style.textColor
      })
      label.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
      label.tags.add('PrezoWidgetRole', 'word-cloud-label')
      label.tags.add(WORD_CLOUD_WORD_INDEX_TAG, `${index}`)
      pairs.push({ bubble, label })
    })

    pairs.forEach((pair) => pair.label.load('id'))
    await context.sync()
    return pairs.map((pair) => ({
      bubble: pair.bubble.id,
      label: pair.label.id
    }))
  }
  const clearExistingWordCloudShapes = async (slide, context) => {
    const scope = slide.shapes
    scope.load('items')
    await context.sync()

    const taggedShapes = scope.items.map((shape) => {
      const widgetTag = shape.tags.getItemOrNullObject(WORD_CLOUD_WIDGET_TAG)
      widgetTag.load('value')
      return { shape, widgetTag }
    })

    await context.sync()

    let hasDeletes = false
    taggedShapes.forEach(({ shape, widgetTag }) => {
      if (!widgetTag.isNullObject && widgetTag.value === 'true') {
        shape.delete()
        hasDeletes = true
      }
    })

    if (hasDeletes) {
      await context.sync()
    }
  }
  const recoverWordCloudShapeIdsFromTags = async (slide, context) => {
    const scope = slide.shapes
    scope.load('items')
    await context.sync()

    const tagged = scope.items.map((shape) => {
      const widgetTag = shape.tags.getItemOrNullObject(WORD_CLOUD_WIDGET_TAG)
      const roleTag = shape.tags.getItemOrNullObject('PrezoWidgetRole')
      const indexTag = shape.tags.getItemOrNullObject(WORD_CLOUD_WORD_INDEX_TAG)
      widgetTag.load('value')
      roleTag.load('value')
      indexTag.load('value')
      shape.load('id')
      return { shape, widgetTag, roleTag, indexTag }
    })

    await context.sync()

    let shadow = null
    let container = null
    let title = null
    let subtitle = null
    let body = null
    const wordsByIndex = new Map()

    tagged.forEach(({ shape, widgetTag, roleTag, indexTag }) => {
      const hasWidgetTag = !widgetTag.isNullObject && widgetTag.value === 'true'
      const role = !roleTag.isNullObject ? roleTag.value : null
      if (!hasWidgetTag && !role) {
        return
      }
      switch (role) {
        case 'word-cloud-shadow':
          shadow = shape
          break
        case 'word-cloud-container':
          container = shape
          break
        case 'word-cloud-title':
          title = shape
          break
        case 'word-cloud-subtitle':
          subtitle = shape
          break
        case 'word-cloud-body':
          body = shape
          break
        case 'word-cloud-bubble': {
          const parsedIndex = Number.parseInt(indexTag.isNullObject ? '' : indexTag.value, 10)
          if (!Number.isFinite(parsedIndex)) {
            break
          }
          const entry = wordsByIndex.get(parsedIndex) || {}
          entry.bubble = shape
          wordsByIndex.set(parsedIndex, entry)
          break
        }
        case 'word-cloud-label': {
          const parsedIndex = Number.parseInt(indexTag.isNullObject ? '' : indexTag.value, 10)
          if (!Number.isFinite(parsedIndex)) {
            break
          }
          const entry = wordsByIndex.get(parsedIndex) || {}
          entry.label = shape
          wordsByIndex.set(parsedIndex, entry)
          break
        }
        default:
          break
      }
    })

    if (!container || !title || !subtitle || !body) {
      return null
    }

    const words = [...wordsByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, entry]) => entry)
      .filter((entry) => entry.bubble && entry.label)
      .slice(0, MAX_WORD_CLOUD_WORDS)
      .map((entry) => ({
        bubble: entry.bubble.id,
        label: entry.label.id
      }))

    return {
      shadow: shadow ? shadow.id : undefined,
      container: container.id,
      title: title.id,
      subtitle: subtitle.id,
      body: body.id,
      words
    }
  }
  const createWordCloudWordShapeEntries = async (
    slide,
    context,
    container,
    style,
    count,
    startIndex = 0
  ) => {
    if (!container || container.isNullObject) {
      return []
    }
    container.load(['left', 'top', 'width', 'height'])
    await context.sync()
    if (container.isNullObject) {
      return []
    }
    const widgetRect = {
      left: container.left,
      top: container.top,
      width: container.width,
      height: container.height
    }
    const areaRect = wordAreaRect(widgetRect, style.spacingScale)
    const total = Math.max(0, Math.min(count, MAX_WORD_CLOUD_WORDS))
    if (!total) {
      return []
    }
    const created = []
    for (let offset = 0; offset < total; offset += 1) {
      const index = startIndex + offset
      if (index >= MAX_WORD_CLOUD_WORDS) {
        break
      }
      const anchor = WORD_CLOUD_ANCHORS[index] || WORD_CLOUD_ANCHORS[WORD_CLOUD_ANCHORS.length - 1]
      const frame = baseWordFrame(areaRect, anchor)
      try {
        const bubble = slide.shapes.addTextBox('', frame)
        const label = slide.shapes.addTextBox('', frame)
        bubble.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
        bubble.tags.add('PrezoWidgetRole', 'word-cloud-bubble')
        bubble.tags.add(WORD_CLOUD_WORD_INDEX_TAG, `${index}`)
        label.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
        label.tags.add('PrezoWidgetRole', 'word-cloud-label')
        label.tags.add(WORD_CLOUD_WORD_INDEX_TAG, `${index}`)
        bubble.load('id')
        label.load('id')
        await context.sync()
        created.push({
          bubble: bubble.id,
          label: label.id
        })
      } catch (error) {
        console.warn('Failed to create word cloud placeholder slot', { index, error })
      }
    }
    return created
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

  const updateQnaWidget = async (sessionId, code, questions) => {
    const bodyText = buildBody(questions)
    const pendingCount = (questions || []).filter((question) => question.status === 'pending')
      .length
    const approved = (questions || []).filter((question) => question.status === 'approved')
    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides
      slides.load('items')
      await context.sync()

      const slideInfos = slides.items.map((slide) => {
        const sessionTag = slide.tags.getItemOrNullObject(SESSION_TAG)
        const pendingTag = slide.tags.getItemOrNullObject(WIDGET_PENDING_TAG)
        const styleTag = slide.tags.getItemOrNullObject(WIDGET_STYLE_TAG)
        const shapeTag = slide.tags.getItemOrNullObject(SHAPES_TAG)
        sessionTag.load('value')
        pendingTag.load('value')
        styleTag.load('value')
        shapeTag.load('value')
        return { slide, sessionTag, pendingTag, styleTag, shapeTag }
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

        if (title && !title.isNullObject) {
          const hasNewLayout = Boolean(
            (shapeIds.items && shapeIds.items.length > 0) ||
              shapeIds.subtitle ||
              shapeIds.meta ||
              shapeIds.badge
          )
          title.textFrame.textRange.text = hasNewLayout ? PANEL_TITLE : buildTitle(code)
        }
        if (meta && !meta.isNullObject) {
          meta.textFrame.textRange.text = EYEBROW_TEXT
        }
        if (subtitle && !subtitle.isNullObject) {
          subtitle.textFrame.textRange.text = buildMeta(code)
        }
        if (badge && !badge.isNullObject) {
          badge.textFrame.textRange.text = buildBadge(pendingCount)
        }
        if (itemShapes.length > 0) {
          const hasApproved = approved.length > 0
          if (body && !body.isNullObject) {
            body.textFrame.textRange.text = hasApproved ? '' : 'No approved questions yet.'
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
    const poll = pickPoll(polls || [])
    const titleText = buildPollTitle(code)
    const questionText = buildPollQuestion(poll)
    const optionData = buildPollOptions(poll)

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
        sessionTag.load('value')
        pendingTag.load('value')
        shapeTag.load('value')
        styleTag.load('value')
        return { slide, sessionTag, pendingTag, shapeTag, styleTag }
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
          bodyShape.textFrame.textRange.text = `${questionText}\n${buildPollOptions(poll)
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
  const insertWidget = async (styleOverrides) => {
    const style = normalizeQnaStyle(styleOverrides)
    const scale = style.spacingScale
    const maxQuestions = style.maxQuestions
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

      const meta = slide.shapes.addTextBox(EYEBROW_TEXT, {
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

      const title = slide.shapes.addTextBox(PANEL_TITLE, {
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
      badge.textFrame.textRange.text = buildBadge(0)
      applyFont(badge.textFrame.textRange.font, style, {
        size: 11,
        bold: true,
        color: style.accentColor
      })
      badge.tags.add(WIDGET_TAG, 'true')
      badge.tags.add('PrezoWidgetRole', 'badge')

      const body = slide.shapes.addTextBox(
        hasSession ? 'No approved questions yet.' : PLACEHOLDER_BODY,
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
      slide.tags.add(WIDGET_STYLE_TAG, JSON.stringify(style))
      slide.tags.add(SHAPES_TAG, JSON.stringify(shapeIds))
      await context.sync()
    })

    if (hasSession && sessionId) {
      try {
        const snapshot = await fetchSnapshot(binding)
        await updateQnaWidget(sessionId, code, snapshot.questions || [])
      } catch (error) {
        console.warn('Failed to refresh Q&A widget', error)
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

  const updateWordCloudWidget = async (sessionId, code, wordClouds) => {
    const normalizedSessionId = normalizeSessionId(sessionId)
    const cloud = pickWordCloud(wordClouds || [])
    const words = cloud ? (cloud.words || []).slice(0, MAX_WORD_CLOUD_WORDS) : []
    const maxVotes = words.reduce((max, word) => Math.max(max, word.votes), 0)

    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides
      slides.load('items')
      await context.sync()

      const slideInfos = slides.items.map((slide) => {
        const sessionTag = slide.tags.getItemOrNullObject(WORD_CLOUD_SESSION_TAG)
        const pendingTag = slide.tags.getItemOrNullObject(WORD_CLOUD_PENDING_TAG)
        const shapeTag = slide.tags.getItemOrNullObject(WORD_CLOUD_SHAPES_TAG)
        const styleTag = slide.tags.getItemOrNullObject(WORD_CLOUD_STYLE_TAG)
        const stateTag = slide.tags.getItemOrNullObject(WORD_CLOUD_STATE_TAG)
        sessionTag.load('value')
        pendingTag.load('value')
        shapeTag.load('value')
        styleTag.load('value')
        stateTag.load('value')
        return { slide, sessionTag, pendingTag, shapeTag, styleTag, stateTag }
      })

      await context.sync()

      for (const info of slideInfos) {
        const isPending = !info.pendingTag.isNullObject && info.pendingTag.value === 'true'
        const sessionTagValue = !info.sessionTag.isNullObject ? normalizeSessionId(info.sessionTag.value) : ''
        const hasSessionMatch = sessionTagValue === normalizedSessionId

        let shapeIds = null
        let recovered = false
        if (!info.shapeTag.isNullObject && info.shapeTag.value) {
          try {
            shapeIds = JSON.parse(info.shapeTag.value)
          } catch {
            shapeIds = null
          }
        }
        if (!shapeIds) {
          shapeIds = await recoverWordCloudShapeIdsFromTags(info.slide, context)
          recovered = Boolean(shapeIds)
          if (shapeIds) {
            setSlideTagIfFits(info.slide, WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))
          }
        }
        if (!shapeIds) {
          continue
        }

        const shouldRebind = isPending || !hasSessionMatch || recovered

        let style = DEFAULT_WORD_CLOUD_STYLE
        let applyStyle = false
        if (!info.styleTag.isNullObject && info.styleTag.value) {
          try {
            const parsed = JSON.parse(info.styleTag.value)
            style = normalizeWordCloudStyle(parsed)
            applyStyle = Boolean(parsed.lockStyle)
          } catch {
            style = DEFAULT_WORD_CLOUD_STYLE
          }
        }

        const shadow = shapeIds.shadow
          ? info.slide.shapes.getItemOrNullObject(shapeIds.shadow)
          : null
        const container = shapeIds.container
          ? info.slide.shapes.getItemOrNullObject(shapeIds.container)
          : null
        const title = shapeIds.title
          ? info.slide.shapes.getItemOrNullObject(shapeIds.title)
          : null
        const subtitle = shapeIds.subtitle
          ? info.slide.shapes.getItemOrNullObject(shapeIds.subtitle)
          : null
        const body = shapeIds.body
          ? info.slide.shapes.getItemOrNullObject(shapeIds.body)
          : null
        let wordShapeIds = normalizeWordShapeEntries(shapeIds.words)
        if (!wordShapeIds.length) {
          const legacyWordIds = extractLegacyWordShapeIds(shapeIds.words)
          if (legacyWordIds.length) {
            wordShapeIds = await upgradeLegacyWordShapeEntries(
              info.slide,
              context,
              legacyWordIds,
              style
            )
            if (wordShapeIds.length) {
              shapeIds.words = wordShapeIds
              setSlideTagIfFits(info.slide, WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))
              await context.sync()
            }
          }
        }
        const targetWordSlots = Math.max(
          1,
          Math.min(style.maxWords, MAX_WORD_CLOUD_WORDS, Math.max(words.length, 1))
        )
        if (wordShapeIds.length < targetWordSlots) {
          const missingWordSlots = targetWordSlots - wordShapeIds.length
          const createdWordShapes = await createWordCloudWordShapeEntries(
            info.slide,
            context,
            container,
            style,
            missingWordSlots,
            wordShapeIds.length
          )
          if (createdWordShapes.length) {
            wordShapeIds = [...wordShapeIds, ...createdWordShapes]
            shapeIds.words = wordShapeIds
            setSlideTagIfFits(info.slide, WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))
          }
        }
        if (!wordShapeIds.length) {
          continue
        }
        const wordShapes = wordShapeIds.map((ids) => ({
          bubble: info.slide.shapes.getItemOrNullObject(ids.bubble),
          label: info.slide.shapes.getItemOrNullObject(ids.label)
        }))

        if (shadow) shadow.load('id')
        if (container) container.load(['id', 'left', 'top', 'width', 'height'])
        if (title) title.load('id')
        if (subtitle) subtitle.load('id')
        if (body) body.load('id')
        wordShapes.forEach((shape) => {
          shape.bubble.load('id')
          shape.label.load('id')
        })
        await context.sync()

        if (applyStyle) {
          if (shadow && !shadow.isNullObject) {
            shadow.fill.setSolidColor(style.shadowColor)
            shadow.fill.transparency = style.shadowOpacity
            shadow.lineFormat.visible = false
          }
          if (container && !container.isNullObject) {
            container.fill.setSolidColor(style.panelColor)
            container.lineFormat.color = style.borderColor
            container.lineFormat.weight = 1.2
          }
          if (title && !title.isNullObject) {
            applyFont(title.textFrame.textRange, style, {
              size: 22,
              bold: true,
              color: style.textColor
            })
          }
          if (subtitle && !subtitle.isNullObject) {
            applyFont(subtitle.textFrame.textRange, style, {
              size: 13,
              color: style.mutedColor
            })
          }
          if (body && !body.isNullObject) {
            applyFont(body.textFrame.textRange, style, {
              size: 13,
              color: style.mutedColor
            })
          }
        }

        if (title && !title.isNullObject) {
          title.textFrame.textRange.text = buildWordCloudTitle(code)
        }
        if (subtitle && !subtitle.isNullObject) {
          subtitle.textFrame.textRange.text = buildWordCloudSubtitle(cloud)
        }
        if (body && !body.isNullObject) {
          body.textFrame.textRange.text = buildWordCloudMeta(cloud)
        }

        const widgetRect =
          container && !container.isNullObject
            ? {
                left: container.left,
                top: container.top,
                width: container.width,
                height: container.height
              }
            : null
        const areaRect = widgetRect ? wordAreaRect(widgetRect, style.spacingScale) : null
        const previousState = parseWordCloudState(
          !info.stateTag.isNullObject ? info.stateTag.value : null
        )
        const previousRatios =
          previousState.cloudId === (cloud && cloud.id ? cloud.id : null)
            ? previousState.ratios
            : {}
        const visibleWords = Math.min(style.maxWords, words.length, wordShapes.length)

        const plans = wordShapes.map((pair, index) => {
          const anchor =
            WORD_CLOUD_ANCHORS[index] || WORD_CLOUD_ANCHORS[WORD_CLOUD_ANCHORS.length - 1]
          const word = index < visibleWords ? words[index] : null
          if (!word) {
            return {
              pair,
              anchor,
              word: null,
              startRatio: 0,
              targetRatio: 0,
              index
            }
          }
          const key = normalizeWordKey(word.label)
          const startRatio = previousRatios[key] ?? 0
          const targetRatio = maxVotes > 0 ? word.votes / maxVotes : 0
          return {
            pair,
            anchor,
            word,
            startRatio: clamp(startRatio, 0, 1),
            targetRatio: clamp(targetRatio, 0, 1),
            index
          }
        })

        const shouldAnimate = plans.some(
          (plan) => plan.word && Math.abs(plan.startRatio - plan.targetRatio) > 0.035
        )
        const frames = shouldAnimate ? 5 : 1

        for (let frame = 1; frame <= frames; frame += 1) {
          const progress = frame / frames
          const eased = shouldAnimate ? easeOutCubic(progress) : 1
          plans.forEach((plan) => {
            if (plan.pair.bubble.isNullObject || plan.pair.label.isNullObject) {
              return
            }
            if (!plan.word) {
              setWordShapeHidden(plan.pair, areaRect, plan.anchor, style)
              return
            }
            const ratio = interpolate(plan.startRatio, plan.targetRatio, eased)
            renderWordShape(
              plan.pair,
              plan.word.label,
              ratio,
              style,
              areaRect,
              plan.anchor,
              plan.index
            )
          })
          await context.sync()
          if (shouldAnimate && frame < frames) {
            await wait(50)
          }
        }

        const nextState = createWordCloudState(cloud, words.slice(0, visibleWords))
        setSlideTagIfFits(info.slide, WORD_CLOUD_STATE_TAG, JSON.stringify(nextState))

        if (shouldRebind || normalizedSessionId) {
          setSlideTag(info.slide, WORD_CLOUD_SESSION_TAG, normalizedSessionId)
          setSlideTag(info.slide, WORD_CLOUD_PENDING_TAG, 'false')
        }
      }

      await context.sync()
    })
  }

  const insertWordCloudWidget = async (styleOverrides) => {
    const style = normalizeWordCloudStyle(styleOverrides)
    const wordShapeType = await resolveWordCloudShapeType()
    const scale = style.spacingScale
    const maxWords = style.maxWords
    const binding = await getBinding()
    const sessionId = binding && binding.sessionId ? binding.sessionId : null
    const code = binding ? binding.code : null
    const hasSession = Boolean(sessionId)
    let stage = 'start'

    try {
      await PowerPoint.run(async (context) => {
        stage = 'load selected slide'
        const slides = context.presentation.getSelectedSlides()
        slides.load('items')
        const pageSetup = context.presentation.pageSetup
        pageSetup.load(['slideWidth', 'slideHeight'])
        await context.sync()

        const slide = slides.items[0]
        if (!slide) {
          throw new Error('Select a slide before inserting a widget.')
        }

        stage = 'cleanup previous word cloud'
        await clearExistingWordCloudShapes(slide, context)
        setSlideTag(slide, WORD_CLOUD_SESSION_TAG, '')
        setSlideTag(slide, WORD_CLOUD_PENDING_TAG, 'true')
        setSlideTag(slide, WORD_CLOUD_STYLE_TAG, '')
        setSlideTag(slide, WORD_CLOUD_STATE_TAG, '')
        setSlideTag(slide, WORD_CLOUD_SHAPES_TAG, '')

        stage = 'create container shapes'
        const width = Math.max(380, pageSetup.slideWidth * 0.7)
        const height = Math.max(280, pageSetup.slideHeight * 0.56)
        const left = (pageSetup.slideWidth - width) / 2
        const top = pageSetup.slideHeight * 0.1
        const padding = 24
        const widgetRect = { left, top, width, height }
        const areaRect = wordAreaRect(widgetRect, scale)

        const shadow = slide.shapes.addGeometricShape('RoundRectangle', {
          left: left + 4,
          top: top + 6,
          width,
          height
        })
        shadow.fill.setSolidColor(style.shadowColor)
        shadow.fill.transparency = style.shadowOpacity
        shadow.lineFormat.visible = false
        shadow.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
        shadow.tags.add('PrezoWidgetRole', 'word-cloud-shadow')

        const container = slide.shapes.addGeometricShape('RoundRectangle', {
          left,
          top,
          width,
          height
        })
        container.fill.setSolidColor(style.panelColor)
        container.lineFormat.color = style.borderColor
        container.lineFormat.weight = 1.2
        container.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
        container.tags.add('PrezoWidgetRole', 'word-cloud-container')

        const title = slide.shapes.addTextBox(buildWordCloudTitle(code), {
          left: left + padding,
          top: top + 18 * scale,
          width: width - padding * 2,
          height: 30 * scale
        })
        title.textFrame.wordWrap = true
        applyFont(title.textFrame.textRange, style, {
          size: 22,
          bold: true,
          color: style.textColor
        })
        title.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
        title.tags.add('PrezoWidgetRole', 'word-cloud-title')

        const subtitle = slide.shapes.addTextBox(
          hasSession ? 'Audience votes animate each cloud.' : 'Connect a Prezo session to go live.',
          {
            left: left + padding,
            top: top + 52 * scale,
            width: width - padding * 2,
            height: 22 * scale
          }
        )
        subtitle.textFrame.wordWrap = true
        applyFont(subtitle.textFrame.textRange, style, { size: 13, color: style.mutedColor })
        subtitle.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
        subtitle.tags.add('PrezoWidgetRole', 'word-cloud-subtitle')

        const body = slide.shapes.addTextBox(
          hasSession ? 'Waiting for word cloud votes...' : 'No active word cloud yet.',
          {
            left: left + padding,
            top: top + 84 * scale,
            width: width - padding * 2,
            height: 18 * scale
          }
        )
        body.textFrame.wordWrap = true
        applyFont(body.textFrame.textRange, style, { size: 13, color: style.mutedColor })
        body.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
        body.tags.add('PrezoWidgetRole', 'word-cloud-body')

        stage = 'sync scaffold before words'
        await context.sync()

        stage = 'create word shapes'
        const wordShapes = []
        const wordShapeTypeCandidates = []
        if (wordShapeType) {
          wordShapeTypeCandidates.push(wordShapeType)
        }
        if (!wordShapeTypeCandidates.includes('RoundRectangle')) {
          wordShapeTypeCandidates.push('RoundRectangle')
        }
        wordShapeTypeCandidates.push('TextBox')
        const visibleWords = Math.min(maxWords, MAX_WORD_CLOUD_WORDS)
        for (let index = 0; index < visibleWords; index += 1) {
          const anchor = WORD_CLOUD_ANCHORS[index]
          const frame = baseWordFrame(areaRect, anchor)
          let created = false
          for (const candidateType of wordShapeTypeCandidates) {
            try {
              stage = `create word shape ${index + 1}/${visibleWords} using ${candidateType}`
              const bubble =
                candidateType === 'TextBox'
                  ? slide.shapes.addTextBox('', frame)
                  : slide.shapes.addGeometricShape(candidateType, frame)
              const label = slide.shapes.addTextBox('', frame)
              setWordShapeHidden({ bubble, label }, areaRect, anchor, style)
              applyFont(label.textFrame.textRange, style, {
                size: style.minFontSize,
                bold: false,
                color: style.textColor
              })
              label.textFrame.wordWrap = false
              bubble.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
              bubble.tags.add('PrezoWidgetRole', 'word-cloud-bubble')
              bubble.tags.add(WORD_CLOUD_WORD_INDEX_TAG, `${index}`)
              label.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
              label.tags.add('PrezoWidgetRole', 'word-cloud-label')
              label.tags.add(WORD_CLOUD_WORD_INDEX_TAG, `${index}`)
              bubble.load('id')
              label.load('id')
              stage = `sync word shape ${index + 1}/${visibleWords} using ${candidateType}`
              await context.sync()
              wordShapes.push({ bubble, label })
              created = true
              break
            } catch {
              // Try the next candidate shape type for this slot.
            }
          }
          if (!created) {
            console.warn('Skipping word cloud slot during insert', { index })
          }
        }

        if (!wordShapes.length) {
          try {
            const fallbackFrame = {
              left: left + padding,
              top: top + 124 * scale,
              width: Math.max(80, width - padding * 2),
              height: Math.max(34, height * 0.2)
            }
            const bubble = slide.shapes.addTextBox('', fallbackFrame)
            const label = slide.shapes.addTextBox('', fallbackFrame)
            bubble.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
            bubble.tags.add('PrezoWidgetRole', 'word-cloud-bubble')
            bubble.tags.add(WORD_CLOUD_WORD_INDEX_TAG, '0')
            label.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
            label.tags.add('PrezoWidgetRole', 'word-cloud-label')
            label.tags.add(WORD_CLOUD_WORD_INDEX_TAG, '0')
            bubble.load('id')
            label.load('id')
            stage = 'sync fallback word shape'
            await context.sync()
            wordShapes.push({ bubble, label })
          } catch (fallbackError) {
            console.warn('Word cloud fallback word shape failed', fallbackError)
          }
        }

        let shapeIds = null
        try {
          stage = 'sync scaffold ids'
          shadow.load('id')
          container.load('id')
          title.load('id')
          subtitle.load('id')
          body.load('id')
          wordShapes.forEach((shape) => {
            shape.bubble.load('id')
            shape.label.load('id')
          })
          await context.sync()
          shapeIds = {
            shadow: shadow.id,
            container: container.id,
            title: title.id,
            subtitle: subtitle.id,
            body: body.id,
            words: wordShapes.map((shape) => ({
              bubble: shape.bubble.id,
              label: shape.label.id
            }))
          }
        } catch (shapeIdError) {
          console.warn('Word cloud shape id sync failed during insert', shapeIdError)
        }

        const serializedStyle = JSON.stringify(style)
        const serializedState = JSON.stringify(EMPTY_WORD_CLOUD_STATE)
        const serializedShapeIds = shapeIds ? JSON.stringify(shapeIds) : ''
        stage = `persist tags style=${serializedStyle.length} state=${serializedState.length} shapes=${serializedShapeIds.length}`

        try {
          if (hasSession && sessionId) {
            setSlideTag(slide, WORD_CLOUD_SESSION_TAG, sessionId)
            setSlideTag(slide, WORD_CLOUD_PENDING_TAG, 'false')
          } else {
            setSlideTag(slide, WORD_CLOUD_PENDING_TAG, 'true')
            setSlideTag(slide, WORD_CLOUD_SESSION_TAG, '')
          }
          setSlideTagIfFits(slide, WORD_CLOUD_STYLE_TAG, serializedStyle)
          setSlideTagIfFits(slide, WORD_CLOUD_STATE_TAG, serializedState)
          setSlideTagIfFits(slide, WORD_CLOUD_SHAPES_TAG, serializedShapeIds)
          await context.sync()
        } catch (tagPersistError) {
          console.warn('Word cloud metadata persistence failed after insert', tagPersistError)
        }
      })
    } catch (error) {
      const detail = error && error.message ? error.message : String(error || 'Insert failed')
      throw new Error(`${detail} [stage: ${stage}]`)
    }

    if (hasSession && sessionId) {
      try {
        const snapshot = await fetchSnapshot(binding)
        await updateWordCloudWidget(sessionId, code, snapshot.word_clouds || [])
      } catch (error) {
        console.warn('Failed to refresh word cloud widget', error)
      }
    }
  }

  const insertWordCloudWidgetWithRetry = async (styleOverrides) => {
    try {
      await insertWordCloudWidget(styleOverrides)
    } catch (error) {
      const detail = error && error.message ? error.message : String(error || '')
      if (!/invalid argument/i.test(detail)) {
        throw error
      }
      await wait(150)
      try {
        await insertWordCloudWidget(styleOverrides)
      } catch (retryError) {
        const retryDetail =
          retryError && retryError.message ? retryError.message : String(retryError || '')
        if (!/invalid argument/i.test(retryDetail)) {
          throw retryError
        }
        // Force safest shape mode on final retry.
        cachedWordCloudShapeType = 'RoundRectangle'
        await wait(120)
        await insertWordCloudWidget(styleOverrides)
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
        await insertWidget(message.style)
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
    if (message && message.type === 'insert-word-cloud') {
      try {
        await insertWordCloudWidgetWithRetry(message.style)
        activeDialog.messageChild(JSON.stringify({ type: 'word-cloud-inserted' }))
        activeDialog.close()
        activeDialog = null
      } catch (error) {
        const detail = error && error.message ? error.message : 'Failed to insert word cloud widget'
        activeDialog.messageChild(
          JSON.stringify({ type: 'error', source: 'word-cloud', message: detail })
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




import type { Poll, QnaMode, QnaPrompt, Question } from '../api/types'

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
const MAX_POLL_OPTIONS = 5
const PANEL_TITLE = 'Questions from your audience'
const PROMPT_PANEL_TITLE = 'Audience answers'
const EYEBROW_TEXT = 'PREZO LIVE Q&A'
const PROMPT_EYEBROW_TEXT = 'PREZO LIVE PROMPT'
const DISCUSSION_PANEL_TITLE = 'Open discussion'
const DISCUSSION_EYEBROW_TEXT = 'PREZO OPEN DISCUSSION'
const PLACEHOLDER_SUBTITLE = 'Connect a Prezo session to go live.'
const PLACEHOLDER_BODY = 'Connect a Prezo session to populate this slide.'

type WidgetShapeIds = {
  container: string
  title: string
  body: string
  subtitle?: string
  meta?: string
  badge?: string
  shadow?: string
  items?: Array<{
    container: string
    text: string
    votes: string
  }>
}

type PollWidgetShapeIds = {
  container: string
  title: string
  question?: string
  body?: string
  shadow?: string
  group?: string
  items?: Array<{
    label: string
    group?: string
    bg: string
    fill: string
  }>
}

type QnaWidgetTags = {
  widgetTag: string
  sessionTag: string
  shapesTag: string
  pendingTag: string
  styleTag: string
  promptBindingTag: string
  legacyModeTag?: string
  legacyPromptTag?: string
}

type QnaWidgetConfig = {
  tags: QnaWidgetTags
  eyebrowText: string
  promptEyebrowText?: string
  panelTitle: string
  promptPanelTitle: string
  promptMissingTitle: string
  badgeAudienceLabel: string
  badgePromptLabel: string
  emptyBodyAudience: string
  emptyBodyPrompt: string
  useAudienceWhenUnbound: boolean
  unboundMode?: QnaMode
  buildLegacyTitle: (
    code: string | null | undefined,
    mode: QnaMode,
    prompt?: string | null
  ) => string
}

type QnaStyleConfig = {
  fontFamily: string | null
  textColor: string
  mutedColor: string
  accentColor: string
  panelColor: string
  cardColor: string
  borderColor: string
  shadowColor: string
  shadowOpacity: number
  spacingScale: number
  maxQuestions: number
  lockStyle?: boolean
}

type PollStyleConfig = {
  fontFamily: string | null
  textColor: string
  mutedColor: string
  accentColor: string
  panelColor: string
  barColor: string
  borderColor: string
  shadowColor: string
  shadowOpacity: number
  spacingScale: number
  orientation: string
  barThicknessScale: number
  maxOptions: number
  lockStyle?: boolean
}

const ensurePowerPoint = () => {
  if (typeof PowerPoint === 'undefined' || typeof PowerPoint.run !== 'function') {
    throw new Error('PowerPoint JS API is not available.')
  }
}

const buildTitle = (code?: string | null, mode: QnaMode = 'audience', prompt?: string | null) => {
  if (mode === 'prompt') {
    return prompt?.trim() ? prompt.trim() : PROMPT_PANEL_TITLE
  }
  return code ? `Prezo Live Q&A • ${code}` : 'Prezo Live Q&A'
}

const buildDiscussionTitle = (
  code?: string | null,
  mode: QnaMode = 'audience',
  prompt?: string | null
) => {
  if (mode === 'prompt' && prompt?.trim()) {
    return prompt.trim()
  }
  return code ? `Open discussion • ${code}` : DISCUSSION_PANEL_TITLE
}

const buildMeta = (code?: string | null) =>
  code ? `Join code ${code}` : 'Waiting for new questions.'

const buildBadgeText = (
  mode: QnaMode,
  pendingCount: number,
  approvedCount: number,
  config: QnaWidgetConfig
) => {
  const label =
    mode === 'prompt' ? config.badgePromptLabel : config.badgeAudienceLabel
  const count = mode === 'prompt' ? approvedCount : pendingCount
  return `${label} ${count}`
}

const DEFAULT_QNA_STYLE: QnaStyleConfig = {
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

const DEFAULT_POLL_STYLE: PollStyleConfig = {
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

const QNA_WIDGET_CONFIG: QnaWidgetConfig = {
  tags: {
    widgetTag: WIDGET_TAG,
    sessionTag: SESSION_TAG,
    shapesTag: SHAPES_TAG,
    pendingTag: WIDGET_PENDING_TAG,
    styleTag: WIDGET_STYLE_TAG,
    promptBindingTag: QNA_PROMPT_BINDING_TAG,
    legacyModeTag: LEGACY_QNA_MODE_TAG,
    legacyPromptTag: LEGACY_QNA_PROMPT_TAG
  },
  eyebrowText: EYEBROW_TEXT,
  promptEyebrowText: PROMPT_EYEBROW_TEXT,
  panelTitle: PANEL_TITLE,
  promptPanelTitle: PROMPT_PANEL_TITLE,
  promptMissingTitle: 'Prompt not found.',
  badgeAudienceLabel: 'Pending',
  badgePromptLabel: 'Answers',
  emptyBodyAudience: 'No approved questions yet.',
  emptyBodyPrompt: 'No answers yet.',
  useAudienceWhenUnbound: true,
  unboundMode: 'audience',
  buildLegacyTitle: buildTitle
}

const DISCUSSION_WIDGET_CONFIG: QnaWidgetConfig = {
  tags: {
    widgetTag: DISCUSSION_WIDGET_TAG,
    sessionTag: DISCUSSION_SESSION_TAG,
    shapesTag: DISCUSSION_SHAPES_TAG,
    pendingTag: DISCUSSION_PENDING_TAG,
    styleTag: DISCUSSION_STYLE_TAG,
    promptBindingTag: DISCUSSION_PROMPT_BINDING_TAG
  },
  eyebrowText: DISCUSSION_EYEBROW_TEXT,
  promptEyebrowText: DISCUSSION_EYEBROW_TEXT,
  panelTitle: DISCUSSION_PANEL_TITLE,
  promptPanelTitle: DISCUSSION_PANEL_TITLE,
  promptMissingTitle: 'Prompt not found.',
  badgeAudienceLabel: 'Answers',
  badgePromptLabel: 'Answers',
  emptyBodyAudience: 'Select a prompt to show answers.',
  emptyBodyPrompt: 'No answers yet.',
  useAudienceWhenUnbound: false,
  unboundMode: 'audience',
  buildLegacyTitle: buildDiscussionTitle
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const hexToRgb = (hex: string) => {
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

const rgbToHex = (color: { r: number; g: number; b: number }) => {
  const toHex = (value: number) => value.toString(16).padStart(2, '0')
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
}

const mixColors = (a: string, b: string, ratio: number) => {
  const colorA = hexToRgb(a)
  const colorB = hexToRgb(b)
  const mix = (v1: number, v2: number) => Math.round(v1 * (1 - ratio) + v2 * ratio)
  return rgbToHex({
    r: mix(colorA.r, colorB.r),
    g: mix(colorA.g, colorB.g),
    b: mix(colorA.b, colorB.b)
  })
}

const lighten = (hex: string, ratio: number) => mixColors(hex, '#ffffff', ratio)

const normalizeQnaStyle = (style?: Partial<QnaStyleConfig> | null): QnaStyleConfig => {
  const next = { ...DEFAULT_QNA_STYLE, ...(style ?? {}) }
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
    maxQuestions: clamp(
      Math.round(Number(next.maxQuestions ?? DEFAULT_QNA_STYLE.maxQuestions)),
      1,
      5
    )
  }
}

const normalizePollStyle = (style?: Partial<PollStyleConfig> | null): PollStyleConfig => {
  const next = { ...DEFAULT_POLL_STYLE, ...(style ?? {}) }
  const legacyWidth =
    style && (style as { barWidthScale?: number }).barWidthScale !== undefined
      ? (style as { barWidthScale?: number }).barWidthScale
      : style && (style as { widthScale?: number }).widthScale !== undefined
        ? (style as { widthScale?: number }).widthScale
        : undefined
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

const badgeFillFor = (style: QnaStyleConfig) => lighten(style.accentColor, 0.82)

const applyFont = (
  target: any,
  style: { fontFamily: string | null },
  options: { size?: number; color?: string; bold?: boolean }
) => {
  const font = target && target.font ? target.font : target
  if (style.fontFamily) {
    font.name = style.fontFamily
  }
  if (options.size) {
    font.size = options.size
  }
  if (options.bold !== undefined) {
    font.bold = options.bold
  }
  if (options.color) {
    font.color = options.color
  }
}

const getShapeId = (shape: { id: string } | null | undefined) =>
  shape ? shape.id : undefined

const isShapeNullObject = (shape: { isNullObject?: boolean } | null | undefined) =>
  Boolean(shape?.isNullObject)



const buildBody = (
  questions: Question[],
  mode: QnaMode,
  config: QnaWidgetConfig
) => {
  const approved = questions.filter((q) => q.status === 'approved')
  if (approved.length === 0) {
    return mode === 'prompt' ? config.emptyBodyPrompt : config.emptyBodyAudience
  }
  const sorted =
    mode === 'prompt' ? [...approved].sort((a, b) => b.votes - a.votes) : approved
  return sorted
    .slice(0, 6)
    .map((question, index) => `${index + 1}. ${question.text}`)
    .join('\n')
}

const buildPollTitle = (code?: string | null) =>
  code ? `Prezo Poll • ${code}` : 'Prezo Poll'

const pickPoll = (polls: Poll[]) => {
  if (polls.length === 0) {
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
  return sorted[0] ?? polls[0]
}

const buildPollQuestion = (poll: Poll | null) => {
  if (!poll) {
    return 'No polls yet.'
  }
  const prefix = poll.status === 'open' ? 'Live poll' : 'Poll'
  return `${prefix}: ${poll.question}`
}

const buildPollOptions = (poll: Poll | null) => {
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

export async function insertQnaWidget(sessionId?: string | null, code?: string | null) {
  ensurePowerPoint()

  const style = normalizeQnaStyle()
  const scale = style.spacingScale
  const maxQuestions = style.maxQuestions
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
        const parsed = JSON.parse(existingShapesTag.value) as Partial<WidgetShapeIds>
        const itemIds =
          parsed.items?.flatMap((item) => [item.container, item.text, item.votes]) ?? []
        const ids = [
          parsed.shadow,
          parsed.container,
          parsed.title,
          parsed.subtitle,
          parsed.meta,
          parsed.badge,
          parsed.body,
          ...itemIds
        ].filter(
          (value): value is string => Boolean(value)
        )
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
        // If parsing fails, we just overwrite tags below.
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

    const meta = slide.shapes.addTextBox(EYEBROW_TEXT, {
      left: left + paddingX,
      top: headerTop,
      width: Math.max(160, textWidth),
      height: eyebrowHeight
    })
    meta.textFrame.wordWrap = true
    applyFont(meta.textFrame.textRange, style, { size: 11, color: style.mutedColor })
    meta.tags.add(WIDGET_TAG, 'true')
    meta.tags.add('PrezoWidgetRole', 'meta')

    const title = slide.shapes.addTextBox(PANEL_TITLE, {
      left: left + paddingX,
      top: titleTop,
      width: Math.max(160, textWidth),
      height: titleHeight
    })
    title.textFrame.wordWrap = true
    applyFont(title.textFrame.textRange, style, {
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
    applyFont(subtitle.textFrame.textRange, style, { size: 13, color: style.mutedColor })
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
    badge.textFrame.textRange.text = buildBadgeText(
      'audience',
      0,
      0,
      QNA_WIDGET_CONFIG
    )
    applyFont(badge.textFrame.textRange, style, {
      size: 11,
      bold: true,
      color: style.accentColor
    })
    badge.tags.add(WIDGET_TAG, 'true')
    badge.tags.add('PrezoWidgetRole', 'badge')

    const body = slide.shapes.addTextBox(
      hasSession ? QNA_WIDGET_CONFIG.emptyBodyAudience : PLACEHOLDER_BODY,
      {
      left: left + paddingX,
      top: bodyTop,
      width: width - paddingX * 2,
      height: Math.max(80, bodyHeight)
      }
    )
    body.textFrame.wordWrap = true
    applyFont(body.textFrame.textRange, style, { size: 14, color: style.mutedColor })
    body.tags.add(WIDGET_TAG, 'true')
    body.tags.add('PrezoWidgetRole', 'body')

    const itemShapes: Array<{
      container: PowerPoint.Shape
      text: PowerPoint.Shape
      votes: PowerPoint.Shape
    }> = []

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
      applyFont(question.textFrame.textRange, style, {
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
      applyFont(votes.textFrame.textRange, style, {
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

    const shapeIds: WidgetShapeIds = {
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
}


export async function insertDiscussionWidget(sessionId?: string | null, code?: string | null) {
  ensurePowerPoint()

  const style = normalizeQnaStyle()
  const scale = style.spacingScale
  const maxQuestions = style.maxQuestions
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
        const parsed = JSON.parse(existingShapesTag.value) as Partial<WidgetShapeIds>
        const itemIds =
          parsed.items?.flatMap((item) => [item.container, item.text, item.votes]) ?? []
        const ids = [
          parsed.shadow,
          parsed.container,
          parsed.title,
          parsed.subtitle,
          parsed.meta,
          parsed.badge,
          parsed.body,
          ...itemIds
        ].filter(
          (value): value is string => Boolean(value)
        )
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
        // If parsing fails, we just overwrite tags below.
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

    const meta = slide.shapes.addTextBox(DISCUSSION_EYEBROW_TEXT, {
      left: left + paddingX,
      top: headerTop,
      width: Math.max(160, textWidth),
      height: eyebrowHeight
    })
    meta.textFrame.wordWrap = true
    applyFont(meta.textFrame.textRange, style, { size: 11, color: style.mutedColor })
    meta.tags.add(DISCUSSION_WIDGET_TAG, 'true')
    meta.tags.add('PrezoWidgetRole', 'meta')

    const title = slide.shapes.addTextBox(DISCUSSION_PANEL_TITLE, {
      left: left + paddingX,
      top: titleTop,
      width: Math.max(160, textWidth),
      height: titleHeight
    })
    title.textFrame.wordWrap = true
    applyFont(title.textFrame.textRange, style, {
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
    applyFont(subtitle.textFrame.textRange, style, { size: 13, color: style.mutedColor })
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
    badge.textFrame.textRange.text = buildBadgeText(
      'audience',
      0,
      0,
      DISCUSSION_WIDGET_CONFIG
    )
    applyFont(badge.textFrame.textRange, style, {
      size: 11,
      bold: true,
      color: style.accentColor
    })
    badge.tags.add(DISCUSSION_WIDGET_TAG, 'true')
    badge.tags.add('PrezoWidgetRole', 'badge')

    const body = slide.shapes.addTextBox(
      hasSession ? DISCUSSION_WIDGET_CONFIG.emptyBodyAudience : PLACEHOLDER_BODY,
      {
      left: left + paddingX,
      top: bodyTop,
      width: width - paddingX * 2,
      height: Math.max(80, bodyHeight)
      }
    )
    body.textFrame.wordWrap = true
    applyFont(body.textFrame.textRange, style, { size: 14, color: style.mutedColor })
    body.tags.add(DISCUSSION_WIDGET_TAG, 'true')
    body.tags.add('PrezoWidgetRole', 'body')

    const itemShapes: Array<{
      container: PowerPoint.Shape
      text: PowerPoint.Shape
      votes: PowerPoint.Shape
    }> = []

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
      applyFont(question.textFrame.textRange, style, {
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
      applyFont(votes.textFrame.textRange, style, {
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

    const shapeIds: WidgetShapeIds = {
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
}
export async function updateQnaWidget(
  sessionId: string,
  code: string | null | undefined,
  questions: Question[],
  prompts: QnaPrompt[],
  config: QnaWidgetConfig = QNA_WIDGET_CONFIG
) {
  ensurePowerPoint()

  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]))
  const tags = config.tags
  await PowerPoint.run(async (context) => {
    const slides = context.presentation.slides
    slides.load('items')
    await context.sync()

    const slideInfos = slides.items.map((slide) => {
      const sessionTag = slide.tags.getItemOrNullObject(tags.sessionTag)
      const pendingTag = slide.tags.getItemOrNullObject(tags.pendingTag)
      const styleTag = slide.tags.getItemOrNullObject(tags.styleTag)
      const shapeTag = slide.tags.getItemOrNullObject(tags.shapesTag)
      const promptBindingTag = slide.tags.getItemOrNullObject(tags.promptBindingTag)
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

      let shapeIds: WidgetShapeIds | null = null
      try {
        shapeIds = JSON.parse(info.shapeTag.value) as WidgetShapeIds
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
          const parsed = JSON.parse(info.styleTag.value) as Partial<QnaStyleConfig>
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
      const title = info.slide.shapes.getItemOrNullObject(shapeIds.title)
      const body = info.slide.shapes.getItemOrNullObject(shapeIds.body)
      const subtitle = shapeIds.subtitle
        ? info.slide.shapes.getItemOrNullObject(shapeIds.subtitle)
        : null
      const meta = shapeIds.meta
        ? info.slide.shapes.getItemOrNullObject(shapeIds.meta)
        : null
      const badge = shapeIds.badge
        ? info.slide.shapes.getItemOrNullObject(shapeIds.badge)
        : null
      const itemShapes = (shapeIds.items ?? []).map((item) => {
        const container = info.slide.shapes.getItemOrNullObject(item.container)
        const text = info.slide.shapes.getItemOrNullObject(item.text)
        const votes = info.slide.shapes.getItemOrNullObject(item.votes)
        container.load('id')
        text.load('id')
        votes.load('id')
        return { container, text, votes }
      })
      if (containerShape) {
        containerShape.load('id')
      }
      if (shadowShape) {
        shadowShape.load('id')
      }
      title.load('id')
      body.load('id')
      if (subtitle) {
        subtitle.load('id')
      }
      if (meta) {
        meta.load('id')
      }
      if (badge) {
        badge.load('id')
      }
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
        if (!title.isNullObject) {
          applyFont(title.textFrame.textRange, style, {
            size: 18,
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
        if (badge && !badge.isNullObject) {
          badge.fill.setSolidColor(badgeFillFor(style))
          badge.lineFormat.visible = false
          applyFont(badge.textFrame.textRange, style, {
            size: 11,
            bold: true,
            color: style.accentColor
          })
        }
        if (!body.isNullObject) {
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
      const boundPrompt = boundPromptId ? promptMap.get(boundPromptId) ?? null : null
      const resolvedMode: QnaMode =
        boundPromptId ? 'prompt' : config.unboundMode ?? 'audience'
      const filteredQuestions = boundPromptId
        ? questions.filter((q) => q.prompt_id === boundPromptId)
        : config.useAudienceWhenUnbound
          ? questions.filter((q) => !q.prompt_id)
          : []
      const pendingCount = filteredQuestions.filter((q) => q.status === 'pending').length
      const approvedRaw = filteredQuestions.filter((q) => q.status === 'approved')
      const approved =
        resolvedMode === 'prompt'
          ? [...approvedRaw].sort((a, b) => b.votes - a.votes)
          : approvedRaw
      const promptTitle = boundPrompt?.prompt?.trim()
      const panelTitle =
        resolvedMode === 'prompt'
          ? promptTitle ||
            (boundPromptId ? config.promptMissingTitle : config.promptPanelTitle)
          : config.panelTitle
      if (!title.isNullObject) {
        const hasNewLayout = Boolean(
          (shapeIds.items && shapeIds.items.length > 0) ||
            shapeIds.subtitle ||
            shapeIds.meta ||
            shapeIds.badge
        )
        title.textFrame.textRange.text = hasNewLayout
          ? panelTitle
          : config.buildLegacyTitle(code, resolvedMode, promptTitle ?? null)
      }
      if (meta && !meta.isNullObject) {
        meta.textFrame.textRange.text =
          resolvedMode === 'prompt'
            ? config.promptEyebrowText ?? config.eyebrowText
            : config.eyebrowText
      }
      if (subtitle && !subtitle.isNullObject) {
        subtitle.textFrame.textRange.text = buildMeta(code)
      }
      if (badge && !badge.isNullObject) {
        badge.textFrame.textRange.text = buildBadgeText(
          resolvedMode,
          pendingCount,
          approved.length,
          config
        )
      }
      if (itemShapes.length > 0) {
        const hasApproved = approved.length > 0
        if (!body.isNullObject) {
          body.textFrame.textRange.text = hasApproved
            ? ''
            : resolvedMode === 'prompt'
              ? config.emptyBodyPrompt
              : config.emptyBodyAudience
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
      } else if (!body.isNullObject) {
        body.textFrame.textRange.text = buildBody(filteredQuestions, resolvedMode, config)
      }

      if (isPending) {
        info.slide.tags.add(tags.sessionTag, sessionId)
        info.slide.tags.delete(tags.pendingTag)
      }
    }

    await context.sync()
  })
}

export async function insertPollWidget(
  sessionId?: string | null,
  code?: string | null,
  styleOverrides?: Partial<PollStyleConfig> | null
) {
  ensurePowerPoint()

  const style = normalizePollStyle(styleOverrides)
  const scale = style.spacingScale
  const maxOptions = style.maxOptions
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
          const parsed = JSON.parse(existingShapesTag.value) as Partial<PollWidgetShapeIds>
          const itemIds =
            parsed.items?.flatMap((item) => [item.label, item.group, item.bg, item.fill]) ?? []
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
          ).filter((value): value is string => Boolean(value))
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
    const itemShapes: Array<{
      label: PowerPoint.Shape
      group: PowerPoint.Shape
      bg: PowerPoint.Shape
      fill: PowerPoint.Shape
    }> = []

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
        left: isVertical ? columnLeft : left + paddingX,
        top: isVertical ? verticalBarTop + verticalBarAreaHeight + 6 : rowTop,
        width: isVertical ? columnWidth : fullBarWidth,
        height: isVertical ? verticalLabelHeight : 16
      })
      label.textFrame.wordWrap = true
      applyFont(label.textFrame.textRange, style, { size: 13, color: style.textColor })
      label.textFrame.textRange.paragraphFormat.horizontalAlignment = isVertical ? 'Center' : 'Left'
      label.tags.add(POLL_WIDGET_TAG, 'true')
      label.tags.add('PrezoWidgetRole', 'poll-label')

      const barTop = isVertical ? verticalBarTop : rowTop + 18
      const bg = slide.shapes.addGeometricShape('Rectangle', {
        left: isVertical ? verticalBarLeft : left + paddingX,
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
        left: isVertical ? verticalBarLeft : left + paddingX,
        top: isVertical ? barTop + (verticalBarAreaHeight - fillHeight) : barTop,
        width: isVertical ? verticalBarWidth : showItem ? Math.max(2, fullBarWidth * 0.35) : 2,
        height: isVertical ? fillHeight : barThickness
      })
      fill.fill.setSolidColor(style.accentColor)
      fill.fill.transparency = showItem ? 0 : 1
      fill.lineFormat.visible = false
      fill.tags.add(POLL_WIDGET_TAG, 'true')
      fill.tags.add('PrezoWidgetRole', 'poll-bar-fill')

      const barGroup = slide.shapes.addGroup([bg, fill])
      barGroup.tags.add(POLL_WIDGET_TAG, 'true')
      barGroup.tags.add('PrezoWidgetRole', 'poll-bar-group')

      label.load('id')
      barGroup.load('id')
      bg.load('id')
      fill.load('id')
      itemShapes.push({ label, group: barGroup, bg, fill })
    }

    shadow.load('id')
    container.load('id')
    title.load('id')
    question.load('id')
    await context.sync()

    const shapeIds: PollWidgetShapeIds = {
      shadow: shadow.id,
      container: container.id,
      title: title.id,
      question: question.id,
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
    slide.tags.delete(POLL_BINDING_TAG)
    slide.tags.add(POLL_STYLE_TAG, JSON.stringify(style))
    slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(shapeIds))
    await context.sync()
  })
}

export async function updatePollWidget(
  sessionId: string,
  code: string | null | undefined,
  polls: Poll[]
) {
  ensurePowerPoint()

  const pollMap = new Map(polls.map((poll) => [poll.id, poll]))
  const titleText = buildPollTitle(code)

  await PowerPoint.run(async (context) => {
    const slides = context.presentation.slides
    slides.load('items')
    await context.sync()

    const recoverPollShapeIds = async (
      slide: PowerPoint.Slide,
      isVerticalLayout: boolean
    ): Promise<PollWidgetShapeIds | null> => {
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

      const labels: PowerPoint.Shape[] = []
      const bars: PowerPoint.Shape[] = []
      const fills: PowerPoint.Shape[] = []
      const barGroups: PowerPoint.Shape[] = []
      let container: PowerPoint.Shape | null = null
      let shadow: PowerPoint.Shape | null = null
      let title: PowerPoint.Shape | null = null
      let question: PowerPoint.Shape | null = null
      let body: PowerPoint.Shape | null = null

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
            case 'poll-bar-group':
              barGroups.push(shape)
              return
            default:
              return
          }
        }
      })

      type PollBarItem = {
        group?: PowerPoint.Shape
        bg: PowerPoint.Shape
        fill: PowerPoint.Shape
      }

      const groupedBarItems: PollBarItem[] = []
      if (barGroups.length > 0) {
        const groupScopes = barGroups.map((shape) => ({
          shape,
          scope: shape.group.shapes
        }))
        groupScopes.forEach(({ scope }) => scope.load('items'))
        await context.sync()

        const taggedGroups = groupScopes.map(({ shape, scope }) => {
          const taggedShapes = scope.items.map((child) => {
            const roleTag = child.tags.getItemOrNullObject('PrezoWidgetRole')
            roleTag.load('value')
            child.load(['id', 'left', 'top', 'width', 'height'])
            return { child, roleTag }
          })
          return { shape, taggedShapes }
        })
        await context.sync()

        taggedGroups.forEach(({ shape, taggedShapes }) => {
          let bg: PowerPoint.Shape | null = null
          let fill: PowerPoint.Shape | null = null
          taggedShapes.forEach(({ child, roleTag }) => {
            if (roleTag.isNullObject || !roleTag.value) {
              return
            }
            if (roleTag.value === 'poll-bar-bg') {
              bg = child
              return
            }
            if (roleTag.value === 'poll-bar-fill') {
              fill = child
            }
          })
          if (bg && fill) {
            groupedBarItems.push({ group: shape, bg, fill })
          }
        })
      }

      const sortKey = (shape: PowerPoint.Shape) =>
        isVerticalLayout ? shape.left : shape.top
      labels.sort((a, b) => sortKey(a) - sortKey(b))

      const barItems: PollBarItem[] =
        groupedBarItems.length > 0
          ? groupedBarItems
          : Array.from({ length: Math.min(bars.length, fills.length) }, (_, index) => ({
              bg: bars[index],
              fill: fills[index]
            }))
      barItems.sort((a, b) => sortKey(a.bg) - sortKey(b.bg))

      if (!title || !container || labels.length === 0 || barItems.length === 0) {
        return null
      }

      const itemCount = Math.min(labels.length, barItems.length)
      const items = Array.from({ length: itemCount }, (_, index) => ({
        label: getShapeId(labels[index]) as string,
        group: getShapeId(barItems[index].group),
        bg: getShapeId(barItems[index].bg) as string,
        fill: getShapeId(barItems[index].fill) as string
      }))

      return {
        shadow: getShapeId(shadow),
        container: getShapeId(container) as string,
        title: getShapeId(title) as string,
        question: getShapeId(question),
        body: getShapeId(body),
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

      let shapeIds: PollWidgetShapeIds | null = null
      let recovered = false
      if (!info.shapeTag.isNullObject && info.shapeTag.value) {
        try {
          shapeIds = JSON.parse(info.shapeTag.value) as PollWidgetShapeIds
        } catch {
          shapeIds = null
        }
      }

      let style = DEFAULT_POLL_STYLE
      let applyStyle = false
      if (info.styleTag && !info.styleTag.isNullObject && info.styleTag.value) {
        try {
          const parsed = JSON.parse(info.styleTag.value) as Partial<PollStyleConfig>
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
      const poll = boundPollId ? (pollMap.get(boundPollId) ?? null) : pickPoll(polls)
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
      const resolveShape = (id: string) =>
        shapeScope ? shapeScope.getItemOrNullObject(id) : info.slide.shapes.getItemOrNullObject(id)

      let shadowShape = shapeIds.shadow ? resolveShape(shapeIds.shadow) : null
      if (shadowShape) {
        shadowShape.load('id')
      }

      let container = shapeIds.container ? resolveShape(shapeIds.container) : null
      if (container) {
        container.load(['id', 'width', 'left', 'top', 'height'])
      }

      let title = resolveShape(shapeIds.title)
      title.load('id')
      let questionShape = shapeIds.question ? resolveShape(shapeIds.question) : null
      if (questionShape) {
        questionShape.load('id')
      }

      let bodyShape: PowerPoint.Shape | null = null
      if (shapeIds.body) {
        bodyShape = resolveShape(shapeIds.body)
        bodyShape.load('id')
      }

      let itemShapes = (shapeIds.items ?? []).map((item) => {
        const label = resolveShape(item.label)
        const itemGroup = item.group
          ? shapeScope
            ? shapeScope.getItemOrNullObject(item.group)
            : info.slide.shapes.getItemOrNullObject(item.group)
          : null
        if (itemGroup) {
          itemGroup.load('id')
        }
        const barScope =
          itemGroup && !itemGroup.isNullObject ? itemGroup.group.shapes : shapeScope
        const bg = barScope
          ? barScope.getItemOrNullObject(item.bg)
          : info.slide.shapes.getItemOrNullObject(item.bg)
        const fill = barScope
          ? barScope.getItemOrNullObject(item.fill)
          : info.slide.shapes.getItemOrNullObject(item.fill)
        label.load('id')
        bg.load(['id', 'width', 'left', 'height', 'top'])
        fill.load(['id', 'width', 'left', 'height', 'top'])
        return { label, group: itemGroup, bg, fill }
      })

      await context.sync()

      const needsFallback =
        title.isNullObject ||
        (questionShape ? questionShape.isNullObject : false) ||
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

        const labels: PowerPoint.Shape[] = []
        const bars: PowerPoint.Shape[] = []
        const fills: PowerPoint.Shape[] = []
        const barGroups: PowerPoint.Shape[] = []
        let taggedContainer: PowerPoint.Shape | null = null
        let taggedShadow: PowerPoint.Shape | null = null
        let taggedTitle: PowerPoint.Shape | null = null
        let taggedQuestion: PowerPoint.Shape | null = null
        let taggedBody: PowerPoint.Shape | null = null
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
            case 'poll-bar-group':
              barGroups.push(shape)
              break
            default:
              break
          }
        })

        type PollBarItem = {
          group?: PowerPoint.Shape
          bg: PowerPoint.Shape
          fill: PowerPoint.Shape
        }

        const groupedBarItems: PollBarItem[] = []
        if (barGroups.length > 0) {
          const groupScopes = barGroups.map((shape) => ({
            shape,
            scope: shape.group.shapes
          }))
          groupScopes.forEach(({ scope }) => scope.load('items'))
          await context.sync()

          const taggedGroups = groupScopes.map(({ shape, scope }) => {
            const taggedShapes = scope.items.map((child) => {
              const roleTag = child.tags.getItemOrNullObject('PrezoWidgetRole')
              roleTag.load('value')
              child.load(['id', 'left', 'top', 'width', 'height'])
              return { child, roleTag }
            })
            return { shape, taggedShapes }
          })
          await context.sync()

          taggedGroups.forEach(({ shape, taggedShapes }) => {
            let bg: PowerPoint.Shape | null = null
            let fill: PowerPoint.Shape | null = null
            taggedShapes.forEach(({ child, roleTag }) => {
              if (roleTag.isNullObject || !roleTag.value) {
                return
              }
              if (roleTag.value === 'poll-bar-bg') {
                bg = child
                return
              }
              if (roleTag.value === 'poll-bar-fill') {
                fill = child
              }
            })
            if (bg && fill) {
              groupedBarItems.push({ group: shape, bg, fill })
            }
          })
        }

        const sortKey = (shape: PowerPoint.Shape) => (isVertical ? shape.left : shape.top)
        labels.sort((a, b) => sortKey(a) - sortKey(b))
        const barItems: PollBarItem[] =
          groupedBarItems.length > 0
            ? groupedBarItems
            : Array.from({ length: Math.min(bars.length, fills.length) }, (_, index) => ({
                bg: bars[index],
                fill: fills[index]
              }))
        barItems.sort((a, b) => sortKey(a.bg) - sortKey(b.bg))

        const itemCount = Math.min(labels.length, barItems.length)
        const taggedItems = Array.from({ length: itemCount }, (_, index) => ({
          label: labels[index],
          group: barItems[index].group ?? null,
          bg: barItems[index].bg,
          fill: barItems[index].fill
        }))

        if (taggedContainer) {
          container = taggedContainer
        }
        if (taggedShadow) {
          shadowShape = taggedShadow
        }
        if (taggedTitle) {
          title = taggedTitle
        }
        if (taggedQuestion) {
          questionShape = taggedQuestion
        }
        if (taggedBody) {
          bodyShape = taggedBody
        }
        if (taggedItems.length > 0) {
          itemShapes = taggedItems.map((item) => {
            item.label.load('id')
            if (item.group) {
              item.group.load('id')
            }
            item.bg.load(['id', 'width', 'left', 'height', 'top'])
            item.fill.load(['id', 'width', 'left', 'height', 'top'])
            return item
          })
          await context.sync()
        }

        if (taggedContainer || taggedShadow || taggedTitle || taggedQuestion || taggedItems.length) {
          const resolvedShapeIds: PollWidgetShapeIds = {
            group: groupShape && !isShapeNullObject(groupShape) ? getShapeId(groupShape) : undefined,
            shadow:
              taggedShadow && !isShapeNullObject(taggedShadow)
                ? getShapeId(taggedShadow)
                : shapeIds.shadow,
            container:
              taggedContainer && !isShapeNullObject(taggedContainer)
                ? (getShapeId(taggedContainer) as string)
                : shapeIds.container,
            title:
              taggedTitle && !isShapeNullObject(taggedTitle)
                ? (getShapeId(taggedTitle) as string)
                : shapeIds.title,
            question:
              taggedQuestion && !isShapeNullObject(taggedQuestion)
                ? getShapeId(taggedQuestion)
                : shapeIds.question,
            body:
              taggedBody && !isShapeNullObject(taggedBody)
                ? getShapeId(taggedBody)
                : shapeIds.body,
            items:
              taggedItems.length > 0
                ? taggedItems.map((item) => ({
                    label: getShapeId(item.label) as string,
                    group: getShapeId(item.group),
                    bg: getShapeId(item.bg) as string,
                    fill: getShapeId(item.fill) as string
                  }))
                : shapeIds.items
          }
          info.slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(resolvedShapeIds))
        }
      }

      if (!shapeScope) {
        const legacyBarItems = itemShapes
          .map((item, index) => ({ item, index }))
          .filter(
            ({ item }) =>
              (!item.group || item.group.isNullObject) &&
              !item.bg.isNullObject &&
              !item.fill.isNullObject
          )

        if (legacyBarItems.length > 0) {
          const createdGroups = legacyBarItems.map(({ item, index }) => {
            const barGroup = info.slide.shapes.addGroup([item.bg, item.fill])
            barGroup.tags.add(POLL_WIDGET_TAG, 'true')
            barGroup.tags.add('PrezoWidgetRole', 'poll-bar-group')
            barGroup.load('id')
            const groupItems = barGroup.group.shapes
            groupItems.load('items')
            return { index, barGroup, groupItems }
          })
          await context.sync()

          const taggedGroups = createdGroups.map(({ index, barGroup, groupItems }) => {
            const taggedItems = groupItems.items.map((child) => {
              const roleTag = child.tags.getItemOrNullObject('PrezoWidgetRole')
              roleTag.load('value')
              child.load(['id', 'width', 'left', 'height', 'top'])
              return { child, roleTag }
            })
            return { index, barGroup, taggedItems }
          })
          await context.sync()

          const groupedByIndex = new Map<
            number,
            { group: PowerPoint.Shape; bg: PowerPoint.Shape; fill: PowerPoint.Shape }
          >()

          taggedGroups.forEach(({ index, barGroup, taggedItems }) => {
            let bg: PowerPoint.Shape | null = null
            let fill: PowerPoint.Shape | null = null
            taggedItems.forEach(({ child, roleTag }) => {
              if (roleTag.isNullObject || !roleTag.value) {
                return
              }
              if (roleTag.value === 'poll-bar-bg') {
                bg = child
                return
              }
              if (roleTag.value === 'poll-bar-fill') {
                fill = child
              }
            })
            if (!bg && taggedItems[0]) {
              bg = taggedItems[0].child
            }
            if (!fill && taggedItems[1]) {
              fill = taggedItems[1].child
            }
            if (bg && fill) {
              groupedByIndex.set(index, { group: barGroup, bg, fill })
            }
          })

          if (groupedByIndex.size > 0) {
            itemShapes = itemShapes.map((item, index) => {
              const grouped = groupedByIndex.get(index)
              if (!grouped) {
                return item
              }
              return {
                label: item.label,
                group: grouped.group,
                bg: grouped.bg,
                fill: grouped.fill
              }
            })

            const migratedItems: Array<{
              label: string
              group?: string
              bg: string
              fill: string
            }> = []
            itemShapes.forEach((item) => {
              const labelId = getShapeId(item.label)
              const groupId = getShapeId(item.group)
              const bgId = getShapeId(item.bg)
              const fillId = getShapeId(item.fill)
              if (!labelId || !bgId || !fillId) {
                return
              }
              const migratedItem: {
                label: string
                group?: string
                bg: string
                fill: string
              } = {
                label: labelId,
                bg: bgId,
                fill: fillId
              }
              if (groupId) {
                migratedItem.group = groupId
              }
              migratedItems.push(migratedItem)
            })

            if (migratedItems.length > 0) {
              const migratedShapeIds: PollWidgetShapeIds = {
                ...shapeIds,
                items: migratedItems
              }
              shapeIds = migratedShapeIds
              info.slide.tags.add(POLL_SHAPES_TAG, JSON.stringify(migratedShapeIds))
            }
          }
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
        if (!title.isNullObject) {
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
      itemShapes.forEach((item) => {
        if (item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject) {
          return
        }
        applyFont(item.label.textFrame.textRange, style, { size: 13, color: style.textColor })
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

      if (!title.isNullObject) {
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

export async function updateDiscussionWidget(
  sessionId: string,
  code: string | null | undefined,
  questions: Question[],
  prompts: QnaPrompt[]
) {
  await updateQnaWidget(sessionId, code, questions, prompts, DISCUSSION_WIDGET_CONFIG)
}

export async function setQnaWidgetBinding(
  sessionId: string,
  promptId?: string | null
) {
  ensurePowerPoint()

  await PowerPoint.run(async (context) => {
    const slides = context.presentation.getSelectedSlides()
    slides.load('items')
    await context.sync()

    const slide = slides.items[0]
    if (!slide) {
      throw new Error('Select a slide containing a Q&A widget.')
    }

    const shapesTag = slide.tags.getItemOrNullObject(SHAPES_TAG)
    shapesTag.load('value')
    await context.sync()

    let hasWidget = !shapesTag.isNullObject && Boolean(shapesTag.value)
    if (!hasWidget) {
      const shapes = slide.shapes
      shapes.load('items')
      await context.sync()
      const tagged = shapes.items.map((shape) => {
        const tag = shape.tags.getItemOrNullObject(WIDGET_TAG)
        tag.load('value')
        return tag
      })
      await context.sync()
      hasWidget = tagged.some((tag) => !tag.isNullObject && tag.value === 'true')
    }

    if (!hasWidget) {
      throw new Error('No Q&A widget found on the selected slide.')
    }

    slide.tags.delete(LEGACY_QNA_MODE_TAG)
    slide.tags.delete(LEGACY_QNA_PROMPT_TAG)
    if (promptId) {
      slide.tags.add(QNA_PROMPT_BINDING_TAG, promptId)
    } else {
      slide.tags.delete(QNA_PROMPT_BINDING_TAG)
    }

    slide.tags.add(SESSION_TAG, sessionId)
    slide.tags.delete(WIDGET_PENDING_TAG)
    await context.sync()
  })
}

export async function setDiscussionWidgetBinding(
  sessionId: string,
  promptId?: string | null
) {
  ensurePowerPoint()

  await PowerPoint.run(async (context) => {
    const slides = context.presentation.getSelectedSlides()
    slides.load('items')
    await context.sync()

    const slide = slides.items[0]
    if (!slide) {
      throw new Error('Select a slide containing an open discussion widget.')
    }

    const shapesTag = slide.tags.getItemOrNullObject(DISCUSSION_SHAPES_TAG)
    shapesTag.load('value')
    await context.sync()

    let hasWidget = !shapesTag.isNullObject && Boolean(shapesTag.value)
    if (!hasWidget) {
      const shapes = slide.shapes
      shapes.load('items')
      await context.sync()
      const tagged = shapes.items.map((shape) => {
        const tag = shape.tags.getItemOrNullObject(DISCUSSION_WIDGET_TAG)
        tag.load('value')
        return tag
      })
      await context.sync()
      hasWidget = tagged.some((tag) => !tag.isNullObject && tag.value === 'true')
    }

    if (!hasWidget) {
      throw new Error('No open discussion widget found on the selected slide.')
    }

    if (promptId) {
      slide.tags.add(DISCUSSION_PROMPT_BINDING_TAG, promptId)
    } else {
      slide.tags.delete(DISCUSSION_PROMPT_BINDING_TAG)
    }

    slide.tags.add(DISCUSSION_SESSION_TAG, sessionId)
    slide.tags.delete(DISCUSSION_PENDING_TAG)
    await context.sync()
  })
}

export async function setPollWidgetBinding(sessionId: string, pollId?: string | null) {
  ensurePowerPoint()

  await PowerPoint.run(async (context) => {
    const slides = context.presentation.getSelectedSlides()
    slides.load('items')
    await context.sync()

    const slide = slides.items[0]
    if (!slide) {
      throw new Error('Select a slide containing a poll widget.')
    }

    const shapesTag = slide.tags.getItemOrNullObject(POLL_SHAPES_TAG)
    shapesTag.load('value')
    await context.sync()

    let hasWidget = !shapesTag.isNullObject && Boolean(shapesTag.value)
    if (!hasWidget) {
      const shapes = slide.shapes
      shapes.load('items')
      await context.sync()
      const tagged = shapes.items.map((shape) => {
        const tag = shape.tags.getItemOrNullObject(POLL_WIDGET_TAG)
        tag.load('value')
        return tag
      })
      await context.sync()
      hasWidget = tagged.some((tag) => !tag.isNullObject && tag.value === 'true')
    }

    if (!hasWidget) {
      throw new Error('No poll widget found on the selected slide.')
    }

    if (pollId) {
      slide.tags.add(POLL_BINDING_TAG, pollId)
    } else {
      slide.tags.delete(POLL_BINDING_TAG)
    }

    slide.tags.add(POLL_SESSION_TAG, sessionId)
    slide.tags.delete(POLL_PENDING_TAG)
    await context.sync()
  })
}

import type { WordCloud } from '../api/types'

const WORD_CLOUD_WIDGET_TAG = 'PrezoWordCloudWidget'
const WORD_CLOUD_SESSION_TAG = 'PrezoWordCloudSessionId'
const WORD_CLOUD_SHAPES_TAG = 'PrezoWordCloudShapeIds'
const WORD_CLOUD_PENDING_TAG = 'PrezoWordCloudPending'
const WORD_CLOUD_STYLE_TAG = 'PrezoWordCloudStyle'
const WORD_CLOUD_LAYOUT_TAG = 'PrezoWordCloudLayout'
const WORD_CLOUD_STATE_TAG = 'PrezoWordCloudState'
const WORD_CLOUD_WORD_INDEX_TAG = 'PrezoWordCloudWordIndex'
const WORD_CLOUD_LAYOUT_CLOUD = 'cloud-v1'
const MAX_WORD_CLOUD_WORDS = 5

const buildWordCloudTitle = (code?: string | null) =>
  code ? `Prezo Word Cloud - ${code}` : 'Prezo Word Cloud'

const buildWordCloudSubtitle = (cloud: WordCloud | null) => {
  if (!cloud) {
    return 'No active word cloud yet.'
  }
  return cloud.prompt || 'Pick a word to shape the cloud.'
}

const buildWordCloudMeta = (cloud: WordCloud | null) => {
  if (!cloud) {
    return 'Create and open a word cloud in the host console.'
  }
  return cloud.status === 'open' ? 'Voting is live.' : 'Voting is closed.'
}

type WordCloudShapeIds = {
  shadow?: string
  container: string
  title: string
  subtitle: string
  body: string
  words: string[]
}

type WordCloudStyleConfig = {
  fontFamily: string | null
  textColor: string
  mutedColor: string
  accentColor: string
  panelColor: string
  borderColor: string
  shadowColor: string
  shadowOpacity: number
  spacingScale: number
  minFontSize: number
  maxFontSize: number
  maxWords: number
  lockStyle?: boolean
}

type WordCloudWidgetState = {
  cloudId: string | null
  ratios: Record<string, number>
}

type WordAnchor = {
  x: number
  y: number
  width: number
  height: number
}

type WidgetRect = {
  left: number
  top: number
  width: number
  height: number
}

const EMPTY_WORD_CLOUD_STATE: WordCloudWidgetState = {
  cloudId: null,
  ratios: {}
}

const DEFAULT_WORD_CLOUD_STYLE: WordCloudStyleConfig = {
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const hexToRgb = (hex: string) => {
  const normalized = (hex || '').replace('#', '')
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

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const toHex = (value: number) => value.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const mixColors = (a: string, b: string, ratio: number) => {
  const clamped = clamp(ratio, 0, 1)
  const colorA = hexToRgb(a)
  const colorB = hexToRgb(b)
  const mix = (v1: number, v2: number) => Math.round(v1 * (1 - clamped) + v2 * clamped)
  return rgbToHex({
    r: mix(colorA.r, colorB.r),
    g: mix(colorA.g, colorB.g),
    b: mix(colorA.b, colorB.b)
  })
}

const normalizeWordKey = (label: string) => label.trim().toLocaleLowerCase()

const parseWordCloudState = (value: string | null | undefined): WordCloudWidgetState => {
  if (!value) {
    return EMPTY_WORD_CLOUD_STATE
  }
  try {
    const parsed = JSON.parse(value) as Partial<WordCloudWidgetState>
    const ratios =
      parsed && parsed.ratios && typeof parsed.ratios === 'object'
        ? Object.entries(parsed.ratios).reduce<Record<string, number>>((acc, [key, raw]) => {
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

const createWordCloudState = (
  cloud: WordCloud | null,
  words: Array<{ label: string; votes: number }>
): WordCloudWidgetState => {
  const maxVotes = words.reduce((max, word) => Math.max(max, word.votes), 0)
  const ratios = words.reduce<Record<string, number>>((acc, word) => {
    const ratio = maxVotes > 0 ? word.votes / maxVotes : 0
    acc[normalizeWordKey(word.label)] = clamp(ratio, 0, 1)
    return acc
  }, {})
  return {
    cloudId: cloud?.id ?? null,
    ratios
  }
}

const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp(value, 0, 1), 3)

const interpolate = (from: number, to: number, progress: number) => from + (to - from) * progress

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const normalizeWordCloudStyle = (
  style?: Partial<WordCloudStyleConfig> | null
): WordCloudStyleConfig => {
  const next = { ...DEFAULT_WORD_CLOUD_STYLE, ...(style ?? {}) }
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
    maxWords: clamp(
      Math.round(Number(next.maxWords ?? DEFAULT_WORD_CLOUD_STYLE.maxWords)),
      1,
      MAX_WORD_CLOUD_WORDS
    )
  }
}

const ensurePowerPoint = () => {
  if (typeof PowerPoint === 'undefined' || typeof PowerPoint.run !== 'function') {
    throw new Error('PowerPoint JS API is not available.')
  }
}

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

const pickWordCloud = (wordClouds: WordCloud[]) => {
  if (wordClouds.length === 0) {
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
  return sorted[0] ?? wordClouds[0]
}

const wordAnchors = [
  { x: 0.14, y: 0.34, width: 0.28, height: 0.15 },
  { x: 0.46, y: 0.32, width: 0.3, height: 0.16 },
  { x: 0.26, y: 0.53, width: 0.32, height: 0.17 },
  { x: 0.58, y: 0.55, width: 0.26, height: 0.15 },
  { x: 0.4, y: 0.72, width: 0.24, height: 0.14 }
] satisfies WordAnchor[]

const WORD_CLOUD_SHAPE_TYPES = ['Cloud', 'CloudCallout', 'RoundRectangle'] as const
const WORD_CLOUD_COLOR_SEEDS = [0.14, 0.22, 0.18, 0.27, 0.2]

const baseWordFrame = (widgetRect: WidgetRect, anchor: WordAnchor) => ({
  left: widgetRect.left + widgetRect.width * anchor.x,
  top: widgetRect.top + widgetRect.height * anchor.y,
  width: widgetRect.width * anchor.width,
  height: widgetRect.height * anchor.height
})

const scaledWordFrame = (widgetRect: WidgetRect, anchor: WordAnchor, ratio: number) => {
  const base = baseWordFrame(widgetRect, anchor)
  const clamped = clamp(ratio, 0, 1)
  const widthScale = 0.9 + clamped * 0.42
  const heightScale = 0.92 + clamped * 0.32
  const width = base.width * widthScale
  const height = base.height * heightScale
  const centerX = base.left + base.width / 2
  const centerY = base.top + base.height / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height
  }
}

const buildCloudVisual = (style: WordCloudStyleConfig, ratio: number, index: number) => {
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

const fontSizeForRatio = (style: WordCloudStyleConfig, ratio: number) => {
  const clamped = clamp(ratio, 0, 1)
  const eased = Math.pow(clamped, 0.78)
  return Math.round(style.minFontSize + (style.maxFontSize - style.minFontSize) * eased)
}

const setWordShapeHidden = (
  shape: any,
  widgetRect: WidgetRect | null,
  anchor: WordAnchor,
  cloudLayout: boolean
) => {
  shape.textFrame.textRange.text = ''
  if (widgetRect) {
    const frame = baseWordFrame(widgetRect, anchor)
    shape.left = frame.left
    shape.top = frame.top
    shape.width = frame.width
    shape.height = frame.height
  }
  if (cloudLayout) {
    shape.fill.transparency = 1
    shape.lineFormat.visible = false
  }
}

const renderWordShape = (
  shape: any,
  wordLabel: string,
  ratio: number,
  style: WordCloudStyleConfig,
  widgetRect: WidgetRect | null,
  anchor: WordAnchor,
  index: number,
  cloudLayout: boolean
) => {
  const clampedRatio = clamp(ratio, 0, 1)
  shape.textFrame.textRange.text = wordLabel
  shape.textFrame.wordWrap = true

  if (cloudLayout && widgetRect) {
    const frame = scaledWordFrame(widgetRect, anchor, clampedRatio)
    const visual = buildCloudVisual(style, clampedRatio, index)
    shape.left = frame.left
    shape.top = frame.top
    shape.width = frame.width
    shape.height = frame.height
    shape.fill.setSolidColor(visual.fillColor)
    shape.fill.transparency = visual.transparency
    shape.lineFormat.visible = true
    shape.lineFormat.color = visual.borderColor
    shape.lineFormat.weight = visual.lineWeight
    applyFont(shape.textFrame.textRange, style, {
      size: fontSizeForRatio(style, clampedRatio),
      bold: visual.bold,
      color: visual.textColor
    })
    return
  }

  if (widgetRect) {
    const frame = baseWordFrame(widgetRect, anchor)
    shape.left = frame.left
    shape.top = frame.top
    shape.width = frame.width
    shape.height = frame.height
  }
  applyFont(shape.textFrame.textRange, style, {
    size: fontSizeForRatio(style, clampedRatio),
    bold: clampedRatio >= 0.45,
    color: clampedRatio > 0 ? style.accentColor : style.textColor
  })
}

const addWordCloudShape = (slide: PowerPoint.Slide, frame: WidgetRect) => {
  for (const shapeType of WORD_CLOUD_SHAPE_TYPES) {
    try {
      return slide.shapes.addGeometricShape(shapeType as any, frame)
    } catch {
      // fallback to the next supported shape
    }
  }
  return slide.shapes.addTextBox('', frame)
}

const recoverShapeIds = async (
  slide: PowerPoint.Slide,
  context: any
): Promise<WordCloudShapeIds | null> => {
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
    shape.load(['id', 'top', 'left'])
    return { shape, widgetTag, roleTag, indexTag }
  })

  await context.sync()

  let container: PowerPoint.Shape | null = null
  let shadow: PowerPoint.Shape | null = null
  let title: PowerPoint.Shape | null = null
  let subtitle: PowerPoint.Shape | null = null
  let body: PowerPoint.Shape | null = null
  const words: Array<{ shape: PowerPoint.Shape; index: number | null }> = []

  tagged.forEach(({ shape, widgetTag, roleTag, indexTag }) => {
    const hasWidgetTag = !widgetTag.isNullObject && widgetTag.value === 'true'
    const role = !roleTag.isNullObject ? roleTag.value : null
    if (!hasWidgetTag && !role) {
      return
    }
    switch (role) {
      case 'word-cloud-container':
        container = shape
        break
      case 'word-cloud-shadow':
        shadow = shape
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
      case 'word-cloud-word':
        words.push({
          shape,
          index:
            !indexTag.isNullObject && Number.isFinite(Number.parseInt(indexTag.value, 10))
              ? Number.parseInt(indexTag.value, 10)
              : null
        })
        break
      default:
        break
    }
  })

  const resolvedContainer = container
  const resolvedTitle = title
  const resolvedSubtitle = subtitle
  const resolvedBody = body

  if (
    !resolvedContainer ||
    !resolvedTitle ||
    !resolvedSubtitle ||
    !resolvedBody ||
    words.length === 0
  ) {
    return null
  }

  words.sort((a, b) => {
    if (a.index !== null || b.index !== null) {
      const aIndex = a.index ?? Number.MAX_SAFE_INTEGER
      const bIndex = b.index ?? Number.MAX_SAFE_INTEGER
      if (aIndex !== bIndex) {
        return aIndex - bIndex
      }
    }
    if (Math.abs(a.shape.top - b.shape.top) < 4) {
      return a.shape.left - b.shape.left
    }
    return a.shape.top - b.shape.top
  })

  const resolvedShadow = shadow as any
  const ensuredContainer = resolvedContainer as any
  const ensuredTitle = resolvedTitle as any
  const ensuredSubtitle = resolvedSubtitle as any
  const ensuredBody = resolvedBody as any

  return {
    shadow: resolvedShadow?.id,
    container: ensuredContainer.id,
    title: ensuredTitle.id,
    subtitle: ensuredSubtitle.id,
    body: ensuredBody.id,
    words: words.slice(0, MAX_WORD_CLOUD_WORDS).map((entry) => entry.shape.id)
  }
}

export async function insertWordCloudWidget(
  sessionId?: string | null,
  code?: string | null,
  styleOverrides?: Partial<WordCloudStyleConfig> | null
) {
  ensurePowerPoint()

  const style = normalizeWordCloudStyle(styleOverrides)
  const scale = style.spacingScale
  const hasSession = Boolean(sessionId)
  const maxWords = style.maxWords

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

    const existingShapesTag = slide.tags.getItemOrNullObject(WORD_CLOUD_SHAPES_TAG)
    existingShapesTag.load('value')
    await context.sync()

    if (!existingShapesTag.isNullObject && existingShapesTag.value) {
      try {
        const parsed = JSON.parse(existingShapesTag.value) as Partial<WordCloudShapeIds>
        const ids = [
          parsed.shadow,
          parsed.container,
          parsed.title,
          parsed.subtitle,
          parsed.body,
          ...(parsed.words ?? [])
        ].filter((value): value is string => Boolean(value))
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
      slide.tags.delete(WORD_CLOUD_SESSION_TAG)
      slide.tags.delete(WORD_CLOUD_PENDING_TAG)
      slide.tags.delete(WORD_CLOUD_STYLE_TAG)
      slide.tags.delete(WORD_CLOUD_LAYOUT_TAG)
      slide.tags.delete(WORD_CLOUD_STATE_TAG)
      slide.tags.delete(WORD_CLOUD_SHAPES_TAG)
    }

    const width = Math.max(380, pageSetup.slideWidth * 0.7)
    const height = Math.max(280, pageSetup.slideHeight * 0.56)
    const left = (pageSetup.slideWidth - width) / 2
    const top = pageSetup.slideHeight * 0.1
    const padding = 24
    const widgetRect: WidgetRect = { left, top, width, height }

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

    const wordShapes: PowerPoint.Shape[] = []
    const visibleWords = Math.min(maxWords, MAX_WORD_CLOUD_WORDS)
    for (let index = 0; index < visibleWords; index += 1) {
      const anchor = wordAnchors[index]
      const frame = baseWordFrame(widgetRect, anchor)
      const wordShape = addWordCloudShape(slide, frame)
      setWordShapeHidden(wordShape, widgetRect, anchor, true)
      applyFont(wordShape.textFrame.textRange, style, {
        size: style.minFontSize,
        bold: false,
        color: style.textColor
      })
      wordShape.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
      wordShape.tags.add('PrezoWidgetRole', 'word-cloud-word')
      wordShape.tags.add(WORD_CLOUD_WORD_INDEX_TAG, `${index}`)
      wordShapes.push(wordShape)
    }

    shadow.load('id')
    container.load('id')
    title.load('id')
    subtitle.load('id')
    body.load('id')
    wordShapes.forEach((shape) => shape.load('id'))
    await context.sync()

    const shapeIds: WordCloudShapeIds = {
      shadow: shadow.id,
      container: container.id,
      title: title.id,
      subtitle: subtitle.id,
      body: body.id,
      words: wordShapes.map((shape) => shape.id)
    }

    if (hasSession && sessionId) {
      slide.tags.add(WORD_CLOUD_SESSION_TAG, sessionId)
      slide.tags.delete(WORD_CLOUD_PENDING_TAG)
    } else {
      slide.tags.add(WORD_CLOUD_PENDING_TAG, 'true')
      slide.tags.delete(WORD_CLOUD_SESSION_TAG)
    }
    slide.tags.add(WORD_CLOUD_STYLE_TAG, JSON.stringify(style))
    slide.tags.add(WORD_CLOUD_LAYOUT_TAG, WORD_CLOUD_LAYOUT_CLOUD)
    slide.tags.add(WORD_CLOUD_STATE_TAG, JSON.stringify(EMPTY_WORD_CLOUD_STATE))
    slide.tags.add(WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))
    await context.sync()
  })
}

export async function updateWordCloudWidget(
  sessionId: string,
  code: string | null | undefined,
  wordClouds: WordCloud[]
) {
  ensurePowerPoint()

  const cloud = pickWordCloud(wordClouds)
  const words = cloud?.words.slice(0, MAX_WORD_CLOUD_WORDS) ?? []
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
      const layoutTag = slide.tags.getItemOrNullObject(WORD_CLOUD_LAYOUT_TAG)
      const stateTag = slide.tags.getItemOrNullObject(WORD_CLOUD_STATE_TAG)
      sessionTag.load('value')
      pendingTag.load('value')
      shapeTag.load('value')
      styleTag.load('value')
      layoutTag.load('value')
      stateTag.load('value')
      return { slide, sessionTag, pendingTag, shapeTag, styleTag, layoutTag, stateTag }
    })

    await context.sync()

    for (const info of slideInfos) {
      const isPending = !info.pendingTag.isNullObject && info.pendingTag.value === 'true'
      const hasSessionMatch =
        !info.sessionTag.isNullObject && info.sessionTag.value === sessionId

      let shapeIds: WordCloudShapeIds | null = null
      if (!info.shapeTag.isNullObject && info.shapeTag.value) {
        try {
          shapeIds = JSON.parse(info.shapeTag.value) as WordCloudShapeIds
        } catch {
          shapeIds = null
        }
      }

      let recovered = false
      if (!shapeIds) {
        shapeIds = await recoverShapeIds(info.slide, context)
        recovered = Boolean(shapeIds)
        if (shapeIds) {
          info.slide.tags.add(WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))
        }
      }

      if (!shapeIds) {
        continue
      }

      if (!isPending && !hasSessionMatch && !recovered) {
        continue
      }

      let style = DEFAULT_WORD_CLOUD_STYLE
      let applyStyle = false
      if (!info.styleTag.isNullObject && info.styleTag.value) {
        try {
          const parsed = JSON.parse(info.styleTag.value) as Partial<WordCloudStyleConfig>
          style = normalizeWordCloudStyle(parsed)
          applyStyle = Boolean(parsed.lockStyle)
        } catch {
          style = DEFAULT_WORD_CLOUD_STYLE
        }
      }

      const shadow = shapeIds.shadow
        ? info.slide.shapes.getItemOrNullObject(shapeIds.shadow)
        : null
      const container = info.slide.shapes.getItemOrNullObject(shapeIds.container)
      const title = info.slide.shapes.getItemOrNullObject(shapeIds.title)
      const subtitle = info.slide.shapes.getItemOrNullObject(shapeIds.subtitle)
      const body = info.slide.shapes.getItemOrNullObject(shapeIds.body)
      const wordShapes = shapeIds.words.map((id) => info.slide.shapes.getItemOrNullObject(id))

      if (shadow) {
        shadow.load('id')
      }
      container.load(['id', 'left', 'top', 'width', 'height'])
      title.load('id')
      subtitle.load('id')
      body.load('id')
      wordShapes.forEach((shape) => shape.load('id'))
      await context.sync()

      if (applyStyle) {
        if (shadow && !shadow.isNullObject) {
          shadow.fill.setSolidColor(style.shadowColor)
          shadow.fill.transparency = style.shadowOpacity
          shadow.lineFormat.visible = false
        }
        if (!container.isNullObject) {
          container.fill.setSolidColor(style.panelColor)
          container.lineFormat.color = style.borderColor
          container.lineFormat.weight = 1.2
        }
        if (!title.isNullObject) {
          applyFont(title.textFrame.textRange, style, {
            size: 22,
            bold: true,
            color: style.textColor
          })
        }
        if (!subtitle.isNullObject) {
          applyFont(subtitle.textFrame.textRange, style, {
            size: 13,
            color: style.mutedColor
          })
        }
        if (!body.isNullObject) {
          applyFont(body.textFrame.textRange, style, { size: 13, color: style.mutedColor })
        }
      }

      if (!title.isNullObject) {
        title.textFrame.textRange.text = buildWordCloudTitle(code)
      }
      if (!subtitle.isNullObject) {
        subtitle.textFrame.textRange.text = buildWordCloudSubtitle(cloud)
      }
      if (!body.isNullObject) {
        body.textFrame.textRange.text = buildWordCloudMeta(cloud)
      }

      const cloudLayout =
        !info.layoutTag.isNullObject && info.layoutTag.value === WORD_CLOUD_LAYOUT_CLOUD
      const widgetRect: WidgetRect | null =
        !container.isNullObject
          ? {
              left: container.left,
              top: container.top,
              width: container.width,
              height: container.height
            }
          : null
      const previousState = parseWordCloudState(
        !info.stateTag.isNullObject ? info.stateTag.value : null
      )
      const previousRatios =
        previousState.cloudId === (cloud?.id ?? null) ? previousState.ratios : {}
      const visibleWords = Math.min(style.maxWords, words.length, wordShapes.length)

      const plans = wordShapes.map((shape, index) => {
        const anchor = wordAnchors[index] ?? wordAnchors[wordAnchors.length - 1]
        const word = index < visibleWords ? words[index] : null
        if (!word) {
          return {
            shape,
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
          shape,
          anchor,
          word,
          startRatio: clamp(startRatio, 0, 1),
          targetRatio: clamp(targetRatio, 0, 1),
          index
        }
      })

      const shouldAnimate =
        cloudLayout &&
        plans.some(
          (plan) => plan.word && Math.abs(plan.startRatio - plan.targetRatio) > 0.035
        )
      const frames = shouldAnimate ? 5 : 1

      for (let frame = 1; frame <= frames; frame += 1) {
        const progress = frame / frames
        const eased = shouldAnimate ? easeOutCubic(progress) : 1
        plans.forEach((plan) => {
          if (plan.shape.isNullObject) {
            return
          }
          if (!plan.word) {
            setWordShapeHidden(plan.shape, widgetRect, plan.anchor, cloudLayout)
            return
          }
          const ratio = interpolate(plan.startRatio, plan.targetRatio, eased)
          renderWordShape(
            plan.shape,
            plan.word.label,
            ratio,
            style,
            widgetRect,
            plan.anchor,
            plan.index,
            cloudLayout
          )
        })
        await context.sync()
        if (shouldAnimate && frame < frames) {
          await wait(50)
        }
      }

      const nextState = createWordCloudState(cloud, words.slice(0, visibleWords))
      info.slide.tags.add(WORD_CLOUD_STATE_TAG, JSON.stringify(nextState))
      if (cloudLayout) {
        info.slide.tags.add(WORD_CLOUD_LAYOUT_TAG, WORD_CLOUD_LAYOUT_CLOUD)
      }

      if (isPending || recovered) {
        info.slide.tags.add(WORD_CLOUD_SESSION_TAG, sessionId)
        info.slide.tags.delete(WORD_CLOUD_PENDING_TAG)
      }
    }

    await context.sync()
  })
}

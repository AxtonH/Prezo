import type { WordCloud } from '../api/types'

const WORD_CLOUD_WIDGET_TAG = 'PrezoWordCloudWidget'
const WORD_CLOUD_SESSION_TAG = 'PrezoWordCloudSessionId'
const WORD_CLOUD_SHAPES_TAG = 'PrezoWordCloudShapeIds'
const WORD_CLOUD_PENDING_TAG = 'PrezoWordCloudPending'
const WORD_CLOUD_STYLE_TAG = 'PrezoWordCloudStyle'
const WORD_CLOUD_STATE_TAG = 'PrezoWordCloudState'
const WORD_CLOUD_WORD_INDEX_TAG = 'PrezoWordCloudWordIndex'
const MAX_WORD_CLOUD_WORDS = 5
const MAX_SLIDE_TAG_VALUE_LENGTH = 250

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
  words: Array<{
    bubble: string
    label: string
  }>
}

const isNonEmptyId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isValidWordCloudShapeIds = (value: unknown): value is WordCloudShapeIds => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<WordCloudShapeIds>
  return (
    isNonEmptyId(candidate.container) &&
    isNonEmptyId(candidate.title) &&
    isNonEmptyId(candidate.subtitle) &&
    isNonEmptyId(candidate.body)
  )
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
  cx: number
  cy: number
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
const normalizeSessionId = (value: string | null | undefined) => String(value ?? '').trim()
const setSlideTag = (slide: PowerPoint.Slide, key: string, value: string) => {
  slide.tags.add(key, value)
}
const setSlideTagIfFits = (slide: PowerPoint.Slide, key: string, value: string) => {
  const normalizedValue = String(value ?? '')
  if (normalizedValue.length > MAX_SLIDE_TAG_VALUE_LENGTH) {
    setSlideTag(slide, key, '')
    return false
  }
  setSlideTag(slide, key, normalizedValue)
  return true
}

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
  { cx: 0.5, cy: 0.43, width: 0.34, height: 0.22 },
  { cx: 0.34, cy: 0.6, width: 0.27, height: 0.18 },
  { cx: 0.66, cy: 0.6, width: 0.27, height: 0.18 },
  { cx: 0.42, cy: 0.77, width: 0.24, height: 0.16 },
  { cx: 0.58, cy: 0.77, width: 0.24, height: 0.16 }
] satisfies WordAnchor[]

const WORD_CLOUD_SHAPE_TYPES = ['Cloud', 'CloudCallout', 'RoundRectangle'] as const
const WORD_CLOUD_COLOR_SEEDS = [0.14, 0.22, 0.18, 0.27, 0.2]
type WordCloudShapeType = (typeof WORD_CLOUD_SHAPE_TYPES)[number]
let cachedWordCloudShapeType: WordCloudShapeType | null = null

const wordAreaRect = (widgetRect: WidgetRect, scale: number): WidgetRect => {
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

const baseWordFrame = (areaRect: WidgetRect, anchor: WordAnchor) => ({
  left: areaRect.left + areaRect.width * (anchor.cx - anchor.width / 2),
  top: areaRect.top + areaRect.height * (anchor.cy - anchor.height / 2),
  width: areaRect.width * anchor.width,
  height: areaRect.height * anchor.height
})

const fitFontSizeForLabel = (
  label: string,
  preferred: number,
  frame: { width: number; height: number },
  maxFontSize: number
) => {
  const chars = Math.max(1, label.trim().length)
  const widthCap = Math.floor(frame.width / Math.max(2, chars * 0.53))
  const heightCap = Math.floor(frame.height * 0.7)
  return clamp(Math.min(preferred, widthCap, heightCap, maxFontSize), 12, maxFontSize)
}

const labelFrameForWord = (
  bubbleFrame: { left: number; top: number; width: number; height: number },
  label: string,
  fontSize: number
) => {
  const chars = Math.max(1, label.trim().length)
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

const scaledWordFrame = (
  areaRect: WidgetRect,
  anchor: WordAnchor,
  ratio: number,
  label: string,
  style: WordCloudStyleConfig
) => {
  const base = baseWordFrame(areaRect, anchor)
  const clamped = clamp(ratio, 0, 1)
  const widthScale = 0.9 + clamped * 0.28
  const heightScale = 0.94 + clamped * 0.22
  let width = base.width * widthScale
  let height = base.height * heightScale
  const preferredFont = fontSizeForRatio(style, clamped)
  const minWidthForWord = Math.min(
    areaRect.width * 0.52,
    Math.max(base.width * 0.7, preferredFont * (label.trim().length * 0.58 + 1.5) + 36)
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
  const eased = Math.pow(clamped, 0.7)
  return Math.round(style.minFontSize + (style.maxFontSize - style.minFontSize) * eased)
}

const setWordShapeHidden = (
  pair: { bubble: any; label: any },
  areaRect: WidgetRect | null,
  anchor: WordAnchor,
  style: WordCloudStyleConfig
) => {
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
  pair: { bubble: any; label: any },
  wordLabel: string,
  ratio: number,
  style: WordCloudStyleConfig,
  areaRect: WidgetRect | null,
  anchor: WordAnchor,
  index: number
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
    const fittedFontSize = fitFontSizeForLabel(wordLabel, preferredFontSize, firstPassFrame, style.maxFontSize)
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

const resolveWordCloudShapeType = async (): Promise<WordCloudShapeType> => {
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
        const probe = slide.shapes.addGeometricShape(candidate as any, {
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
      // Try the next candidate shape type.
    }
  }

  cachedWordCloudShapeType = 'RoundRectangle'
  return cachedWordCloudShapeType
}

const normalizeWordShapeEntries = (
  entries: unknown
): Array<{
  bubble: string
  label: string
}> => {
  if (!Array.isArray(entries)) {
    return []
  }
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }
      const bubble = (entry as { bubble?: unknown }).bubble
      const label = (entry as { label?: unknown }).label
      if (!isNonEmptyId(bubble) || !isNonEmptyId(label)) {
        return null
      }
      return { bubble, label }
    })
    .filter((entry): entry is { bubble: string; label: string } => Boolean(entry))
}

const extractLegacyWordShapeIds = (entries: unknown): string[] => {
  if (!Array.isArray(entries)) {
    return []
  }
  return entries.filter((entry): entry is string => isNonEmptyId(entry))
}

const upgradeLegacyWordShapeEntries = async (
  slide: PowerPoint.Slide,
  context: any,
  legacyIds: string[],
  style: WordCloudStyleConfig
): Promise<Array<{ bubble: string; label: string }>> => {
  const limited = legacyIds.slice(0, MAX_WORD_CLOUD_WORDS)
  if (limited.length === 0) {
    return []
  }

  const bubbles = limited.map((id) => slide.shapes.getItemOrNullObject(id))
  bubbles.forEach((shape) => shape.load(['id', 'left', 'top', 'width', 'height']))
  await context.sync()

  const pairs: Array<{ bubble: PowerPoint.Shape; label: PowerPoint.Shape }> = []
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

const clearExistingWordCloudShapes = async (slide: PowerPoint.Slide, context: any) => {
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

const createWordCloudWordShapeEntries = async (
  slide: PowerPoint.Slide,
  context: any,
  container: PowerPoint.Shape,
  style: WordCloudStyleConfig,
  count: number,
  startIndex = 0
): Promise<Array<{ bubble: string; label: string }>> => {
  container.load(['id', 'left', 'top', 'width', 'height'])
  await context.sync()
  if (container.isNullObject) {
    return []
  }

  const widgetRect: WidgetRect = {
    left: container.left,
    top: container.top,
    width: container.width,
    height: container.height
  }
  const areaRect = wordAreaRect(widgetRect, style.spacingScale)
  const total = Math.max(0, Math.min(count, MAX_WORD_CLOUD_WORDS))
  if (total === 0) {
    return []
  }
  const created: Array<{ bubble: string; label: string }> = []

  for (let offset = 0; offset < total; offset += 1) {
    const index = startIndex + offset
    if (index >= MAX_WORD_CLOUD_WORDS) {
      break
    }
    const anchor = wordAnchors[index] ?? wordAnchors[wordAnchors.length - 1]
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
    shape.load(['id', 'top', 'left', 'width', 'height'])
    return { shape, widgetTag, roleTag, indexTag }
  })

  await context.sync()

  let container: PowerPoint.Shape | null = null
  let shadow: PowerPoint.Shape | null = null
  let title: PowerPoint.Shape | null = null
  let subtitle: PowerPoint.Shape | null = null
  let body: PowerPoint.Shape | null = null
  const wordsByIndex = new Map<number, { bubble?: PowerPoint.Shape; label?: PowerPoint.Shape }>()
  const legacyWords: Array<{ shape: PowerPoint.Shape; index: number | null }> = []
  const widgetCandidates: Array<{ shape: PowerPoint.Shape; index: number | null }> = []
  const areaOf = (shape: PowerPoint.Shape) => Math.max(0, shape.width) * Math.max(0, shape.height)

  tagged.forEach(({ shape, widgetTag, roleTag, indexTag }) => {
    const hasWidgetTag = !widgetTag.isNullObject && widgetTag.value === 'true'
    const role = !roleTag.isNullObject ? roleTag.value : null
    const parsedIndex =
      !indexTag.isNullObject && Number.isFinite(Number.parseInt(indexTag.value, 10))
        ? Number.parseInt(indexTag.value, 10)
        : null
    if (!hasWidgetTag && !role) {
      return
    }
    if (hasWidgetTag) {
      widgetCandidates.push({ shape, index: parsedIndex })
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
      case 'word-cloud-bubble': {
        if (parsedIndex === null) {
          break
        }
        const entry = wordsByIndex.get(parsedIndex) ?? {}
        entry.bubble = shape
        wordsByIndex.set(parsedIndex, entry)
        break
      }
      case 'word-cloud-label': {
        if (parsedIndex === null) {
          break
        }
        const entry = wordsByIndex.get(parsedIndex) ?? {}
        entry.label = shape
        wordsByIndex.set(parsedIndex, entry)
        break
      }
      case 'word-cloud-word':
        legacyWords.push({
          shape,
          index: parsedIndex
        })
        break
      default:
        if (hasWidgetTag && parsedIndex !== null) {
          const entry = wordsByIndex.get(parsedIndex) ?? {}
          if (!entry.bubble) {
            entry.bubble = shape
          } else if (!entry.label) {
            const bubbleArea = areaOf(entry.bubble)
            const candidateArea = areaOf(shape)
            if (candidateArea > bubbleArea) {
              entry.label = entry.bubble
              entry.bubble = shape
            } else {
              entry.label = shape
            }
          }
          wordsByIndex.set(parsedIndex, entry)
        }
        break
    }
  })

  if ((!container || !title || !subtitle || !body) && widgetCandidates.length > 0) {
    const uniqueCandidates = Array.from(
      new Map(widgetCandidates.map((candidate) => [candidate.shape.id, candidate])).values()
    )
    const nonIndexedShapes = uniqueCandidates
      .filter((candidate) => candidate.index === null)
      .map((candidate) => candidate.shape)
    const byArea = [...nonIndexedShapes].sort((a, b) => areaOf(b) - areaOf(a))

    if (!container && byArea.length > 0) {
      container = byArea[0]
    }
    if (!shadow) {
      const shadowCandidate = byArea.find((shape) => !container || shape.id !== container.id)
      if (shadowCandidate) {
        shadow = shadowCandidate
      }
    }

    const textCandidates = nonIndexedShapes
      .filter((shape) => (!container || shape.id !== container.id) && (!shadow || shape.id !== shadow.id))
      .sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top))

    if (!title && textCandidates.length > 0) {
      title = textCandidates[0]
    }
    if (!subtitle && textCandidates.length > 1) {
      subtitle = textCandidates[1]
    }
    if (!body && textCandidates.length > 2) {
      body = textCandidates[2]
    }
  }

  const resolvedContainer = container
  const resolvedTitle = title
  const resolvedSubtitle = subtitle
  const resolvedBody = body

  if (
    !resolvedContainer ||
    !resolvedTitle ||
    !resolvedSubtitle ||
    !resolvedBody
  ) {
    return null
  }

  let words = [...wordsByIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, entry]) => entry)
    .filter((entry) => entry.bubble && entry.label)
    .slice(0, MAX_WORD_CLOUD_WORDS) as Array<{ bubble: PowerPoint.Shape; label: PowerPoint.Shape }>

  if (words.length === 0 && legacyWords.length > 0) {
    legacyWords.sort((a, b) => {
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
    words = []
    legacyWords.slice(0, MAX_WORD_CLOUD_WORDS).forEach((entry, index) => {
      const bubble = entry.shape
      const label = slide.shapes.addTextBox('', {
        left: bubble.left + bubble.width * 0.12,
        top: bubble.top + bubble.height * 0.18,
        width: Math.max(24, bubble.width * 0.76),
        height: Math.max(16, bubble.height * 0.64)
      })
      label.fill.transparency = 1
      label.lineFormat.visible = false
      label.textFrame.wordWrap = false
      label.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
      label.tags.add('PrezoWidgetRole', 'word-cloud-label')
      label.tags.add(WORD_CLOUD_WORD_INDEX_TAG, `${index}`)
      words.push({ bubble, label })
    })
    words.forEach((entry) => entry.label.load('id'))
    await context.sync()
  }

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
    words: words.map((entry) => ({
      bubble: entry.bubble.id,
      label: entry.label.id
    }))
  }
}

export async function insertWordCloudWidget(
  sessionId?: string | null,
  code?: string | null,
  styleOverrides?: Partial<WordCloudStyleConfig> | null
) {
  ensurePowerPoint()

  const style = normalizeWordCloudStyle(styleOverrides)
  const wordShapeType = await resolveWordCloudShapeType()
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

    await clearExistingWordCloudShapes(slide, context)
    setSlideTag(slide, WORD_CLOUD_SESSION_TAG, '')
    setSlideTag(slide, WORD_CLOUD_PENDING_TAG, 'true')
    setSlideTag(slide, WORD_CLOUD_STYLE_TAG, '')
    setSlideTag(slide, WORD_CLOUD_STATE_TAG, '')
    setSlideTag(slide, WORD_CLOUD_SHAPES_TAG, '')

    const width = Math.max(380, pageSetup.slideWidth * 0.7)
    const height = Math.max(280, pageSetup.slideHeight * 0.56)
    const left = (pageSetup.slideWidth - width) / 2
    const top = pageSetup.slideHeight * 0.1
    const padding = 24
    const widgetRect: WidgetRect = { left, top, width, height }
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

    await context.sync()

    const wordShapes: Array<{ bubble: PowerPoint.Shape; label: PowerPoint.Shape }> = []
    const wordShapeTypeCandidates: Array<WordCloudShapeType | 'TextBox'> = []
    wordShapeTypeCandidates.push(wordShapeType)
    if (wordShapeType !== 'RoundRectangle') {
      wordShapeTypeCandidates.push('RoundRectangle')
    }
    wordShapeTypeCandidates.push('TextBox')
    const visibleWords = Math.min(maxWords, MAX_WORD_CLOUD_WORDS)
    for (let index = 0; index < visibleWords; index += 1) {
      const anchor = wordAnchors[index]
      const frame = baseWordFrame(areaRect, anchor)
      let created = false
      for (const candidateType of wordShapeTypeCandidates) {
        try {
          const bubble =
            candidateType === 'TextBox'
              ? slide.shapes.addTextBox('', frame)
              : slide.shapes.addGeometricShape(candidateType as any, frame)
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

    if (wordShapes.length === 0) {
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
        await context.sync()
        wordShapes.push({ bubble, label })
      } catch (fallbackError) {
        console.warn('Word cloud fallback word shape failed', fallbackError)
      }
    }

    let shapeIds: WordCloudShapeIds | null = null
    try {
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
}

export async function updateWordCloudWidget(
  sessionId: string,
  code: string | null | undefined,
  wordClouds: WordCloud[]
) {
  ensurePowerPoint()
  const normalizedSessionId = normalizeSessionId(sessionId)

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
      try {
        const isPending = !info.pendingTag.isNullObject && info.pendingTag.value === 'true'
        const sessionTagValue = !info.sessionTag.isNullObject
          ? normalizeSessionId(info.sessionTag.value)
          : ''
        const hasSessionMatch = sessionTagValue === normalizedSessionId

        let recovered = false
        let shapeIds: WordCloudShapeIds | null = await recoverShapeIds(info.slide, context)
        if (shapeIds) {
          recovered = true
          setSlideTagIfFits(info.slide, WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))
        } else if (!info.shapeTag.isNullObject && info.shapeTag.value) {
          try {
            shapeIds = JSON.parse(info.shapeTag.value) as WordCloudShapeIds
          } catch {
            shapeIds = null
          }
        }

        if (!shapeIds || !isValidWordCloudShapeIds(shapeIds)) {
          continue
        }

        // Rebind stale widgets instead of skipping them forever when session tags drift.
        const shouldRebind = isPending || !hasSessionMatch || recovered

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

        if (shadow) {
          shadow.load('id')
        }
        container.load(['id', 'left', 'top', 'width', 'height'])
        title.load('id')
        subtitle.load('id')
        body.load('id')
        await context.sync()

        if (container.isNullObject || title.isNullObject || subtitle.isNullObject || body.isNullObject) {
          continue
        }

        let wordShapeIds = normalizeWordShapeEntries(shapeIds.words)
        if (wordShapeIds.length === 0) {
          const legacyWordIds = extractLegacyWordShapeIds(shapeIds.words)
          if (legacyWordIds.length > 0) {
            wordShapeIds = await upgradeLegacyWordShapeEntries(
              info.slide,
              context,
              legacyWordIds,
              style
            )
          }
        }

        if (wordShapeIds.length > 0) {
          const existingWordRefs = wordShapeIds.map((ids) => ({
            ids,
            bubble: info.slide.shapes.getItemOrNullObject(ids.bubble),
            label: info.slide.shapes.getItemOrNullObject(ids.label)
          }))
          existingWordRefs.forEach((shape) => {
            shape.bubble.load('id')
            shape.label.load('id')
          })
          await context.sync()
          wordShapeIds = existingWordRefs
            .filter((shape) => !shape.bubble.isNullObject && !shape.label.isNullObject)
            .map((shape) => shape.ids)
        }

        const targetWordSlots = Math.max(
          1,
          Math.min(MAX_WORD_CLOUD_WORDS, Math.max(words.length, style.maxWords))
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
          if (createdWordShapes.length > 0) {
            wordShapeIds = [...wordShapeIds, ...createdWordShapes]
          }
        }
        if (wordShapeIds.length === 0) {
          continue
        }

        shapeIds.words = wordShapeIds
        setSlideTagIfFits(info.slide, WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))

        const wordShapes = wordShapeIds.map((ids) => ({
          bubble: info.slide.shapes.getItemOrNullObject(ids.bubble),
          label: info.slide.shapes.getItemOrNullObject(ids.label)
        }))
        wordShapes.forEach((shape) => {
          shape.bubble.load('id')
          shape.label.load('id')
        })
        await context.sync()

        const liveWordShapes = wordShapes.filter(
          (shape) => !shape.bubble.isNullObject && !shape.label.isNullObject
        )
        if (liveWordShapes.length === 0) {
          continue
        }

        if (applyStyle) {
          if (shadow && !shadow.isNullObject) {
            shadow.fill.setSolidColor(style.shadowColor)
            shadow.fill.transparency = style.shadowOpacity
            shadow.lineFormat.visible = false
          }
          container.fill.setSolidColor(style.panelColor)
          container.lineFormat.color = style.borderColor
          container.lineFormat.weight = 1.2
          applyFont(title.textFrame.textRange, style, {
            size: 22,
            bold: true,
            color: style.textColor
          })
          applyFont(subtitle.textFrame.textRange, style, {
            size: 13,
            color: style.mutedColor
          })
          applyFont(body.textFrame.textRange, style, { size: 13, color: style.mutedColor })
        }

        title.textFrame.textRange.text = buildWordCloudTitle(code)
        subtitle.textFrame.textRange.text = buildWordCloudSubtitle(cloud)
        body.textFrame.textRange.text = buildWordCloudMeta(cloud)

        const widgetRect: WidgetRect = {
          left: container.left,
          top: container.top,
          width: container.width,
          height: container.height
        }
        const areaRect = wordAreaRect(widgetRect, style.spacingScale)
        const previousState = parseWordCloudState(
          !info.stateTag.isNullObject ? info.stateTag.value : null
        )
        const previousRatios =
          previousState.cloudId === (cloud?.id ?? null) ? previousState.ratios : {}
        const visibleWords = Math.min(words.length, liveWordShapes.length)

        const plans = liveWordShapes.map((pair, index) => {
          const anchor = wordAnchors[index] ?? wordAnchors[wordAnchors.length - 1]
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
      } catch (error) {
        console.warn('Word cloud slide update skipped due to shape error', error)
      }
    }

    await context.sync()
  })
}

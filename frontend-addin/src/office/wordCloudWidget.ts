import type { WordCloud } from '../api/types'

const WORD_CLOUD_WIDGET_TAG = 'PrezoWordCloudWidget'
const WORD_CLOUD_SESSION_TAG = 'PrezoWordCloudSessionId'
const WORD_CLOUD_SHAPES_TAG = 'PrezoWordCloudShapeIds'
const WORD_CLOUD_PENDING_TAG = 'PrezoWordCloudPending'
const WORD_CLOUD_STYLE_TAG = 'PrezoWordCloudStyle'
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
  { x: 0.16, y: 0.38, width: 0.3, height: 0.16 },
  { x: 0.52, y: 0.34, width: 0.3, height: 0.16 },
  { x: 0.28, y: 0.58, width: 0.3, height: 0.16 },
  { x: 0.62, y: 0.58, width: 0.28, height: 0.16 },
  { x: 0.44, y: 0.74, width: 0.26, height: 0.14 }
]

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
    widgetTag.load('value')
    roleTag.load('value')
    shape.load(['id', 'top', 'left'])
    return { shape, widgetTag, roleTag }
  })

  await context.sync()

  let container: PowerPoint.Shape | null = null
  let shadow: PowerPoint.Shape | null = null
  let title: PowerPoint.Shape | null = null
  let subtitle: PowerPoint.Shape | null = null
  let body: PowerPoint.Shape | null = null
  const words: PowerPoint.Shape[] = []

  tagged.forEach(({ shape, widgetTag, roleTag }) => {
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
        words.push(shape)
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
    if (Math.abs(a.top - b.top) < 4) {
      return a.left - b.left
    }
    return a.top - b.top
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
    words: words.slice(0, MAX_WORD_CLOUD_WORDS).map((word) => word.id)
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
      slide.tags.delete(WORD_CLOUD_SHAPES_TAG)
    }

    const width = Math.max(380, pageSetup.slideWidth * 0.7)
    const height = Math.max(280, pageSetup.slideHeight * 0.56)
    const left = (pageSetup.slideWidth - width) / 2
    const top = pageSetup.slideHeight * 0.1
    const padding = 24

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
    container.lineFormat.weight = 1
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
      hasSession ? 'Audience votes make words grow.' : 'Connect a Prezo session to go live.',
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
      const wordShape = slide.shapes.addTextBox('', {
        left: left + width * anchor.x,
        top: top + height * anchor.y,
        width: width * anchor.width,
        height: height * anchor.height
      })
      wordShape.textFrame.wordWrap = true
      applyFont(wordShape.textFrame.textRange, style, {
        size: style.minFontSize,
        bold: true,
        color: style.textColor
      })
      wordShape.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
      wordShape.tags.add('PrezoWidgetRole', 'word-cloud-word')
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
      sessionTag.load('value')
      pendingTag.load('value')
      shapeTag.load('value')
      styleTag.load('value')
      return { slide, sessionTag, pendingTag, shapeTag, styleTag }
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
      container.load('id')
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
          container.lineFormat.weight = 1
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

      const visibleWords = Math.min(style.maxWords, words.length)
      wordShapes.forEach((shape, index) => {
        if (shape.isNullObject) {
          return
        }
        const word = words[index]
        if (!word || index >= visibleWords) {
          shape.textFrame.textRange.text = ''
          return
        }

        const ratio = maxVotes > 0 ? word.votes / maxVotes : 0
        const fontSize =
          style.minFontSize + (style.maxFontSize - style.minFontSize) * ratio
        shape.textFrame.textRange.text = word.label
        applyFont(shape.textFrame.textRange, style, {
          size: Math.round(fontSize),
          bold: ratio >= 0.45,
          color: ratio > 0 ? style.accentColor : style.textColor
        })
      })

      if (isPending || recovered) {
        info.slide.tags.add(WORD_CLOUD_SESSION_TAG, sessionId)
        info.slide.tags.delete(WORD_CLOUD_PENDING_TAG)
      }
    }

    await context.sync()
  })
}

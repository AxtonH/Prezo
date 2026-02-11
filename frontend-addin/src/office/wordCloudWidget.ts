import type { WordCloud } from '../api/types'

// Constants
const WORD_CLOUD_WIDGET_TAG = 'PrezoWordCloudWidget'
const WORD_CLOUD_SESSION_TAG = 'PrezoWordCloudSessionId'
const WORD_CLOUD_SHAPES_TAG = 'PrezoWordCloudShapeIds'
const WORD_CLOUD_STYLE_TAG = 'PrezoWordCloudStyle'
const MAX_WORD_CLOUD_WORDS = 5

// Types
type WordCloudShapeIds = {
  container: string
  title: string
  subtitle: string
  body: string
  words: Array<{ bubble: string; label: string }>
}

type WordCloudStyleConfig = {
  fontFamily: string | null
  textColor: string
  mutedColor: string
  accentColor: string
  panelColor: string
  borderColor: string
}

const DEFAULT_STYLE: WordCloudStyleConfig = {
  fontFamily: null,
  textColor: '#0f172a',
  mutedColor: '#64748b',
  accentColor: '#2563eb',
  panelColor: '#ffffff',
  borderColor: '#e2e8f0'
}

// Helper functions
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const hexToRgb = (hex: string) => {
  const normalized = (hex || '').replace('#', '')
  if (normalized.length === 6) {
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    }
  }
  return { r: 0, g: 0, b: 0 }
}

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const mixColors = (colorA: string, colorB: string, ratio: number) => {
  const a = hexToRgb(colorA)
  const b = hexToRgb(colorB)
  const t = clamp(ratio, 0, 1)
  return rgbToHex({
    r: a.r * (1 - t) + b.r * t,
    g: a.g * (1 - t) + b.g * t,
    b: a.b * (1 - t) + b.b * t
  })
}

const applyFont = (
  textRange: any,
  style: WordCloudStyleConfig,
  options: { size: number; bold?: boolean; color: string }
) => {
  if (style.fontFamily) {
    textRange.font.name = style.fontFamily
  }
  textRange.font.size = options.size
  textRange.font.color = options.color
  if (options.bold !== undefined) {
    textRange.font.bold = options.bold
  }
}

const pickWordCloud = (wordClouds: WordCloud[]): WordCloud | null => {
  if (wordClouds.length === 0) return null
  const openCloud = wordClouds.find((cloud) => cloud.status === 'open')
  if (openCloud) return openCloud
  const sorted = [...wordClouds].sort((a, b) => {
    const aTime = Date.parse(a.created_at)
    const bTime = Date.parse(b.created_at)
    return bTime - aTime
  })
  return sorted[0]
}

// Word positioning - simple grid layout
const getWordPosition = (index: number, containerWidth: number, containerHeight: number) => {
  const positions = [
    { x: 0.5, y: 0.35 },  // Center top
    { x: 0.3, y: 0.55 },  // Left middle
    { x: 0.7, y: 0.55 },  // Right middle
    { x: 0.35, y: 0.75 }, // Left bottom
    { x: 0.65, y: 0.75 }  // Right bottom
  ]
  const pos = positions[index] || positions[0]
  return {
    x: pos.x * containerWidth,
    y: pos.y * containerHeight
  }
}

// Create the widget container and scaffolding
export async function insertWordCloudWidget(
  sessionId?: string | null,
  code?: string | null,
  styleOverrides?: Partial<WordCloudStyleConfig> | null
) {
  if (typeof PowerPoint === 'undefined') {
    throw new Error('PowerPoint JS API is not available.')
  }

  const style = { ...DEFAULT_STYLE, ...(styleOverrides || {}) }
  const hasSession = Boolean(sessionId)

  await PowerPoint.run(async (context) => {
    const slides = context.presentation.getSelectedSlides()
    slides.load('items')
    await context.sync()

    const slide = slides.items[0]
    if (!slide) {
      throw new Error('Select a slide before inserting a widget.')
    }

    // Clear any existing word cloud widgets
    const allShapes = slide.shapes
    allShapes.load('items')
    await context.sync()

    for (const shape of allShapes.items) {
      const tag = shape.tags.getItemOrNullObject(WORD_CLOUD_WIDGET_TAG)
      tag.load('value')
      await context.sync()
      if (!tag.isNullObject && tag.value === 'true') {
        shape.delete()
      }
    }
    await context.sync()

    // Widget dimensions
    const pageSetup = context.presentation.pageSetup
    pageSetup.load(['slideWidth', 'slideHeight'])
    await context.sync()

    const width = pageSetup.slideWidth * 0.7
    const height = pageSetup.slideHeight * 0.6
    const left = (pageSetup.slideWidth - width) / 2
    const top = pageSetup.slideHeight * 0.15

    // Create container
    const container = slide.shapes.addGeometricShape('RoundRectangle', {
      left,
      top,
      width,
      height
    })
    container.fill.setSolidColor(style.panelColor)
    container.lineFormat.color = style.borderColor
    container.lineFormat.weight = 1.5
    container.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')

    // Create title
    const title = slide.shapes.addTextBox(
      code ? `Prezo Word Cloud - ${code}` : 'Prezo Word Cloud',
      { left: left + 24, top: top + 20, width: width - 48, height: 32 }
    )
    title.textFrame.textRange.text = code ? `Prezo Word Cloud - ${code}` : 'Prezo Word Cloud'
    applyFont(title.textFrame.textRange, style, { size: 22, bold: true, color: style.textColor })
    title.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')

    // Create subtitle
    const subtitle = slide.shapes.addTextBox(
      hasSession ? 'Audience votes animate each cloud.' : 'Connect a session to go live.',
      { left: left + 24, top: top + 56, width: width - 48, height: 24 }
    )
    applyFont(subtitle.textFrame.textRange, style, { size: 13, color: style.mutedColor })
    subtitle.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')

    // Create body
    const body = slide.shapes.addTextBox(
      hasSession ? 'Waiting for word cloud votes...' : 'No active word cloud yet.',
      { left: left + 24, top: top + 84, width: width - 48, height: 20 }
    )
    applyFont(body.textFrame.textRange, style, { size: 13, color: style.mutedColor })
    body.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')

    // Load IDs
    container.load('id')
    title.load('id')
    subtitle.load('id')
    body.load('id')
    await context.sync()

    // Create word bubble slots (initially hidden)
    const wordArea = {
      left: left + 24,
      top: top + 120,
      width: width - 48,
      height: height - 140
    }

    const wordShapes: Array<{ bubble: PowerPoint.Shape; label: PowerPoint.Shape }> = []

    for (let i = 0; i < MAX_WORD_CLOUD_WORDS; i++) {
      const pos = getWordPosition(i, wordArea.width, wordArea.height)

      // Create bubble
      const bubble = slide.shapes.addGeometricShape('RoundRectangle', {
        left: wordArea.left + pos.x - 60,
        top: wordArea.top + pos.y - 25,
        width: 120,
        height: 50
      })
      bubble.fill.setSolidColor(style.panelColor)
      bubble.fill.transparency = 1 // Hidden initially
      bubble.lineFormat.visible = false
      bubble.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
      bubble.tags.add('WordIndex', String(i))

      // Create label
      const label = slide.shapes.addTextBox('', {
        left: wordArea.left + pos.x - 50,
        top: wordArea.top + pos.y - 15,
        width: 100,
        height: 30
      })
      label.textFrame.textRange.text = ''
      label.fill.transparency = 1
      label.lineFormat.visible = false
      applyFont(label.textFrame.textRange, style, { size: 18, color: style.textColor })
      label.tags.add(WORD_CLOUD_WIDGET_TAG, 'true')
      label.tags.add('WordIndex', String(i))

      bubble.load('id')
      label.load('id')

      wordShapes.push({ bubble, label })
    }

    await context.sync()

    // Save shape IDs to slide tags
    const shapeIds: WordCloudShapeIds = {
      container: container.id,
      title: title.id,
      subtitle: subtitle.id,
      body: body.id,
      words: wordShapes.map((ws) => ({ bubble: ws.bubble.id, label: ws.label.id }))
    }

    slide.tags.add(WORD_CLOUD_SHAPES_TAG, JSON.stringify(shapeIds))
    slide.tags.add(WORD_CLOUD_STYLE_TAG, JSON.stringify(style))
    slide.tags.add(WORD_CLOUD_SESSION_TAG, sessionId || '')
    await context.sync()
  })
}

// Update widget with word cloud data
export async function updateWordCloudWidget(
  sessionId: string,
  code: string | null | undefined,
  wordClouds: WordCloud[]
) {
  if (typeof PowerPoint === 'undefined') {
    throw new Error('PowerPoint JS API is not available.')
  }

  const cloud = pickWordCloud(wordClouds)
  const words = cloud?.words.slice(0, MAX_WORD_CLOUD_WORDS) || []
  const maxVotes = words.reduce((max, w) => Math.max(max, w.votes), 0)

  console.log('Updating word cloud widget', { sessionId, wordsCount: words.length, maxVotes, words })

  await PowerPoint.run(async (context) => {
    const slides = context.presentation.slides
    slides.load('items')
    await context.sync()

    console.log('Found slides:', slides.items.length)

    for (const slide of slides.items) {
      try {
        // Check if this slide has a word cloud for this session
        const sessionTag = slide.tags.getItemOrNullObject(WORD_CLOUD_SESSION_TAG)
        const shapeIdsTag = slide.tags.getItemOrNullObject(WORD_CLOUD_SHAPES_TAG)
        const styleTag = slide.tags.getItemOrNullObject(WORD_CLOUD_STYLE_TAG)

        sessionTag.load('value')
        shapeIdsTag.load('value')
        styleTag.load('value')
        await context.sync()

        if (sessionTag.isNullObject || sessionTag.value !== sessionId) {
          console.log('Skipping slide - no matching session', {
            hasTag: !sessionTag.isNullObject,
            tagValue: sessionTag.value,
            expectedSessionId: sessionId
          })
          continue
        }

        if (shapeIdsTag.isNullObject || !shapeIdsTag.value) {
          console.log('Skipping slide - no shape IDs')
          continue
        }

        console.log('Found matching slide, updating...')

        const shapeIds: WordCloudShapeIds = JSON.parse(shapeIdsTag.value)
        const style: WordCloudStyleConfig = styleTag.isNullObject
          ? DEFAULT_STYLE
          : { ...DEFAULT_STYLE, ...JSON.parse(styleTag.value) }

        // Get shapes
        const title = slide.shapes.getItemOrNullObject(shapeIds.title)
        const subtitle = slide.shapes.getItemOrNullObject(shapeIds.subtitle)
        const body = slide.shapes.getItemOrNullObject(shapeIds.body)

        title.load(['id', 'textFrame'])
        subtitle.load(['id', 'textFrame'])
        body.load(['id', 'textFrame'])
        await context.sync()

        if (title.isNullObject || subtitle.isNullObject || body.isNullObject) {
          continue
        }

        // Update text
        title.textFrame.textRange.text = code
          ? `Prezo Word Cloud - ${code}`
          : 'Prezo Word Cloud'
        subtitle.textFrame.textRange.text = cloud?.prompt || 'Pick a word to shape the cloud.'
        body.textFrame.textRange.text = cloud?.status === 'open' ? 'Voting is live.' : 'Voting is closed.'

        // Update word bubbles
        console.log('Updating word bubbles, count:', shapeIds.words.length)
        for (let i = 0; i < shapeIds.words.length && i < MAX_WORD_CLOUD_WORDS; i++) {
          const wordShapeIds = shapeIds.words[i]
          const bubble = slide.shapes.getItemOrNullObject(wordShapeIds.bubble)
          const label = slide.shapes.getItemOrNullObject(wordShapeIds.label)

          bubble.load(['id', 'left', 'top', 'width', 'height', 'fill', 'lineFormat'])
          label.load(['id', 'left', 'top', 'width', 'height', 'textFrame'])
          await context.sync()

          if (bubble.isNullObject || label.isNullObject) {
            console.log('Bubble or label not found for index:', i)
            continue
          }

          const word = words[i]
          if (!word) {
            // Hide unused bubbles
            console.log('Hiding unused bubble at index:', i)
            bubble.fill.transparency = 1
            bubble.lineFormat.visible = false
            label.textFrame.textRange.text = ''
            continue
          }

          console.log('Updating word bubble:', { index: i, word: word.label, votes: word.votes })

          // Calculate size based on votes
          const voteRatio = maxVotes > 0 ? word.votes / maxVotes : 0
          const scale = 0.8 + voteRatio * 0.6 // Scale from 0.8x to 1.4x

          // Get current center position
          const centerX = bubble.left + bubble.width / 2
          const centerY = bubble.top + bubble.height / 2

          // Set new size (keeping center position)
          const baseWidth = 120
          const baseHeight = 50
          const newWidth = baseWidth * scale
          const newHeight = baseHeight * scale

          bubble.left = centerX - newWidth / 2
          bubble.top = centerY - newHeight / 2
          bubble.width = newWidth
          bubble.height = newHeight

          // Set bubble color based on votes
          const bubbleColor = mixColors(style.panelColor, style.accentColor, voteRatio * 0.7)
          const borderColor = mixColors(style.borderColor, style.accentColor, voteRatio)

          bubble.fill.setSolidColor(bubbleColor)
          bubble.fill.transparency = 0
          bubble.lineFormat.visible = true
          bubble.lineFormat.color = borderColor
          bubble.lineFormat.weight = 2

          // Update label
          label.textFrame.textRange.text = word.label
          const labelWidth = newWidth * 0.8
          const labelHeight = newHeight * 0.6
          label.left = centerX - labelWidth / 2
          label.top = centerY - labelHeight / 2
          label.width = labelWidth
          label.height = labelHeight

          const fontSize = Math.round(16 + voteRatio * 12) // 16pt to 28pt
          const textColor = voteRatio > 0.5 ? '#ffffff' : style.textColor
          applyFont(label.textFrame.textRange, style, {
            size: fontSize,
            bold: voteRatio > 0.4,
            color: textColor
          })
        }

        await context.sync()
      } catch (error) {
        console.warn('Failed to update word cloud on slide', error)
      }
    }
  })
}

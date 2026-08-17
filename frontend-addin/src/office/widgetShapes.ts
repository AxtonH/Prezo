import type { Poll, QnaMode, QnaPrompt, Question } from '../api/types'

import { runPowerPoint } from './powerpointRun'
import { getPresentedSheetId } from './presentedSlide'
import {
  pollProjection,
  promptProjection,
  questionProjection
} from './widgetDataSignatures'

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
const POLL_TEXT_SYNC_TAG = 'PrezoPollWidgetAutoText'

/** Slide tags the slideshow conductor needs to map widget slides to polls. */
export const POLL_WIDGET_SLIDE_TAGS = {
  sessionTag: POLL_SESSION_TAG,
  bindingTag: POLL_BINDING_TAG,
} as const

/** Q&A widget slide tags: an unbound widget drives session Q&A; a
 * prompt-bound one drives that prompt. */
export const QNA_WIDGET_SLIDE_TAGS = {
  sessionTag: SESSION_TAG,
  promptBindingTag: QNA_PROMPT_BINDING_TAG,
} as const

/** Discussion widget slide tags (always prompt-bound when driveable). */
export const DISCUSSION_WIDGET_SLIDE_TAGS = {
  sessionTag: DISCUSSION_SESSION_TAG,
  bindingTag: DISCUSSION_PROMPT_BINDING_TAG,
} as const
const MAX_POLL_OPTIONS = 5
const PANEL_TITLE = 'Questions from your audience'
const PROMPT_PANEL_TITLE = 'Audience answers'
const EYEBROW_TEXT = 'PREZO LIVE Q&A'
const PROMPT_EYEBROW_TEXT = 'PREZO LIVE PROMPT'
const DISCUSSION_PANEL_TITLE = 'Open discussion'
const DISCUSSION_EYEBROW_TEXT = 'PREZO OPEN DISCUSSION'
const PLACEHOLDER_SUBTITLE = 'Connect a Prezo session to go live.'
const PLACEHOLDER_BODY = 'Connect a Prezo session to populate this slide.'
/** Unbound poll widgets render this instead of auto-following a poll —
 * binding is an explicit host action (Bind widget on the poll card). */
const POLL_BIND_PLACEHOLDER = 'Bind this widget to a poll from the Prezo panel.'
/** Unbound skeleton bars stay partially filled (insert-time and after
 * session login alike) so designers can see and restyle the fill shapes. */
const POLL_SKELETON_FILL_RATIO = 0.35

type WidgetShapeIds = {
  container: string
  title: string
  body: string
  subtitle?: string
  meta?: string
  badge?: string
  shadow?: string
  counter?: string
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
  counter?: string
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
  /** Noun for the interaction counter shape ("5 questions" / "1 answer"). */
  counterSingular: string
  counterPlural: string
  useAudienceWhenUnbound: boolean
  unboundMode?: QnaMode
  /** When no prompt is explicitly bound, pick one to display (e.g. latest open). */
  pickUnboundPrompt?: (prompts: QnaPrompt[]) => QnaPrompt | null
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

/** True when the PowerPoint JS API exists (task pane). In the web host console it is absent — callers no-op instead of throwing. */
export function isPowerPointShapeApiAvailable(): boolean {
  return typeof PowerPoint !== 'undefined' && typeof PowerPoint.run === 'function'
}

/**
 * PowerPoint slide tags: `tags.add(key, value)` throws RichApi GeneralException if `key` already exists.
 * Always remove first, then add (delete is a no-op when missing in practice for this API).
 */
function setSlideTag(slide: PowerPoint.Slide, key: string, value: string) {
  slide.tags.delete(key)
  slide.tags.add(key, value)
}

/** Same contract as `setSlideTag` but for shape tags — `tags.add` on an existing key throws RichApi GeneralException. */
function setShapeTag(shape: PowerPoint.Shape, key: string, value: string) {
  shape.tags.delete(key)
  shape.tags.add(key, value)
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

const pickLatestOpenPrompt = (prompts: QnaPrompt[]): QnaPrompt | null => {
  if (prompts.length === 0) {
    return null
  }
  const open = prompts.filter((p) => p.status === 'open')
  const pool = open.length > 0 ? open : prompts
  const sorted = [...pool].sort((a, b) => {
    const aTime = Date.parse(a.created_at)
    const bTime = Date.parse(b.created_at)
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0
    }
    return bTime - aTime
  })
  return sorted[0] ?? null
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
  counterSingular: 'question',
  counterPlural: 'questions',
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
  counterSingular: 'answer',
  counterPlural: 'answers',
  useAudienceWhenUnbound: false,
  unboundMode: 'audience',
  pickUnboundPrompt: pickLatestOpenPrompt,
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

/** Shape types whose textFrame cannot be accessed — doing so throws RichApi InvalidArgument. */
const TEXT_INCAPABLE_SHAPE_TYPES = new Set<string>([
  'Image',
  'Line',
  'Chart',
  'Table',
  'SmartArt',
  'Ink',
  'Video',
  'Audio',
  'Media',
  'Unsupported',
  'Unknown'
])

const shapeSupportsText = (
  shape: { isNullObject?: boolean; type?: string } | null | undefined
) => {
  if (!shape || shape.isNullObject) {
    return false
  }
  const type = shape.type
  if (!type) {
    return true
  }
  return !TEXT_INCAPABLE_SHAPE_TYPES.has(type)
}

/** Shape types whose `.fill.setSolidColor` call fails — Lines use lineFormat, Images/Media aren't fillable. */
const FILL_INCAPABLE_SHAPE_TYPES = new Set<string>([
  'Line',
  'Image',
  'Chart',
  'Table',
  'SmartArt',
  'Ink',
  'Video',
  'Audio',
  'Media',
  'Unsupported',
  'Unknown'
])

const shapeSupportsFill = (
  shape: { isNullObject?: boolean; type?: string } | null | undefined
) => {
  if (!shape || shape.isNullObject) {
    return false
  }
  const type = shape.type
  if (!type) {
    return true
  }
  return !FILL_INCAPABLE_SHAPE_TYPES.has(type)
}

const looksLikeAutoPollText = (value: string) => {
  const text = value.trim()
  if (!text) {
    return true
  }
  if (text.startsWith('Prezo Poll')) {
    return true
  }
  if (text.startsWith('Live poll:') || text.startsWith('Poll:')) {
    return true
  }
  if (
    text === 'No polls yet.' ||
    text === 'Poll not found.' ||
    text === POLL_BIND_PLACEHOLDER
  ) {
    return true
  }
  return /\(\d+\)\s*(?:•|â€¢)\s*\d+%$/.test(text)
}

type PollTextFontSnapshot = {
  name?: string
  size?: number
  bold?: boolean
  italic?: boolean
  color?: string
}

type PollTextSyncState = {
  shape: PowerPoint.Shape
  autoTag: PowerPoint.Tag
  font: PollTextFontSnapshot
}

/**
 * Last-applied data signature per widget slide, so update passes skip
 * widgets whose bound data didn't change. One vote then costs one widget's
 * round trips instead of every widget in the deck, and slides that were
 * scanned and found widget-free are never rescanned.
 *
 * Key: `${widgetKind}|${sessionId}|${slide.id}`. Values are either the JSON
 * signature the last successful pass applied, or NO_WIDGET_SIGNATURE for
 * slides a recovery scan proved empty (data-independent: an ordinary content
 * slide stays skipped no matter how the data changes). Entries are dropped
 * when a slide's update fails so the next pass retries in full. Bypassed for
 * pending widgets, forced text passes, and repair passes on the selected
 * slide (the "user may have just edited this" signal).
 */
const appliedWidgetSignatures = new Map<string, string>()
const NO_WIDGET_SIGNATURE = 'no-widget'

/** Options shared by the widget update entry points. */
type WidgetUpdatePassOptions = {
  /** Re-process the currently selected slide even when its data signature is
   * unchanged — selection-change refreshes pass this so user edits on the
   * slide being worked on are repaired without paying for the whole deck. */
  repairSelectedSlide?: boolean
}

/** Reading an unloaded scalar off a RichApi proxy throws — treat as unknown. */
const loadedNumber = (read: () => unknown): number | null => {
  try {
    const value = read()
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

const loadedString = (read: () => unknown): string | null => {
  try {
    const value = read()
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

const loadedBoolean = (read: () => unknown): boolean | null => {
  try {
    const value = read()
    return typeof value === 'boolean' ? value : null
  } catch {
    return null
  }
}

/** Write helpers that skip no-op writes: repeat update passes must not dirty
 * the deck, grow the undo stack, or trigger autosave when nothing changed. */
const setFillTransparencyIfChanged = (
  shape: PowerPoint.Shape,
  transparency: number
) => {
  const current = loadedNumber(() => shape.fill.transparency)
  if (current !== null && Math.abs(current - transparency) < 0.001) {
    return
  }
  shape.fill.transparency = transparency
}

const setLineVisibleIfChanged = (shape: PowerPoint.Shape, visible: boolean) => {
  if (loadedBoolean(() => shape.lineFormat.visible) === visible) {
    return
  }
  shape.lineFormat.visible = visible
}

const setShapeTextIfChanged = (shape: PowerPoint.Shape, text: string) => {
  if (loadedString(() => shape.textFrame.textRange.text) === text) {
    return
  }
  shape.textFrame.textRange.text = text
}

/**
 * Queue the loads `safeLoadPollTextSyncState` would issue, without syncing.
 * Callers batch many shapes into one context.sync() (the sequential
 * per-shape syncs were the single biggest cost of a poll widget pass), then
 * build snapshots via `snapshotPollTextSyncState`. On a failed batched sync,
 * fall back to the per-shape `safeLoadPollTextSyncState` so one exotic shape
 * can't take down the widget — same isolation as before, now off the hot
 * path. Requires shape.type to already be loaded (all call sites load it in
 * their preceding phase); a shape whose type read throws is treated as
 * text-incapable rather than poisoning the batch.
 */
const queuePollTextSyncStateLoad = (
  shape: PowerPoint.Shape | null | undefined
): { shape: PowerPoint.Shape; autoTag: PowerPoint.Tag } | null => {
  if (!shape || isShapeNullObject(shape)) {
    return null
  }
  try {
    if (!shapeSupportsText(shape)) {
      return null
    }
  } catch {
    return null
  }
  const autoTag = shape.tags.getItemOrNullObject(POLL_TEXT_SYNC_TAG)
  autoTag.load('value')
  shape.textFrame.textRange.load('text')
  shape.textFrame.textRange.font.load(['name', 'size', 'bold', 'italic', 'color'])
  return { shape, autoTag }
}

/** Build the state snapshot after the batched sync resolved the queued loads. */
const snapshotPollTextSyncState = (
  queued: { shape: PowerPoint.Shape; autoTag: PowerPoint.Tag } | null
): PollTextSyncState | null => {
  if (!queued || isShapeNullObject(queued.shape)) {
    return null
  }
  try {
    const font = queued.shape.textFrame.textRange.font
    const snapshot: PollTextFontSnapshot = {
      name: typeof font.name === 'string' && font.name ? font.name : undefined,
      size:
        typeof font.size === 'number' && Number.isFinite(font.size) && font.size > 0
          ? font.size
          : undefined,
      bold: typeof font.bold === 'boolean' ? font.bold : undefined,
      italic: typeof font.italic === 'boolean' ? font.italic : undefined,
      color: typeof font.color === 'string' && font.color ? font.color : undefined
    }
    return { shape: queued.shape, autoTag: queued.autoTag, font: snapshot }
  } catch {
    return null
  }
}

/** Per-shape text-state load that tolerates InvalidArgument on Shape.textFrame (e.g. when a shape type's textFrame isn't supported despite matching our heuristic). */
const safeLoadPollTextSyncState = async (
  shape: PowerPoint.Shape | null | undefined,
  context: PowerPoint.RequestContext
): Promise<PollTextSyncState | null> => {
  if (!shape || isShapeNullObject(shape)) {
    return null
  }
  if (!shapeSupportsText(shape)) {
    return null
  }
  const autoTag = shape.tags.getItemOrNullObject(POLL_TEXT_SYNC_TAG)
  autoTag.load('value')
  try {
    shape.textFrame.textRange.load('text')
    const font = shape.textFrame.textRange.font
    font.load(['name', 'size', 'bold', 'italic', 'color'])
    await context.sync()
    const snapshot: PollTextFontSnapshot = {
      name: typeof font.name === 'string' && font.name ? font.name : undefined,
      size:
        typeof font.size === 'number' && Number.isFinite(font.size) && font.size > 0
          ? font.size
          : undefined,
      bold: typeof font.bold === 'boolean' ? font.bold : undefined,
      italic: typeof font.italic === 'boolean' ? font.italic : undefined,
      color: typeof font.color === 'string' && font.color ? font.color : undefined
    }
    return { shape, autoTag, font: snapshot }
  } catch {
    return null
  }
}

/** Reapply saved font properties to a text range — setting textRange.text resets all inline formatting. */
const reapplyPollTextFont = (
  shape: PowerPoint.Shape,
  snapshot: PollTextFontSnapshot
) => {
  const font = shape.textFrame.textRange.font
  if (snapshot.name) font.name = snapshot.name
  if (snapshot.size !== undefined) font.size = snapshot.size
  if (snapshot.bold !== undefined) font.bold = snapshot.bold
  if (snapshot.italic !== undefined) font.italic = snapshot.italic
  if (snapshot.color) font.color = snapshot.color
}

const syncPollText = (
  state: PollTextSyncState | null,
  nextText: string,
  options?: { force?: boolean; option?: PollOptionValues }
) => {
  if (!state || isShapeNullObject(state.shape)) {
    return
  }
  const currentText = state.shape.textFrame.textRange.text ?? ''
  const force = Boolean(options?.force)
  const option = options?.option

  /**
   * "Fully auto": there is a recorded last-auto-write tag AND the current
   * text matches it byte-for-byte. That means the user has not edited this
   * label since we last wrote it, so the prefix in currentText is just the
   * option name we baked in last time.
   *
   * When the bound poll changes, that stale prefix is from the OLD poll's
   * options — preserving it would freeze labels like "Yes (1) • 50%" into a
   * widget that's now showing a totally different question. In the fully-auto
   * case we therefore skip regeneratePollLabel entirely and let nextText
   * (built fresh from the new option) win. The user's manual customizations
   * (currentText !== lastAutoText) still go through regeneratePollLabel so
   * their reformatting is preserved across updates.
   */
  const hasAutoTag = !state.autoTag.isNullObject
  const lastAutoText = hasAutoTag ? (state.autoTag.value ?? '') : ''
  const isFullyAuto = hasAutoTag && currentText === lastAutoText

  /** If the user reformatted the label (e.g. dropped "(N) •"), preserve their template by regenerating in-place.
   * `force` skips regeneration too: after a host edit the old prefix IS the stale
   * content being replaced, so preserving the template would keep the old label. */
  const regenerated =
    option && !isFullyAuto && !force ? regeneratePollLabel(currentText, option) : null
  const targetText = regenerated ?? nextText

  if (!hasAutoTag) {
    if (
      force ||
      currentText === targetText ||
      regenerated !== null ||
      looksLikeAutoPollText(currentText)
    ) {
      /** Only rewrite text when it actually differs — textRange.text = ... wipes inline font formatting. */
      if (currentText !== targetText) {
        state.shape.textFrame.textRange.text = targetText
        reapplyPollTextFont(state.shape, state.font)
      }
      setShapeTag(state.shape, POLL_TEXT_SYNC_TAG, targetText)
      return
    }
    setShapeTag(state.shape, POLL_TEXT_SYNC_TAG, currentText)
    return
  }

  /** Allow updates when the current text still looks auto-generated OR fits a known template — covers tag drift and user reformatting. */
  if (
    !force &&
    currentText !== lastAutoText &&
    regenerated === null &&
    !looksLikeAutoPollText(currentText)
  ) {
    return
  }

  if (currentText !== targetText) {
    state.shape.textFrame.textRange.text = targetText
    reapplyPollTextFont(state.shape, state.font)
  }
  /** Skip the tag delete+add when it already holds the target — repeat
   * passes over unchanged data must not queue any document mutation. */
  if (lastAutoText !== targetText) {
    setShapeTag(state.shape, POLL_TEXT_SYNC_TAG, targetText)
  }
}



const COUNTER_NUMBER_RE = /\d[\d,]*/

const buildCountText = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`

/**
 * Update a counter shape's number while preserving the user's text template.
 *
 * Auto state (empty text, or text still byte-identical to our last default
 * write): write the fresh default ("12 votes") and record it in the auto tag.
 * User-edited state: swap only the first number in their text ("Total: 12
 * people" -> "Total: 15 people") and deliberately DON'T update the auto tag —
 * the tag stays at the last default write, so the template keeps being
 * number-swapped on every update instead of reverting to the default one
 * update later. If the user removed the number entirely, their text wins and
 * we stop touching the shape.
 */
const syncCounterText = (
  state: PollTextSyncState | null,
  count: number,
  defaultText: string
) => {
  if (!state || isShapeNullObject(state.shape)) {
    return
  }
  /** Never write a non-number — a NaN would poison the auto tag and stick
   * until the next healthy update. */
  if (!Number.isFinite(count)) {
    return
  }
  const currentText = state.shape.textFrame.textRange.text ?? ''
  const hasAutoTag = !state.autoTag.isNullObject
  const lastAutoText = hasAutoTag ? (state.autoTag.value ?? '') : ''
  const isAuto = !currentText.trim() || (hasAutoTag && currentText === lastAutoText)

  if (isAuto) {
    if (currentText !== defaultText) {
      state.shape.textFrame.textRange.text = defaultText
      reapplyPollTextFont(state.shape, state.font)
    }
    /** Same no-op guard as syncPollText: unchanged counters write nothing. */
    if (!(hasAutoTag && lastAutoText === defaultText)) {
      setShapeTag(state.shape, POLL_TEXT_SYNC_TAG, defaultText)
    }
    return
  }

  if (!COUNTER_NUMBER_RE.test(currentText)) {
    return
  }
  const targetText = currentText.replace(COUNTER_NUMBER_RE, String(count))
  if (currentText !== targetText) {
    state.shape.textFrame.textRange.text = targetText
    reapplyPollTextFont(state.shape, state.font)
  }
}

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
      id: option.id,
      label: `${option.label} (${option.votes}) • ${percent}%`,
      ratio,
      name: option.label,
      votes: option.votes,
      percent
    }
  })
}

type PollOptionValues = {
  name: string
  votes: number
  percent: number
}

/** Regenerate a label in whatever format the user left it in — so removing "(N) •" etc. sticks across updates. */
const regeneratePollLabel = (
  currentText: string,
  option: PollOptionValues
): string | null => {
  const trimmed = currentText.replace(/\s+$/, '')
  const fullMatch = trimmed.match(/^(.*?)\s*\(\d+\)\s*(?:•|\u2022)\s*\d+%$/s)
  if (fullMatch) {
    const prefix = fullMatch[1].length ? fullMatch[1] : option.name
    return `${prefix} (${option.votes}) • ${option.percent}%`
  }
  const percentOnly = trimmed.match(/^(.*?)\s*\d+%$/s)
  if (percentOnly) {
    const prefix = percentOnly[1].length ? percentOnly[1] : option.name
    return `${prefix} ${option.percent}%`
  }
  const votesOnly = trimmed.match(/^(.*?)\s*\(\d+\)$/s)
  if (votesOnly) {
    const prefix = votesOnly[1].length ? votesOnly[1] : option.name
    return `${prefix} (${option.votes})`
  }
  return null
}

/** Thrown when an insert would overwrite an existing widget and the caller
 * did not pass `replace: true`. UIs catch this to show a confirm step —
 * PowerPoint has no undo transactions for add-ins, so a silently replaced
 * (possibly designer-customized) widget would be unrecoverable. */
export class WidgetExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WidgetExistsError'
  }
}

export async function insertQnaWidget(
  sessionId?: string | null,
  code?: string | null,
  options?: { replace?: boolean }
) {
  if (!isPowerPointShapeApiAvailable()) {
    return
  }

  const style = normalizeQnaStyle()
  const scale = style.spacingScale
  const maxQuestions = style.maxQuestions
  const hasSession = Boolean(sessionId)
  const useShapeVisibility = supportsShapeVisibility()
  const allowReplace = Boolean(options?.replace)
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

    /** Manually deleting the widget shapes leaves the slide tags behind, so
     * a stale shapes tag alone must not block the insert (it used to force
     * a bogus replace confirmation). Only shapes the tag references that
     * are still on the slide count as an existing widget. */
    let existingShapes: PowerPoint.Shape[] = []
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
          parsed.counter,
          ...itemIds
        ].filter(
          (value): value is string => Boolean(value)
        )
        const shapes = ids.map((id) => slide.shapes.getItemOrNullObject(id))
        shapes.forEach((shape) => shape.load('id'))
        await context.sync()
        existingShapes = shapes.filter((shape) => !shape.isNullObject)
      } catch {
        // If parsing fails, we just overwrite tags below.
      }
    }

    const hasExistingWidget = existingShapes.length > 0
    if (hasExistingWidget && !allowReplace) {
      throw new WidgetExistsError(
        'This slide already has a Q&A widget. Replace it or remove it first.'
      )
    }

    if (!existingShapesTag.isNullObject && existingShapesTag.value) {
      if (existingShapes.length > 0) {
        existingShapes.forEach((shape) => {
          shape.delete()
        })
        await context.sync()
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
    /** Insert-time names keep the Selection Pane readable; updates never
     * rename, so designer renames always stick. */
    shadow.name = 'Prezo Q&A Shadow'
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
    container.name = 'Prezo Q&A Panel'
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
    meta.name = 'Prezo Q&A Eyebrow'
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
    title.name = 'Prezo Q&A Title'
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
    subtitle.name = 'Prezo Q&A Subtitle'
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
    badge.name = 'Prezo Q&A Badge'
    badge.tags.add(WIDGET_TAG, 'true')
    badge.tags.add('PrezoWidgetRole', 'badge')

    const counter = slide.shapes.addTextBox('0 questions', {
      left: left + width - paddingX - 150,
      top: titleTop + badgeHeight + 6,
      width: 150,
      height: 14
    })
    counter.textFrame.wordWrap = true
    applyFont(counter.textFrame.textRange, style, { size: 11, color: style.mutedColor })
    counter.textFrame.textRange.paragraphFormat.horizontalAlignment = 'Right'
    counter.name = 'Prezo Q&A Interaction Counter'
    counter.tags.add(WIDGET_TAG, 'true')
    counter.tags.add('PrezoWidgetRole', 'counter')
    counter.tags.add(POLL_TEXT_SYNC_TAG, '0 questions')
    counter.load('id')

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
    body.name = 'Prezo Q&A Body'
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
      item.name = `Prezo Q&A Item ${index + 1} Card`
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
      question.name = `Prezo Q&A Item ${index + 1} Question`
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
      votes.name = `Prezo Q&A Item ${index + 1} Votes`
      votes.tags.add(WIDGET_TAG, 'true')
      votes.tags.add('PrezoWidgetRole', 'item-votes')

      /** Rows are content-driven and start empty, so start them truly hidden
       * on capable hosts; the update loop reveals rows that gain content. */
      if (useShapeVisibility) {
        item.visible = false
        question.visible = false
        votes.visible = false
      }

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
}


export async function insertDiscussionWidget(sessionId?: string | null, code?: string | null) {
  if (!isPowerPointShapeApiAvailable()) {
    return
  }

  const style = normalizeQnaStyle()
  const scale = style.spacingScale
  const maxQuestions = style.maxQuestions
  const hasSession = Boolean(sessionId)
  const useShapeVisibility = supportsShapeVisibility()
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
          parsed.counter,
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
    /** Insert-time names keep the Selection Pane readable; updates never
     * rename, so designer renames always stick. */
    shadow.name = 'Prezo Discussion Shadow'
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
    container.name = 'Prezo Discussion Panel'
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
    meta.name = 'Prezo Discussion Eyebrow'
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
    title.name = 'Prezo Discussion Title'
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
    subtitle.name = 'Prezo Discussion Subtitle'
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
    badge.name = 'Prezo Discussion Badge'
    badge.tags.add(DISCUSSION_WIDGET_TAG, 'true')
    badge.tags.add('PrezoWidgetRole', 'badge')

    const counter = slide.shapes.addTextBox('0 answers', {
      left: left + width - paddingX - 150,
      top: titleTop + badgeHeight + 6,
      width: 150,
      height: 14
    })
    counter.textFrame.wordWrap = true
    applyFont(counter.textFrame.textRange, style, { size: 11, color: style.mutedColor })
    counter.textFrame.textRange.paragraphFormat.horizontalAlignment = 'Right'
    counter.name = 'Prezo Discussion Interaction Counter'
    counter.tags.add(DISCUSSION_WIDGET_TAG, 'true')
    counter.tags.add('PrezoWidgetRole', 'counter')
    counter.tags.add(POLL_TEXT_SYNC_TAG, '0 answers')
    counter.load('id')

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
    body.name = 'Prezo Discussion Body'
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
      item.name = `Prezo Discussion Item ${index + 1} Card`
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
      question.name = `Prezo Discussion Item ${index + 1} Answer`
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
      votes.name = `Prezo Discussion Item ${index + 1} Votes`
      votes.tags.add(DISCUSSION_WIDGET_TAG, 'true')
      votes.tags.add('PrezoWidgetRole', 'item-votes')

      /** Rows are content-driven and start empty, so start them truly hidden
       * on capable hosts; the update loop reveals rows that gain content. */
      if (useShapeVisibility) {
        item.visible = false
        question.visible = false
        votes.visible = false
      }

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
}
export async function updateQnaWidget(
  sessionId: string,
  code: string | null | undefined,
  questions: Question[],
  prompts: QnaPrompt[],
  config: QnaWidgetConfig = QNA_WIDGET_CONFIG,
  options?: WidgetUpdatePassOptions
) {
  if (!isPowerPointShapeApiAvailable()) {
    return
  }

  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]))
  const tags = config.tags
  const useShapeVisibility = supportsShapeVisibility()
  const withVisible = (props: string[]) =>
    useShapeVisibility ? [...props, 'visible'] : props
  await runPowerPoint(async (context) => {
    const slides = context.presentation.slides
    slides.load('items/id')
    const selectedSlides = options?.repairSelectedSlide
      ? context.presentation.getSelectedSlides()
      : null
    if (selectedSlides) {
      selectedSlides.load('items/id')
    }
    await context.sync()

    const repairSlideIds = new Set<string>()
    if (selectedSlides) {
      try {
        selectedSlides.items.forEach((slide) => repairSlideIds.add(slide.id))
      } catch {
        // Empty or unreadable selection — no repair bypass this pass.
      }
    }

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

      const explicitBoundPromptId =
        !info.promptBindingTag.isNullObject && info.promptBindingTag.value
          ? info.promptBindingTag.value.trim()
          : ''
      const explicitBoundPrompt = explicitBoundPromptId
        ? promptMap.get(explicitBoundPromptId) ?? null
        : null
      const fallbackPrompt =
        !explicitBoundPromptId && config.pickUnboundPrompt
          ? config.pickUnboundPrompt(prompts)
          : null
      const boundPromptId = explicitBoundPromptId || fallbackPrompt?.id || ''
      const boundPrompt = explicitBoundPrompt ?? fallbackPrompt ?? null
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

      /** Skip widgets whose rendered inputs match what the last successful
       * pass applied — no shape loads, no writes. See appliedWidgetSignatures. */
      const slideKey = `${tags.widgetTag}|${sessionId}|${info.slide.id}`
      const dataSignature = JSON.stringify([
        code ?? null,
        info.shapeTag.value,
        info.styleTag.isNullObject ? null : info.styleTag.value,
        explicitBoundPromptId,
        boundPrompt ? promptProjection(boundPrompt) : boundPromptId || null,
        filteredQuestions.map(questionProjection)
      ])
      if (
        !isPending &&
        !repairSlideIds.has(info.slide.id) &&
        appliedWidgetSignatures.get(slideKey) === dataSignature
      ) {
        continue
      }

      try {
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
      const counterShape = shapeIds.counter
        ? info.slide.shapes.getItemOrNullObject(shapeIds.counter)
        : null
      const itemShapes = (shapeIds.items ?? []).map((item) => {
        const container = info.slide.shapes.getItemOrNullObject(item.container)
        const text = info.slide.shapes.getItemOrNullObject(item.text)
        const votes = info.slide.shapes.getItemOrNullObject(item.votes)
        container.load(withVisible(['id', 'type']))
        text.load(withVisible(['id', 'type']))
        votes.load(withVisible(['id', 'type']))
        return { container, text, votes }
      })
      if (containerShape) {
        containerShape.load(['id', 'type'])
      }
      if (shadowShape) {
        shadowShape.load(['id', 'type'])
      }
      title.load(['id', 'type'])
      body.load(['id', 'type'])
      if (subtitle) {
        subtitle.load(['id', 'type'])
      }
      if (meta) {
        meta.load(['id', 'type'])
      }
      if (badge) {
        badge.load(['id', 'type'])
      }
      if (counterShape) {
        counterShape.load(['id', 'type'])
      }
      await context.sync()

      /** Second batched load: current text for every text-capable shape (so
       * the writes below can skip no-ops), the counter's text-sync state, and
       * the item cards' fill/line state — one sync for all of it. */
      const queueTextLoad = (shape: PowerPoint.Shape | null) => {
        if (shape && !isShapeNullObject(shape) && shapeSupportsText(shape)) {
          shape.textFrame.textRange.load('text')
        }
      }
      queueTextLoad(title)
      queueTextLoad(body)
      queueTextLoad(subtitle)
      queueTextLoad(meta)
      queueTextLoad(badge)
      itemShapes.forEach((item) => {
        queueTextLoad(item.text)
        queueTextLoad(item.votes)
        if (shapeSupportsFill(item.container)) {
          item.container.load(['fill/transparency', 'lineFormat/visible'])
        }
      })
      const queuedCounterState = queuePollTextSyncStateLoad(counterShape)
      let counterState: PollTextSyncState | null = null
      try {
        await context.sync()
        counterState = snapshotPollTextSyncState(queuedCounterState)
      } catch {
        /** A shape the type heuristic couldn't screen blew up the batch:
         * fall back to the old behavior — unguarded writes below, counter
         * state loaded in per-shape isolation. */
        counterState = await safeLoadPollTextSyncState(counterShape, context)
      }

      if (applyStyle) {
        if (shapeSupportsFill(shadowShape)) {
          shadowShape!.fill.setSolidColor(style.shadowColor)
          shadowShape!.fill.transparency = style.shadowOpacity
          shadowShape!.lineFormat.visible = false
        }
        if (shapeSupportsFill(containerShape)) {
          containerShape!.fill.setSolidColor(style.panelColor)
          containerShape!.lineFormat.color = style.borderColor
          containerShape!.lineFormat.weight = 1
        }
        if (meta && shapeSupportsText(meta)) {
          applyFont(meta.textFrame.textRange, style, { size: 11, color: style.mutedColor })
        }
        if (shapeSupportsText(title)) {
          applyFont(title.textFrame.textRange, style, {
            size: 18,
            bold: true,
            color: style.textColor
          })
        }
        if (subtitle && shapeSupportsText(subtitle)) {
          applyFont(subtitle.textFrame.textRange, style, {
            size: 13,
            color: style.mutedColor
          })
        }
        if (badge && !badge.isNullObject) {
          if (shapeSupportsFill(badge)) {
            badge.fill.setSolidColor(badgeFillFor(style))
            badge.lineFormat.visible = false
          }
          if (shapeSupportsText(badge)) {
            applyFont(badge.textFrame.textRange, style, {
              size: 11,
              bold: true,
              color: style.accentColor
            })
          }
        }
        if (shapeSupportsText(body)) {
          applyFont(body.textFrame.textRange, style, { size: 14, color: style.mutedColor })
        }
        itemShapes.forEach((item) => {
          if (item.container.isNullObject || item.text.isNullObject || item.votes.isNullObject) {
            return
          }
          if (shapeSupportsFill(item.container)) {
            item.container.fill.setSolidColor(style.cardColor)
            item.container.lineFormat.color = style.borderColor
            item.container.lineFormat.weight = 1
          }
          if (shapeSupportsText(item.text)) {
            applyFont(item.text.textFrame.textRange, style, {
              size: 14,
              color: style.textColor
            })
          }
          if (shapeSupportsText(item.votes)) {
            applyFont(item.votes.textFrame.textRange, style, {
              size: 12,
              color: style.mutedColor
            })
          }
        })
      }

      /** All text writes below are diffed against the loaded current text —
       * unchanged widgets queue no mutations (undo stack and autosave stay
       * quiet), and text-incapable swap-ins are skipped instead of throwing. */
      if (shapeSupportsText(title)) {
        const hasNewLayout = Boolean(
          (shapeIds.items && shapeIds.items.length > 0) ||
            shapeIds.subtitle ||
            shapeIds.meta ||
            shapeIds.badge
        )
        setShapeTextIfChanged(
          title,
          hasNewLayout
            ? panelTitle
            : config.buildLegacyTitle(code, resolvedMode, promptTitle ?? null)
        )
      }
      if (meta && shapeSupportsText(meta)) {
        setShapeTextIfChanged(
          meta,
          resolvedMode === 'prompt'
            ? config.promptEyebrowText ?? config.eyebrowText
            : config.eyebrowText
        )
      }
      if (subtitle && shapeSupportsText(subtitle)) {
        setShapeTextIfChanged(subtitle, buildMeta(code))
      }
      if (badge && shapeSupportsText(badge)) {
        setShapeTextIfChanged(
          badge,
          buildBadgeText(resolvedMode, pendingCount, approved.length, config)
        )
      }
      /** Interaction counter: total submissions in this widget's scope (all
       * statuses). Text only, template-preserving — see syncCounterText. */
      syncCounterText(
        counterState,
        filteredQuestions.length,
        buildCountText(
          filteredQuestions.length,
          config.counterSingular,
          config.counterPlural
        )
      )
      if (itemShapes.length > 0) {
        const hasApproved = approved.length > 0
        if (shapeSupportsText(body)) {
          setShapeTextIfChanged(
            body,
            hasApproved
              ? ''
              : resolvedMode === 'prompt'
                ? config.emptyBodyPrompt
                : config.emptyBodyAudience
          )
        }
        itemShapes.forEach((item, index) => {
          if (item.container.isNullObject || item.text.isNullObject || item.votes.isNullObject) {
            return
          }
          const question = approved[index]
          if (!question) {
            /** Empty row: hide it for real on capable hosts so it leaves the
             * canvas/tab order; older hosts keep the transparency fallback. */
            if (useShapeVisibility) {
              setShapesVisibility([item.container, item.text, item.votes], false)
              return
            }
            if (shapeSupportsFill(item.container)) {
              setFillTransparencyIfChanged(item.container, 1)
              setLineVisibleIfChanged(item.container, false)
            }
            if (shapeSupportsText(item.text)) {
              setShapeTextIfChanged(item.text, '')
            }
            if (shapeSupportsText(item.votes)) {
              setShapeTextIfChanged(item.votes, '')
            }
            return
          }
          if (useShapeVisibility) {
            setShapesVisibility([item.container, item.text, item.votes], true)
          }
          if (shapeSupportsFill(item.container)) {
            setFillTransparencyIfChanged(item.container, 0)
            setLineVisibleIfChanged(item.container, true)
          }
          if (shapeSupportsText(item.text)) {
            setShapeTextIfChanged(item.text, question.text)
          }
          if (shapeSupportsText(item.votes)) {
            setShapeTextIfChanged(item.votes, `${question.votes} votes`)
          }
        })
      } else if (shapeSupportsText(body)) {
        setShapeTextIfChanged(body, buildBody(filteredQuestions, resolvedMode, config))
      }

      if (isPending) {
        setSlideTag(info.slide, tags.sessionTag, sessionId)
        info.slide.tags.delete(tags.pendingTag)
      }

      /** Per-widget flush + cache write. A failure drops the cache entry so
       * the next pass retries this widget in full, and no longer takes every
       * other widget's queued writes down with it. */
      await context.sync()
      appliedWidgetSignatures.set(slideKey, dataSignature)
      } catch (err) {
        appliedWidgetSignatures.delete(slideKey)
        console.warn(`Q&A widget update failed on slide id ${info.slide.id}`, err)
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
  if (!isPowerPointShapeApiAvailable()) {
    return
  }

  const style = normalizePollStyle(styleOverrides)
  const scale = style.spacingScale
  const maxOptions = style.maxOptions
  const hasSession = Boolean(sessionId)
  const useShapeVisibility = supportsShapeVisibility()
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
          const parsed = JSON.parse(existingShapesTag.value) as Partial<PollWidgetShapeIds>
          const itemIds =
            parsed.items?.flatMap((item) => [item.label, item.group, item.bg, item.fill]) ?? []
          const ids = (parsed.group
            ? [parsed.group, parsed.counter]
            : [
                parsed.shadow,
                parsed.container,
                parsed.title,
                parsed.question,
                parsed.body,
                parsed.counter,
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
    /** Named shapes keep PowerPoint's Selection Pane readable for designers
     * ("Prezo Poll Option 3 Bar" instead of "Rectangle 47"). Insert-time
     * only — updates never rename, so designer renames always stick. */
    shadow.name = 'Prezo Poll Shadow'
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
    container.name = 'Prezo Poll Panel'
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
    title.name = 'Prezo Poll Title'
    title.tags.add(POLL_WIDGET_TAG, 'true')
    title.tags.add('PrezoWidgetRole', 'poll-title')
    title.tags.add(POLL_TEXT_SYNC_TAG, buildPollTitle(code))

    const question = slide.shapes.addTextBox(POLL_BIND_PLACEHOLDER, {
      left: left + 24,
      top: top + 62 * scale,
      width: width - 48,
      height: 40
    })
    question.textFrame.wordWrap = true
    applyFont(question.textFrame.textRange, style, { size: 14, color: style.mutedColor })
    question.name = 'Prezo Poll Question'
    question.tags.add(POLL_WIDGET_TAG, 'true')
    question.tags.add('PrezoWidgetRole', 'poll-question')
    question.tags.add(POLL_TEXT_SYNC_TAG, POLL_BIND_PLACEHOLDER)

    const counter = slide.shapes.addTextBox('0 votes', {
      left: left + width - 24 - 140,
      top: top + 18 * scale,
      width: 140,
      height: 16
    })
    counter.textFrame.wordWrap = true
    applyFont(counter.textFrame.textRange, style, { size: 12, color: style.mutedColor })
    counter.textFrame.textRange.paragraphFormat.horizontalAlignment = 'Right'
    counter.name = 'Prezo Poll Vote Counter'
    counter.tags.add(POLL_WIDGET_TAG, 'true')
    counter.tags.add('PrezoWidgetRole', 'poll-counter')
    counter.tags.add(POLL_TEXT_SYNC_TAG, '0 votes')
    counter.load('id')

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
      label.name = `Prezo Poll Option ${index + 1} Label`
      label.tags.add(POLL_WIDGET_TAG, 'true')
      label.tags.add('PrezoWidgetRole', 'poll-label')
      label.tags.add(POLL_TEXT_SYNC_TAG, showItem ? `Option ${index + 1}` : '')

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
      bg.name = `Prezo Poll Option ${index + 1} Bar Track`
      bg.tags.add(POLL_WIDGET_TAG, 'true')
      bg.tags.add('PrezoWidgetRole', 'poll-bar-bg')

      const fillHeight = isVertical
        ? Math.max(2, verticalBarAreaHeight * POLL_SKELETON_FILL_RATIO)
        : barThickness
      const fill = slide.shapes.addGeometricShape('Rectangle', {
        left: isVertical ? verticalBarLeft : left + paddingX,
        top: isVertical ? barTop + (verticalBarAreaHeight - fillHeight) : barTop,
        width: isVertical
          ? verticalBarWidth
          : showItem
            ? Math.max(2, fullBarWidth * POLL_SKELETON_FILL_RATIO)
            : 2,
        height: isVertical ? fillHeight : barThickness
      })
      fill.fill.setSolidColor(style.accentColor)
      fill.fill.transparency = showItem ? 0 : 1
      fill.lineFormat.visible = false
      fill.name = `Prezo Poll Option ${index + 1} Bar Fill`
      fill.tags.add(POLL_WIDGET_TAG, 'true')
      fill.tags.add('PrezoWidgetRole', 'poll-bar-fill')

      const barGroup = slide.shapes.addGroup([bg, fill])
      barGroup.name = `Prezo Poll Option ${index + 1} Bar`
      barGroup.tags.add(POLL_WIDGET_TAG, 'true')
      barGroup.tags.add('PrezoWidgetRole', 'poll-bar-group')

      /** Rows beyond the style's option count start truly hidden on capable
       * hosts — no ghost shapes on the canvas from the first insert. The
       * update loop reveals them if a bigger poll is bound later. */
      if (!showItem && useShapeVisibility) {
        label.visible = false
        barGroup.visible = false
      }

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
      counter: counter.id,
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

/** Shape.visible ships in PowerPointApi 1.10 (the same set as Shape.rotation,
 * which the poll updater already writes). Hosts below it fall back to the
 * legacy transparency-based hiding, so nothing regresses. */
const supportsShapeVisibility = (): boolean => {
  try {
    return Boolean(
      typeof Office !== 'undefined' &&
        Office.context?.requirements?.isSetSupported?.('PowerPointApi', '1.10')
    )
  } catch {
    return false
  }
}

/** Reading an unloaded scalar off a RichApi proxy throws — treat that as
 * "unknown" so callers write unconditionally instead of crashing. */
const loadedVisibleState = (shape: PowerPoint.Shape): boolean | null => {
  try {
    const value = shape.visible
    return typeof value === 'boolean' ? value : null
  } catch {
    return null
  }
}

/** Type-guarded group check tolerant of shapes whose `type` wasn't loaded on
 * this traversal path (e.g. a bar group created in the same batch). */
const isLoadedGroupShape = (
  shape: PowerPoint.Shape | null | undefined
): shape is PowerPoint.Shape => {
  if (!shape || isShapeNullObject(shape)) {
    return false
  }
  try {
    return shape.type === 'Group'
  } catch {
    return false
  }
}

/** Set Shape.visible on each shape, skipping writes whose loaded value
 * already matches so repeat updates don't dirty the deck or the undo stack. */
const setShapesVisibility = (
  shapes: Array<PowerPoint.Shape | null | undefined>,
  visible: boolean
) => {
  for (const shape of shapes) {
    if (!shape || isShapeNullObject(shape)) {
      continue
    }
    if (loadedVisibleState(shape) === visible) {
      continue
    }
    shape.visible = visible
  }
}

/** Vote-change bar animation. Duration is wall-clock: a throttled webview
 * timer just drops frames (worst case a single snap to target), it never
 * stretches the animation. Each frame costs one context.sync round trip. */
const POLL_BAR_ANIMATION_MS = 600
const POLL_BAR_ANIMATION_FRAME_DELAY_MS = 30
/** Deltas below this many points snap directly — keeps selection-change
 * refreshes and unchanged-vote updates from wiggling the bars. */
const POLL_BAR_ANIMATION_MIN_DELTA_PT = 1.5

type PollBarGeometry = {
  left: number
  top: number
  width: number
  height: number
}

type PollBarAnimation = {
  fill: PowerPoint.Shape
  from: PollBarGeometry
  to: PollBarGeometry
  /** ratio hit 0: keep the bar visible while it shrinks, hide it after. */
  hideAtEnd: boolean
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms))

const applyBarGeometry = (fill: PowerPoint.Shape, geometry: PollBarGeometry) => {
  fill.width = geometry.width
  fill.height = geometry.height
  fill.left = geometry.left
  fill.top = geometry.top
}

/** Tween poll bar fills to their target geometry with a short ease-out.
 * All bars on a slide share the same frames so options grow together. Only
 * the geometry properties the one-shot updater already owns are written —
 * user styling (colors, fonts, effects) is never touched. On any failure the
 * remaining bars get isolated exact-target writes so a shape deleted or
 * swapped mid-animation can't strand the others at an intermediate size. */
const animatePollBars = async (
  context: PowerPoint.RequestContext,
  animations: PollBarAnimation[]
) => {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  try {
    const start = Date.now()
    for (;;) {
      const elapsed = Date.now() - start
      const progress = Math.min(1, elapsed / POLL_BAR_ANIMATION_MS)
      const eased = easeOutCubic(progress)
      for (const anim of animations) {
        applyBarGeometry(anim.fill, {
          left: lerp(anim.from.left, anim.to.left, eased),
          top: lerp(anim.from.top, anim.to.top, eased),
          width: lerp(anim.from.width, anim.to.width, eased),
          height: lerp(anim.from.height, anim.to.height, eased)
        })
      }
      await context.sync()
      if (progress >= 1) {
        break
      }
      await sleep(POLL_BAR_ANIMATION_FRAME_DELAY_MS)
    }
  } catch {
    for (const anim of animations) {
      try {
        applyBarGeometry(anim.fill, anim.to)
        await context.sync()
      } catch (itemErr) {
        console.warn('Poll widget: bar animation fallback write failed', itemErr)
      }
    }
  }
  for (const anim of animations) {
    if (!anim.hideAtEnd) {
      continue
    }
    try {
      anim.fill.fill.transparency = 1
      await context.sync()
    } catch (itemErr) {
      console.warn('Poll widget: bar hide-after-animation failed', itemErr)
    }
  }
}

export async function updatePollWidget(
  sessionId: string,
  code: string | null | undefined,
  polls: Poll[],
  options?: WidgetUpdatePassOptions & {
    /** Tween bar geometry instead of snapping. Callers pass this only while
     * the deck is in slideshow view — animating in edit view would pile
     * frame-by-frame writes onto the user's undo stack. */
    animateBars?: boolean
    /**
     * Passed once right after the host edits a poll or binds a widget to
     * one: overwrite the edited fields even on shapes whose text the
     * designer retyped. Without it, syncPollText preserves the user's
     * template — including the now-stale old label/question. Fonts, colors,
     * and geometry are untouched (the write path snapshots and reapplies
     * the font), and only widgets bound to the edited poll are affected.
     * Also bypasses the applied-signature skip for the matching slide.
     */
    forceText?: { pollId: string; question?: boolean; optionIds?: string[] }
  }
) {
  if (!isPowerPointShapeApiAvailable()) {
    return
  }
  const animateBars = Boolean(options?.animateBars)
  /** Bars tween only on the slide the audience is looking at; widgets on
   * other slides snap to target instead — nobody sees those move, and each
   * animation costs ~20 host round trips. Unknown (null) keeps legacy
   * animate-everything behavior. */
  const presentedSheetId = animateBars ? await getPresentedSheetId() : null
  const useShapeVisibility = supportsShapeVisibility()
  /** Only append 'visible' to load lists on capable hosts — loading a
   * property the host doesn't know errors the whole sync. */
  const withVisible = (props: string[]) =>
    useShapeVisibility ? [...props, 'visible'] : props

  const pollMap = new Map(polls.map((poll) => [poll.id, poll]))
  const titleText = buildPollTitle(code)

  await runPowerPoint(async (context) => {
    const slides = context.presentation.slides
    slides.load('items/id')
    const selectedSlides = options?.repairSelectedSlide
      ? context.presentation.getSelectedSlides()
      : null
    if (selectedSlides) {
      selectedSlides.load('items/id')
    }
    await context.sync()

    const repairSlideIds = new Set<string>()
    if (selectedSlides) {
      try {
        selectedSlides.items.forEach((slide) => repairSlideIds.add(slide.id))
      } catch {
        // Empty or unreadable selection — no repair bypass this pass.
      }
    }

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
        shape.load(['id', 'left', 'top', 'width', 'height', 'type'])
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
      let counter: PowerPoint.Shape | null = null

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
            case 'poll-counter':
              counter = shape
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
              /** Files edited on another device can leave a `poll-bar-group` tag on a shape that was ungrouped. Accessing `shape.group.shapes` on a non-group throws GeneralException on sync. */
              if (shape.type === 'Group') {
                barGroups.push(shape)
              }
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
          if (!bg || !fill) {
            const ranked = [...taggedShapes]
              .map(({ child }) => child)
              .sort((a, b) => b.width * b.height - a.width * a.height)
            if (!bg) {
              bg = ranked[0] ?? null
            }
            if (!fill) {
              fill = ranked.find((shape) => shape.id !== bg?.id) ?? ranked[1] ?? null
            }
          }
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
        counter: getShapeId(counter),
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

    let slideIndex = -1
    for (const info of slideInfos) {
      slideIndex += 1
      let syncPhase = 'init'
      let slideKey: string | null = null
      try {
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
      /** Unbound widgets never auto-follow a poll: they hold the designable
       * placeholder skeleton until the host explicitly binds one. */
      const poll = boundPollId ? (pollMap.get(boundPollId) ?? null) : null
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
      const forceText =
        options?.forceText && poll && poll.id === options.forceText.pollId
          ? options.forceText
          : null
      const forceOptionIds = new Set(forceText?.optionIds ?? [])

      /** Skip work the deck already shows — see appliedWidgetSignatures.
       * The signature covers everything this pass would render from (bound
       * poll content, code, style + shapes tags); pending widgets, forced
       * text passes, and repair passes on the selected slide always run. */
      slideKey = `poll|${sessionId}|${info.slide.id}`
      const dataSignature = JSON.stringify([
        code ?? null,
        info.shapeTag.isNullObject ? null : info.shapeTag.value,
        info.styleTag.isNullObject ? null : info.styleTag.value,
        boundPollId,
        poll ? pollProjection(poll) : null
      ])
      const cachedSignature = appliedWidgetSignatures.get(slideKey)
      if (!isPending && !forceText && !repairSlideIds.has(info.slide.id)) {
        if (cachedSignature === dataSignature) {
          continue
        }
        /** Slides once scanned and found widget-free stay skipped no matter
         * how the data changes (the sentinel is data-independent), so content
         * slides stop paying the recovery scan on every pass. Slides that
         * carry this session's tag, pending inserts, and repair passes never
         * sentinel-skip. */
        if (cachedSignature === NO_WIDGET_SIGNATURE && !shapeIds && !hasSessionMatch) {
          continue
        }
      }
      /**
       * Pure repair: a selection-change pass over a widget whose rendered
       * data did NOT change (the click-on-widget case). These passes never
       * touch the bars AT ALL — no writes, and no model-read guards either,
       * because the document model cannot testify about the render (writes
       * can land in the model without repainting; model-read guards froze
       * bars three times: dc7efcf, 80b99cd, 615b6a9). Skipping outright
       * makes clicking a widget structurally free of undo entries. The
       * trade-off is deliberate: a hand-dragged bar re-fits on the next
       * data change or bind instead of instantly — the add-in should not
       * fight a designer mid-edit anyway. Every data-bearing pass (changed
       * signature, bind/edit force, pending insert) SENDS all bar writes
       * unconditionally in per-item syncs — the only field-proven way to
       * repaint (fdb1686, 1b70f65, d400945).
       */
      const isPureRepairPass =
        !isPending && !forceText && cachedSignature === dataSignature

      if (!shapeIds) {
        shapeIds = await recoverPollShapeIds(info.slide, isVertical)
        recovered = Boolean(shapeIds)
        if (shapeIds) {
          setSlideTag(info.slide, POLL_SHAPES_TAG, JSON.stringify(shapeIds))
        }
      }

      if (!shapeIds) {
        /** Recovery found nothing. Ordinary content slides land here — cache
         * the verdict so they are never rescanned. Slides still tagged for
         * this session (a widget in a broken state) keep retrying. */
        if (!hasSessionMatch && !isPending) {
          appliedWidgetSignatures.set(slideKey, NO_WIDGET_SIGNATURE)
        }
        continue
      }

      if (!isPending && !hasSessionMatch && !recovered) {
        continue
      }

      const groupShape = shapeIds.group
        ? info.slide.shapes.getItemOrNullObject(shapeIds.group)
        : null
      if (groupShape) {
        groupShape.load(['id', 'type', 'rotation'])
      }

      syncPhase = 'load-group-type'
      await context.sync()

      /** A widget edited on another device may have had its group ungrouped — accessing `.group.shapes` on a non-group throws RichApi GeneralException. */
      const groupShapeIsGroup =
        !!groupShape && !groupShape.isNullObject && groupShape.type === 'Group'
      const shapeScope = groupShapeIsGroup ? groupShape!.group.shapes : null
      const resolveShape = (id: string) =>
        shapeScope ? shapeScope.getItemOrNullObject(id) : info.slide.shapes.getItemOrNullObject(id)

      let shadowShape = shapeIds.shadow ? resolveShape(shapeIds.shadow) : null
      if (shadowShape) {
        shadowShape.load(['id', 'type'])
      }

      let container = shapeIds.container ? resolveShape(shapeIds.container) : null
      if (container) {
        container.load(['id', 'width', 'left', 'top', 'height', 'type'])
      }

      let title = resolveShape(shapeIds.title)
      title.load(['id', 'type'])
      let questionShape = shapeIds.question ? resolveShape(shapeIds.question) : null
      if (questionShape) {
        questionShape.load(['id', 'type'])
      }

      let bodyShape: PowerPoint.Shape | null = null
      if (shapeIds.body) {
        bodyShape = resolveShape(shapeIds.body)
        bodyShape.load(['id', 'type'])
      }

      let counterShape: PowerPoint.Shape | null = null
      if (shapeIds.counter) {
        counterShape = resolveShape(shapeIds.counter)
        counterShape.load(['id', 'type'])
      }

      const itemEntries = (shapeIds.items ?? []).map((item) => {
        const label = resolveShape(item.label)
        const itemGroup = item.group
          ? shapeScope
            ? shapeScope.getItemOrNullObject(item.group)
            : info.slide.shapes.getItemOrNullObject(item.group)
          : null
        if (itemGroup) {
          itemGroup.load(withVisible(['id', 'type']))
        }
        label.load(withVisible(['id', 'type']))
        return {
          label,
          group: itemGroup,
          bgId: item.bg,
          fillId: item.fill
        }
      })

      syncPhase = 'load-shape-entries'
      await context.sync()

      let itemShapes = itemEntries.map((entry) => {
        const entryGroupIsGroup =
          !!entry.group && !entry.group.isNullObject && entry.group.type === 'Group'
        const barScope = entryGroupIsGroup ? entry.group!.group.shapes : shapeScope
        const bg = barScope
          ? barScope.getItemOrNullObject(entry.bgId)
          : info.slide.shapes.getItemOrNullObject(entry.bgId)
        const fill = barScope
          ? barScope.getItemOrNullObject(entry.fillId)
          : info.slide.shapes.getItemOrNullObject(entry.fillId)
        bg.load(withVisible(['id', 'width', 'left', 'height', 'top', 'type']))
        fill.load(withVisible(['id', 'width', 'left', 'height', 'top', 'type']))
        return { label: entry.label, group: entry.group, bg, fill }
      })

      syncPhase = 'load-bar-shapes'
      await context.sync()

      const needsFallback =
        title.isNullObject ||
        (questionShape ? questionShape.isNullObject : false) ||
        itemShapes.length === 0 ||
        itemShapes.every(
          (item) => item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject
        )

      if (needsFallback) {
        const fallbackScope = groupShapeIsGroup ? groupShape!.group.shapes : info.slide.shapes
        fallbackScope.load('items')
        await context.sync()
        const tagged = fallbackScope.items.map((shape) => {
          const roleTag = shape.tags.getItemOrNullObject('PrezoWidgetRole')
          roleTag.load('value')
          shape.load(['id', 'left', 'top', 'width', 'height', 'type'])
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
        let taggedCounter: PowerPoint.Shape | null = null
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
              /** Skip shapes tagged as bar-group but no longer a group (ungrouped on another device). */
              if (shape.type === 'Group') {
                barGroups.push(shape)
              }
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
            if (!bg || !fill) {
              const ranked = [...taggedShapes]
                .map(({ child }) => child)
                .sort((a, b) => b.width * b.height - a.width * a.height)
              if (!bg) {
                bg = ranked[0] ?? null
              }
              if (!fill) {
                fill = ranked.find((shape) => shape.id !== bg?.id) ?? ranked[1] ?? null
              }
            }
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
        if (taggedCounter) {
          counterShape = taggedCounter
        }
        if (taggedItems.length > 0) {
          itemShapes = taggedItems.map((item) => {
            item.label.load(withVisible(['id']))
            if (item.group) {
              item.group.load(withVisible(['id', 'type']))
            }
            item.bg.load(withVisible(['id', 'width', 'left', 'height', 'top']))
            item.fill.load(withVisible(['id', 'width', 'left', 'height', 'top']))
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
            counter:
              taggedCounter && !isShapeNullObject(taggedCounter)
                ? getShapeId(taggedCounter)
                : shapeIds.counter,
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
          setSlideTag(info.slide, POLL_SHAPES_TAG, JSON.stringify(resolvedShapeIds))
        }
      }

      /** Adopt an orphaned counter: a shapes tag written before the counter
       * existed (or rewritten by an older build) lacks the field even though
       * the shape sits on the slide. One role-tag scan finds it and persists
       * it back into the tag; counter === '' is the "scanned, none found"
       * sentinel that keeps this off the hot path for widgets that genuinely
       * have no counter. */
      if (!counterShape && shapeIds.counter === undefined) {
        syncPhase = 'adopt-counter'
        const scanScope = groupShapeIsGroup ? groupShape!.group.shapes : info.slide.shapes
        scanScope.load('items')
        await context.sync()
        const scanned = scanScope.items.map((shape) => {
          const roleTag = shape.tags.getItemOrNullObject('PrezoWidgetRole')
          roleTag.load('value')
          shape.load(['id', 'type'])
          return { shape, roleTag }
        })
        await context.sync()
        const found = scanned.find(
          ({ roleTag }) => !roleTag.isNullObject && roleTag.value === 'poll-counter'
        )
        counterShape = found ? found.shape : null
        shapeIds = { ...shapeIds, counter: found ? found.shape.id : '' }
        setSlideTag(info.slide, POLL_SHAPES_TAG, JSON.stringify(shapeIds))
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
            barGroup.load(withVisible(['id']))
            const groupItems = barGroup.group.shapes
            groupItems.load('items')
            return { index, barGroup, groupItems }
          })
          await context.sync()

          const taggedGroups = createdGroups.map(({ index, barGroup, groupItems }) => {
            const taggedItems = groupItems.items.map((child) => {
              const roleTag = child.tags.getItemOrNullObject('PrezoWidgetRole')
              roleTag.load('value')
              child.load(withVisible(['id', 'width', 'left', 'height', 'top']))
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
              setSlideTag(info.slide, POLL_SHAPES_TAG, JSON.stringify(migratedShapeIds))
            }
          }
        }
      }

      if (applyStyle) {
        if (shapeSupportsFill(shadowShape)) {
          shadowShape!.fill.setSolidColor(style.shadowColor)
          shadowShape!.fill.transparency = style.shadowOpacity
          shadowShape!.lineFormat.visible = false
        }
        if (shapeSupportsFill(container)) {
          container!.fill.setSolidColor(style.panelColor)
          container!.lineFormat.color = style.borderColor
          container!.lineFormat.weight = 1
        }
        if (shapeSupportsText(title)) {
          applyFont(title.textFrame.textRange, style, {
            size: 20,
            bold: true,
            color: style.textColor
          })
        }
        if (shapeSupportsText(questionShape)) {
          applyFont(questionShape!.textFrame.textRange, style, {
            size: 14,
            color: style.mutedColor
          })
        }
        if (shapeSupportsText(bodyShape)) {
          applyFont(bodyShape!.textFrame.textRange, style, {
            size: 13,
            color: style.mutedColor
          })
        }
      }
      itemShapes.forEach((item) => {
        if (item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject) {
          return
        }
        if (applyStyle) {
          if (shapeSupportsText(item.label)) {
            applyFont(item.label.textFrame.textRange, style, { size: 13, color: style.textColor })
          }
          if (shapeSupportsFill(item.bg)) {
            item.bg.fill.setSolidColor(style.barColor)
            item.bg.lineFormat.visible = false
          }
          if (shapeSupportsFill(item.fill)) {
            item.fill.fill.setSolidColor(style.accentColor)
            item.fill.lineFormat.visible = false
          }
        }
      })

      syncPhase = 'load-text-states'
      /** One batched sync for every text-sync state plus the bars' current
       * fill transparency (for no-op write elimination below). The sequential
       * per-shape state loads this replaces were the largest cost of a pass. */
      itemShapes.forEach((item) => {
        if (shapeSupportsFill(item.bg)) {
          item.bg.load('fill/transparency')
        }
        if (shapeSupportsFill(item.fill)) {
          item.fill.load('fill/transparency')
        }
      })
      const queuedTitle = queuePollTextSyncStateLoad(title)
      const queuedQuestion = queuePollTextSyncStateLoad(questionShape)
      const queuedBody = queuePollTextSyncStateLoad(bodyShape)
      const queuedCounter = queuePollTextSyncStateLoad(counterShape)
      const queuedLabels = itemShapes.map((item) => queuePollTextSyncStateLoad(item.label))
      let titleTextState: PollTextSyncState | null = null
      let questionTextState: PollTextSyncState | null = null
      let bodyTextState: PollTextSyncState | null = null
      let counterTextState: PollTextSyncState | null = null
      let labelTextStates: (PollTextSyncState | null)[] = []
      try {
        await context.sync()
        titleTextState = snapshotPollTextSyncState(queuedTitle)
        questionTextState = snapshotPollTextSyncState(queuedQuestion)
        bodyTextState = snapshotPollTextSyncState(queuedBody)
        counterTextState = snapshotPollTextSyncState(queuedCounter)
        labelTextStates = queuedLabels.map(snapshotPollTextSyncState)
      } catch {
        /** Batch poisoned by one exotic shape — reload each state with the
         * old per-shape isolation so the rest of the widget still updates. */
        titleTextState = await safeLoadPollTextSyncState(title, context)
        questionTextState = await safeLoadPollTextSyncState(questionShape, context)
        bodyTextState = await safeLoadPollTextSyncState(bodyShape, context)
        counterTextState = await safeLoadPollTextSyncState(counterShape, context)
        labelTextStates = []
        for (const item of itemShapes) {
          labelTextStates.push(await safeLoadPollTextSyncState(item.label, context))
        }
      }

      if (groupShape && !groupShape.isNullObject) {
        /** Bar geometry math assumes an unrotated group; only pay the write
         * (and the undo entry) when the group actually drifted. */
        const rotation = loadedNumber(() => groupShape.rotation)
        if (rotation === null || rotation !== 0) {
          groupShape.rotation = 0
        }
      }

      syncPollText(titleTextState, titleText)

      if (questionShape && !questionShape.isNullObject) {
        syncPollText(
          questionTextState,
          questionText,
          forceText?.question ? { force: true } : undefined
        )
      } else if (bodyShape && !bodyShape.isNullObject) {
        syncPollText(
          bodyTextState,
          `${questionText}\n${optionData
            .map((option, index) => `${index + 1}. ${option.label}`)
            .join('\n')}`,
          forceText && (forceText.question || forceOptionIds.size > 0)
            ? { force: true }
            : undefined
        )
      }

      /** Total-votes counter: text only, never geometry — the shape stays
       * freely movable/resizable and keeps a user-edited template. */
      const totalVotes = optionData.reduce((sum, option) => sum + option.votes, 0)
      syncCounterText(
        counterTextState,
        totalVotes,
        buildCountText(totalVotes, 'vote', 'votes')
      )

      const isFiniteNum = (n: unknown): n is number =>
        typeof n === 'number' && Number.isFinite(n)

      /** Per-item isolation: a single shape with an incompatible fill (e.g. picture fill on bg) would otherwise fail the whole slide's flush transactionally. */
      const tryItemWrite = async (fn: () => void, label: string) => {
        try {
          fn()
          await context.sync()
        } catch (itemErr) {
          console.warn(
            `Poll widget: skipped ${label} on slide index ${slideIndex}`,
            itemErr
          )
        }
      }

      /**
       * Item writes are staged and flushed in ONE sync per widget; only when
       * that batched flush fails does each write retry with the per-item
       * isolation (tryItemWrite) that used to run unconditionally. Same
       * robustness against one bad shape, without ~5 round trips per option
       * row on the common path. Staged functions must stay idempotent — the
       * fallback re-runs them.
       */
      const stagedItemWrites: Array<{ fn: () => void; label: string }> = []
      const stageItemWrite = (fn: () => void, label: string) => {
        stagedItemWrites.push({ fn, label })
      }

      const pendingBarAnimations: PollBarAnimation[] = []
      /** Bars tween only on the presented slide; the rest snap silently. */
      const slideSheetId = String(info.slide.id).split('#')[0]
      const animateThisSlide =
        animateBars && (presentedSheetId === null || slideSheetId === presentedSheetId)

      for (let index = 0; index < itemShapes.length; index += 1) {
        const item = itemShapes[index]
        const data = optionData[index]
        if (item.label.isNullObject || item.bg.isNullObject || item.fill.isNullObject) {
          continue
        }
        /** Skip bar geometry/color writes entirely if bg or fill was swapped for a non-fillable shape on another device. */
        const canStyleBars = shapeSupportsFill(item.bg) && shapeSupportsFill(item.fill)
        const bgTop = item.bg.top
        const bgLeft = item.bg.left
        const bgWidth = item.bg.width
        const bgHeight = item.bg.height
        const bgGeometryValid =
          isFiniteNum(bgTop) && isFiniteNum(bgLeft) && isFiniteNum(bgWidth) && isFiniteNum(bgHeight)

        if (!data || index >= visibleOptions) {
          const rowGroup = isLoadedGroupShape(item.group) ? item.group : null
          if (useShapeVisibility && hasPollData) {
            /**
             * Surplus row for the bound poll: hide it outright instead of
             * the legacy transparency trick. Hidden shapes leave the canvas,
             * tab order, and select-all, but keep every bit of designer
             * styling (including label text) for when a rebind reveals the
             * row again. Geometry/transparency writes are skipped entirely.
             */
            stageItemWrite(() => {
              setShapesVisibility(
                rowGroup ? [item.label, rowGroup] : [item.label, item.bg, item.fill],
                false
              )
            }, `row hide ${index}`)
            continue
          }
          if (useShapeVisibility) {
            /** No poll bound: this is the designable placeholder skeleton —
             * rows previously hidden under a binding must come back. */
            stageItemWrite(() => {
              setShapesVisibility([item.label, rowGroup, item.bg, item.fill], true)
            }, `row show ${index}`)
          }
          /** Skeleton rows keep an insert-style "Option N" label (non-forced,
           * so designer retypes survive; stale auto text from a previous
           * binding still gets replaced). Rows beyond the skeleton — and
           * surplus rows on legacy no-visibility hosts — clear instead. */
          const placeholderLabel =
            !hasPollData && index < visibleOptions ? `Option ${index + 1}` : ''
          stageItemWrite(
            () =>
              syncPollText(labelTextStates[index] ?? null, placeholderLabel, {
                force: !placeholderLabel
              }),
            `label ${placeholderLabel ? 'placeholder' : 'clear'} ${index}`
          )
          if (canStyleBars && bgGeometryValid) {
            /** Skeleton rows keep the insert-time partial fill so the fill
             * shapes stay visible and designable while unbound. */
            const isSkeletonRow = !hasPollData && index < visibleOptions
            const skeletonFillHeight = Math.max(2, bgHeight * POLL_SKELETON_FILL_RATIO)
            const targetGeometry: PollBarGeometry = isVertical
              ? {
                  left: bgLeft,
                  top: bgTop + Math.max(0, bgHeight - (isSkeletonRow ? skeletonFillHeight : 2)),
                  width: bgWidth,
                  height: isSkeletonRow ? skeletonFillHeight : 2
                }
              : {
                  left: bgLeft,
                  top: bgTop,
                  width: isSkeletonRow ? Math.max(2, bgWidth * POLL_SKELETON_FILL_RATIO) : 2,
                  height: bgHeight
                }
            /**
             * Bar geometry/fill writes go through SMALL PER-ITEM syncs, and
             * that is load-bearing twice over: (1) the big mixed staged
             * flush silently dropped grouped-bar geometry (dc7efcf saga),
             * and (2) the 80b99cd bars-only BATCH landed in the document
             * model without repainting — read-back verification saw the
             * model matching and the no-op guards then skipped every later
             * write, freezing the bars for good. Per-item writes repaint
             * reliably (fdb1686, field-proven), which is also what makes
             * the pre-write guards below safe: the model can only match the
             * target if a repainting write put it there.
             */
            if (!isPureRepairPass) {
              await tryItemWrite(() => {
                applyBarGeometry(item.fill, targetGeometry)
              }, `bar dims ${index}`)
            }
            /**
             * Bar transparency reflects visibility, not aesthetics. The
             * pre-allocated MAX_POLL_OPTIONS row shapes get hidden/shown
             * as the bound poll's option count changes; without an
             * unconditional update here, a row that was hidden under the
             * previous binding stays invisible when a new binding makes it
             * the Nth visible option (and vice versa). User-customized
             * colors and geometry remain untouched — only the on/off
             * visibility flag is system-controlled.
             */
            const fillTransparency = isSkeletonRow ? 0 : 1
            const bgTransparency = hasPollData ? 1 : isSkeletonRow ? 0 : 0.35
            if (!isPureRepairPass) {
              await tryItemWrite(() => {
                item.fill.fill.transparency = fillTransparency
                item.bg.fill.transparency = bgTransparency
              }, `bar transparency ${index}`)
            }
          }
          continue
        }

        if (useShapeVisibility) {
          /** All four written (not just the group): rows hidden per-shape by
           * an earlier pass (pre-group-migration) must fully reappear. */
          stageItemWrite(() => {
            setShapesVisibility(
              [item.label, isLoadedGroupShape(item.group) ? item.group : null, item.bg, item.fill],
              true
            )
          }, `row show ${index}`)
        }
        stageItemWrite(
          () =>
            syncPollText(labelTextStates[index] ?? null, data.label, {
              option: { name: data.name, votes: data.votes, percent: data.percent },
              force: forceOptionIds.has(data.id)
            }),
          `label ${index}`
        )
        if (canStyleBars && bgGeometryValid) {
          const targetGeometry: PollBarGeometry = isVertical
            ? (() => {
                const fillHeight = Math.max(2, bgHeight * data.ratio)
                return {
                  left: bgLeft,
                  top: bgTop + (bgHeight - fillHeight),
                  width: bgWidth,
                  height: fillHeight
                }
              })()
            : {
                left: bgLeft,
                top: bgTop,
                width: Math.max(2, bgWidth * data.ratio),
                height: bgHeight
              }

          const fillGeometryValid =
            isFiniteNum(item.fill.left) &&
            isFiniteNum(item.fill.top) &&
            isFiniteNum(item.fill.width) &&
            isFiniteNum(item.fill.height)
          /** Only the value axis decides whether to animate — cross-axis
           * drift (user nudged the fill off its track) is corrected silently
           * either way. */
          const valueAxisDelta = isVertical
            ? Math.abs(targetGeometry.height - item.fill.height)
            : Math.abs(targetGeometry.width - item.fill.width)

          if (animateThisSlide && fillGeometryValid && valueAxisDelta >= POLL_BAR_ANIMATION_MIN_DELTA_PT) {
            pendingBarAnimations.push({
              fill: item.fill,
              from: {
                left: item.fill.left,
                top: item.fill.top,
                width: item.fill.width,
                height: item.fill.height
              },
              to: targetGeometry,
              hideAtEnd: data.ratio === 0
            })
            /** Reveal a previously hidden bar before it grows; hiding (ratio
             * 0) waits until the shrink finishes inside animatePollBars. See
             * the hidden branch above for why transparency is
             * system-controlled rather than gated on style lock. */
            if (!isPureRepairPass) {
              await tryItemWrite(() => {
                if (data.ratio > 0) {
                  item.fill.fill.transparency = 0
                }
                item.bg.fill.transparency = 0
              }, `bar transparency ${index}`)
            }
            continue
          }

          /** Per-item writes, NEVER batched — see the note on the hidden
           * branch: batched bar geometry updates the model without
           * repainting on desktop hosts. Pure repair passes skip bars
           * entirely (undo-stack hygiene — repair runs on every selection
           * change, and model-read guards are banned); every other pass
           * sends the write unconditionally. */
          if (!isPureRepairPass) {
            await tryItemWrite(() => {
              applyBarGeometry(item.fill, targetGeometry)
            }, `bar dims ${index}`)
          }
          /** See the matching note on the hidden branch above for why
              transparency is system-controlled rather than gated on style lock. */
          const boundFillTransparency = data.ratio === 0 ? 1 : 0
          if (!isPureRepairPass) {
            await tryItemWrite(() => {
              item.fill.fill.transparency = boundFillTransparency
              item.bg.fill.transparency = 0
            }, `bar transparency ${index}`)
          }
        }
      }

      if (stagedItemWrites.length > 0) {
        syncPhase = 'flush-item-writes'
        let stagedFlushed = false
        try {
          for (const write of stagedItemWrites) {
            try {
              write.fn()
            } catch (itemErr) {
              console.warn(
                `Poll widget: skipped ${write.label} on slide index ${slideIndex}`,
                itemErr
              )
            }
          }
          await context.sync()
          stagedFlushed = true
        } catch (flushErr) {
          console.warn(
            `Poll widget: batched item writes failed on slide index ${slideIndex}; retrying items in isolation`,
            flushErr
          )
        }
        if (!stagedFlushed) {
          for (const write of stagedItemWrites) {
            await tryItemWrite(write.fn, write.label)
          }
        }
      }

      if (pendingBarAnimations.length > 0) {
        syncPhase = 'animate-bars'
        await animatePollBars(context, pendingBarAnimations)
      }

      if (isPending || recovered) {
        setSlideTag(info.slide, POLL_SESSION_TAG, sessionId)
        info.slide.tags.delete(POLL_PENDING_TAG)
      }

      /** Flush this slide's queued mutations so one bad slide doesn't poison the next iteration's context state. */
      syncPhase = 'flush-slide-mutations'
      await context.sync()
      /** Remember what this pass applied so unchanged data skips the widget
       * next time. Recovery/migration passes that rewrote the shapes tag get
       * one extra echo pass (the signature snapshots the pre-pass tag) and
       * then converge. */
      appliedWidgetSignatures.set(slideKey, dataSignature)
      } catch (err) {
        if (slideKey) {
          appliedWidgetSignatures.delete(slideKey)
        }
        const debugInfo =
          err && typeof err === 'object' && 'debugInfo' in err
            ? (err as { debugInfo?: unknown }).debugInfo
            : undefined
        console.warn(
          `Poll widget update failed on slide index ${slideIndex} at phase "${syncPhase}"`,
          err,
          debugInfo ? { debugInfo } : ''
        )
      }
    }

    await context.sync().catch((err) => {
      console.warn('Poll widget final sync failed', err)
    })
  })
}

export async function updateDiscussionWidget(
  sessionId: string,
  code: string | null | undefined,
  questions: Question[],
  prompts: QnaPrompt[],
  options?: WidgetUpdatePassOptions
) {
  await updateQnaWidget(
    sessionId,
    code,
    questions,
    prompts,
    DISCUSSION_WIDGET_CONFIG,
    options
  )
}

export async function setQnaWidgetBinding(
  sessionId: string,
  promptId?: string | null
) {
  if (!isPowerPointShapeApiAvailable()) {
    return
  }

  await runPowerPoint(async (context) => {
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
    slide.tags.delete(QNA_PROMPT_BINDING_TAG)
    if (promptId) {
      slide.tags.add(QNA_PROMPT_BINDING_TAG, promptId)
    }

    slide.tags.delete(SESSION_TAG)
    slide.tags.add(SESSION_TAG, sessionId)
    slide.tags.delete(WIDGET_PENDING_TAG)
    await context.sync()
  })
}

export async function setDiscussionWidgetBinding(
  sessionId: string,
  promptId?: string | null
) {
  if (!isPowerPointShapeApiAvailable()) {
    return
  }

  await runPowerPoint(async (context) => {
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

    slide.tags.delete(DISCUSSION_PROMPT_BINDING_TAG)
    if (promptId) {
      slide.tags.add(DISCUSSION_PROMPT_BINDING_TAG, promptId)
    }

    slide.tags.delete(DISCUSSION_SESSION_TAG)
    slide.tags.add(DISCUSSION_SESSION_TAG, sessionId)
    slide.tags.delete(DISCUSSION_PENDING_TAG)
    await context.sync()
  })
}

export async function setPollWidgetBinding(sessionId: string, pollId?: string | null) {
  if (!isPowerPointShapeApiAvailable()) {
    return
  }

  await runPowerPoint(async (context) => {
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

    /** PowerPoint throws RichApi GeneralException if `tags.add` is used when the key already exists. */
    slide.tags.delete(POLL_BINDING_TAG)
    if (pollId) {
      slide.tags.add(POLL_BINDING_TAG, pollId)
    }
    slide.tags.delete(POLL_SESSION_TAG)
    slide.tags.add(POLL_SESSION_TAG, sessionId)
    slide.tags.delete(POLL_PENDING_TAG)
    await context.sync()
  })
}

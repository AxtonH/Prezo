export const DEFAULT_API_BASE = 'https://prezo-backend-production.up.railway.app'
export const DEFAULT_POLL_SELECTOR = 'latest/open'
export const THEME_LIBRARY_KEY = 'prezo.poll-game-poc.themes.v1'
export const THEME_DRAFT_KEY = 'prezo.poll-game-poc.theme-draft.v1'
export const RIBBON_TAB_KEY = 'prezo.poll-game-poc.ribbon-tab.v1'
export const RIBBON_COLLAPSED_KEY = 'prezo.poll-game-poc.ribbon-collapsed.v1'
export const RIBBON_HIDDEN_KEY = 'prezo.poll-game-poc.ribbon-hidden.v1'
export const TEXT_OVERRIDES_KEY = 'prezo.poll-game-poc.text-overrides.v1'
export const AI_CHAT_OPEN_KEY = 'prezo.poll-game-poc.ai-chat-open.v1'
export const AI_MODEL_STORAGE_KEY = 'prezo.poll-game-poc.ai-model.v1'
export const AI_DEFAULT_MODEL = 'gpt-5.2'

export const AI_THEME_NUMBER_RANGES = Object.freeze({
  bgImageOpacity: [0, 1],
  overlayOpacity: [0, 1],
  gridOpacity: [0, 0.5],
  panelOpacity: [0, 1],
  trackOpacity: [0, 1],
  barHeight: [8, 44],
  barRadius: [0, 999],
  questionSize: [42, 90],
  labelSize: [14, 36],
  raceCarSize: [20, 56],
  raceTrackOpacity: [0, 1],
  raceSpeed: [0.35, 1.8],
  logoWidth: [40, 280],
  logoOpacity: [0, 1],
  assetWidth: [60, 720],
  assetOpacity: [0, 1]
})

export const AI_THEME_COLOR_KEYS = new Set([
  'bgA',
  'bgB',
  'overlayColor',
  'panelColor',
  'panelBorder',
  'textMain',
  'textSub',
  'trackColor',
  'fillA',
  'fillB',
  'raceTrackColor'
])

export const AI_THEME_ALLOWED_KEYS = new Set([
  ...Object.keys(AI_THEME_NUMBER_RANGES),
  ...AI_THEME_COLOR_KEYS,
  'bgImageUrl',
  'gridVisible',
  'visualMode',
  'artifactLayout',
  'raceCar',
  'raceCarImageUrl',
  'logoUrl',
  'assetUrl',
  'fontFamily'
])

export const AI_MOVE_TARGETS = Object.freeze({
  panel: { xKey: 'panelX', yKey: 'panelY', minX: -2400, maxX: 2400, minY: -2400, maxY: 2400 },
  eyebrow: {
    xKey: 'eyebrowX',
    yKey: 'eyebrowY',
    minX: -1600,
    maxX: 1600,
    minY: -1200,
    maxY: 1200
  },
  question: {
    xKey: 'questionX',
    yKey: 'questionY',
    minX: -1600,
    maxX: 1600,
    minY: -1200,
    maxY: 1200
  },
  meta: { xKey: 'metaX', yKey: 'metaY', minX: -1600, maxX: 1600, minY: -1200, maxY: 1200 },
  footer: {
    xKey: 'footerX',
    yKey: 'footerY',
    minX: -1600,
    maxX: 1600,
    minY: -1200,
    maxY: 1200
  },
  options: {
    xKey: 'optionsX',
    yKey: 'optionsY',
    minX: -2400,
    maxX: 2400,
    minY: -2400,
    maxY: 2400
  },
  logo: { xKey: 'logoX', yKey: 'logoY', minX: 0, maxX: 100, minY: 0, maxY: 100 },
  asset: { xKey: 'assetX', yKey: 'assetY', minX: 0, maxX: 100, minY: 0, maxY: 100 },
  bgImage: {
    xKey: 'bgImageX',
    yKey: 'bgImageY',
    minX: -2400,
    maxX: 2400,
    minY: -2400,
    maxY: 2400
  },
  overlay: {
    xKey: 'bgOverlayX',
    yKey: 'bgOverlayY',
    minX: -2400,
    maxX: 2400,
    minY: -2400,
    maxY: 2400
  },
  grid: { xKey: 'gridX', yKey: 'gridY', minX: -2400, maxX: 2400, minY: -2400, maxY: 2400 }
})

export const AI_BOX_RESIZE_TARGETS = Object.freeze({
  eyebrow: {
    widthKey: 'eyebrowBoxWidth',
    heightKey: 'eyebrowBoxHeight',
    minW: 60,
    maxW: 1800,
    minH: 14,
    maxH: 420
  },
  question: {
    widthKey: 'questionBoxWidth',
    heightKey: 'questionBoxHeight',
    minW: 120,
    maxW: 2200,
    minH: 40,
    maxH: 1400
  },
  meta: {
    widthKey: 'metaBoxWidth',
    heightKey: 'metaBoxHeight',
    minW: 90,
    maxW: 1000,
    minH: 28,
    maxH: 220
  },
  footer: {
    widthKey: 'footerBoxWidth',
    heightKey: 'footerBoxHeight',
    minW: 120,
    maxW: 2200,
    minH: 18,
    maxH: 420
  }
})

export const AI_SCALE_RESIZE_TARGETS = Object.freeze({
  panel: { xKey: 'panelScaleX', yKey: 'panelScaleY', minX: 0.35, maxX: 2.8, minY: 0.35, maxY: 2.8 },
  logo: { xKey: 'logoScaleX', yKey: 'logoScaleY', minX: 0.25, maxX: 5, minY: 0.25, maxY: 5 },
  asset: { xKey: 'assetScaleX', yKey: 'assetScaleY', minX: 0.25, maxX: 5, minY: 0.25, maxY: 5 },
  bgImage: {
    xKey: 'bgImageScaleX',
    yKey: 'bgImageScaleY',
    minX: 0.35,
    maxX: 3.5,
    minY: 0.35,
    maxY: 3.5
  },
  overlay: {
    xKey: 'bgOverlayScaleX',
    yKey: 'bgOverlayScaleY',
    minX: 0.35,
    maxX: 3.5,
    minY: 0.35,
    maxY: 3.5
  },
  grid: { xKey: 'gridScaleX', yKey: 'gridScaleY', minX: 0.35, maxX: 3.5, minY: 0.35, maxY: 3.5 }
})

export const AI_TARGET_ALIASES = Object.freeze({
  title: 'question',
  subtitle: 'eyebrow',
  eyebrow: 'eyebrow',
  question: 'question',
  heading: 'question',
  panel: 'panel',
  canvas: 'panel',
  container: 'panel',
  meta: 'meta',
  status: 'meta',
  votes: 'meta',
  footer: 'footer',
  options: 'options',
  polls: 'options',
  logo: 'logo',
  asset: 'asset',
  background: 'bgImage',
  bg: 'bgImage',
  bgimage: 'bgImage',
  overlay: 'overlay',
  grid: 'grid'
})

export const AI_CHAT_MAX_MESSAGES = 80

export const TEXT_FONT_FAMILIES = [
  'Aptos',
  'Arial',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Franklin Gothic Medium',
  'Garamond',
  'Georgia',
  'Impact',
  'Lucida Sans Unicode',
  'Palatino Linotype',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana'
]

export const TEXT_FONT_SIZES = [
  8,
  9,
  10,
  10.5,
  11,
  12,
  14,
  16,
  18,
  20,
  24,
  28,
  32,
  36,
  40,
  44,
  48,
  54,
  60,
  66,
  72
]

export const HISTORY_LIMIT = 100
export const DRAG_START_THRESHOLD_PX = 5
export const MIN_RESIZE_HANDLE_SIZE_PX = 28

/**
 * Host-side handler for designer-tool config: rulers, grid overlay, and
 * snap-to-grid during drag. Mirrors the shape of the other handler modules
 * (textedit / select / position / history) so the integration point in
 * poll-game-gamified-app.js stays consistent.
 *
 * Scope: per-user preference, persisted in localStorage. Designers want
 * consistent behaviour across artifacts, so we don't tie this to the
 * artifact record itself. Present mode unconditionally hides the visual
 * aids regardless of the user's saved preference — that's a render-time
 * decision the host makes when pushing the effective config to the iframe.
 */

const STORAGE_KEY = 'prezo.designerTools.v1'

const DEFAULT_CONFIG = Object.freeze({
  rulersVisible: true,
  gridVisible: true,
  gridSpacing: 100,
  snapToGrid: true,
  snapThreshold: 8
})

const ALLOWED_SPACINGS = [50, 100, 200]

function clampSpacing(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_CONFIG.gridSpacing
  // Snap to the nearest allowed bucket so users can't end up with 73px grids.
  let best = ALLOWED_SPACINGS[0]
  let bestDelta = Math.abs(n - best)
  for (const allowed of ALLOWED_SPACINGS) {
    const delta = Math.abs(n - allowed)
    if (delta < bestDelta) { best = allowed; bestDelta = delta }
  }
  return best
}

function clampThreshold(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONFIG.snapThreshold
  return Math.min(50, Math.round(n))
}

function readStoredConfig() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_CONFIG }
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONFIG }
    return {
      rulersVisible: typeof parsed.rulersVisible === 'boolean' ? parsed.rulersVisible : DEFAULT_CONFIG.rulersVisible,
      gridVisible: typeof parsed.gridVisible === 'boolean' ? parsed.gridVisible : DEFAULT_CONFIG.gridVisible,
      gridSpacing: clampSpacing(parsed.gridSpacing),
      snapToGrid: typeof parsed.snapToGrid === 'boolean' ? parsed.snapToGrid : DEFAULT_CONFIG.snapToGrid,
      snapThreshold: clampThreshold(parsed.snapThreshold)
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function writeStoredConfig(config) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Quota exceeded / private browsing — non-fatal.
  }
}

export const DESIGNER_TOOLS_DEFAULT_CONFIG = DEFAULT_CONFIG
export const DESIGNER_TOOLS_ALLOWED_SPACINGS = ALLOWED_SPACINGS

/**
 * @typedef {Object} DesignerToolsConfig
 * @property {boolean} rulersVisible
 * @property {boolean} gridVisible
 * @property {number}  gridSpacing      One of ALLOWED_SPACINGS.
 * @property {boolean} snapToGrid
 * @property {number}  snapThreshold    Pixels (in 1920x1080 ref space).
 */

/**
 * @param {Object} args
 * @param {(config: DesignerToolsConfig) => void} [args.onConfigChange]
 *   Invoked whenever the effective config changes. Host wires this to push
 *   a `prezo-grid-config` message into the iframe.
 */
export function createArtifactGuidesHandler({ onConfigChange } = {}) {
  let config = readStoredConfig()

  /** @returns {DesignerToolsConfig} */
  function getConfig() {
    return { ...config }
  }

  /**
   * Merge a partial update into the current config. Persists + fires the
   * change callback if anything actually changed.
   * @param {Partial<DesignerToolsConfig>} partial
   */
  function setConfig(partial) {
    if (!partial || typeof partial !== 'object') return
    const next = { ...config }
    if (typeof partial.rulersVisible === 'boolean') next.rulersVisible = partial.rulersVisible
    if (typeof partial.gridVisible === 'boolean') next.gridVisible = partial.gridVisible
    if (partial.gridSpacing !== undefined) next.gridSpacing = clampSpacing(partial.gridSpacing)
    if (typeof partial.snapToGrid === 'boolean') next.snapToGrid = partial.snapToGrid
    if (partial.snapThreshold !== undefined) next.snapThreshold = clampThreshold(partial.snapThreshold)
    if (configsEqual(config, next)) return
    config = next
    writeStoredConfig(config)
    if (typeof onConfigChange === 'function') {
      try { onConfigChange({ ...config }) } catch {}
    }
  }

  /**
   * Compute the EFFECTIVE config for a given context (present mode hides
   * all visual aids regardless of the user's saved preference).
   * @param {{ presentMode?: boolean }} ctx
   * @returns {DesignerToolsConfig}
   */
  function getEffectiveConfig(ctx) {
    const presentMode = !!(ctx && ctx.presentMode)
    if (presentMode) {
      return {
        rulersVisible: false,
        gridVisible: false,
        gridSpacing: config.gridSpacing,
        snapToGrid: false,
        snapThreshold: config.snapThreshold
      }
    }
    return { ...config }
  }

  return {
    getConfig,
    setConfig,
    getEffectiveConfig
  }
}

function configsEqual(a, b) {
  return (
    a.rulersVisible === b.rulersVisible &&
    a.gridVisible === b.gridVisible &&
    a.gridSpacing === b.gridSpacing &&
    a.snapToGrid === b.snapToGrid &&
    a.snapThreshold === b.snapThreshold
  )
}

/**
 * Theme editor DOM half for the gamified station: the control-spec table and
 * its input bindings, updateTheme/applyTheme/syncThemeControls, and the
 * background/logo/asset upload UI (file inputs + drag-and-drop zone). The
 * pure half (defaultTheme, sanitizeTheme, color utilities) lives in
 * poll-game-gamified-theme.js.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 6a-dom). The panel owns its
 * DOM: the shared `el` map is injected, and the control/upload elements are
 * resolved by id here. The canvas-object helpers applyTheme calls
 * (applyElementOffset, applyHeaderTextObjects, ...) stay in app.js — they are
 * shared with the drag/resize engine — and arrive as callbacks under their
 * original names. currentTheme uses the getCurrentTheme/setCurrentTheme seam
 * established by the library panel; `historyState` is a mutation-only object
 * and arrives by reference.
 *
 * readFileAsDataUrl is a deliberate private copy of the app.js version that
 * wins hoisting there (rejects with Error('read_failed'), coerces non-string
 * results to '') — app.js keeps its own for the attachments UI.
 */
import { ARTIFACT_VISUAL_MODE, createEmptyArtifactAnswers } from './poll-game-gamified-artifact-mode.js'
import { hexToRgba, sanitizeTheme } from './poll-game-gamified-theme.js'
import { asText, clamp } from './poll-game-gamified-utils.js'

const themeControls = [
  { id: 'theme-bg-a', key: 'bgA', type: 'color' },
  { id: 'theme-bg-b', key: 'bgB', type: 'color' },
  { id: 'theme-overlay-color', key: 'overlayColor', type: 'color' },
  { id: 'theme-bg-image-opacity', key: 'bgImageOpacity', type: 'number' },
  { id: 'theme-overlay-opacity', key: 'overlayOpacity', type: 'number' },
  { id: 'theme-grid-opacity', key: 'gridOpacity', type: 'number' },
  { id: 'theme-panel-color', key: 'panelColor', type: 'color' },
  { id: 'theme-panel-opacity', key: 'panelOpacity', type: 'number' },
  { id: 'theme-panel-border', key: 'panelBorder', type: 'color' },
  { id: 'theme-text-main', key: 'textMain', type: 'color' },
  { id: 'theme-text-sub', key: 'textSub', type: 'color' },
  { id: 'theme-track-color', key: 'trackColor', type: 'color' },
  { id: 'theme-track-opacity', key: 'trackOpacity', type: 'number' },
  { id: 'theme-fill-a', key: 'fillA', type: 'color' },
  { id: 'theme-fill-b', key: 'fillB', type: 'color' },
  { id: 'theme-bar-height', key: 'barHeight', type: 'number' },
  { id: 'theme-bar-radius', key: 'barRadius', type: 'number' },
  { id: 'theme-question-size', key: 'questionSize', type: 'number' },
  { id: 'theme-label-size', key: 'labelSize', type: 'number' },
  { id: 'theme-visual-mode', key: 'visualMode', type: 'select' },
  { id: 'theme-logo-url', key: 'logoUrl', type: 'text' },
  { id: 'theme-logo-width', key: 'logoWidth', type: 'number' },
  { id: 'theme-logo-opacity', key: 'logoOpacity', type: 'number' },
  { id: 'theme-logo-x', key: 'logoX', type: 'number' },
  { id: 'theme-logo-y', key: 'logoY', type: 'number' },
  { id: 'theme-asset-url', key: 'assetUrl', type: 'text' },
  { id: 'theme-asset-width', key: 'assetWidth', type: 'number' },
  { id: 'theme-asset-opacity', key: 'assetOpacity', type: 'number' },
  { id: 'theme-asset-x', key: 'assetX', type: 'number' },
  { id: 'theme-asset-y', key: 'assetY', type: 'number' },
  { id: 'theme-font-family', key: 'fontFamily', type: 'text' }
]

function readControlValue(input, type) {
  if (type === 'checkbox') {
    return Boolean(input.checked)
  }
  if (type === 'number') {
    return Number(input.value)
  }
  return input.value
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  })
}

export function createThemeEditor(deps) {
  const {
    state,
    el,
    /** Editor undo/redo bookkeeping — mutation-only object, shared with the
        history handler in app.js. updateTheme only reads `.applying`. */
    historyState,
    getCurrentTheme,
    setCurrentTheme,
    // Persistence + app orchestration callbacks under original closure names.
    saveThemeDraft,
    recordHistoryCheckpoint,
    renderFromSnapshot,
    postVisualModeToParent,
    clearArtifactMarkup,
    resetArtifactConversation,
    hideArtifactStage,
    showThemeFeedback,
    // Canvas-object helpers shared with the drag/resize engine in app.js.
    applyElementOffset,
    applyElementBoxSize,
    applyHeaderTextObjects,
    applyImageAsset,
    applyDeletedStaticTargets,
    syncArtifactComposerVisibility,
    scheduleResizeSelectionUpdate
  } = deps

  const controlElements = Object.fromEntries(
    themeControls.map((spec) => [spec.id, document.getElementById(spec.id)])
  )

  function bindThemeControls() {
    for (const spec of themeControls) {
      const input = controlElements[spec.id]
      if (!input) {
        continue
      }
      const eventName =
        spec.type === 'checkbox' || spec.type === 'select' ? 'change' : 'input'
      input.addEventListener(eventName, () => {
        const value = readControlValue(input, spec.type)
        updateTheme({ [spec.key]: value }, { historyLabel: 'Update design' })
        if (
          state.snapshot &&
          spec.key === 'visualMode'
        ) {
          renderFromSnapshot(true)
        }
      })
    }
  }

  function updateTheme(partialTheme, options = {}) {
    const persist = options.persist !== false
    const recordHistory = options.recordHistory !== false && persist && !historyState.applying
    const historyLabel = asText(options.historyLabel) || 'Update design'
    const previousVisualMode = getCurrentTheme().visualMode
    const nextTheme = {
      ...getCurrentTheme(),
      ...partialTheme
    }
    const includesBgUrl =
      partialTheme &&
      Object.prototype.hasOwnProperty.call(partialTheme, 'bgImageUrl') &&
      asText(partialTheme.bgImageUrl)
    const includesBgOpacity =
      partialTheme &&
      Object.prototype.hasOwnProperty.call(partialTheme, 'bgImageOpacity')
    if (includesBgUrl && !includesBgOpacity && Number(nextTheme.bgImageOpacity) <= 0.01) {
      nextTheme.bgImageOpacity = 0.55
    }

    setCurrentTheme(sanitizeTheme(nextTheme))
    if (
      !state.artifact.busy &&
      previousVisualMode !== ARTIFACT_VISUAL_MODE &&
      getCurrentTheme().visualMode === ARTIFACT_VISUAL_MODE
    ) {
      state.artifact.lastPrompt = ''
      state.artifact.lastAnswers = createEmptyArtifactAnswers()
      clearArtifactMarkup()
      resetArtifactConversation({ preserveInput: false })
      hideArtifactStage()
    }
    applyTheme(getCurrentTheme())
    if (
      partialTheme &&
      Object.prototype.hasOwnProperty.call(partialTheme, 'visualMode') &&
      state.snapshot
    ) {
      renderFromSnapshot(true)
    }
    if (persist) {
      saveThemeDraft(getCurrentTheme())
    }
    if (recordHistory) {
      recordHistoryCheckpoint(historyLabel)
    }
    if (previousVisualMode !== getCurrentTheme().visualMode) {
      postVisualModeToParent('update-theme')
    }
  }

  function applyTheme(theme) {
    const root = document.documentElement.style
    root.setProperty('--font-family', theme.fontFamily)
    root.setProperty('--bg-a', theme.bgA)
    root.setProperty('--bg-b', theme.bgB)
    root.setProperty('--panel-color', theme.panelColor)
    root.setProperty('--panel-opacity', `${theme.panelOpacity}`)
    root.setProperty('--panel-bg', hexToRgba(theme.panelColor, theme.panelOpacity))
    root.setProperty('--panel-border-color', theme.panelBorder)
    root.setProperty('--panel-border', hexToRgba(theme.panelBorder, 0.36))
    root.setProperty('--text-main', theme.textMain)
    root.setProperty('--text-sub', theme.textSub)
    root.setProperty('--track', hexToRgba(theme.trackColor, theme.trackOpacity))
    root.setProperty('--fill-a', theme.fillA)
    root.setProperty('--fill-b', theme.fillB)
    root.setProperty('--bar-height', `${theme.barHeight}px`)
    root.setProperty('--bar-radius', `${theme.barRadius}px`)
    root.setProperty('--question-size', `${theme.questionSize}px`)
    root.setProperty('--label-size', `${theme.labelSize}px`)
    root.setProperty('--artifact-layout', theme.artifactLayout)
    root.setProperty('--grid-opacity', `${theme.gridOpacity}`)
    root.setProperty('--wrap-offset-x', '0px')
    root.setProperty('--wrap-offset-y', '0px')
    root.setProperty('--panel-offset-x', `${clamp(theme.panelX, -2400, 2400, 0)}px`)
    root.setProperty('--panel-offset-y', `${clamp(theme.panelY, -2400, 2400, 0)}px`)
    root.setProperty('--panel-scale-x', `${clamp(theme.panelScaleX, 0.35, 2.8, 1)}`)
    root.setProperty('--panel-scale-y', `${clamp(theme.panelScaleY, 0.35, 2.8, 1)}`)

    el.bgImage.style.backgroundImage = theme.bgImageUrl
      ? `url("${theme.bgImageUrl.replace(/"/g, '\\"')}")`
      : 'none'
    el.bgImage.style.opacity = `${theme.bgImageOpacity}`
    el.bgOverlay.style.backgroundColor = theme.overlayColor
    el.bgOverlay.style.opacity = `${theme.overlayOpacity}`
    el.gridBg.style.display = Number(theme.gridOpacity) > 0 ? 'block' : 'none'
    el.gridBg.style.opacity = `${theme.gridOpacity}`
    applyElementOffset(
      el.bgImage,
      theme.bgImageX,
      theme.bgImageY,
      theme.bgImageScaleX,
      theme.bgImageScaleY
    )
    applyElementOffset(
      el.bgOverlay,
      theme.bgOverlayX,
      theme.bgOverlayY,
      theme.bgOverlayScaleX,
      theme.bgOverlayScaleY
    )
    applyElementOffset(el.gridBg, theme.gridX, theme.gridY, theme.gridScaleX, theme.gridScaleY)
    applyElementOffset(el.headLeft, 0, 0, 1, 1)
    applyHeaderTextObjects()
    applyElementOffset(el.metaBar, theme.metaX, theme.metaY, 1, 1)
    applyElementOffset(el.footer, theme.footerX, theme.footerY, 1, 1)
    applyElementBoxSize(el.headLeft, null, null)
    applyElementBoxSize(el.metaBar, theme.metaBoxWidth, theme.metaBoxHeight)
    applyElementBoxSize(el.footer, theme.footerBoxWidth, theme.footerBoxHeight)

    applyImageAsset(el.customLogo, {
      url: theme.logoUrl,
      width: `${theme.logoWidth}px`,
      opacity: `${theme.logoOpacity}`,
      left: `${theme.logoX}%`,
      top: `${theme.logoY}%`,
      scaleX: theme.logoScaleX,
      scaleY: theme.logoScaleY
    })

    applyImageAsset(el.customAsset, {
      url: theme.assetUrl,
      width: `${theme.assetWidth}px`,
      opacity: `${theme.assetOpacity}`,
      left: `${theme.assetX}%`,
      top: `${theme.assetY}%`,
      scaleX: theme.assetScaleX,
      scaleY: theme.assetScaleY
    })
    applyDeletedStaticTargets(theme)
    syncArtifactComposerVisibility()
    scheduleResizeSelectionUpdate()
    syncBgDropzoneUi()
  }

  function syncThemeControls() {
    for (const spec of themeControls) {
      const input = controlElements[spec.id]
      if (!input) {
        continue
      }
      const value = getCurrentTheme()[spec.key]
      if (spec.type === 'checkbox') {
        input.checked = Boolean(value)
      } else {
        input.value = value == null ? '' : String(value)
      }
    }
    syncBgDropzoneUi()
  }

  function syncSingleControlValue(themeKey, value) {
    const spec = themeControls.find((entry) => entry.key === themeKey)
    if (!spec) {
      return
    }
    const input = controlElements[spec.id]
    if (!input) {
      return
    }
    if (spec.type === 'checkbox') {
      input.checked = Boolean(value)
      return
    }
    input.value = value == null ? '' : String(Math.round(Number(value)))
  }

  function bindImageUpload(inputId, themeKey, successText) {
    const input = document.getElementById(inputId)
    if (!input) {
      return
    }
    input.addEventListener('change', async (event) => {
      const target = event.target
      const file = target?.files?.[0]
      if (!file) {
        return
      }
      try {
        const dataUrl = await readFileAsDataUrl(file)
        updateTheme({ [themeKey]: dataUrl }, { historyLabel: 'Update image asset' })
        showThemeFeedback(successText, 'success')
      } catch {
        showThemeFeedback('File upload failed.', 'error')
      } finally {
        input.value = ''
      }
    })
  }

  function syncBgDropzoneUi() {
    const zone = document.getElementById('theme-bg-image-dropzone')
    const clearBtn = document.getElementById('theme-bg-image-clear')
    if (!zone) {
      return
    }
    const url = asText(getCurrentTheme().bgImageUrl)
    const has = Boolean(url)
    zone.classList.toggle('theme-bg-dropzone--has-image', has)
    if (has) {
      const safe = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      zone.style.backgroundImage = `url("${safe}")`
    } else {
      zone.style.backgroundImage = ''
    }
    const label = zone.querySelector('.theme-bg-dropzone-label')
    const hint = zone.querySelector('.theme-bg-dropzone-hint')
    if (label) {
      label.textContent = has
        ? 'Image applied — drop or click to replace'
        : 'Drop an image here, or click to browse'
    }
    if (hint) {
      if (has) {
        hint.style.display = 'none'
      } else {
        hint.style.display = 'block'
        hint.textContent = 'PNG, JPG, WebP, GIF, SVG'
      }
    }
    if (clearBtn) {
      clearBtn.hidden = !has
    }
  }

  function setupBackgroundDropzone() {
    const zone = document.getElementById('theme-bg-image-dropzone')
    const input = document.getElementById('theme-bg-image-upload')
    const clearBtn = document.getElementById('theme-bg-image-clear')
    if (!zone || !input) {
      return
    }
    const prevent = (event) => {
      event.preventDefault()
      event.stopPropagation()
    }
    ;['dragenter', 'dragover'].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        prevent(event)
        zone.classList.add('theme-bg-dropzone--drag')
      })
    })
    zone.addEventListener('dragleave', (event) => {
      prevent(event)
      zone.classList.remove('theme-bg-dropzone--drag')
    })
    zone.addEventListener('drop', async (event) => {
      prevent(event)
      zone.classList.remove('theme-bg-dropzone--drag')
      const file = event.dataTransfer?.files?.[0]
      if (!file || !file.type.startsWith('image/')) {
        showThemeFeedback('Drop an image file.', 'error')
        return
      }
      try {
        const dataUrl = await readFileAsDataUrl(file)
        updateTheme({ bgImageUrl: dataUrl }, { historyLabel: 'Update design' })
        showThemeFeedback('Background image applied.', 'success')
      } catch {
        showThemeFeedback('Could not read that image.', 'error')
      }
    })
    zone.addEventListener('click', (event) => {
      if (event.target === clearBtn || (clearBtn && clearBtn.contains(event.target))) {
        return
      }
      input.click()
    })
    zone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        input.click()
      }
    })
    if (clearBtn) {
      clearBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        event.preventDefault()
        updateTheme({ bgImageUrl: '' }, { historyLabel: 'Clear background image' })
        showThemeFeedback('Background image removed.', 'success')
      })
    }
  }

  return {
    bindThemeControls,
    updateTheme,
    applyTheme,
    syncThemeControls,
    syncSingleControlValue,
    bindImageUpload,
    setupBackgroundDropzone
  }
}

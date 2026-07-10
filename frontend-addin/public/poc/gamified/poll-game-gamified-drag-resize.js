/**
 * Canvas drag/resize engine for the gamified station: pointer-driven move
 * and resize of every stage object (panel, background layers, header text,
 * logo/asset images, option rows and their text parts), the resize selection
 * box, the per-node drag/resize profile registries, position reset, and the
 * shared canvas-object geometry helpers (applyElementOffset,
 * applyElementBoxSize, the header/option text flow subsystem,
 * applyImageAsset, applyDeletedStaticTargets).
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 8). The engine owns its
 * interaction state: dragState/resizeState/dragProfiles/resizeProfiles live
 * here and the three externally-read objects are returned BY REFERENCE so
 * app.js call sites (ribbon guard, artifact-mode sync, unload cleanup) read
 * them unchanged. The engine mutates the live theme object in place while
 * dragging (cheap incremental updates) and only routes through updateTheme
 * on release — hence every read of the old `currentTheme` binding became
 * getCurrentTheme() so it always operates on the current object after a
 * library/theme swap replaces it.
 */
import { DRAG_START_THRESHOLD_PX, MIN_RESIZE_HANDLE_SIZE_PX } from './poll-game-gamified-constants.js'
import { defaultTheme, sanitizeOptionalDimension } from './poll-game-gamified-theme.js'
import { asText, clamp, clone } from './poll-game-gamified-utils.js'

export function createDragResizeEngine(deps) {
  const {
    state,
    el,
    getCurrentTheme,
    // App callbacks under their original closure names.
    updateTheme,
    syncSingleControlValue,
    saveThemeDraft,
    recordHistoryCheckpoint,
    renderFromSnapshot,
    showThemeFeedback,
    getOptionDeleteTargetKey
  } = deps

  const dragState = {
    enabled: false,
    active: null,
    pending: null
  }
  const dragProfiles = new WeakMap()
  const resizeProfiles = new WeakMap()
  const resizeState = {
    selectedNode: null,
    active: null,
    rafId: null
  }

  function setupDragInteractions() {
    setDragMode(true, { announce: false })

    window.addEventListener('pointermove', handleDragPointerMove)
    window.addEventListener('pointerup', handleDragPointerRelease)
    window.addEventListener('pointercancel', handleDragPointerRelease)

    const panelDragSpec = {
      unit: 'px',
      minX: -2400,
      maxX: 2400,
      minY: -2400,
      maxY: 2400,
      skipWhenHidden: false,
      requireDirectTarget: true
    }
    registerDragTarget(el.panelBgDrag, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragTop, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragRight, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragBottom, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragLeft, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragTl, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragTr, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragBr, 'panelX', 'panelY', panelDragSpec)
    registerDragTarget(el.panelDragBl, 'panelX', 'panelY', panelDragSpec)
    for (const panelNode of [
      el.panelBgDrag,
      el.panelDragTop,
      el.panelDragRight,
      el.panelDragBottom,
      el.panelDragLeft,
      el.panelDragTl,
      el.panelDragTr,
      el.panelDragBr,
      el.panelDragBl
    ]) {
      panelNode.addEventListener('pointerdown', () => {
        setActiveResizeTarget(el.panelBgDrag)
      })
    }

    registerDragTarget(el.customLogo, 'logoX', 'logoY', {
      unit: 'percent',
      minX: -40,
      maxX: 140,
      minY: -40,
      maxY: 140,
      skipWhenHidden: true
    })
    registerDragTarget(el.customAsset, 'assetX', 'assetY', {
      unit: 'percent',
      minX: -40,
      maxX: 140,
      minY: -40,
      maxY: 140,
      skipWhenHidden: true
    })

    registerDragTarget(el.bgImage, 'bgImageX', 'bgImageY', {
      unit: 'px',
      minX: -2400,
      maxX: 2400,
      minY: -2400,
      maxY: 2400,
      skipWhenHidden: false
    })
    registerDragTarget(el.bgOverlay, 'bgOverlayX', 'bgOverlayY', {
      unit: 'px',
      minX: -2400,
      maxX: 2400,
      minY: -2400,
      maxY: 2400,
      skipWhenHidden: false
    })
    registerDragTarget(el.gridBg, 'gridX', 'gridY', {
      unit: 'px',
      minX: -2400,
      maxX: 2400,
      minY: -2400,
      maxY: 2400,
      skipWhenHidden: false
    })
    registerDragTarget(el.eyebrow, 'eyebrowX', 'eyebrowY', {
      unit: 'px',
      minX: -1600,
      maxX: 1600,
      minY: -1200,
      maxY: 1200,
      skipWhenHidden: false,
      edgeGrabPadding: 18
    })
    registerDragTarget(el.question, 'questionX', 'questionY', {
      unit: 'px',
      minX: -1600,
      maxX: 1600,
      minY: -1200,
      maxY: 1200,
      skipWhenHidden: false,
      edgeGrabPadding: 22
    })
    registerDragTarget(el.metaBar, 'metaX', 'metaY', {
      unit: 'px',
      minX: -1600,
      maxX: 1600,
      minY: -1200,
      maxY: 1200,
      skipWhenHidden: false
    })
    registerDragTarget(el.footer, 'footerX', 'footerY', {
      unit: 'px',
      minX: -1600,
      maxX: 1600,
      minY: -1200,
      maxY: 1200,
      skipWhenHidden: false,
      edgeGrabPadding: 22
    })

    registerResizeTarget(
      el.panelBgDrag,
      createThemeResizeProfile({
        xKey: 'panelX',
        yKey: 'panelY',
        scaleXKey: 'panelScaleX',
        scaleYKey: 'panelScaleY',
        minScaleX: 0.35,
        maxScaleX: 2.8,
        minScaleY: 0.35,
        maxScaleY: 2.8,
        apply: () => {
          const root = document.documentElement.style
          root.setProperty('--panel-offset-x', `${clamp(getCurrentTheme().panelX, -2400, 2400, 0)}px`)
          root.setProperty('--panel-offset-y', `${clamp(getCurrentTheme().panelY, -2400, 2400, 0)}px`)
          root.setProperty(
            '--panel-scale-x',
            `${clamp(getCurrentTheme().panelScaleX, 0.35, 2.8, 1)}`
          )
          root.setProperty(
            '--panel-scale-y',
            `${clamp(getCurrentTheme().panelScaleY, 0.35, 2.8, 1)}`
          )
        }
      })
    )
    registerResizeTarget(
      el.bgImage,
      createThemeResizeProfile({
        xKey: 'bgImageX',
        yKey: 'bgImageY',
        scaleXKey: 'bgImageScaleX',
        scaleYKey: 'bgImageScaleY',
        minScaleX: 0.35,
        maxScaleX: 3.5,
        minScaleY: 0.35,
        maxScaleY: 3.5,
        apply: () => {
          applyElementOffset(
            el.bgImage,
            getCurrentTheme().bgImageX,
            getCurrentTheme().bgImageY,
            getCurrentTheme().bgImageScaleX,
            getCurrentTheme().bgImageScaleY
          )
        }
      })
    )
    registerResizeTarget(
      el.bgOverlay,
      createThemeResizeProfile({
        xKey: 'bgOverlayX',
        yKey: 'bgOverlayY',
        scaleXKey: 'bgOverlayScaleX',
        scaleYKey: 'bgOverlayScaleY',
        minScaleX: 0.35,
        maxScaleX: 3.5,
        minScaleY: 0.35,
        maxScaleY: 3.5,
        apply: () => {
          applyElementOffset(
            el.bgOverlay,
            getCurrentTheme().bgOverlayX,
            getCurrentTheme().bgOverlayY,
            getCurrentTheme().bgOverlayScaleX,
            getCurrentTheme().bgOverlayScaleY
          )
        }
      })
    )
    registerResizeTarget(
      el.gridBg,
      createThemeResizeProfile({
        xKey: 'gridX',
        yKey: 'gridY',
        scaleXKey: 'gridScaleX',
        scaleYKey: 'gridScaleY',
        minScaleX: 0.35,
        maxScaleX: 3.5,
        minScaleY: 0.35,
        maxScaleY: 3.5,
        apply: () => {
          applyElementOffset(
            el.gridBg,
            getCurrentTheme().gridX,
            getCurrentTheme().gridY,
            getCurrentTheme().gridScaleX,
            getCurrentTheme().gridScaleY
          )
        }
      })
    )
    registerResizeTarget(
      el.eyebrow,
      createThemeBoxResizeProfile({
        xKey: 'eyebrowX',
        yKey: 'eyebrowY',
        widthKey: 'eyebrowBoxWidth',
        heightKey: 'eyebrowBoxHeight',
        minWidth: 60,
        maxWidth: 1800,
        minHeight: 14,
        maxHeight: 420,
        apply: () => {
          applyHeaderTextObjects()
        }
      })
    )
    registerResizeTarget(
      el.question,
      createThemeBoxResizeProfile({
        xKey: 'questionX',
        yKey: 'questionY',
        widthKey: 'questionBoxWidth',
        heightKey: 'questionBoxHeight',
        minWidth: 120,
        maxWidth: 2200,
        minHeight: 40,
        maxHeight: 1400,
        apply: () => {
          applyHeaderTextObjects()
        }
      })
    )
    registerResizeTarget(
      el.metaBar,
      createThemeBoxResizeProfile({
        xKey: 'metaX',
        yKey: 'metaY',
        widthKey: 'metaBoxWidth',
        heightKey: 'metaBoxHeight',
        minWidth: 90,
        maxWidth: 1000,
        minHeight: 28,
        maxHeight: 220,
        apply: () => {
          applyElementOffset(el.metaBar, getCurrentTheme().metaX, getCurrentTheme().metaY, 1, 1)
          applyElementBoxSize(el.metaBar, getCurrentTheme().metaBoxWidth, getCurrentTheme().metaBoxHeight)
        }
      })
    )
    registerResizeTarget(
      el.footer,
      createThemeBoxResizeProfile({
        xKey: 'footerX',
        yKey: 'footerY',
        widthKey: 'footerBoxWidth',
        heightKey: 'footerBoxHeight',
        minWidth: 120,
        maxWidth: 2200,
        minHeight: 18,
        maxHeight: 420,
        apply: () => {
          applyElementOffset(el.footer, getCurrentTheme().footerX, getCurrentTheme().footerY, 1, 1)
          applyElementBoxSize(el.footer, getCurrentTheme().footerBoxWidth, getCurrentTheme().footerBoxHeight)
        }
      })
    )
    registerResizeTarget(
      el.customLogo,
      createThemeResizeProfile({
        xKey: 'logoX',
        yKey: 'logoY',
        scaleXKey: 'logoScaleX',
        scaleYKey: 'logoScaleY',
        unit: 'percent',
        minScaleX: 0.25,
        maxScaleX: 5,
        minScaleY: 0.25,
        maxScaleY: 5,
        keepAspectByDefault: true,
        apply: () => {
          el.customLogo.style.left = `${getCurrentTheme().logoX}%`
          el.customLogo.style.top = `${getCurrentTheme().logoY}%`
          el.customLogo.style.transform = `translate(-50%, -50%) scale(${clamp(
            getCurrentTheme().logoScaleX,
            0.25,
            5,
            1
          )}, ${clamp(getCurrentTheme().logoScaleY, 0.25, 5, 1)})`
        }
      })
    )
    registerResizeTarget(
      el.customAsset,
      createThemeResizeProfile({
        xKey: 'assetX',
        yKey: 'assetY',
        scaleXKey: 'assetScaleX',
        scaleYKey: 'assetScaleY',
        unit: 'percent',
        minScaleX: 0.25,
        maxScaleX: 5,
        minScaleY: 0.25,
        maxScaleY: 5,
        keepAspectByDefault: true,
        apply: () => {
          el.customAsset.style.left = `${getCurrentTheme().assetX}%`
          el.customAsset.style.top = `${getCurrentTheme().assetY}%`
          el.customAsset.style.transform = `translate(-50%, -50%) scale(${clamp(
            getCurrentTheme().assetScaleX,
            0.25,
            5,
            1
          )}, ${clamp(getCurrentTheme().assetScaleY, 0.25, 5, 1)})`
        }
      })
    )
  }

  function setupResizeInteractions() {
    for (const handle of el.resizeHandles) {
      handle.addEventListener('pointerdown', handleResizeHandlePointerDown)
    }
    window.addEventListener('pointermove', handleResizePointerMove)
    window.addEventListener('pointerup', handleResizePointerRelease)
    window.addEventListener('pointercancel', handleResizePointerRelease)
    document.addEventListener('pointerdown', handleResizeSelectionPointerDown, true)
    window.addEventListener('resize', scheduleResizeSelectionUpdate)
    window.addEventListener('scroll', scheduleResizeSelectionUpdate, true)
    scheduleResizeSelectionUpdate()
  }

  function createThemeResizeProfile(options = {}) {
    const xKey = asText(options.xKey)
    const yKey = asText(options.yKey)
    const scaleXKey = asText(options.scaleXKey)
    const scaleYKey = asText(options.scaleYKey)
    const unit = options.unit === 'percent' ? 'percent' : 'px'
    const minX = Number.isFinite(options.minX) ? Number(options.minX) : unit === 'percent' ? 0 : -2400
    const maxX = Number.isFinite(options.maxX) ? Number(options.maxX) : unit === 'percent' ? 100 : 2400
    const minY = Number.isFinite(options.minY) ? Number(options.minY) : unit === 'percent' ? 0 : -2400
    const maxY = Number.isFinite(options.maxY) ? Number(options.maxY) : unit === 'percent' ? 100 : 2400
    const minScaleX = Number.isFinite(options.minScaleX) ? Number(options.minScaleX) : 0.25
    const maxScaleX = Number.isFinite(options.maxScaleX) ? Number(options.maxScaleX) : 5
    const minScaleY = Number.isFinite(options.minScaleY) ? Number(options.minScaleY) : 0.25
    const maxScaleY = Number.isFinite(options.maxScaleY) ? Number(options.maxScaleY) : 5
    const apply = typeof options.apply === 'function' ? options.apply : () => {}

    return {
      unit,
      minX,
      maxX,
      minY,
      maxY,
      minScaleX,
      maxScaleX,
      minScaleY,
      maxScaleY,
      keepAspectByDefault: options.keepAspectByDefault === true,
      adjustPositionOnResize: options.adjustPositionOnResize !== false,
      getPosition: () => ({
        x: xKey ? clamp(getCurrentTheme()[xKey], minX, maxX, 0) : 0,
        y: yKey ? clamp(getCurrentTheme()[yKey], minY, maxY, 0) : 0
      }),
      setPosition: (x, y) => {
        if (xKey) {
          getCurrentTheme()[xKey] = clamp(x, minX, maxX, getCurrentTheme()[xKey])
        }
        if (yKey) {
          getCurrentTheme()[yKey] = clamp(y, minY, maxY, getCurrentTheme()[yKey])
        }
        apply()
      },
      getScale: () => ({
        x: scaleXKey ? clamp(getCurrentTheme()[scaleXKey], minScaleX, maxScaleX, 1) : 1,
        y: scaleYKey ? clamp(getCurrentTheme()[scaleYKey], minScaleY, maxScaleY, 1) : 1
      }),
      setScale: (scaleX, scaleY) => {
        if (scaleXKey) {
          getCurrentTheme()[scaleXKey] = clamp(scaleX, minScaleX, maxScaleX, getCurrentTheme()[scaleXKey])
        }
        if (scaleYKey) {
          getCurrentTheme()[scaleYKey] = clamp(scaleY, minScaleY, maxScaleY, getCurrentTheme()[scaleYKey])
        }
        apply()
      }
    }
  }

  function createThemeBoxResizeProfile(options = {}) {
    const xKey = asText(options.xKey)
    const yKey = asText(options.yKey)
    const widthKey = asText(options.widthKey)
    const heightKey = asText(options.heightKey)
    const unit = options.unit === 'percent' ? 'percent' : 'px'
    const minX = Number.isFinite(options.minX) ? Number(options.minX) : unit === 'percent' ? 0 : -2400
    const maxX = Number.isFinite(options.maxX) ? Number(options.maxX) : unit === 'percent' ? 100 : 2400
    const minY = Number.isFinite(options.minY) ? Number(options.minY) : unit === 'percent' ? 0 : -2400
    const maxY = Number.isFinite(options.maxY) ? Number(options.maxY) : unit === 'percent' ? 100 : 2400
    const minWidth = Number.isFinite(options.minWidth) ? Number(options.minWidth) : 60
    const maxWidth = Number.isFinite(options.maxWidth) ? Number(options.maxWidth) : 2600
    const minHeight = Number.isFinite(options.minHeight) ? Number(options.minHeight) : 24
    const maxHeight = Number.isFinite(options.maxHeight) ? Number(options.maxHeight) : 1800
    const apply = typeof options.apply === 'function' ? options.apply : () => {}

    return {
      unit,
      minX,
      maxX,
      minY,
      maxY,
      resizeMode: 'box',
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      keepAspectByDefault: options.keepAspectByDefault === true,
      adjustPositionOnResize: options.adjustPositionOnResize !== false,
      getPosition: () => ({
        x: xKey ? clamp(getCurrentTheme()[xKey], minX, maxX, 0) : 0,
        y: yKey ? clamp(getCurrentTheme()[yKey], minY, maxY, 0) : 0
      }),
      setPosition: (x, y) => {
        if (xKey) {
          getCurrentTheme()[xKey] = clamp(x, minX, maxX, getCurrentTheme()[xKey])
        }
        if (yKey) {
          getCurrentTheme()[yKey] = clamp(y, minY, maxY, getCurrentTheme()[yKey])
        }
        apply()
      },
      getSize: () => ({
        width: widthKey
          ? sanitizeOptionalDimension(getCurrentTheme()[widthKey], minWidth, maxWidth, null)
          : null,
        height: heightKey
          ? sanitizeOptionalDimension(getCurrentTheme()[heightKey], minHeight, maxHeight, null)
          : null
      }),
      setSize: (width, height) => {
        if (widthKey) {
          getCurrentTheme()[widthKey] = sanitizeOptionalDimension(width, minWidth, maxWidth, null)
        }
        if (heightKey) {
          getCurrentTheme()[heightKey] = sanitizeOptionalDimension(height, minHeight, maxHeight, null)
        }
        apply()
      }
    }
  }

  function registerResizeTarget(node, options = {}) {
    if (!node) {
      return
    }

    const dragProfile = dragProfiles.get(node)
    const unit =
      options.unit === 'percent' || options.unit === 'px'
        ? options.unit
        : dragProfile?.unit === 'percent'
          ? 'percent'
          : 'px'
    const minX = Number.isFinite(options.minX)
      ? Number(options.minX)
      : Number.isFinite(dragProfile?.minX)
        ? Number(dragProfile.minX)
        : unit === 'percent'
          ? 0
          : -2400
    const maxX = Number.isFinite(options.maxX)
      ? Number(options.maxX)
      : Number.isFinite(dragProfile?.maxX)
        ? Number(dragProfile.maxX)
        : unit === 'percent'
          ? 100
          : 2400
    const minY = Number.isFinite(options.minY)
      ? Number(options.minY)
      : Number.isFinite(dragProfile?.minY)
        ? Number(dragProfile.minY)
        : unit === 'percent'
          ? 0
          : -2400
    const maxY = Number.isFinite(options.maxY)
      ? Number(options.maxY)
      : Number.isFinite(dragProfile?.maxY)
        ? Number(dragProfile.maxY)
        : unit === 'percent'
          ? 100
          : 2400
    const minScaleX = Number.isFinite(options.minScaleX) ? Number(options.minScaleX) : 0.25
    const maxScaleX = Number.isFinite(options.maxScaleX) ? Number(options.maxScaleX) : 5
    const minScaleY = Number.isFinite(options.minScaleY) ? Number(options.minScaleY) : 0.25
    const maxScaleY = Number.isFinite(options.maxScaleY) ? Number(options.maxScaleY) : 5
    const resizeMode = options.resizeMode === 'box' ? 'box' : 'scale'
    const minWidth = Number.isFinite(options.minWidth) ? Number(options.minWidth) : MIN_RESIZE_HANDLE_SIZE_PX
    const maxWidth = Number.isFinite(options.maxWidth) ? Number(options.maxWidth) : 4000
    const minHeight = Number.isFinite(options.minHeight) ? Number(options.minHeight) : MIN_RESIZE_HANDLE_SIZE_PX
    const maxHeight = Number.isFinite(options.maxHeight) ? Number(options.maxHeight) : 4000
    const getPosition =
      typeof options.getPosition === 'function'
        ? options.getPosition
        : typeof dragProfile?.getPosition === 'function'
          ? dragProfile.getPosition
          : dragProfile?.xKey && dragProfile?.yKey
            ? () => ({
                x: clamp(getCurrentTheme()[dragProfile.xKey], minX, maxX, 0),
                y: clamp(getCurrentTheme()[dragProfile.yKey], minY, maxY, 0)
              })
            : null
    const setPosition =
      typeof options.setPosition === 'function'
        ? options.setPosition
        : typeof dragProfile?.setPosition === 'function'
          ? dragProfile.setPosition
          : dragProfile?.xKey && dragProfile?.yKey
            ? (x, y) => applyLiveDragThemePosition(dragProfile.xKey, dragProfile.yKey, x, y)
            : null
    const getScale =
      typeof options.getScale === 'function' ? options.getScale : () => ({ x: 1, y: 1 })
    const setScale = typeof options.setScale === 'function' ? options.setScale : () => {}
    const getSize =
      typeof options.getSize === 'function' ? options.getSize : () => ({ width: null, height: null })
    const setSize = typeof options.setSize === 'function' ? options.setSize : () => {}
    const onCommit = typeof options.onCommit === 'function' ? options.onCommit : null

    node.classList.add('resizable-target')
    resizeProfiles.set(node, {
      unit,
      minX,
      maxX,
      minY,
      maxY,
      minScaleX,
      maxScaleX,
      minScaleY,
      maxScaleY,
      resizeMode,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      keepAspectByDefault: options.keepAspectByDefault === true,
      adjustPositionOnResize: options.adjustPositionOnResize !== false,
      getPosition,
      setPosition,
      getScale,
      setScale,
      getSize,
      setSize,
      onCommit
    })
  }

  function handleResizeSelectionPointerDown(event) {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    // Keep object selection while interacting with editor UI controls (PowerPoint-style).
    if (
      target.closest('#settings-ribbon') ||
      target.closest('#settings-minimized') ||
      target.closest('#artifact-composer') ||
      target.closest('#artifact-composer-fab') ||
      target.closest('#ai-chat-shell') ||
      target.closest('#reset-positions-modal')
    ) {
      return
    }
    if (target.closest('#resize-selection') || target.closest('#selection-toolbar')) {
      return
    }
    const nextNode = target.closest('.resizable-target')
    if (nextNode && resizeProfiles.has(nextNode)) {
      setActiveResizeTarget(nextNode)
      return
    }
    if (target.closest('[data-text-control="true"]')) {
      return
    }
    clearActiveResizeTarget()
  }

  function handleResizeHandlePointerDown(event) {
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) {
      return
    }
    const direction = asText(handle.dataset.resizeHandle).toLowerCase()
    if (!direction) {
      return
    }
    const node = getActiveResizeTarget()
    if (!node) {
      return
    }
    const profile = resizeProfiles.get(node)
    if (!profile) {
      return
    }
    const startRect = getNodeLocalRect(node)
    if (!startRect || startRect.width <= 0 || startRect.height <= 0) {
      return
    }
    const startSize = profile.getSize()
    const startScale = profile.getScale()
    const startPosition =
      typeof profile.getPosition === 'function' ? profile.getPosition() : null

    event.preventDefault()
    event.stopPropagation()
    if (dragState.pending) {
      dragState.pending = null
    }
    if (dragState.active) {
      dragState.active.node.classList.remove('dragging')
      dragState.active = null
    }

    resizeState.active = {
      pointerId: event.pointerId,
      handle,
      direction,
      node,
      profile,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect,
      startSize,
      startScale,
      startPosition,
      changed: false
    }
    node.classList.add('dragging')
    try {
      handle.setPointerCapture(event.pointerId)
    } catch {}
    scheduleResizeSelectionUpdate()
  }

  function handleResizePointerMove(event) {
    const active = resizeState.active
    if (!active || active.pointerId !== event.pointerId) {
      return
    }
    if (event.cancelable) {
      event.preventDefault()
    }
    event.stopPropagation()

    const canvasScale = getCanvasScaleFactor()
    const dx = (event.clientX - active.startClientX) / canvasScale
    const dy = (event.clientY - active.startClientY) / canvasScale
    const direction = active.direction
    const moveEast = direction.includes('e')
    const moveWest = direction.includes('w')
    const moveSouth = direction.includes('s')
    const moveNorth = direction.includes('n')
    const hasHorizontal = moveEast || moveWest
    const hasVertical = moveNorth || moveSouth

    let nextWidth = active.startRect.width
    let nextHeight = active.startRect.height
    if (moveEast) {
      nextWidth = active.startRect.width + dx
    } else if (moveWest) {
      nextWidth = active.startRect.width - dx
    }
    if (moveSouth) {
      nextHeight = active.startRect.height + dy
    } else if (moveNorth) {
      nextHeight = active.startRect.height - dy
    }

    const profile = active.profile
    const keepAspect =
      hasHorizontal && hasVertical && (profile.keepAspectByDefault || event.shiftKey)
    if (keepAspect) {
      const ratio = active.startRect.width / Math.max(1, active.startRect.height)
      const widthFromHeight = nextHeight * ratio
      const heightFromWidth = nextWidth / Math.max(0.01, ratio)
      const widthDeltaRatio =
        Math.abs(nextWidth - active.startRect.width) / Math.max(1, active.startRect.width)
      const heightDeltaRatio =
        Math.abs(nextHeight - active.startRect.height) / Math.max(1, active.startRect.height)
      if (widthDeltaRatio >= heightDeltaRatio) {
        nextHeight = heightFromWidth
      } else {
        nextWidth = widthFromHeight
      }
    }

    nextWidth = Math.max(MIN_RESIZE_HANDLE_SIZE_PX, nextWidth)
    nextHeight = Math.max(MIN_RESIZE_HANDLE_SIZE_PX, nextHeight)

    let appliedWidth = nextWidth
    let appliedHeight = nextHeight
    if (profile.resizeMode === 'box') {
      const startBoxWidth = sanitizeOptionalDimension(
        active.startSize?.width,
        profile.minWidth,
        profile.maxWidth,
        active.startRect.width
      )
      const startBoxHeight = sanitizeOptionalDimension(
        active.startSize?.height,
        profile.minHeight,
        profile.maxHeight,
        active.startRect.height
      )
      const widthScale = nextWidth / Math.max(1, active.startRect.width)
      const heightScale = nextHeight / Math.max(1, active.startRect.height)
      appliedWidth = clamp(
        startBoxWidth * widthScale,
        profile.minWidth,
        profile.maxWidth,
        startBoxWidth
      )
      appliedHeight = clamp(
        startBoxHeight * heightScale,
        profile.minHeight,
        profile.maxHeight,
        startBoxHeight
      )
      profile.setSize(appliedWidth, appliedHeight)
    } else {
      const baseWidth = active.startRect.width / Math.max(0.01, active.startScale.x)
      const baseHeight = active.startRect.height / Math.max(0.01, active.startScale.y)
      let nextScaleX = nextWidth / Math.max(1, baseWidth)
      let nextScaleY = nextHeight / Math.max(1, baseHeight)
      nextScaleX = clamp(nextScaleX, profile.minScaleX, profile.maxScaleX, active.startScale.x)
      nextScaleY = clamp(nextScaleY, profile.minScaleY, profile.maxScaleY, active.startScale.y)
      appliedWidth = baseWidth * nextScaleX
      appliedHeight = baseHeight * nextScaleY
      profile.setScale(nextScaleX, nextScaleY)
    }

    const deltaWidth = appliedWidth - active.startRect.width
    const deltaHeight = appliedHeight - active.startRect.height

    let centerShiftX = 0
    let centerShiftY = 0
    const keepCenter = event.ctrlKey || event.metaKey
    if (profile.adjustPositionOnResize) {
      if (profile.resizeMode === 'box') {
        if (keepCenter) {
          if (hasHorizontal) {
            centerShiftX = -deltaWidth / 2
          }
          if (hasVertical) {
            centerShiftY = -deltaHeight / 2
          }
        } else {
          if (moveWest && !moveEast) {
            centerShiftX = -deltaWidth
          }
          if (moveNorth && !moveSouth) {
            centerShiftY = -deltaHeight
          }
        }
      } else if (!keepCenter) {
        if (moveEast && !moveWest) {
          centerShiftX = deltaWidth / 2
        } else if (moveWest && !moveEast) {
          centerShiftX = -deltaWidth / 2
        }
        if (moveSouth && !moveNorth) {
          centerShiftY = deltaHeight / 2
        } else if (moveNorth && !moveSouth) {
          centerShiftY = -deltaHeight / 2
        }
      }
    }

    if (
      profile.adjustPositionOnResize &&
      active.startPosition &&
      typeof profile.setPosition === 'function'
    ) {
      const wrapRect = getWrapRect()
      const wrapLocalWidth = wrapRect ? wrapRect.width / canvasScale : 0
      const wrapLocalHeight = wrapRect ? wrapRect.height / canvasScale : 0
      const deltaPosX =
        profile.unit === 'percent'
          ? wrapLocalWidth > 0
            ? (centerShiftX / wrapLocalWidth) * 100
            : 0
          : centerShiftX
      const deltaPosY =
        profile.unit === 'percent'
          ? wrapLocalHeight > 0
            ? (centerShiftY / wrapLocalHeight) * 100
            : 0
          : centerShiftY
      const nextPosX = clamp(
        active.startPosition.x + deltaPosX,
        profile.minX,
        profile.maxX,
        active.startPosition.x
      )
      const nextPosY = clamp(
        active.startPosition.y + deltaPosY,
        profile.minY,
        profile.maxY,
        active.startPosition.y
      )
      profile.setPosition(nextPosX, nextPosY)
    }
    active.changed = true
    scheduleResizeSelectionUpdate()
  }

  function handleResizePointerRelease(event) {
    const active = resizeState.active
    if (!active || active.pointerId !== event.pointerId) {
      return
    }

    resizeState.active = null
    active.node.classList.remove('dragging')
    try {
      active.handle.releasePointerCapture(event.pointerId)
    } catch {}

    if (active.changed) {
      if (active.profile.onCommit) {
        active.profile.onCommit()
      } else {
        saveThemeDraft(getCurrentTheme())
        recordHistoryCheckpoint('Resize object')
      }
      showThemeFeedback('Object resized.', 'success')
    }
    scheduleResizeSelectionUpdate()
  }

  function getActiveResizeTarget() {
    const node = resizeState.selectedNode
    if (!node || !node.isConnected || !resizeProfiles.has(node) || node.classList.contains('hidden')) {
      return null
    }
    return node
  }

  function setActiveResizeTarget(node) {
    if (!node || !resizeProfiles.has(node)) {
      return
    }
    if (resizeState.selectedNode === node) {
      scheduleResizeSelectionUpdate()
      return
    }
    resizeState.selectedNode = node
    scheduleResizeSelectionUpdate()
  }

  function clearActiveResizeTarget() {
    if (!resizeState.selectedNode) {
      return
    }
    resizeState.selectedNode = null
    hideResizeSelectionBox()
  }

  function scheduleResizeSelectionUpdate() {
    if (resizeState.rafId != null) {
      return
    }
    resizeState.rafId = requestAnimationFrame(() => {
      resizeState.rafId = null
      updateResizeSelectionUi()
    })
  }

  function updateResizeSelectionUi() {
    const activeDragNode =
      dragState.active?.node && resizeProfiles.has(dragState.active.node)
        ? dragState.active.node
        : null
    const activeResizeNode = resizeState.active?.node
    const selectedNode = getActiveResizeTarget()
    const node = activeResizeNode || selectedNode || activeDragNode
    if (!node) {
      hideResizeSelectionBox()
      return
    }
    if (!node.isConnected || node.classList.contains('hidden')) {
      clearActiveResizeTarget()
      hideResizeSelectionBox()
      return
    }
    const rect = getNodeLocalRect(node)
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      hideResizeSelectionBox()
      return
    }

    el.resizeSelection.classList.remove('hidden')
    el.resizeSelection.setAttribute('aria-hidden', 'false')
    el.resizeSelection.style.left = `${rect.left}px`
    el.resizeSelection.style.top = `${rect.top}px`
    el.resizeSelection.style.width = `${rect.width}px`
    el.resizeSelection.style.height = `${rect.height}px`
  }

  function hideResizeSelectionBox() {
    el.resizeSelection.classList.add('hidden')
    el.resizeSelection.setAttribute('aria-hidden', 'true')
  }

  function getNodeLocalRect(node) {
    if (!(node instanceof HTMLElement)) {
      return null
    }
    const wrapRect = getWrapRect()
    if (!wrapRect || wrapRect.width <= 0 || wrapRect.height <= 0) {
      return null
    }
    const nodeRect = node.getBoundingClientRect()
    if (!nodeRect || nodeRect.width <= 0 || nodeRect.height <= 0) {
      return null
    }
    const scale = getCanvasScaleFactor()
    return {
      left: (nodeRect.left - wrapRect.left) / scale,
      top: (nodeRect.top - wrapRect.top) / scale,
      width: nodeRect.width / scale,
      height: nodeRect.height / scale
    }
  }

  function setDragMode(enabled, options = {}) {
    const announce = options.announce !== false
    dragState.enabled = Boolean(enabled)
    document.body.classList.toggle('drag-mode', dragState.enabled)
    if (!dragState.enabled && dragState.active) {
      dragState.active.node.classList.remove('dragging')
      dragState.active = null
    }
    if (!dragState.enabled && dragState.pending) {
      dragState.pending = null
    }
    if (!dragState.enabled) {
      clearActiveResizeTarget()
    } else {
      scheduleResizeSelectionUpdate()
    }
    if (announce) {
      showThemeFeedback(
        dragState.enabled
          ? 'Drag and resize are enabled. Use object handles to resize like PowerPoint.'
          : 'Drag is disabled.',
        'success'
      )
    }
  }

  function registerDragTarget(node, xKey, yKey, options = {}) {
    if (!node) {
      return
    }
    node.classList.add('drag-target')
    attachDragBehavior(node, xKey, yKey, options)
  }

  function attachDragBehavior(node, xKey, yKey, options = {}) {
    const unit = options.unit === 'px' ? 'px' : 'percent'
    const minX = Number.isFinite(options.minX) ? Number(options.minX) : 0
    const maxX = Number.isFinite(options.maxX) ? Number(options.maxX) : 100
    const minY = Number.isFinite(options.minY) ? Number(options.minY) : 0
    const maxY = Number.isFinite(options.maxY) ? Number(options.maxY) : 100
    const defaultX = Number.isFinite(options.defaultX) ? Number(options.defaultX) : 0
    const defaultY = Number.isFinite(options.defaultY) ? Number(options.defaultY) : 0
    const skipWhenHidden = options.skipWhenHidden !== false
    const requireDirectTarget = options.requireDirectTarget === true
    const edgeGrabPadding = Number.isFinite(options.edgeGrabPadding)
      ? Math.max(0, Number(options.edgeGrabPadding))
      : 0
    const getPosition = typeof options.getPosition === 'function' ? options.getPosition : null
    const setPosition = typeof options.setPosition === 'function' ? options.setPosition : null
    const onCommit = typeof options.onCommit === 'function' ? options.onCommit : null
    dragProfiles.set(node, {
      unit,
      minX,
      maxX,
      minY,
      maxY,
      defaultX,
      defaultY,
      xKey,
      yKey,
      getPosition,
      setPosition,
      onCommit
    })

    node.addEventListener('pointerdown', (event) => {
      if (!dragState.enabled || (skipWhenHidden && node.classList.contains('hidden'))) {
        return
      }
      const targetElement = event.target instanceof Element ? event.target : null
      const richTextTarget = targetElement ? targetElement.closest('.rich-text-editable') : null
      if (richTextTarget && node.contains(richTextTarget)) {
        // PowerPoint-style: text click enters text editing, dragging uses object shell.
        if (!isPointerNearNodeEdge(node, event, edgeGrabPadding)) {
          return
        }
      }
      if (requireDirectTarget && event.target !== node) {
        return
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return
      }
      if (resizeProfiles.has(node)) {
        setActiveResizeTarget(node)
      }
      const wrapRect = getWrapRect()
      if (!wrapRect || wrapRect.width <= 0 || wrapRect.height <= 0) {
        return
      }

      const startPosition = getPosition ? getPosition() : null
      const dragDescriptor = {
        node,
        xKey,
        yKey,
        unit,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        minX,
        maxX,
        minY,
        maxY,
        startX: clamp(startPosition?.x ?? getCurrentTheme()[xKey], minX, maxX, defaultX),
        startY: clamp(startPosition?.y ?? getCurrentTheme()[yKey], minY, maxY, defaultY),
        setPosition,
        onCommit,
        suppressNativePointerBehavior: !(richTextTarget && node.contains(richTextTarget))
      }

      if (dragState.pending && dragState.pending.pointerId !== event.pointerId) {
        dragState.pending = null
      }
      if (dragDescriptor.suppressNativePointerBehavior) {
        event.preventDefault()
        event.stopPropagation()
      }
      dragState.pending = dragDescriptor
    })
  }

  function handleDragPointerMove(event) {
    if (resizeState.active) {
      return
    }
    let active = dragState.active
    if (!active) {
      const pending = dragState.pending
      if (!pending || pending.pointerId !== event.pointerId) {
        return
      }
      const distance = Math.hypot(
        event.clientX - pending.startClientX,
        event.clientY - pending.startClientY
      )
      if (distance < DRAG_START_THRESHOLD_PX) {
        return
      }
      if (event.cancelable) {
        event.preventDefault()
      }
      if (pending.suppressNativePointerBehavior) {
        event.stopPropagation()
      }
      activateDragTarget(pending, event)
      dragState.pending = null
      active = dragState.active
    }
    if (!active || active.pointerId !== event.pointerId) {
      return
    }
    const wrapRect = getWrapRect()
    if (!wrapRect || wrapRect.width <= 0 || wrapRect.height <= 0) {
      return
    }

    if (event.cancelable) {
      event.preventDefault()
    }
    const canvasScale = getCanvasScaleFactor()
    const deltaX =
      active.unit === 'px'
        ? (event.clientX - active.startClientX) / canvasScale
        : ((event.clientX - active.startClientX) / wrapRect.width) * 100
    const deltaY =
      active.unit === 'px'
        ? (event.clientY - active.startClientY) / canvasScale
        : ((event.clientY - active.startClientY) / wrapRect.height) * 100
    const nextX = clamp(active.startX + deltaX, active.minX, active.maxX, active.startX)
    const nextY = clamp(active.startY + deltaY, active.minY, active.maxY, active.startY)

    if (active.setPosition) {
      active.setPosition(nextX, nextY)
      scheduleResizeSelectionUpdate()
      return
    }

    if (active.xKey && active.yKey) {
      applyLiveDragThemePosition(active.xKey, active.yKey, nextX, nextY)
      syncSingleControlValue(active.xKey, nextX)
      syncSingleControlValue(active.yKey, nextY)
      scheduleResizeSelectionUpdate()
    }
  }

  function handleDragPointerRelease(event) {
    const active = dragState.active
    if (!active || active.pointerId !== event.pointerId) {
      const pending = dragState.pending
      if (pending && pending.pointerId === event.pointerId) {
        dragState.pending = null
      }
      return
    }

    active.node.classList.remove('dragging')
    try {
      active.node.releasePointerCapture(event.pointerId)
    } catch {}
    dragState.active = null
    if (active.onCommit) {
      active.onCommit()
      scheduleResizeSelectionUpdate()
      return
    }
    saveThemeDraft(getCurrentTheme())
    recordHistoryCheckpoint('Move object')
    showThemeFeedback('Object position updated. Save theme to keep it in a named preset.', 'success')
    scheduleResizeSelectionUpdate()
  }

  function activateDragTarget(descriptor, event) {
    if (!descriptor) {
      return
    }
    dragState.active = descriptor
    descriptor.node.classList.add('dragging')
    try {
      descriptor.node.setPointerCapture(event.pointerId)
    } catch {}
  }

  function getCanvasScaleFactor() {
    const rootStyle = window.getComputedStyle(document.documentElement)
    const raw = Number.parseFloat(rootStyle.getPropertyValue('--canvas-scale'))
    if (!Number.isFinite(raw) || raw <= 0) {
      return 1
    }
    return raw
  }

  function applyLiveDragThemePosition(xKey, yKey, xValue, yValue) {
    getCurrentTheme()[xKey] = xValue
    getCurrentTheme()[yKey] = yValue

    if (xKey === 'panelX' && yKey === 'panelY') {
      const root = document.documentElement.style
      root.setProperty('--panel-offset-x', `${xValue}px`)
      root.setProperty('--panel-offset-y', `${yValue}px`)
      return
    }
    if (xKey === 'bgImageX' && yKey === 'bgImageY') {
      applyElementOffset(
        el.bgImage,
        xValue,
        yValue,
        getCurrentTheme().bgImageScaleX,
        getCurrentTheme().bgImageScaleY
      )
      return
    }
    if (xKey === 'bgOverlayX' && yKey === 'bgOverlayY') {
      applyElementOffset(
        el.bgOverlay,
        xValue,
        yValue,
        getCurrentTheme().bgOverlayScaleX,
        getCurrentTheme().bgOverlayScaleY
      )
      return
    }
    if (xKey === 'gridX' && yKey === 'gridY') {
      applyElementOffset(
        el.gridBg,
        xValue,
        yValue,
        getCurrentTheme().gridScaleX,
        getCurrentTheme().gridScaleY
      )
      return
    }
    if (xKey === 'eyebrowX' && yKey === 'eyebrowY') {
      applyHeaderTextObjects()
      return
    }
    if (xKey === 'questionX' && yKey === 'questionY') {
      applyHeaderTextObjects()
      return
    }
    if (xKey === 'metaX' && yKey === 'metaY') {
      applyElementOffset(el.metaBar, xValue, yValue, 1, 1)
      applyElementBoxSize(el.metaBar, getCurrentTheme().metaBoxWidth, getCurrentTheme().metaBoxHeight)
      return
    }
    if (xKey === 'footerX' && yKey === 'footerY') {
      applyElementOffset(el.footer, xValue, yValue, 1, 1)
      applyElementBoxSize(el.footer, getCurrentTheme().footerBoxWidth, getCurrentTheme().footerBoxHeight)
      return
    }
    if (xKey === 'logoX' && yKey === 'logoY') {
      el.customLogo.style.left = `${xValue}%`
      el.customLogo.style.top = `${yValue}%`
      el.customLogo.style.transform = `translate(-50%, -50%) scale(${clamp(
        getCurrentTheme().logoScaleX,
        0.25,
        5,
        1
      )}, ${clamp(getCurrentTheme().logoScaleY, 0.25, 5, 1)})`
      return
    }
    if (xKey === 'assetX' && yKey === 'assetY') {
      el.customAsset.style.left = `${xValue}%`
      el.customAsset.style.top = `${yValue}%`
      el.customAsset.style.transform = `translate(-50%, -50%) scale(${clamp(
        getCurrentTheme().assetScaleX,
        0.25,
        5,
        1
      )}, ${clamp(getCurrentTheme().assetScaleY, 0.25, 5, 1)})`
      return
    }

    updateTheme(
      {
        [xKey]: xValue,
        [yKey]: yValue
      },
      { persist: false, recordHistory: false }
    )
  }

  function ensureDeletedObjectsMap() {
    if (!getCurrentTheme().deletedObjects || typeof getCurrentTheme().deletedObjects !== 'object') {
      getCurrentTheme().deletedObjects = {}
    }
    return getCurrentTheme().deletedObjects
  }

  function isThemeObjectDeleted(targetKey) {
    const key = asText(targetKey)
    if (!key) {
      return false
    }
    const map = ensureDeletedObjectsMap()
    return Boolean(map[key])
  }

  function setThemeObjectDeleted(targetKey, deleted = true) {
    const key = asText(targetKey)
    if (!key) {
      return
    }
    const map = ensureDeletedObjectsMap()
    if (deleted) {
      map[key] = true
      return
    }
    delete map[key]
  }

  function applyDeletedStaticTargets(theme) {
    const deletedObjects =
      theme && typeof theme.deletedObjects === 'object' ? theme.deletedObjects : {}
    const isDeleted = (targetKey) => Boolean(deletedObjects[targetKey])

    el.bgImage.classList.toggle('hidden', isDeleted('bgImage'))
    el.bgOverlay.classList.toggle('hidden', isDeleted('overlay'))
    el.gridBg.classList.toggle('hidden', isDeleted('grid'))
    el.eyebrow.classList.toggle('hidden', isDeleted('eyebrow'))
    el.question.classList.toggle('hidden', isDeleted('question'))
    el.metaBar.classList.toggle('hidden', isDeleted('meta'))
    el.options.classList.toggle('hidden', isDeleted('options'))
    el.footer.classList.toggle('hidden', isDeleted('footer'))

    if (isDeleted('logo')) {
      el.customLogo.classList.add('hidden')
    }
    if (isDeleted('asset')) {
      el.customAsset.classList.add('hidden')
    }

    const panelDeleted = isDeleted('panel')
    el.panelBgDrag.classList.toggle('hidden', panelDeleted)
    for (const handle of [
      el.panelDragTop,
      el.panelDragRight,
      el.panelDragBottom,
      el.panelDragLeft,
      el.panelDragTl,
      el.panelDragTr,
      el.panelDragBr,
      el.panelDragBl
    ]) {
      handle.classList.toggle('hidden', panelDeleted)
    }
    el.wrap.classList.toggle('panel-deleted', panelDeleted)
  }

  function applyDeletedOptionTarget(node, poll, optionId, part = 'row') {
    if (!(node instanceof HTMLElement)) {
      return
    }
    const key = getOptionDeleteTargetKey(poll, optionId, part)
    node.classList.toggle('hidden', Boolean(key && isThemeObjectDeleted(key)))
  }

  function ensureOptionOffsets() {
    if (!getCurrentTheme().optionOffsets || typeof getCurrentTheme().optionOffsets !== 'object') {
      getCurrentTheme().optionOffsets = {}
    }
    return getCurrentTheme().optionOffsets
  }

  function ensureOptionScales() {
    if (!getCurrentTheme().optionScales || typeof getCurrentTheme().optionScales !== 'object') {
      getCurrentTheme().optionScales = {}
    }
    return getCurrentTheme().optionScales
  }

  function ensureOptionSizes() {
    if (!getCurrentTheme().optionSizes || typeof getCurrentTheme().optionSizes !== 'object') {
      getCurrentTheme().optionSizes = {}
    }
    return getCurrentTheme().optionSizes
  }

  function ensureOptionAnchors() {
    if (!getCurrentTheme().optionAnchors || typeof getCurrentTheme().optionAnchors !== 'object') {
      getCurrentTheme().optionAnchors = {}
    }
    return getCurrentTheme().optionAnchors
  }

  function getOptionOffsetKey(optionId, part = 'row') {
    const safeId = asText(optionId)
    if (!safeId) {
      return ''
    }
    const safePart = asText(part).toLowerCase()
    if (!safePart || safePart === 'row') {
      return safeId
    }
    return `${safeId}::${safePart}`
  }

  function getOptionDragOffset(optionId, part = 'row') {
    const map = ensureOptionOffsets()
    const key = getOptionOffsetKey(optionId, part)
    const entry = key ? map[key] : null
    if (!entry || typeof entry !== 'object') {
      return { x: 0, y: 0 }
    }
    return {
      x: clamp(entry.x, -2400, 2400, 0),
      y: clamp(entry.y, -2400, 2400, 0)
    }
  }

  function setOptionDragOffset(optionId, x, y, part = 'row') {
    const key = getOptionOffsetKey(optionId, part)
    if (!key) {
      return
    }
    const map = ensureOptionOffsets()
    map[key] = {
      x: clamp(x, -2400, 2400, 0),
      y: clamp(y, -2400, 2400, 0)
    }
  }

  function getOptionDragScale(optionId, part = 'row') {
    const map = ensureOptionScales()
    const key = getOptionOffsetKey(optionId, part)
    const entry = key ? map[key] : null
    if (!entry || typeof entry !== 'object') {
      return { x: 1, y: 1 }
    }
    return {
      x: clamp(entry.x, 0.25, 5, 1),
      y: clamp(entry.y, 0.25, 5, 1)
    }
  }

  function setOptionDragScale(optionId, x, y, part = 'row') {
    const key = getOptionOffsetKey(optionId, part)
    if (!key) {
      return
    }
    const map = ensureOptionScales()
    map[key] = {
      x: clamp(x, 0.25, 5, 1),
      y: clamp(y, 0.25, 5, 1)
    }
  }

  function getOptionBoxSize(optionId, part = 'row') {
    const map = ensureOptionSizes()
    const key = getOptionOffsetKey(optionId, part)
    const entry = key ? map[key] : null
    if (!entry || typeof entry !== 'object') {
      return { width: null, height: null }
    }
    return {
      width: sanitizeOptionalDimension(entry.width, 24, 2600, null),
      height: sanitizeOptionalDimension(entry.height, 18, 1400, null)
    }
  }

  function setOptionBoxSize(optionId, width, height, part = 'row') {
    const key = getOptionOffsetKey(optionId, part)
    if (!key) {
      return
    }
    const map = ensureOptionSizes()
    map[key] = {
      width: sanitizeOptionalDimension(width, 24, 2600, null),
      height: sanitizeOptionalDimension(height, 18, 1400, null)
    }
  }

  function getOptionTextAnchor(optionId, part = 'row') {
    const map = ensureOptionAnchors()
    const key = getOptionOffsetKey(optionId, part)
    const entry = key ? map[key] : null
    if (!entry || typeof entry !== 'object') {
      return { x: null, y: null }
    }
    return {
      x: Number.isFinite(entry.x) ? clamp(entry.x, -2400, 2400, 0) : null,
      y: Number.isFinite(entry.y) ? clamp(entry.y, -2400, 2400, 0) : null
    }
  }

  function setOptionTextAnchor(optionId, x, y, part = 'row') {
    const key = getOptionOffsetKey(optionId, part)
    if (!key) {
      return
    }
    const map = ensureOptionAnchors()
    map[key] = {
      x: Number.isFinite(x) ? clamp(x, -2400, 2400, 0) : null,
      y: Number.isFinite(y) ? clamp(y, -2400, 2400, 0) : null
    }
  }

  function clearOptionTextAnchor(optionId, part = 'row') {
    const key = getOptionOffsetKey(optionId, part)
    if (!key) {
      return
    }
    const map = ensureOptionAnchors()
    delete map[key]
  }

  function isOptionTextPart(part = 'row') {
    const normalized = asText(part).toLowerCase()
    return normalized === 'label' || normalized === 'stats'
  }

  function hasCustomOptionTextSize(optionId, part = 'row') {
    if (!isOptionTextPart(part)) {
      return false
    }
    const size = getOptionBoxSize(optionId, part)
    return Number.isFinite(size.width) || Number.isFinite(size.height)
  }

  function lockOptionLabelRowHeight(row, rowRectOverride = null) {
    if (!(row instanceof HTMLElement) || row.dataset.optionRowFlowLocked === '1') {
      return
    }
    const scale = getCanvasScaleFactor()
    const rowRect = rowRectOverride || row.getBoundingClientRect()
    const lockedHeight = Math.max(24, rowRect.height / Math.max(0.01, scale))
    row.style.minHeight = `${lockedHeight}px`
    row.dataset.optionRowFlowLocked = '1'
  }

  function updateOptionLabelRowLockState(row) {
    if (!(row instanceof HTMLElement)) {
      return
    }
    const hasDetachedText = Boolean(row.querySelector('[data-option-detached-flow="1"]'))
    if (hasDetachedText) {
      return
    }
    row.style.removeProperty('min-height')
    row.dataset.optionRowFlowLocked = '0'
  }

  function isRectLike(value) {
    return Boolean(
      value &&
        Number.isFinite(value.left) &&
        Number.isFinite(value.top) &&
        Number.isFinite(value.width) &&
        Number.isFinite(value.height)
    )
  }

  function detachOptionTextFromFlow(node, optionId, part = 'row', geometry = null) {
    if (!(node instanceof HTMLElement) || !isOptionTextPart(part)) {
      return
    }
    const row = node.closest('.label-row')
    if (!(row instanceof HTMLElement)) {
      return
    }

    if (node.dataset.optionDetachedFlow !== '1') {
      const storedAnchor = getOptionTextAnchor(optionId, part)
      let baseLeft = storedAnchor.x
      let baseTop = storedAnchor.y
      if (!Number.isFinite(baseLeft) || !Number.isFinite(baseTop)) {
        const scale = getCanvasScaleFactor()
        const rowRect = isRectLike(geometry?.rowRect) ? geometry.rowRect : row.getBoundingClientRect()
        const nodeRect = isRectLike(geometry?.nodeRect) ? geometry.nodeRect : node.getBoundingClientRect()
        const offset = getOptionDragOffset(optionId, part)
        baseLeft =
          rowRect.width > 0 && nodeRect.width > 0
            ? (nodeRect.left - rowRect.left) / Math.max(0.01, scale) - offset.x
            : 0
        baseTop =
          rowRect.height > 0 && nodeRect.height > 0
            ? (nodeRect.top - rowRect.top) / Math.max(0.01, scale) - offset.y
            : 0
        setOptionTextAnchor(optionId, baseLeft, baseTop, part)
      }
      node.style.left = `${baseLeft}px`
      node.style.top = `${baseTop}px`
      node.dataset.optionDetachedFlow = '1'
    }

    node.style.position = 'absolute'
    node.style.margin = '0'
    node.style.display = 'inline-block'
    node.style.maxWidth = 'none'
  }

  function restoreOptionTextFlow(node, part = 'row', optionId = '') {
    if (!(node instanceof HTMLElement) || !isOptionTextPart(part)) {
      return
    }
    const row = node.closest('.label-row')
    node.style.removeProperty('position')
    node.style.removeProperty('left')
    node.style.removeProperty('top')
    node.style.removeProperty('margin')
    node.style.removeProperty('display')
    node.style.removeProperty('max-width')
    delete node.dataset.optionDetachedFlow
    if (optionId) {
      clearOptionTextAnchor(optionId, part)
    }
    updateOptionLabelRowLockState(row)
  }

  function syncOptionTextPairFlow(node, optionId) {
    if (!(node instanceof HTMLElement)) {
      return
    }
    const row = node.closest('.label-row')
    if (!(row instanceof HTMLElement)) {
      return
    }
    const label = row.querySelector('.label')
    const stats = row.querySelector('.stats')
    if (!(label instanceof HTMLElement) || !(stats instanceof HTMLElement)) {
      return
    }

    const shouldDetach =
      hasCustomOptionTextSize(optionId, 'label') || hasCustomOptionTextSize(optionId, 'stats')
    if (!shouldDetach) {
      restoreOptionTextFlow(label, 'label', optionId)
      restoreOptionTextFlow(stats, 'stats', optionId)
      return
    }

    if (label.dataset.optionDetachedFlow === '1' && stats.dataset.optionDetachedFlow === '1') {
      return
    }

    const rowRect = row.getBoundingClientRect()
    const labelRect = label.getBoundingClientRect()
    const statsRect = stats.getBoundingClientRect()
    lockOptionLabelRowHeight(row, rowRect)
    detachOptionTextFromFlow(label, optionId, 'label', { rowRect, nodeRect: labelRect })
    detachOptionTextFromFlow(stats, optionId, 'stats', { rowRect, nodeRect: statsRect })
  }

  function applyOptionBoxSize(node, optionId, part = 'row') {
    if (!node) {
      return
    }
    const size = getOptionBoxSize(optionId, part)
    if (isOptionTextPart(part)) {
      syncOptionTextPairFlow(node, optionId)
    }
    if (Number.isFinite(size.width)) {
      node.style.width = `${size.width}px`
      if (node instanceof HTMLSpanElement) {
        node.style.display = 'inline-block'
      }
    } else {
      node.style.removeProperty('width')
    }
    if (Number.isFinite(size.height)) {
      node.style.height = `${size.height}px`
      if (node instanceof HTMLSpanElement) {
        node.style.display = 'inline-block'
      }
    } else {
      node.style.removeProperty('height')
    }
  }

  function shouldScaleOptionPart(part = 'row') {
    const normalized = asText(part).toLowerCase()
    return normalized === 'row' || normalized === 'bar'
  }

  function applyOptionOffsetTransform(node, optionId, part = 'row') {
    const offset = getOptionDragOffset(optionId, part)
    if (shouldScaleOptionPart(part)) {
      const scale = getOptionDragScale(optionId, part)
      node.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale.x}, ${scale.y})`
      return
    }
    node.style.transform = `translate(${offset.x}px, ${offset.y}px)`
  }

  function registerOptionDragTarget(node, optionId, part = 'row', options = {}) {
    const edgeGrabPadding = Number.isFinite(options.edgeGrabPadding)
      ? Math.max(0, Number(options.edgeGrabPadding))
      : 0
    if (!node || !optionId || node.dataset.dragRegistered === '1') {
      return
    }
    node.dataset.dragRegistered = '1'
    node.dataset.optionDragPart = part
    node.classList.add('drag-target')
    attachDragBehavior(node, null, null, {
      unit: 'px',
      minX: -2400,
      maxX: 2400,
      minY: -2400,
      maxY: 2400,
      skipWhenHidden: false,
      edgeGrabPadding,
      getPosition: () => getOptionDragOffset(optionId, part),
      setPosition: (x, y) => {
        setOptionDragOffset(optionId, x, y, part)
        applyOptionOffsetTransform(node, optionId, part)
      }
    })
  }

  function registerOptionResizeTarget(node, optionId, part = 'row', options = {}) {
    if (!node || !optionId) {
      return
    }
    const resizeMode = asText(options.resizeMode).toLowerCase() === 'box' ? 'box' : 'scale'
    if (resizeMode === 'box') {
      registerResizeTarget(node, {
        unit: 'px',
        minX: -2400,
        maxX: 2400,
        minY: -2400,
        maxY: 2400,
        resizeMode: 'box',
        minWidth: Number.isFinite(options.minWidth) ? Number(options.minWidth) : 40,
        maxWidth: Number.isFinite(options.maxWidth) ? Number(options.maxWidth) : 2200,
        minHeight: Number.isFinite(options.minHeight) ? Number(options.minHeight) : 20,
        maxHeight: Number.isFinite(options.maxHeight) ? Number(options.maxHeight) : 900,
        keepAspectByDefault: options.keepAspectByDefault === true,
        adjustPositionOnResize: options.adjustPositionOnResize !== false,
        getPosition: () => getOptionDragOffset(optionId, part),
        setPosition: (x, y) => {
          setOptionDragOffset(optionId, x, y, part)
          applyOptionOffsetTransform(node, optionId, part)
        },
        getSize: () => getOptionBoxSize(optionId, part),
        setSize: (width, height) => {
          setOptionBoxSize(optionId, width, height, part)
          applyOptionBoxSize(node, optionId, part)
        }
      })
      return
    }
    registerResizeTarget(node, {
      unit: 'px',
      minX: -2400,
      maxX: 2400,
      minY: -2400,
      maxY: 2400,
      minScaleX: Number.isFinite(options.minScaleX) ? Number(options.minScaleX) : 0.35,
      maxScaleX: Number.isFinite(options.maxScaleX) ? Number(options.maxScaleX) : 5,
      minScaleY: Number.isFinite(options.minScaleY) ? Number(options.minScaleY) : 0.35,
      maxScaleY: Number.isFinite(options.maxScaleY) ? Number(options.maxScaleY) : 5,
      keepAspectByDefault: options.keepAspectByDefault === true,
      getPosition: () => getOptionDragOffset(optionId, part),
      setPosition: (x, y) => {
        setOptionDragOffset(optionId, x, y, part)
        applyOptionOffsetTransform(node, optionId, part)
      },
      getScale: () => getOptionDragScale(optionId, part),
      setScale: (x, y) => {
        setOptionDragScale(optionId, x, y, part)
        applyOptionOffsetTransform(node, optionId, part)
      }
    })
  }

  function isPointerNearNodeEdge(node, event, edgePadding = 0) {
    if (!(node instanceof Element)) {
      return false
    }
    const padding = Math.max(0, Number(edgePadding) || 0)
    if (padding <= 0) {
      return false
    }
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return false
    }
    // Keep a guaranteed center area for text editing on small boxes.
    const minSide = Math.max(1, Math.min(rect.width, rect.height))
    const maxBySize = Math.max(6, Math.floor(minSide * 0.25))
    const effectivePadding = Math.min(padding, maxBySize)
    const x = Number(event.clientX)
    const y = Number(event.clientY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false
    }
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return false
    }
    const edgeDistance = Math.min(x - rect.left, rect.right - x, y - rect.top, rect.bottom - y)
    return edgeDistance <= effectivePadding
  }

  function getWrapRect() {
    return el.wrap.getBoundingClientRect()
  }

  function buildDefaultPositionThemePatch() {
    return {
      panelX: defaultTheme.panelX,
      panelY: defaultTheme.panelY,
      panelScaleX: defaultTheme.panelScaleX,
      panelScaleY: defaultTheme.panelScaleY,
      bgImageX: defaultTheme.bgImageX,
      bgImageY: defaultTheme.bgImageY,
      bgImageScaleX: defaultTheme.bgImageScaleX,
      bgImageScaleY: defaultTheme.bgImageScaleY,
      bgOverlayX: defaultTheme.bgOverlayX,
      bgOverlayY: defaultTheme.bgOverlayY,
      bgOverlayScaleX: defaultTheme.bgOverlayScaleX,
      bgOverlayScaleY: defaultTheme.bgOverlayScaleY,
      gridX: defaultTheme.gridX,
      gridY: defaultTheme.gridY,
      gridScaleX: defaultTheme.gridScaleX,
      gridScaleY: defaultTheme.gridScaleY,
      eyebrowX: defaultTheme.eyebrowX,
      eyebrowY: defaultTheme.eyebrowY,
      eyebrowBoxWidth: defaultTheme.eyebrowBoxWidth,
      eyebrowBoxHeight: defaultTheme.eyebrowBoxHeight,
      questionX: defaultTheme.questionX,
      questionY: defaultTheme.questionY,
      questionBoxWidth: defaultTheme.questionBoxWidth,
      questionBoxHeight: defaultTheme.questionBoxHeight,
      metaX: defaultTheme.metaX,
      metaY: defaultTheme.metaY,
      metaBoxWidth: defaultTheme.metaBoxWidth,
      metaBoxHeight: defaultTheme.metaBoxHeight,
      metaScaleX: defaultTheme.metaScaleX,
      metaScaleY: defaultTheme.metaScaleY,
      optionsX: defaultTheme.optionsX,
      optionsY: defaultTheme.optionsY,
      footerX: defaultTheme.footerX,
      footerY: defaultTheme.footerY,
      footerBoxWidth: defaultTheme.footerBoxWidth,
      footerBoxHeight: defaultTheme.footerBoxHeight,
      footerScaleX: defaultTheme.footerScaleX,
      footerScaleY: defaultTheme.footerScaleY,
      logoX: defaultTheme.logoX,
      logoY: defaultTheme.logoY,
      logoScaleX: defaultTheme.logoScaleX,
      logoScaleY: defaultTheme.logoScaleY,
      assetX: defaultTheme.assetX,
      assetY: defaultTheme.assetY,
      assetScaleX: defaultTheme.assetScaleX,
      assetScaleY: defaultTheme.assetScaleY,
      optionOffsets: clone(defaultTheme.optionOffsets),
      optionSizes: clone(defaultTheme.optionSizes),
      optionScales: clone(defaultTheme.optionScales),
      optionAnchors: clone(defaultTheme.optionAnchors)
    }
  }

  function resetAllElementPositions() {
    if (dragState.active) {
      dragState.active.node.classList.remove('dragging')
      dragState.active = null
    }

    updateTheme(buildDefaultPositionThemePatch(), { historyLabel: 'Reset positions' })

    if (state.snapshot) {
      renderFromSnapshot(true)
    } else {
      for (const labelRow of el.options.querySelectorAll('.option .label-row')) {
        if (labelRow instanceof HTMLElement) {
          labelRow.style.transform = 'translate(0px, 0px)'
        }
      }
      for (const track of el.options.querySelectorAll('.option .track')) {
        if (track instanceof HTMLElement) {
          track.style.transform = 'translate(0px, 0px)'
        }
      }
      for (const textNode of el.options.querySelectorAll('.option .label, .option .stats')) {
        if (textNode instanceof HTMLElement) {
          textNode.style.removeProperty('width')
          textNode.style.removeProperty('height')
          textNode.style.removeProperty('position')
          textNode.style.removeProperty('left')
          textNode.style.removeProperty('top')
          textNode.style.removeProperty('margin')
          textNode.style.removeProperty('display')
          textNode.style.removeProperty('max-width')
          delete textNode.dataset.optionDetachedFlow
        }
      }
      for (const labelRow of el.options.querySelectorAll('.option .label-row')) {
        if (labelRow instanceof HTMLElement) {
          labelRow.style.removeProperty('min-height')
          labelRow.dataset.optionRowFlowLocked = '0'
        }
      }
    }
    showThemeFeedback('All object positions reset to defaults.', 'success')
  }

  function applyElementOffset(node, offsetX, offsetY, scaleX = 1, scaleY = 1) {
    if (!node) {
      return
    }
    const safeX = clamp(offsetX, -2400, 2400, 0)
    const safeY = clamp(offsetY, -2400, 2400, 0)
    const safeScaleX = clamp(scaleX, 0.2, 8, 1)
    const safeScaleY = clamp(scaleY, 0.2, 8, 1)
    node.style.transform = `translate(${safeX}px, ${safeY}px) scale(${safeScaleX}, ${safeScaleY})`
  }

  function applyElementBoxSize(node, width, height) {
    if (!node) {
      return
    }
    const safeWidth = sanitizeOptionalDimension(width, 24, 4000, null)
    const safeHeight = sanitizeOptionalDimension(height, 18, 2400, null)
    if (Number.isFinite(safeWidth)) {
      node.style.width = `${safeWidth}px`
    } else {
      node.style.removeProperty('width')
    }
    if (Number.isFinite(safeHeight)) {
      node.style.height = `${safeHeight}px`
    } else {
      node.style.removeProperty('height')
    }
  }

  function hasCustomHeaderTextSize(widthKey, heightKey) {
    const width = sanitizeOptionalDimension(getCurrentTheme()[widthKey], 24, 4000, null)
    const height = sanitizeOptionalDimension(getCurrentTheme()[heightKey], 18, 2400, null)
    return Number.isFinite(width) || Number.isFinite(height)
  }

  function lockHeaderTextContainerFlow(containerRectOverride = null) {
    if (!(el.headLeft instanceof HTMLElement) || el.headLeft.dataset.headerFlowLocked === '1') {
      return
    }
    const scale = getCanvasScaleFactor()
    const containerRect =
      containerRectOverride && isRectLike(containerRectOverride)
        ? containerRectOverride
        : el.headLeft.getBoundingClientRect()
    const lockedHeight = Math.max(24, containerRect.height / Math.max(0.01, scale))
    el.headLeft.style.minHeight = `${lockedHeight}px`
    el.headLeft.dataset.headerFlowLocked = '1'
  }

  function updateHeaderTextContainerLockState() {
    if (!(el.headLeft instanceof HTMLElement)) {
      return
    }
    const hasDetachedText = Boolean(
      el.headLeft.querySelector('[data-header-detached-flow="1"]')
    )
    if (hasDetachedText) {
      return
    }
    el.headLeft.style.removeProperty('min-height')
    el.headLeft.dataset.headerFlowLocked = '0'
  }

  function detachHeaderTextFromFlow(node, offsetX, offsetY, geometry = null) {
    if (!(node instanceof HTMLElement) || !(el.headLeft instanceof HTMLElement)) {
      return
    }

    if (node.dataset.headerDetachedFlow !== '1') {
      const scale = getCanvasScaleFactor()
      const containerRect = isRectLike(geometry?.containerRect)
        ? geometry.containerRect
        : el.headLeft.getBoundingClientRect()
      const nodeRect = isRectLike(geometry?.nodeRect)
        ? geometry.nodeRect
        : node.getBoundingClientRect()
      const baseLeft =
        containerRect.width > 0 && nodeRect.width > 0
          ? (nodeRect.left - containerRect.left) / Math.max(0.01, scale) - offsetX
          : 0
      const baseTop =
        containerRect.height > 0 && nodeRect.height > 0
          ? (nodeRect.top - containerRect.top) / Math.max(0.01, scale) - offsetY
          : 0
      node.style.left = `${baseLeft}px`
      node.style.top = `${baseTop}px`
      node.dataset.headerDetachedFlow = '1'
    }

    node.style.position = 'absolute'
    node.style.margin = '0'
    node.style.maxWidth = 'none'
  }

  function restoreHeaderTextFlow(node) {
    if (!(node instanceof HTMLElement)) {
      return
    }
    node.style.removeProperty('position')
    node.style.removeProperty('left')
    node.style.removeProperty('top')
    node.style.removeProperty('margin')
    node.style.removeProperty('max-width')
    delete node.dataset.headerDetachedFlow
    updateHeaderTextContainerLockState()
  }

  function syncHeaderTextFlow() {
    if (!(el.eyebrow instanceof HTMLElement) || !(el.question instanceof HTMLElement)) {
      return
    }
    const shouldDetach =
      hasCustomHeaderTextSize('eyebrowBoxWidth', 'eyebrowBoxHeight') ||
      hasCustomHeaderTextSize('questionBoxWidth', 'questionBoxHeight')

    if (!shouldDetach) {
      restoreHeaderTextFlow(el.eyebrow)
      restoreHeaderTextFlow(el.question)
      return
    }

    const containerRect = el.headLeft.getBoundingClientRect()
    const eyebrowRect = el.eyebrow.getBoundingClientRect()
    const questionRect = el.question.getBoundingClientRect()
    lockHeaderTextContainerFlow(containerRect)
    detachHeaderTextFromFlow(
      el.eyebrow,
      clamp(getCurrentTheme().eyebrowX, -2400, 2400, 0),
      clamp(getCurrentTheme().eyebrowY, -2400, 2400, 0),
      { containerRect, nodeRect: eyebrowRect }
    )
    detachHeaderTextFromFlow(
      el.question,
      clamp(getCurrentTheme().questionX, -2400, 2400, 0),
      clamp(getCurrentTheme().questionY, -2400, 2400, 0),
      { containerRect, nodeRect: questionRect }
    )
  }

  function applyHeaderTextObjects() {
    applyElementOffset(
      el.eyebrow,
      clamp(getCurrentTheme().eyebrowX, -2400, 2400, 0),
      clamp(getCurrentTheme().eyebrowY, -2400, 2400, 0),
      1,
      1
    )
    applyElementOffset(
      el.question,
      clamp(getCurrentTheme().questionX, -2400, 2400, 0),
      clamp(getCurrentTheme().questionY, -2400, 2400, 0),
      1,
      1
    )
    syncHeaderTextFlow()
    applyElementBoxSize(el.eyebrow, getCurrentTheme().eyebrowBoxWidth, getCurrentTheme().eyebrowBoxHeight)
    applyElementBoxSize(el.question, getCurrentTheme().questionBoxWidth, getCurrentTheme().questionBoxHeight)
  }

  function applyImageAsset(node, options) {
    if (!options.url) {
      node.classList.add('hidden')
      node.removeAttribute('src')
      return
    }
    if (node.getAttribute('src') !== options.url) {
      node.setAttribute('src', options.url)
    }
    node.classList.remove('hidden')
    if (options.width) {
      node.style.width = options.width
    }
    if (options.opacity) {
      node.style.opacity = options.opacity
    }
    if (options.left) {
      node.style.left = options.left
    }
    if (options.top) {
      node.style.top = options.top
    }
    const scaleX = clamp(options.scaleX, 0.25, 5, 1)
    const scaleY = clamp(options.scaleY, 0.25, 5, 1)
    node.style.transform = `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`
  }

  return {
    dragState,
    resizeState,
    resizeProfiles,
    applyDeletedOptionTarget,
    applyDeletedStaticTargets,
    applyElementBoxSize,
    applyElementOffset,
    applyHeaderTextObjects,
    applyImageAsset,
    applyOptionBoxSize,
    applyOptionOffsetTransform,
    buildDefaultPositionThemePatch,
    clearActiveResizeTarget,
    getActiveResizeTarget,
    handleDragPointerMove,
    handleDragPointerRelease,
    handleResizeHandlePointerDown,
    handleResizePointerMove,
    handleResizePointerRelease,
    handleResizeSelectionPointerDown,
    isThemeObjectDeleted,
    registerOptionDragTarget,
    registerOptionResizeTarget,
    resetAllElementPositions,
    scheduleResizeSelectionUpdate,
    setActiveResizeTarget,
    setDragMode,
    setThemeObjectDeleted,
    setupDragInteractions,
    setupResizeInteractions
  }
}

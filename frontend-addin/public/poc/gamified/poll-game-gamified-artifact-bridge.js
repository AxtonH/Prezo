// Fixed reference resolution (see applyFrameFit). In present mode the
// reference HEIGHT adapts to the real stage aspect within these bounds, so
// the responsive artifact reflows to fill the embed shape instead of
// letterboxing on black whenever the PowerPoint shape drifts off 16:9.
// Outside the bounds (very tall / very wide shapes) we clamp and letterbox —
// degenerate viewports would break artifact layouts worse than bars do.
const ARTIFACT_REFERENCE_WIDTH = 1920
const ARTIFACT_REFERENCE_HEIGHT = 1080
const ARTIFACT_PRESENT_MIN_ASPECT = 4 / 3
const ARTIFACT_PRESENT_MAX_ASPECT = 21 / 9

/**
 * Pure fit math for the artifact iframe: given the stage's box, return the
 * reference viewport the iframe should render at, the uniform scale that
 * fits it into the stage, and the centring offsets. Edit mode always uses
 * the fixed 16:9 reference (the stage is CSS-locked to 16:9, WYSIWYG);
 * present mode adapts the reference to the stage aspect within the clamp
 * range so the artifact fills the shape.
 */
export function computeArtifactFrameFit(stageWidth, stageHeight, presentMode = false) {
  if (!Number.isFinite(stageWidth) || !Number.isFinite(stageHeight) || stageWidth <= 0 || stageHeight <= 0) {
    return null
  }
  let referenceWidth = ARTIFACT_REFERENCE_WIDTH
  let referenceHeight = ARTIFACT_REFERENCE_HEIGHT
  if (presentMode) {
    const stageAspect = stageWidth / stageHeight
    const targetAspect = Math.min(
      ARTIFACT_PRESENT_MAX_ASPECT,
      Math.max(ARTIFACT_PRESENT_MIN_ASPECT, stageAspect)
    )
    referenceHeight = Math.round(referenceWidth / targetAspect)
  }
  const scale = Math.min(stageWidth / referenceWidth, stageHeight / referenceHeight)
  if (!Number.isFinite(scale) || scale <= 0) {
    return null
  }
  const scaledWidth = referenceWidth * scale
  const scaledHeight = referenceHeight * scale
  return {
    referenceWidth,
    referenceHeight,
    scale,
    scaledWidth,
    scaledHeight,
    offsetX: Math.max(0, (stageWidth - scaledWidth) / 2),
    offsetY: Math.max(0, (stageHeight - scaledHeight) / 2)
  }
}

export function createPollGameArtifactBridge({
  windowObj = window,
  artifactState,
  stageEl,
  frameEl,
  getIsArtifactMode,
  getIsPresentMode = () => false,
  getCurrentPollPayload,
  buildPayloadKey,
  clone,
  clamp,
  stageAspectRatio,
  statePushBatchMs,
  editRenderConfirmTimeoutMs,
  pollStateMessageType = 'prezo-poll-state',
  onRenderWatchdogTimeout
}) {
  function clearPendingPayloadTimer() {
    if (!artifactState.pendingPayloadTimerId) {
      return
    }
    windowObj.clearTimeout(artifactState.pendingPayloadTimerId)
    artifactState.pendingPayloadTimerId = null
  }

  function flushPendingPayload(options = {}) {
    if (!artifactState.frameReady || !frameEl.contentWindow) {
      return false
    }
    let payload = artifactState.pendingPayload
    if (!payload) {
      payload = getCurrentPollPayload()
    }
    if (!payload) {
      return false
    }
    const force = Boolean(options.force)
    const payloadKey = buildPayloadKey(payload)
    if (!force && payloadKey === artifactState.lastPayloadKey) {
      artifactState.pendingPayload = null
      return true
    }
    clearPendingPayloadTimer()
    frameEl.contentWindow.postMessage(
      {
        type: pollStateMessageType,
        payload
      },
      '*'
    )
    artifactState.lastPayloadKey = payloadKey
    artifactState.lastDeliveredPayload = clone(payload)
    artifactState.pendingPayload = null
    return true
  }

  function schedulePendingPayloadFlush(options = {}) {
    if (!artifactState.frameReady || !frameEl.contentWindow) {
      return false
    }
    const force = Boolean(options.force)
    if (force) {
      clearPendingPayloadTimer()
      return flushPendingPayload({ force: true })
    }
    if (artifactState.pendingPayloadTimerId) {
      return true
    }
    artifactState.pendingPayloadTimerId = windowObj.setTimeout(() => {
      artifactState.pendingPayloadTimerId = null
      flushPendingPayload()
    }, statePushBatchMs)
    return true
  }

  function queuePayload(payload, options = {}) {
    if (!payload) {
      return
    }
    const force = Boolean(options.force)
    const payloadKey = buildPayloadKey(payload)
    if (!artifactState.frameReady || !frameEl.contentWindow) {
      artifactState.pendingPayload = payload
      return
    }
    if (!force && payloadKey === artifactState.lastPayloadKey) {
      return
    }
    artifactState.pendingPayload = payload
    schedulePendingPayloadFlush({ force })
  }

  function clearPostLoadReplays() {
    const timerIds = Array.isArray(artifactState.postLoadReplayTimerIds)
      ? artifactState.postLoadReplayTimerIds
      : []
    for (let index = 0; index < timerIds.length; index += 1) {
      windowObj.clearTimeout(timerIds[index])
    }
    artifactState.postLoadReplayTimerIds = []
  }

  function schedulePostLoadReplays() {
    clearPostLoadReplays()
    if (!getIsArtifactMode()) {
      return
    }
    const delays = [140, 360, 820, 1600, 2600]
    for (let index = 0; index < delays.length; index += 1) {
      const delay = delays[index]
      const timerId = windowObj.setTimeout(() => {
        artifactState.postLoadReplayTimerIds = artifactState.postLoadReplayTimerIds.filter(
          (activeId) => activeId !== timerId
        )
        if (!getIsArtifactMode() || !artifactState.frameReady) {
          return
        }
        const payload = getCurrentPollPayload()
        if (payload) {
          artifactState.pendingPayload = payload
        }
        flushPendingPayload()
      }, delay)
      artifactState.postLoadReplayTimerIds.push(timerId)
    }
  }

  function readStageLayoutSize() {
    const computedStyle = windowObj.getComputedStyle(stageEl)
    const rect = stageEl.getBoundingClientRect()
    const layoutWidthCandidates = [
      stageEl.clientWidth,
      stageEl.offsetWidth,
      Number.parseFloat(computedStyle.width),
      rect.width
    ]
    const layoutWidth = layoutWidthCandidates.find(
      (value) => Number.isFinite(value) && value > 0
    )
    if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) {
      return { width: 0, height: 0 }
    }
    const inferredHeight = layoutWidth / stageAspectRatio
    const layoutHeightCandidates = [
      stageEl.clientHeight,
      stageEl.offsetHeight,
      Number.parseFloat(computedStyle.height),
      inferredHeight,
      rect.height
    ]
    const layoutHeight = layoutHeightCandidates.find(
      (value) => Number.isFinite(value) && value > 0
    )
    return {
      width: layoutWidth,
      height: Number.isFinite(layoutHeight) && layoutHeight > 0 ? layoutHeight : inferredHeight
    }
  }

  function clearInlineFrameSizing() {
    stageEl.style.height = ''
    frameEl.style.width = ''
    frameEl.style.height = ''
    frameEl.style.transform = ''
    frameEl.style.transformOrigin = ''
  }

  function setFrameHeight(value, options = {}) {
    // In present mode the stage is sized by CSS (16:9 letterbox box centred in
    // the viewport — see `.present-mode-artifact .artifact-stage` rules). The
    // bridge still re-fits the iframe scale on every call so dimensions track
    // when the viewport changes / fullscreen toggles.
    if (getIsPresentMode()) {
      applyFrameFit()
      return
    }
    const force = Boolean(options.force)
    const stageSize = readStageLayoutSize()
    const stageWidth = stageSize.width
    const aspectHeight =
      stageWidth > 0 ? Math.round((stageWidth / stageAspectRatio) * 1000) / 1000 : Number.NaN
    const fallback = clamp(value, 200, 6000, artifactState.frameHeight || 520)
    const normalized = clamp(
      Number.isFinite(aspectHeight) ? aspectHeight : fallback,
      200,
      6000,
      fallback
    )
    if (!force && Math.abs(normalized - artifactState.frameHeight) < 1) {
      applyFrameFit()
      return
    }
    artifactState.frameHeight = normalized
    stageEl.style.height = `${Math.round(normalized)}px`
    applyFrameFit()
  }

  function handleViewportResize() {
    if (!getIsArtifactMode()) {
      return
    }
    setFrameHeight(artifactState.frameHeight, { force: true })
  }

  // Refit whenever the stage's actual box changes. Office webviews resize
  // the embed without reliably firing window `resize` (or fire it before
  // layout settles), which left a stale fit — intermittent letterbox bars
  // after resizing the PowerPoint shape. ResizeObserver is layout-driven,
  // so it always sees the final box. Convergence: setFrameHeight's <1px
  // guard stops the re-fire loop after the stage height write settles.
  let stageResizeObserver = null
  if (typeof windowObj.ResizeObserver === 'function') {
    stageResizeObserver = new windowObj.ResizeObserver(() => {
      handleViewportResize()
    })
    stageResizeObserver.observe(stageEl)
  }

  /**
   * Push the present-mode document zoom into the artifact iframe. The
   * injected runtime bridge applies it as `documentElement.style.zoom`, so
   * the artifact rasterizes at NATIVE resolution instead of being painted at
   * the 1920-wide reference and bitmap-resampled by the compositor (and then
   * resampled again by PowerPoint's slideshow scaler) — that double resample
   * was the visible grain, and painting ~5× more pixels than displayed on
   * every animation frame was the present-mode lag. Zoom scales px lengths
   * while viewport units keep resolving against the real viewport, which is
   * exactly the same geometry the reference+scale path produces.
   */
  function postViewportZoom(zoom) {
    const normalized = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    if (artifactState.lastViewportZoom === normalized) {
      return
    }
    if (!frameEl.contentWindow) {
      return
    }
    artifactState.lastViewportZoom = normalized
    try {
      frameEl.contentWindow.postMessage(
        { type: 'prezo-viewport-zoom', zoom: normalized, instanceId: artifactState.instanceId },
        '*'
      )
    } catch {}
  }

  /**
   * Fit the iframe inside the visible stage (see computeArtifactFrameFit).
   *
   * Edit mode: the iframe renders the fixed 1920×1080 reference and is
   * `transform: scale()`d into the CSS-aspect-locked stage — designers see
   * WYSIWYG and the pointer/overlay math keeps a constant reference space.
   *
   * Present mode: the iframe is sized to the FITTED BOX at native
   * resolution and the document inside is zoomed by the reference scale
   * (see postViewportZoom). Same visual geometry, no bitmap resampling.
   *
   * Earlier implementations avoided `transform: scale()` because they tried
   * to fit measured *child content* size, which created a feedback loop
   * (iframe dims → child layout → measured size → new scale). Both paths
   * here derive only from the STAGE box, so there's no feedback.
   */
  function applyFrameFit() {
    const stageSize = readStageLayoutSize()
    const presentMode = getIsPresentMode()
    const fit = computeArtifactFrameFit(stageSize.width, stageSize.height, presentMode)
    if (!fit) {
      return
    }
    frameEl.style.transformOrigin = 'top left'
    if (presentMode) {
      frameEl.style.width = `${Math.round(fit.scaledWidth)}px`
      frameEl.style.height = `${Math.round(fit.scaledHeight)}px`
      frameEl.style.transform = `translate(${fit.offsetX}px, ${fit.offsetY}px)`
      postViewportZoom(fit.scale)
    } else {
      // Centre the post-scale iframe inside the stage. `transform-origin:
      // top left` means scale keeps the iframe's top-left at the stage's
      // top-left; the translate then shifts the visual box to the centre.
      // Transform operations apply right-to-left, so order is
      // `translate(...) scale(...)`.
      frameEl.style.width = `${fit.referenceWidth}px`
      frameEl.style.height = `${fit.referenceHeight}px`
      frameEl.style.transform = `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`
      postViewportZoom(1)
    }
    // Reported content dims reflect the rendered (post-scale) size that the
    // overlay / pointer code expects.
    artifactState.reportedContentWidth = Math.round(fit.scaledWidth)
    artifactState.reportedContentHeight = Math.round(fit.scaledHeight)
  }

  function clearRenderWatchdog() {
    if (!artifactState.renderWatchdogTimerId) {
      return
    }
    windowObj.clearTimeout(artifactState.renderWatchdogTimerId)
    artifactState.renderWatchdogTimerId = null
  }

  function scheduleRenderWatchdog() {
    clearRenderWatchdog()
    if (
      !getIsArtifactMode() ||
      artifactState.pendingRequestKind !== 'edit' ||
      !artifactState.rollbackHtml
    ) {
      return
    }
    artifactState.renderWatchdogTimerId = windowObj.setTimeout(() => {
      artifactState.renderWatchdogTimerId = null
      if (
        !getIsArtifactMode() ||
        artifactState.pendingRequestKind !== 'edit' ||
        artifactState.renderConfirmed
      ) {
        return
      }
      onRenderWatchdogTimeout()
    }, editRenderConfirmTimeoutMs)
  }

  function handleFrameLoad() {
    artifactState.frameReady = true
    artifactState.renderErrorCount = 0
    artifactState.lastPayloadKey = ''
    // The fresh document lost any previously applied viewport zoom; clear
    // the dedupe so the setFrameHeight below re-sends it.
    artifactState.lastViewportZoom = null
    setFrameHeight(artifactState.frameHeight, { force: true })
    scheduleRenderWatchdog()
    const currentPayload = getCurrentPollPayload()
    if (currentPayload) {
      artifactState.pendingPayload = currentPayload
    }
    if (flushPendingPayload({ force: true })) {
      schedulePostLoadReplays()
    }
  }

  function handleReadyMessage() {
    const currentPayload = getCurrentPollPayload()
    if (currentPayload) {
      artifactState.pendingPayload = currentPayload
    }
    flushPendingPayload()
    schedulePostLoadReplays()
  }

  function dispose() {
    clearPendingPayloadTimer()
    clearPostLoadReplays()
    clearRenderWatchdog()
    if (stageResizeObserver) {
      stageResizeObserver.disconnect()
      stageResizeObserver = null
    }
  }

  return {
    handleFrameLoad,
    handleReadyMessage,
    queuePayload,
    flushPendingPayload,
    schedulePendingPayloadFlush,
    clearPendingPayloadTimer,
    clearPostLoadReplays,
    schedulePostLoadReplays,
    setFrameHeight,
    handleViewportResize,
    applyFrameFit,
    clearRenderWatchdog,
    scheduleRenderWatchdog,
    dispose
  }
}

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

  // Fixed reference resolution. The iframe is always sized to exactly these
  // pixel dimensions internally; we then apply a CSS transform: scale() to fit
  // the stage. This keeps `vh`/`vw`/`clamp()` units inside the artifact stable
  // across all stage sizes — edit-mode, windowed present mode, and PowerPoint
  // fullscreen all render the same internal pixel canvas, just scaled.
  //
  // Designers see WYSIWYG: a 1920×1080 design renders at scale-down in edit
  // mode and scale-up in present mode, but the inner layout is byte-identical.
  const ARTIFACT_REFERENCE_WIDTH = 1920
  const ARTIFACT_REFERENCE_HEIGHT = 1080

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

  /**
   * Fit the iframe inside the visible stage by applying a uniform scale to a
   * fixed 1920×1080 reference. The iframe's internal viewport is ALWAYS
   * 1920×1080, regardless of the host stage's pixel size or present-mode
   * state, so `vh`/`vw`/`clamp()` inside the artifact compute identically in
   * every context.
   *
   * In edit mode the stage is aspect-locked to 16:9 by CSS, so the scaled
   * iframe fills the stage exactly. In present mode the stage spans the
   * whole viewport (no aspect lock); the iframe is centred and the smaller
   * dimension of the viewport drives the scale, leaving black bars on the
   * surplus axis.
   *
   * Earlier implementations avoided `transform: scale()` because they tried
   * to fit measured *child content* size, which created a feedback loop
   * (iframe dims → child layout → measured size → new scale). Here we scale
   * a CONSTANT reference, so there's no feedback.
   */
  function applyFrameFit() {
    const stageSize = readStageLayoutSize()
    const stageWidth = stageSize.width
    const stageHeight = stageSize.height
    if (stageWidth <= 0 || stageHeight <= 0) {
      return
    }
    // Scale by the limiting axis so the entire 1920×1080 reference fits
    // inside the stage without cropping.
    const scaleX = stageWidth / ARTIFACT_REFERENCE_WIDTH
    const scaleY = stageHeight / ARTIFACT_REFERENCE_HEIGHT
    const scale = Math.min(scaleX, scaleY)
    if (!Number.isFinite(scale) || scale <= 0) {
      return
    }
    // Centre the post-scale iframe inside the stage. `transform-origin: top
    // left` means scale keeps the iframe's top-left at the stage's top-left;
    // the translate then shifts the visual box to the centre. Transform
    // operations apply right-to-left, so order is `translate(...) scale(...)`.
    const scaledW = ARTIFACT_REFERENCE_WIDTH * scale
    const scaledH = ARTIFACT_REFERENCE_HEIGHT * scale
    const offsetX = Math.max(0, (stageWidth - scaledW) / 2)
    const offsetY = Math.max(0, (stageHeight - scaledH) / 2)
    frameEl.style.width = `${ARTIFACT_REFERENCE_WIDTH}px`
    frameEl.style.height = `${ARTIFACT_REFERENCE_HEIGHT}px`
    frameEl.style.transformOrigin = 'top left'
    frameEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
    // Reported content dims reflect the rendered (post-scale) size that the
    // overlay / pointer code expects.
    artifactState.reportedContentWidth = Math.round(scaledW)
    artifactState.reportedContentHeight = Math.round(scaledH)
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

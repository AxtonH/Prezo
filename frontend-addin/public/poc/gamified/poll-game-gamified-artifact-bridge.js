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
    if (getIsPresentMode()) {
      clearInlineFrameSizing()
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
   * Size the sandbox iframe to exactly the visible stage (16:9 box).
   *
   * We intentionally do NOT drive iframe width/height from the child's
   * `prezo-artifact-size` measurements or apply CSS `scale()` to "fit" them:
   * that created a feedback loop (iframe dimensions → child layout / vh → new
   * measured size → new scale) and visible "breathing" / bent proportions.
   * Artifacts should fill the stage with % / flex / 100% height instead.
   */
  function applyFrameFit() {
    if (getIsPresentMode()) {
      clearInlineFrameSizing()
      return
    }
    const stageSize = readStageLayoutSize()
    const stageWidth = stageSize.width
    const stageHeight = stageSize.height
    if (stageWidth <= 0 || stageHeight <= 0) {
      return
    }
    const w = Math.round(stageWidth)
    const h = Math.round(stageHeight)
    frameEl.style.width = `${w}px`
    frameEl.style.height = `${h}px`
    frameEl.style.transform = 'none'
    frameEl.style.transformOrigin = 'top left'
    artifactState.reportedContentWidth = w
    artifactState.reportedContentHeight = h
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

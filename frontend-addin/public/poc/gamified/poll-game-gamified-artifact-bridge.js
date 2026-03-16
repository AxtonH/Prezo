export function createPollGameArtifactBridge({
  windowObj = window,
  artifactState,
  stageEl,
  frameEl,
  getIsArtifactMode,
  getCurrentPollPayload,
  buildPayloadKey,
  clone,
  clamp,
  stageAspectRatio,
  safeFitScale,
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
        flushPendingPayload({ force: true })
      }, delay)
      artifactState.postLoadReplayTimerIds.push(timerId)
    }
  }

  function setFrameHeight(value, options = {}) {
    const force = Boolean(options.force)
    const stageRect = stageEl.getBoundingClientRect()
    const stageWidth = Number.isFinite(stageRect.width) ? stageRect.width : 0
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

  function applyFrameFit() {
    const stageRect = stageEl.getBoundingClientRect()
    const stageWidth = Number.isFinite(stageRect.width) ? stageRect.width : 0
    const stageHeight = Number.isFinite(stageRect.height) ? stageRect.height : 0
    if (stageWidth <= 0 || stageHeight <= 0) {
      return
    }
    const contentWidth = clamp(
      artifactState.reportedContentWidth,
      stageWidth,
      Math.max(stageWidth * 2.4, 1400),
      stageWidth
    )
    const contentHeight = clamp(
      artifactState.reportedContentHeight,
      stageHeight,
      Math.max(stageHeight * 2.4, 1400),
      stageHeight
    )
    const scaleToFit = Math.min(stageWidth / contentWidth, stageHeight / contentHeight, 1)
    const fitScale = clamp(scaleToFit * safeFitScale, 0.4, 1, safeFitScale)
    const scaledWidth = contentWidth * fitScale
    const scaledHeight = contentHeight * fitScale
    const insetX = Math.max(0, (stageWidth - scaledWidth) / 2)
    const insetY = Math.max(0, (stageHeight - scaledHeight) / 2)
    frameEl.style.width = `${Math.round(contentWidth)}px`
    frameEl.style.height = `${Math.round(contentHeight)}px`
    frameEl.style.transform = `translate(${Math.round(insetX)}px, ${Math.round(insetY)}px) scale(${fitScale})`
    frameEl.style.transformOrigin = 'top left'
  }

  function updateReportedContentSize(widthValue, heightValue) {
    const stageRect = stageEl.getBoundingClientRect()
    const stageWidth = Number.isFinite(stageRect.width) ? stageRect.width : 0
    const stageHeight = Number.isFinite(stageRect.height) ? stageRect.height : 0
    if (stageWidth <= 0 || stageHeight <= 0) {
      return
    }
    const rawWidth = Number(widthValue)
    const rawHeight = Number(heightValue)
    const maxWidth = Math.max(stageWidth * 2.4, 1400)
    const maxHeight = Math.max(stageHeight * 2.4, 1400)
    const normalizedWidth =
      Number.isFinite(rawWidth) && rawWidth > 0 && rawWidth <= maxWidth
        ? Math.max(stageWidth, rawWidth)
        : stageWidth
    const normalizedHeight =
      Number.isFinite(rawHeight) && rawHeight > 0 && rawHeight <= maxHeight
        ? Math.max(stageHeight, rawHeight)
        : stageHeight
    if (
      Math.abs(normalizedWidth - artifactState.reportedContentWidth) < 2 &&
      Math.abs(normalizedHeight - artifactState.reportedContentHeight) < 2
    ) {
      return
    }
    artifactState.reportedContentWidth = normalizedWidth
    artifactState.reportedContentHeight = normalizedHeight
    applyFrameFit()
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
    flushPendingPayload({ force: true })
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
    updateReportedContentSize,
    clearRenderWatchdog,
    scheduleRenderWatchdog,
    dispose
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeArtifactFrameFit,
  createPollGameArtifactBridge
} from '../public/poc/gamified/poll-game-gamified-artifact-bridge.js'

test('edit mode always renders the fixed 16:9 reference and letterboxes off-aspect stages', () => {
  const exact = computeArtifactFrameFit(960, 540, false)
  assert.equal(exact.referenceWidth, 1920)
  assert.equal(exact.referenceHeight, 1080)
  assert.equal(exact.scale, 0.5)
  assert.equal(exact.offsetX, 0)
  assert.equal(exact.offsetY, 0)

  const wide = computeArtifactFrameFit(1000, 460, false)
  assert.equal(wide.referenceHeight, 1080, 'edit reference never adapts')
  assert.ok(wide.offsetX > 0, 'wider-than-16:9 stage letterboxes horizontally in edit mode')
  assert.equal(wide.offsetY, 0)
})

test('present mode adapts the reference height so the artifact fills the shape', () => {
  // The screenshot case: a PowerPoint shape resized to ~1.93:1.
  const fit = computeArtifactFrameFit(890, 460, true)
  assert.equal(fit.referenceWidth, 1920)
  assert.equal(fit.referenceHeight, Math.round(1920 / (890 / 460)))
  assert.ok(Math.abs(fit.offsetX) < 1, 'no side bars')
  assert.ok(Math.abs(fit.offsetY) < 1, 'no top/bottom bars')
  assert.ok(Math.abs(fit.scaledWidth - 890) < 1, 'fills the full width')
  assert.ok(Math.abs(fit.scaledHeight - 460) < 1, 'fills the full height')

  const taller = computeArtifactFrameFit(800, 550, true)
  assert.ok(Math.abs(taller.offsetX) < 1 && Math.abs(taller.offsetY) < 1, 'fills a 1.45:1 shape too')
})

test('present mode clamps degenerate aspects and letterboxes beyond the range', () => {
  const ultraWide = computeArtifactFrameFit(3000, 500, true)
  assert.equal(ultraWide.referenceHeight, Math.round(1920 / (21 / 9)), 'clamped to 21:9')
  assert.ok(ultraWide.offsetX > 0, 'surplus width letterboxes')

  const portrait = computeArtifactFrameFit(500, 900, true)
  assert.equal(portrait.referenceHeight, Math.round(1920 / (4 / 3)), 'clamped to 4:3')
  assert.ok(portrait.offsetY > 0, 'surplus height letterboxes')
})

test('degenerate stage boxes return null', () => {
  assert.equal(computeArtifactFrameFit(0, 500, true), null)
  assert.equal(computeArtifactFrameFit(500, Number.NaN, false), null)
  assert.equal(computeArtifactFrameFit(-10, 500, true), null)
})

const makeBridgeHarness = ({ stageWidth, stageHeight, inlineStageHeight }) => {
  const stageEl = {
    style: { height: inlineStageHeight },
    clientWidth: stageWidth,
    clientHeight: stageHeight,
    offsetWidth: stageWidth,
    offsetHeight: stageHeight,
    getBoundingClientRect: () => ({ width: stageWidth, height: stageHeight })
  }
  const frameEl = { style: {}, contentWindow: null }
  const windowObj = {
    getComputedStyle: () => ({ width: `${stageWidth}px`, height: `${stageHeight}px` }),
    setTimeout: () => 0,
    clearTimeout: () => {}
  }
  const state = { presentMode: true }
  const bridge = createPollGameArtifactBridge({
    windowObj,
    artifactState: { frameHeight: 519 },
    stageEl,
    frameEl,
    getIsArtifactMode: () => true,
    getIsPresentMode: () => state.presentMode,
    getCurrentPollPayload: () => null,
    buildPayloadKey: () => '',
    clone: (value) => value,
    clamp: (value, min, max, fallback) => {
      const num = Number(value)
      if (!Number.isFinite(num)) {
        return fallback
      }
      return Math.min(max, Math.max(min, num))
    },
    stageAspectRatio: 16 / 9,
    statePushBatchMs: 50,
    editRenderConfirmTimeoutMs: 1000,
    onRenderWatchdogTimeout: () => {}
  })
  return { bridge, stageEl, frameEl, state }
}

test('present mode releases the edit-mode inline stage height so CSS owns the box', () => {
  // Edit mode writes an inline stage height; left in place it overrides the
  // present-mode `inset: 0` CSS, freezes the stage at its edit-mode height
  // and paints the wrap's black background below as a bottom letterbox band.
  const { bridge, stageEl, frameEl } = makeBridgeHarness({
    stageWidth: 1152,
    stageHeight: 648,
    inlineStageHeight: '519px'
  })
  bridge.setFrameHeight(519, { force: true })
  assert.equal(stageEl.style.height, '', 'stale inline height is cleared in present mode')
  assert.equal(frameEl.style.width, '1152px', 'frame fills the stage width')
  assert.equal(frameEl.style.height, '648px', 'frame fills the stage height')
  assert.equal(frameEl.style.transform, 'translate(0px, 0px)', 'no letterbox offsets in-range')
})

test('leaving present mode restores the aspect-derived inline stage height', () => {
  const { bridge, stageEl, state } = makeBridgeHarness({
    stageWidth: 1152,
    stageHeight: 648,
    inlineStageHeight: '519px'
  })
  bridge.setFrameHeight(519, { force: true })
  assert.equal(stageEl.style.height, '')
  state.presentMode = false
  bridge.setFrameHeight(519, { force: true })
  assert.equal(stageEl.style.height, '648px', 'edit mode re-derives the stage height from width')
})

import test from 'node:test'
import assert from 'node:assert/strict'

import { computeArtifactFrameFit } from '../public/poc/gamified/poll-game-gamified-artifact-bridge.js'

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

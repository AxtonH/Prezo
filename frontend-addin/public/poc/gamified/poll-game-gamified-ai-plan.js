/**
 * Classic-canvas AI edit-plan applier for the gamified station: takes the
 * parsed plan from the /ai edit route (see ai-transport) and applies its
 * actions — theme patches, element moves, box/scale resizes, text and
 * option-label rewrites, theme/position resets — to the live station.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 9). Everything DOM- or
 * subsystem-facing arrives as callbacks under the original closure names
 * (history snapshots, theme controls sync, selection cleanup); currentTheme
 * uses the getCurrentTheme seam.
 */
import {
  AI_BOX_RESIZE_TARGETS,
  AI_MOVE_TARGETS,
  AI_SCALE_RESIZE_TARGETS,
  AI_TARGET_ALIASES
} from './poll-game-gamified-constants.js'
import {
  getEyebrowTextKey,
  getOptionTextKey,
  getQuestionStateTextKey,
  getQuestionTextKey,
  isLiveBoundTextKey,
  sanitizeRichTextHtml,
  saveTextOverrides,
  textToRichHtml
} from './poll-game-gamified-richtext.js'
import { defaultTheme, sanitizeAiThemePatch, sanitizeOptionalDimension } from './poll-game-gamified-theme.js'
import { asText, clamp, clone } from './poll-game-gamified-utils.js'

export function createAiPlanApplier(deps) {
  const {
    state,
    el,
    getCurrentTheme,
    // App callbacks under their original closure names.
    updateTheme,
    syncThemeControls,
    renderFromSnapshot,
    renderInitialState,
    recordHistoryCheckpoint,
    captureHistorySnapshot,
    historySnapshotsEqual,
    buildDefaultPositionThemePatch,
    scheduleResizeSelectionUpdate,
    clearCachedRichTextSelection,
    hideSelectionToolbar,
    refreshTextToolStates,
    syncTextStyleControlsFromSelection
  } = deps

  function applyAiPlanActions(plan) {
    const actions = Array.isArray(plan?.actions) ? plan.actions : []
    const beforeSnapshot = captureHistorySnapshot()
    const themePatch = {}
    let themeActionCount = 0
    let textActionCount = 0
    const warnings = []

    for (const rawAction of actions) {
      if (!rawAction || typeof rawAction !== 'object') {
        continue
      }
      const type = asText(rawAction.type).toLowerCase()
      if (type === 'update_theme' || type === 'updatetheme') {
        const patch = sanitizeAiThemePatch(rawAction.theme, getCurrentTheme())
        if (Object.keys(patch).length === 0) {
          warnings.push('Ignored empty theme update.')
          continue
        }
        Object.assign(themePatch, patch)
        themeActionCount += 1
        continue
      }
      if (type === 'set_text' || type === 'settext') {
        if (applyAiTextAction(rawAction)) {
          textActionCount += 1
        } else {
          warnings.push('Ignored invalid text action.')
        }
        continue
      }
      if (type === 'set_option_label' || type === 'setoptionlabel') {
        if (applyAiOptionLabelAction(rawAction)) {
          textActionCount += 1
        } else {
          warnings.push('Ignored invalid option label action.')
        }
        continue
      }
      if (type === 'move_element' || type === 'move') {
        if (applyAiMoveAction(rawAction, themePatch)) {
          themeActionCount += 1
        } else {
          warnings.push('Ignored invalid move action.')
        }
        continue
      }
      if (type === 'resize_element' || type === 'resize') {
        if (applyAiResizeAction(rawAction, themePatch)) {
          themeActionCount += 1
        } else {
          warnings.push('Ignored invalid resize action.')
        }
        continue
      }
      if (type === 'reset_positions' || type === 'resetpositions') {
        Object.assign(themePatch, buildDefaultPositionThemePatch())
        themeActionCount += 1
        continue
      }
      if (type === 'reset_theme' || type === 'resettheme') {
        Object.assign(themePatch, clone(defaultTheme))
        themeActionCount += 1
        continue
      }
      warnings.push(`Unsupported action type "${type}".`)
    }

    const hasThemePatch = Object.keys(themePatch).length > 0
    if (hasThemePatch) {
      updateTheme(themePatch, { recordHistory: false, historyLabel: 'AI edit' })
      syncThemeControls()
    }
    if (textActionCount > 0) {
      saveTextOverrides(state.textOverrides)
      clearCachedRichTextSelection()
      state.activeTextHost = null
      state.activeInlineStyleNode = null
      hideSelectionToolbar()
      if (state.snapshot) {
        renderFromSnapshot(true)
      } else {
        renderInitialState()
      }
      refreshTextToolStates()
      syncTextStyleControlsFromSelection()
      scheduleResizeSelectionUpdate()
    }

    const afterSnapshot = captureHistorySnapshot()
    const changed = !historySnapshotsEqual(beforeSnapshot, afterSnapshot)
    if (changed) {
      recordHistoryCheckpoint('AI edit')
    }

    return {
      changed,
      themeActionCount,
      textActionCount,
      warningCount: warnings.length,
      warnings
    }
  }

  function summarizeAiOutcome(_plan, outcome) {
    if (!outcome.changed) {
      return 'No editable change was applied from that prompt.'
    }
    const summaryParts = []
    if (outcome.themeActionCount > 0) {
      summaryParts.push(`${outcome.themeActionCount} style/layout change${outcome.themeActionCount === 1 ? '' : 's'}`)
    }
    if (outcome.textActionCount > 0) {
      summaryParts.push(`${outcome.textActionCount} text change${outcome.textActionCount === 1 ? '' : 's'}`)
    }
    if (outcome.warningCount > 0) {
      summaryParts.push(`${outcome.warningCount} ignored action${outcome.warningCount === 1 ? '' : 's'}`)
    }
    return summaryParts.length > 0 ? `Applied ${summaryParts.join(', ')}.` : 'Applied edits.'
  }

  function normalizeAiTarget(rawTarget) {
    const normalized = asText(rawTarget).replace(/[\s_-]+/g, '').toLowerCase()
    if (!normalized) {
      return ''
    }
    if (Object.prototype.hasOwnProperty.call(AI_TARGET_ALIASES, normalized)) {
      return AI_TARGET_ALIASES[normalized]
    }
    if (Object.prototype.hasOwnProperty.call(AI_MOVE_TARGETS, rawTarget)) {
      return rawTarget
    }
    if (Object.prototype.hasOwnProperty.call(AI_BOX_RESIZE_TARGETS, rawTarget)) {
      return rawTarget
    }
    if (Object.prototype.hasOwnProperty.call(AI_SCALE_RESIZE_TARGETS, rawTarget)) {
      return rawTarget
    }
    return ''
  }

  function applyAiMoveAction(action, themePatch) {
    const target = normalizeAiTarget(action.target)
    if (!target || !Object.prototype.hasOwnProperty.call(AI_MOVE_TARGETS, target)) {
      return false
    }
    const config = AI_MOVE_TARGETS[target]
    const baseX =
      Object.prototype.hasOwnProperty.call(themePatch, config.xKey) &&
      Number.isFinite(Number(themePatch[config.xKey]))
        ? Number(themePatch[config.xKey])
        : Number(getCurrentTheme()[config.xKey])
    const baseY =
      Object.prototype.hasOwnProperty.call(themePatch, config.yKey) &&
      Number.isFinite(Number(themePatch[config.yKey]))
        ? Number(themePatch[config.yKey])
        : Number(getCurrentTheme()[config.yKey])
    const hasX = Number.isFinite(Number(action.x))
    const hasY = Number.isFinite(Number(action.y))
    const hasDeltaX = Number.isFinite(Number(action.deltaX))
    const hasDeltaY = Number.isFinite(Number(action.deltaY))
    if (!hasX && !hasY && !hasDeltaX && !hasDeltaY) {
      return false
    }
    const nextX = hasX ? Number(action.x) : baseX + (hasDeltaX ? Number(action.deltaX) : 0)
    const nextY = hasY ? Number(action.y) : baseY + (hasDeltaY ? Number(action.deltaY) : 0)
    themePatch[config.xKey] = clamp(nextX, config.minX, config.maxX, baseX)
    themePatch[config.yKey] = clamp(nextY, config.minY, config.maxY, baseY)
    return true
  }

  function applyAiResizeAction(action, themePatch) {
    const target = normalizeAiTarget(action.target)
    if (!target) {
      return false
    }
    if (Object.prototype.hasOwnProperty.call(AI_BOX_RESIZE_TARGETS, target)) {
      const config = AI_BOX_RESIZE_TARGETS[target]
      const widthCleared = action.width === null
      const heightCleared = action.height === null
      const hasWidth = Number.isFinite(Number(action.width))
      const hasHeight = Number.isFinite(Number(action.height))
      if (!widthCleared && !heightCleared && !hasWidth && !hasHeight) {
        return false
      }
      const baseWidth =
        Object.prototype.hasOwnProperty.call(themePatch, config.widthKey) &&
        Number.isFinite(Number(themePatch[config.widthKey]))
          ? Number(themePatch[config.widthKey])
          : sanitizeOptionalDimension(
              getCurrentTheme()[config.widthKey],
              config.minW,
              config.maxW,
              null
            )
      const baseHeight =
        Object.prototype.hasOwnProperty.call(themePatch, config.heightKey) &&
        Number.isFinite(Number(themePatch[config.heightKey]))
          ? Number(themePatch[config.heightKey])
          : sanitizeOptionalDimension(
              getCurrentTheme()[config.heightKey],
              config.minH,
              config.maxH,
              null
            )
      if (widthCleared) {
        themePatch[config.widthKey] = null
      } else if (hasWidth) {
        themePatch[config.widthKey] = clamp(Number(action.width), config.minW, config.maxW, baseWidth)
      }
      if (heightCleared) {
        themePatch[config.heightKey] = null
      } else if (hasHeight) {
        themePatch[config.heightKey] = clamp(Number(action.height), config.minH, config.maxH, baseHeight)
      }
      return true
    }
    if (!Object.prototype.hasOwnProperty.call(AI_SCALE_RESIZE_TARGETS, target)) {
      return false
    }
    const config = AI_SCALE_RESIZE_TARGETS[target]
    const uniformScale = Number.isFinite(Number(action.scale)) ? Number(action.scale) : null
    const hasScaleX = Number.isFinite(Number(action.scaleX))
    const hasScaleY = Number.isFinite(Number(action.scaleY))
    if (uniformScale == null && !hasScaleX && !hasScaleY) {
      return false
    }
    const baseScaleX =
      Object.prototype.hasOwnProperty.call(themePatch, config.xKey) &&
      Number.isFinite(Number(themePatch[config.xKey]))
        ? Number(themePatch[config.xKey])
        : Number(getCurrentTheme()[config.xKey])
    const baseScaleY =
      Object.prototype.hasOwnProperty.call(themePatch, config.yKey) &&
      Number.isFinite(Number(themePatch[config.yKey]))
        ? Number(themePatch[config.yKey])
        : Number(getCurrentTheme()[config.yKey])
    const rawScaleX = hasScaleX ? Number(action.scaleX) : uniformScale != null ? uniformScale : baseScaleX
    const rawScaleY = hasScaleY ? Number(action.scaleY) : uniformScale != null ? uniformScale : baseScaleY
    themePatch[config.xKey] = clamp(rawScaleX, config.minX, config.maxX, baseScaleX)
    themePatch[config.yKey] = clamp(rawScaleY, config.minY, config.maxY, baseScaleY)
    return true
  }

  function applyAiTextAction(action) {
    const target = normalizeAiTarget(action.target)
    if (!target) {
      return false
    }
    const hasHtml = typeof action.html === 'string'
    const hasValue = hasHtml || typeof action.value === 'string' || typeof action.value === 'number'
    if (!hasValue) {
      return false
    }
    const rawValue = hasHtml ? action.html : String(action.value)
    if (target === 'question') {
      const textKey =
        asText(el.question.dataset.textKey) ||
        (state.currentPoll ? getQuestionTextKey(state.currentPoll) : getQuestionStateTextKey('manual'))
      return applyTextOverride(textKey, rawValue, hasHtml || action.asHtml === true)
    }
    if (target === 'eyebrow') {
      return applyTextOverride(getEyebrowTextKey(), rawValue, hasHtml || action.asHtml === true)
    }
    return false
  }

  function applyAiOptionLabelAction(action) {
    const resolved = resolveOptionFromAction(action)
    if (!resolved) {
      return false
    }
    const hasHtml = typeof action.html === 'string'
    const hasValue = hasHtml || typeof action.value === 'string' || typeof action.value === 'number'
    if (!hasValue) {
      return false
    }
    const rawValue = hasHtml ? action.html : String(action.value)
    const textKey = getOptionTextKey(state.currentPoll, resolved.option, resolved.index)
    return applyTextOverride(textKey, rawValue, hasHtml || action.asHtml === true)
  }

  function resolveOptionFromAction(action) {
    if (!state.currentPoll || !Array.isArray(state.currentPoll.options)) {
      return null
    }
    const options = state.currentPoll.options
    const optionId = asText(action.optionId)
    if (optionId) {
      const byIdIndex = options.findIndex((option) => asText(option?.id) === optionId)
      if (byIdIndex >= 0) {
        return { index: byIdIndex, option: options[byIdIndex] }
      }
    }
    const optionIndex = Number.isFinite(Number(action.optionIndex)) ? Number(action.optionIndex) : NaN
    if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < options.length) {
      return { index: optionIndex, option: options[optionIndex] }
    }
    const optionLabel = asText(action.optionLabel).toLowerCase()
    if (optionLabel) {
      const byLabelIndex = options.findIndex(
        (option) => asText(option?.label).toLowerCase() === optionLabel
      )
      if (byLabelIndex >= 0) {
        return { index: byLabelIndex, option: options[byLabelIndex] }
      }
    }
    return null
  }

  function applyTextOverride(textKey, value, treatAsHtml = false) {
    const key = asText(textKey)
    if (!key || isLiveBoundTextKey(key)) {
      return false
    }
    const rawInput = typeof value === 'string' ? value : String(value ?? '')
    const nextHtml = treatAsHtml ? sanitizeRichTextHtml(rawInput) : textToRichHtml(rawInput)
    if (!Object.prototype.hasOwnProperty.call(state.textOverrides, key) || state.textOverrides[key] !== nextHtml) {
      state.textOverrides[key] = nextHtml
      return true
    }
    return false
  }

  return {
    applyAiPlanActions,
    summarizeAiOutcome
  }
}

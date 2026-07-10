/**
 * Rich-text selection editor for the gamified station: the contenteditable
 * host lifecycle (focus/commit/render), the floating selection toolbar, the
 * ribbon text-style controls, document.execCommand + inline-style span
 * editing, and the cached-selection machinery that lets toolbar controls
 * steal focus without losing the user's selection.
 *
 * Extracted verbatim from the app.js closure (see
 * docs/gamified-station-modularization.md, Phase 7). The editor owns its
 * panel DOM: the shared `el` map is injected (toolbar buttons, style
 * controls, the wrap it delegates listeners on). Shared mutable state stays
 * on the injected `state`/`historyState` objects; currentTheme uses the
 * getCurrentTheme seam. setupArtifactTextToolbar stays in app.js (it edits
 * artifact-iframe text through the bridge, not station hosts) and is invoked
 * through a callback under its original name; it reaches back into this
 * module for the select helpers it shares (fillSelectOptions,
 * syncTextSelectOption, ...).
 */
import { TEXT_FONT_FAMILIES, TEXT_FONT_SIZES } from './poll-game-gamified-constants.js'
import {
  isLiveBoundTextKey,
  isPollQuestionTextKey,
  isStaleQuestionOverride,
  sanitizeFontStyleValue,
  sanitizeFontWeightValue,
  sanitizeRichTextHtml,
  sanitizeTextDecorationValue,
  saveTextOverrides,
  textToRichHtml
} from './poll-game-gamified-richtext.js'
import { normalizeColorToHex, sanitizeHex } from './poll-game-gamified-theme.js'
import { asText, clamp, escapeHtml } from './poll-game-gamified-utils.js'

export function createRichTextEditor(deps) {
  const {
    state,
    el,
    /** Editor undo/redo bookkeeping — mutation-only shared object. */
    historyState,
    getCurrentTheme,
    // App callbacks under their original closure names.
    recordHistoryCheckpoint,
    renderFromSnapshot,
    scheduleTypingHistoryCheckpoint,
    setupArtifactTextToolbar
  } = deps

  function setupRichTextEditor() {
    const textToolButtons = [
      el.textToolBold,
      el.textToolItalic,
      el.textToolUnderline,
      el.textToolClear,
      el.miniTextToolBold,
      el.miniTextToolItalic,
      el.miniTextToolUnderline,
      el.miniTextToolClear
    ]
    for (const button of textToolButtons) {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
      })
    }

    setupRichTextStyleControls()
    setupArtifactTextToolbar()
    bindRichTextCommandButtons([el.textToolBold, el.miniTextToolBold], 'bold')
    bindRichTextCommandButtons([el.textToolItalic, el.miniTextToolItalic], 'italic')
    bindRichTextCommandButtons([el.textToolUnderline, el.miniTextToolUnderline], 'underline')
    bindRichTextCommandButtons([el.textToolClear, el.miniTextToolClear], 'removeFormat')

    el.wrap.addEventListener('focusin', handleRichTextFocusIn)
    el.wrap.addEventListener('focusout', handleRichTextFocusOut)
    el.wrap.addEventListener('input', handleRichTextInput)
    el.wrap.addEventListener('paste', handleRichTextPaste)
    el.wrap.addEventListener('keydown', handleRichTextKeydown)
    document.addEventListener('selectionchange', handleRichTextSelectionChange)
    document.addEventListener('pointerdown', handleRichTextPointerDown, true)
    window.addEventListener('resize', scheduleSelectionToolbarUpdate)
    window.addEventListener('scroll', scheduleSelectionToolbarUpdate, true)
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
  }

  function setupRichTextStyleControls() {
    fillSelectOptions(
      [el.textFontFamily, el.miniTextFontFamily],
      TEXT_FONT_FAMILIES.map((fontName) => ({
        label: fontName,
        value: fontName,
        style: `font-family: "${fontName}", sans-serif`
      }))
    )
    fillSelectOptions(
      [el.textFontSize, el.miniTextFontSize],
      TEXT_FONT_SIZES.map((fontSize) => ({
        label: String(fontSize),
        value: String(fontSize)
      }))
    )

    for (const control of [el.textFontFamily, el.miniTextFontFamily]) {
      bindTextControlFocusLock(control)
      control.addEventListener('change', () => {
        if (state.isSyncingTextStyleControls) {
          return
        }
        const selectedFont = normalizeFontFamilyChoice(control.value)
        setLinkedControlValues([el.textFontFamily, el.miniTextFontFamily], selectedFont)
        if (!selectedFont) {
          return
        }
        if (applyRichTextInlineStyle({ fontFamily: selectedFont })) {
          showTextEditFeedback(`Font changed to ${selectedFont}.`, 'success')
          return
        }
        showTextEditFeedback('Select text in the question or options first.', 'error')
      })
    }

    for (const control of [el.textFontSize, el.miniTextFontSize]) {
      bindTextControlFocusLock(control)
      control.addEventListener('change', () => {
        if (state.isSyncingTextStyleControls) {
          return
        }
        const selectedSize = normalizeFontSizeChoice(control.value)
        setLinkedControlValues([el.textFontSize, el.miniTextFontSize], selectedSize)
        if (!selectedSize) {
          return
        }
        if (applyRichTextInlineStyle({ fontSize: selectedSize })) {
          showTextEditFeedback(`Font size changed to ${selectedSize}.`, 'success')
          return
        }
        showTextEditFeedback('Select text in the question or options first.', 'error')
      })
    }

    for (const control of [el.textFontColor, el.miniTextFontColor]) {
      bindTextControlFocusLock(control)
      control.addEventListener('input', () => {
        if (state.isSyncingTextStyleControls) {
          return
        }
        markTextControlInteractionActive(getTextControlLockMs(control))
        const selectedColor = sanitizeHex(control.value, '#16375e')
        setLinkedControlValues([el.textFontColor, el.miniTextFontColor], selectedColor)
        applyRichTextInlineStyle({ color: selectedColor })
      })
      control.addEventListener('change', () => {
        if (state.isSyncingTextStyleControls) {
          return
        }
        markTextControlInteractionActive(getTextControlLockMs(control))
        const selectedColor = sanitizeHex(control.value, '#16375e')
        setLinkedControlValues([el.textFontColor, el.miniTextFontColor], selectedColor)
        if (applyRichTextInlineStyle({ color: selectedColor })) {
          showTextEditFeedback('Text color updated.', 'success')
          releaseTextControlInteractionSoon()
          return
        }
        showTextEditFeedback('Select text in the question or options first.', 'error')
        releaseTextControlInteractionSoon()
      })
    }
  }

  function bindTextControlFocusLock(control) {
    control.addEventListener('focus', () => {
      cacheRichTextSelection()
      markTextControlInteractionActive(getTextControlLockMs(control))
    })
    control.addEventListener('blur', () => {
      if (isColorTextControl(control)) {
        // Native color dialogs may blur the input while still actively selecting colors.
        markTextControlInteractionActive(getTextControlLockMs(control))
        return
      }
      state.textControlInteractionLocked = false
      state.textControlInteractionUntil = Date.now() + 600
    })
  }

  function getTextControlLockMs(control) {
    return isColorTextControl(control) ? 120000 : 15000
  }

  function isColorTextControl(control) {
    return control instanceof HTMLInputElement && control.type === 'color'
  }

  function markTextControlInteractionActive(durationMs = 15000) {
    state.textControlInteractionLocked = true
    state.textControlInteractionUntil = Date.now() + durationMs
  }

  function releaseTextControlInteractionSoon(delayMs = 600) {
    state.textControlInteractionLocked = false
    state.textControlInteractionUntil = Date.now() + delayMs
  }

  function fillSelectOptions(selectNodes, options) {
    const seen = new Set()
    const normalizedOptions = []
    for (const option of options) {
      const value = asText(option.value)
      if (!value || seen.has(value.toLowerCase())) {
        continue
      }
      seen.add(value.toLowerCase())
      normalizedOptions.push(option)
    }

    for (const select of selectNodes) {
      select.innerHTML = ''
      for (const option of normalizedOptions) {
        const node = document.createElement('option')
        node.value = option.value
        node.textContent = option.label
        if (option.style) {
          node.style.cssText = option.style
        }
        select.appendChild(node)
      }
    }
  }

  function setLinkedControlValues(controls, value) {
    for (const control of controls) {
      if (control.value === value) {
        continue
      }
      control.value = value
    }
  }

  function bindRichTextCommandButtons(buttons, command) {
    for (const button of buttons) {
      button.addEventListener('click', () => {
        if (applyRichTextCommand(command)) {
          return
        }
        showTextEditFeedback('Select text in the question or options first.', 'error')
      })
    }
  }

  function handleRichTextSelectionChange() {
    cacheRichTextSelection()
    const selectionHost = getSelectionRichTextHost()
    if (selectionHost) {
      if (!isTextControlElement(document.activeElement) && !isTextControlInteractionActive()) {
        state.textControlInteractionUntil = 0
        state.textControlInteractionLocked = false
      }
      syncActiveInlineStyleNodeWithSelection(selectionHost)
      if (!isTextControlInteractionActive()) {
        state.activeInlineStyleNode = null
      }
    }
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
    scheduleSelectionToolbarUpdate()
  }

  function handleRichTextPointerDown(event) {
    const target = event.target
    const interactionLocked = state.textControlInteractionLocked

    if (!(target instanceof Element)) {
      if (interactionLocked) {
        return
      }
      hideSelectionToolbar()
      clearCachedRichTextSelection()
      state.textControlInteractionLocked = false
      state.textControlInteractionUntil = 0
      state.activeInlineStyleNode = null
      return
    }
    const textControl = target.closest('[data-text-control="true"]')
    if (textControl) {
      cacheRichTextSelection()
      if (isPersistentTextControlElement(textControl)) {
        markTextControlInteractionActive(120000)
      } else {
        releaseTextControlInteractionSoon()
      }
      return
    }
    if (target.closest('#resize-selection')) {
      return
    }
    if (interactionLocked && !target.closest('.rich-text-editable')) {
      // Native color pickers can emit pointer events outside the page DOM.
      return
    }
    if (target.closest('.rich-text-editable')) {
      state.textControlInteractionLocked = false
      state.textControlInteractionUntil = 0
      state.activeInlineStyleNode = null
      return
    }
    hideSelectionToolbar()
    clearCachedRichTextSelection()
    state.textControlInteractionLocked = false
    state.textControlInteractionUntil = 0
    state.activeInlineStyleNode = null
  }

  function isPersistentTextControlElement(node) {
    if (!(node instanceof Element)) {
      return false
    }
    if (node instanceof HTMLSelectElement) {
      return true
    }
    return isColorTextControl(node)
  }

  function scheduleSelectionToolbarUpdate() {
    if (state.selectionToolbarRafId != null) {
      return
    }
    state.selectionToolbarRafId = requestAnimationFrame(() => {
      state.selectionToolbarRafId = null
      updateSelectionToolbar()
    })
  }

  function updateSelectionToolbar() {
    const selection = window.getSelection()
    const host = getSelectionRichTextHost()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !host) {
      hideSelectionToolbar()
      return
    }

    const selectionRect = getSelectionRect(selection.getRangeAt(0))
    if (!selectionRect) {
      hideSelectionToolbar()
      return
    }
    placeSelectionToolbar(selectionRect)
    showSelectionToolbar()
  }

  function getSelectionRect(range) {
    const box = range.getBoundingClientRect()
    if (box && box.width > 0 && box.height > 0) {
      return box
    }
    const boxes = range.getClientRects()
    for (const rect of boxes) {
      if (rect.width > 0 && rect.height > 0) {
        return rect
      }
    }
    return null
  }

  function placeSelectionToolbar(selectionRect) {
    const toolbar = el.selectionToolbar
    const margin = 10
    const screenPad = 8

    const toolbarRect = toolbar.getBoundingClientRect()
    const toolbarWidth = toolbarRect.width || 170
    const toolbarHeight = toolbarRect.height || 42

    let left = selectionRect.right + margin
    let top = selectionRect.top + selectionRect.height / 2 - toolbarHeight / 2

    if (left + toolbarWidth > window.innerWidth - screenPad) {
      left = selectionRect.left - toolbarWidth - margin
    }
    if (left < screenPad) {
      left = selectionRect.left + selectionRect.width / 2 - toolbarWidth / 2
      top = selectionRect.top - toolbarHeight - margin
    }

    const maxLeft = Math.max(screenPad, window.innerWidth - toolbarWidth - screenPad)
    const maxTop = Math.max(screenPad, window.innerHeight - toolbarHeight - screenPad)
    left = clamp(left, screenPad, maxLeft, screenPad)
    top = clamp(top, screenPad, maxTop, screenPad)

    toolbar.style.left = `${left}px`
    toolbar.style.top = `${top}px`
  }

  function showSelectionToolbar() {
    el.selectionToolbar.classList.add('visible')
    el.selectionToolbar.setAttribute('aria-hidden', 'false')
  }

  function hideSelectionToolbar() {
    el.selectionToolbar.classList.remove('visible')
    el.selectionToolbar.setAttribute('aria-hidden', 'true')
  }

  function handleRichTextFocusIn(event) {
    const host = getRichTextHost(event.target)
    if (!host) {
      return
    }
    state.activeTextHost = host
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
    scheduleSelectionToolbarUpdate()
  }

  function handleRichTextFocusOut(event) {
    const host = getRichTextHost(event.target)
    if (!host) {
      return
    }
    const nextHost = getRichTextHost(event.relatedTarget)
    const preservingSelectionForControl =
      isTextControlElement(event.relatedTarget) || isTextControlInteractionActive()
    commitRichTextHost(host, {
      normalizeDom: !preservingSelectionForControl,
      recordHistory: false
    })
    if (nextHost) {
      state.activeTextHost = nextHost
      refreshTextToolStates()
      syncTextStyleControlsFromSelection()
      scheduleSelectionToolbarUpdate()
      return
    }
    if (preservingSelectionForControl) {
      state.activeTextHost = host
      refreshTextToolStates()
      syncTextStyleControlsFromSelection()
      scheduleSelectionToolbarUpdate()
      return
    }
    state.activeTextHost = null
    state.activeInlineStyleNode = null
    if (!getSelectionRichTextHost()) {
      clearCachedRichTextSelection()
    }
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
    hideSelectionToolbar()
    if (state.snapshot) {
      window.setTimeout(() => {
        if (isRichTextEditingActive()) {
          return
        }
        renderFromSnapshot(true)
      }, 0)
    }
  }

  function handleRichTextInput(event) {
    const host = getRichTextHost(event.target)
    if (!host) {
      return
    }
    commitRichTextHost(host, { historyMode: 'typing' })
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
    scheduleSelectionToolbarUpdate()
  }

  function handleRichTextPaste(event) {
    const host = getRichTextHost(event.target)
    if (!host) {
      return
    }
    event.preventDefault()
    const clipboard = event.clipboardData
    const pastedText = clipboard ? clipboard.getData('text/plain') : ''
    if (!pastedText) {
      return
    }
    host.focus()
    const normalized = pastedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const html = escapeHtml(normalized).replace(/\n/g, '<br>')
    try {
      document.execCommand('insertHTML', false, html)
    } catch {
      document.execCommand('insertText', false, normalized)
    }
    commitRichTextHost(host, { historyLabel: 'Paste text' })
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
    scheduleSelectionToolbarUpdate()
  }

  function handleRichTextKeydown(event) {
    const host = getRichTextHost(event.target)
    if (!host) {
      return
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return
    }
    const key = event.key.toLowerCase()
    if (key === 'b') {
      event.preventDefault()
      applyRichTextCommand('bold')
      return
    }
    if (key === 'i') {
      event.preventDefault()
      applyRichTextCommand('italic')
      return
    }
    if (key === 'u') {
      event.preventDefault()
      applyRichTextCommand('underline')
    }
    scheduleSelectionToolbarUpdate()
  }

  function isTextControlElement(node) {
    return node instanceof Element && Boolean(node.closest('[data-text-control="true"]'))
  }

  function isTextControlInteractionActive() {
    return state.textControlInteractionLocked || Date.now() <= state.textControlInteractionUntil
  }

  function applyRichTextCommand(command) {
    const host =
      getSelectionRichTextHost() || getActiveRichTextHost() || getCachedRichTextSelectionHost()
    if (!host) {
      return false
    }

    const hasLiveSelection = hasNonCollapsedSelectionInHost(host)
    if (!hasLiveSelection) {
      if (document.activeElement !== host) {
        host.focus({ preventScroll: true })
      }
      if (!restoreCachedRichTextSelection(host)) {
        return false
      }
    }

    try {
      document.execCommand('styleWithCSS', false, false)
    } catch {}
    let applied = false
    try {
      applied = document.execCommand(command, false, null)
    } catch {}
    state.activeInlineStyleNode = null
    releaseTextControlInteractionSoon()
    commitRichTextHost(host, { historyLabel: 'Format text' })
    cacheRichTextSelection()
    refreshTextToolStates()
    scheduleSelectionToolbarUpdate()
    if (applied !== false) {
      showTextEditFeedback('Formatting updated.', 'success')
      return true
    }
    return false
  }

  function applyRichTextInlineStyle(styleProps) {
    const context = resolveExpandedRichTextSelection()
    if (!context) {
      return false
    }
    const { host, selection, range } = context

    const reusableNode = getReusableInlineStyleNode(host, range)
    if (reusableNode && applyStylesToElement(reusableNode, styleProps)) {
      updateCachedRangeFromNode(reusableNode, host)
      state.activeTextHost = host
      commitRichTextHost(host, { normalizeDom: false, historyLabel: 'Format text' })
      refreshTextToolStates()
      syncTextStyleControlsFromSelection()
      scheduleSelectionToolbarUpdate()
      return true
    }

    const wrapper = document.createElement('span')
    if (!applyStylesToElement(wrapper, styleProps)) {
      return false
    }

    const fragment = range.extractContents()
    if (!fragment || fragment.childNodes.length === 0) {
      return false
    }
    stripConflictingInlineStyles(fragment, styleProps)
    wrapper.appendChild(fragment)
    range.insertNode(wrapper)

    const nextRange = document.createRange()
    nextRange.selectNodeContents(wrapper)
    if (selection && (!isTextControlInteractionActive() || document.activeElement === host)) {
      try {
        selection.removeAllRanges()
        selection.addRange(nextRange)
      } catch {}
    }

    state.activeInlineStyleNode = wrapper
    updateCachedRangeFromNode(wrapper, host)
    state.activeTextHost = host
    commitRichTextHost(host, { normalizeDom: false, historyLabel: 'Format text' })
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
    scheduleSelectionToolbarUpdate()
    return true
  }

  function applyStylesToElement(node, styleProps) {
    let appliedAnyStyle = false
    if (styleProps.fontFamily) {
      const family = normalizeFontFamilyChoice(styleProps.fontFamily)
      if (family) {
        node.style.fontFamily = family
        appliedAnyStyle = true
      }
    }
    if (styleProps.fontSize) {
      const size = normalizeFontSizeCss(styleProps.fontSize)
      if (size) {
        node.style.fontSize = size
        appliedAnyStyle = true
      }
    }
    if (styleProps.color) {
      const color = sanitizeHex(styleProps.color, '')
      if (color) {
        node.style.color = color
        appliedAnyStyle = true
      }
    }
    if (styleProps.fontWeight) {
      const weight = sanitizeFontWeightValue(asText(styleProps.fontWeight).toLowerCase())
      if (weight) {
        node.style.fontWeight = weight
        appliedAnyStyle = true
      }
    }
    if (styleProps.fontStyle) {
      const fontStyle = sanitizeFontStyleValue(asText(styleProps.fontStyle).toLowerCase())
      if (fontStyle) {
        node.style.fontStyle = fontStyle
        appliedAnyStyle = true
      }
    }
    if (styleProps.textDecoration) {
      const decoration = sanitizeTextDecorationValue(asText(styleProps.textDecoration).toLowerCase())
      if (decoration) {
        node.style.textDecoration = decoration
        appliedAnyStyle = true
      }
    }
    return appliedAnyStyle
  }

  function getReusableInlineStyleNode(host, range = null) {
    const node = state.activeInlineStyleNode
    if (!node || !node.isConnected) {
      state.activeInlineStyleNode = null
      return null
    }
    if (!host.contains(node)) {
      state.activeInlineStyleNode = null
      return null
    }
    if (range && !isRangeInsideNode(node, range)) {
      state.activeInlineStyleNode = null
      return null
    }
    return node
  }

  function updateCachedRangeFromNode(node, host) {
    if (!node || !node.isConnected || !host.contains(node)) {
      cacheRichTextSelection()
      return
    }
    try {
      const nextRange = document.createRange()
      nextRange.selectNodeContents(node)
      state.cachedTextSelectionRange = nextRange.cloneRange()
      state.cachedTextSelectionHost = host
    } catch {
      cacheRichTextSelection()
    }
  }

  function syncActiveInlineStyleNodeWithSelection(host) {
    const node = state.activeInlineStyleNode
    if (!node) {
      return
    }
    if (!node.isConnected || !host.contains(node)) {
      state.activeInlineStyleNode = null
      return
    }
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return
    }
    const range = selection.getRangeAt(0)
    if (!isRangeInsideNode(node, range)) {
      state.activeInlineStyleNode = null
    }
  }

  function isRangeInsideNode(node, range) {
    if (!(node instanceof Element) || !range) {
      return false
    }
    return isNodeInsideHost(node, range.startContainer) && isNodeInsideHost(node, range.endContainer)
  }

  function stripConflictingInlineStyles(rootNode, styleProps) {
    const keysToClear = []
    if (styleProps.fontFamily) {
      keysToClear.push('fontFamily')
    }
    if (styleProps.fontSize) {
      keysToClear.push('fontSize')
    }
    if (styleProps.color) {
      keysToClear.push('color')
    }
    if (styleProps.fontWeight) {
      keysToClear.push('fontWeight')
    }
    if (styleProps.fontStyle) {
      keysToClear.push('fontStyle')
    }
    if (styleProps.textDecoration) {
      keysToClear.push('textDecoration')
    }
    if (keysToClear.length === 0) {
      return
    }

    const stack = [rootNode]
    while (stack.length > 0) {
      const node = stack.pop()
      if (!node) {
        continue
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node
        for (const key of keysToClear) {
          if (key === 'textDecoration') {
            element.style.textDecoration = ''
            element.style.textDecorationLine = ''
            continue
          }
          element.style[key] = ''
        }
        if (!element.getAttribute('style') || !asText(element.getAttribute('style'))) {
          element.removeAttribute('style')
        }
      }
      for (const child of [...node.childNodes]) {
        stack.push(child)
      }
    }
  }

  function resolveExpandedRichTextSelection() {
    const host =
      getSelectionRichTextHost() ||
      getActiveRichTextHost() ||
      getCachedRichTextSelectionHost() ||
      getInlineStyleNodeHost()
    if (!host) {
      return null
    }

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed && getSelectionRichTextHost() === host) {
      return { host, selection, range: selection.getRangeAt(0) }
    }

    const cachedRange = getCachedRichTextSelectionRangeClone(host)
    if (cachedRange) {
      return { host, selection, range: cachedRange }
    }

    if (isTextControlInteractionActive()) {
      const reusableNode = getReusableInlineStyleNode(host)
      if (reusableNode) {
        try {
          const nodeRange = document.createRange()
          nodeRange.selectNodeContents(reusableNode)
          return { host, selection, range: nodeRange }
        } catch {}
      }
    }

    if (!isTextControlInteractionActive()) {
      if (document.activeElement !== host) {
        host.focus({ preventScroll: true })
      }
      if (restoreCachedRichTextSelection(host)) {
        const restored = window.getSelection()
        if (
          restored &&
          restored.rangeCount > 0 &&
          !restored.isCollapsed &&
          getSelectionRichTextHost() === host
        ) {
          return { host, selection: restored, range: restored.getRangeAt(0) }
        }
      }
    }
    return null
  }

  function getCachedRichTextSelectionRangeClone(host) {
    const cachedHost = getCachedRichTextSelectionHost()
    const range = state.cachedTextSelectionRange
    if (!cachedHost || cachedHost !== host || !range) {
      return null
    }
    try {
      return range.cloneRange()
    } catch {
      return null
    }
  }

  function getInlineStyleNodeHost() {
    const node = state.activeInlineStyleNode
    if (!node || !node.isConnected) {
      return null
    }
    return getRichTextHost(node) || (node.parentElement ? node.parentElement.closest('.rich-text-editable') : null)
  }

  function syncTextStyleControlsFromSelection() {
    const snapshot = getCurrentTextStyleSnapshot()
    const fontFamily =
      snapshot?.fontFamily ||
      (isTextControlInteractionActive() ? normalizeFontFamilyChoice(el.textFontFamily.value) : '') ||
      normalizeFontFamilyChoice(getCurrentTheme().fontFamily)
    const fontSize =
      snapshot?.fontSize ||
      (isTextControlInteractionActive() ? normalizeFontSizeChoice(el.textFontSize.value) : '') ||
      '24'
    const fontColor =
      snapshot?.color ||
      (isTextControlInteractionActive() ? sanitizeHex(el.textFontColor.value, '') : '') ||
      sanitizeHex(getCurrentTheme().textMain, '#16375e')

    state.isSyncingTextStyleControls = true
    try {
      syncTextSelectOption([el.textFontFamily, el.miniTextFontFamily], fontFamily)
      syncTextSelectOption([el.textFontSize, el.miniTextFontSize], fontSize)
      setLinkedControlValues([el.textFontColor, el.miniTextFontColor], fontColor)
    } finally {
      state.isSyncingTextStyleControls = false
    }
  }

  function syncTextSelectOption(selects, value) {
    if (!value) {
      return
    }
    for (const select of selects) {
      ensureSelectOption(select, value)
      select.value = value
    }
  }

  function ensureSelectOption(select, value) {
    const normalized = String(value)
    for (const option of select.options) {
      if (option.value === normalized) {
        return
      }
    }
    const option = document.createElement('option')
    option.value = normalized
    option.textContent = normalized
    select.appendChild(option)
  }

  function getCurrentTextStyleSnapshot() {
    const host =
      getSelectionRichTextHost() || getCachedRichTextSelectionHost() || getActiveRichTextHost()
    if (!host) {
      return null
    }

    const probe = getTextStyleProbeNode(host)
    if (!probe) {
      return null
    }
    const probeElement =
      probe instanceof Element
        ? probe
        : probe instanceof Node && probe.parentElement
          ? probe.parentElement
          : host
    const computed = window.getComputedStyle(probeElement)

    return {
      fontFamily: normalizeFontFamilyChoice(extractFontFamilyName(computed.fontFamily)),
      fontSize: normalizeFontSizeChoice(String(pxToPoints(computed.fontSize))),
      color: normalizeColorToHex(computed.color)
    }
  }

  function getTextStyleProbeNode(host) {
    const liveSelection = window.getSelection()
    if (liveSelection && liveSelection.rangeCount > 0) {
      const liveHost = getSelectionRichTextHost()
      if (liveHost && liveHost === host) {
        const range = liveSelection.getRangeAt(0)
        return range.startContainer
      }
    }

    const cachedHost = getCachedRichTextSelectionHost()
    if (cachedHost && cachedHost === host && state.cachedTextSelectionRange) {
      return state.cachedTextSelectionRange.startContainer
    }
    return null
  }

  function normalizeFontFamilyChoice(value) {
    const name = extractFontFamilyName(value)
    if (!name) {
      return ''
    }
    const lower = name.toLowerCase()
    for (const option of TEXT_FONT_FAMILIES) {
      if (option.toLowerCase() === lower) {
        return option
      }
    }
    return name
  }

  function extractFontFamilyName(value) {
    const text = asText(value)
    if (!text) {
      return ''
    }
    const primary = text.split(',')[0]?.trim().replace(/^["']|["']$/g, '') || ''
    return primary
  }

  function normalizeFontSizeChoice(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) {
      return ''
    }
    let closest = TEXT_FONT_SIZES[0]
    let closestDelta = Math.abs(num - closest)
    for (const option of TEXT_FONT_SIZES) {
      const delta = Math.abs(num - option)
      if (delta < closestDelta) {
        closest = option
        closestDelta = delta
      }
    }
    return String(closest)
  }

  function normalizeFontSizeCss(value) {
    const text = asText(value).toLowerCase()
    if (!text) {
      return ''
    }
    const withUnit = /^([0-9]+(?:\.[0-9]+)?)(pt|px|em|rem|%)$/.exec(text)
    const rawNumber = withUnit ? Number(withUnit[1]) : Number(text)
    const unit = withUnit ? withUnit[2] : 'pt'
    if (!Number.isFinite(rawNumber) || rawNumber <= 0) {
      return ''
    }
    const clamped = Math.min(300, Math.max(4, rawNumber))
    const printable = Number.isInteger(clamped) ? String(clamped) : String(clamped)
    return `${printable}${unit}`
  }

  function pxToPoints(pxText) {
    const px = Number.parseFloat(pxText)
    if (!Number.isFinite(px) || px <= 0) {
      return 24
    }
    return (px * 72) / 96
  }

  function refreshTextToolStates() {
    const hasEditableSelection = Boolean(
      getSelectionRichTextHost() || getCachedRichTextSelectionHost() || getActiveRichTextHost()
    )
    const hasExpandedSelection = Boolean(
      getSelectionRichTextHost() || getCachedRichTextSelectionHost()
    )
    const commandState = getCurrentTextCommandState()
    setTextToolState(el.textToolBold, hasEditableSelection, commandState.bold)
    setTextToolState(el.miniTextToolBold, hasEditableSelection, commandState.bold)
    setTextToolState(el.textToolItalic, hasEditableSelection, commandState.italic)
    setTextToolState(el.miniTextToolItalic, hasEditableSelection, commandState.italic)
    setTextToolState(el.textToolUnderline, hasEditableSelection, commandState.underline)
    setTextToolState(el.miniTextToolUnderline, hasEditableSelection, commandState.underline)
    el.textToolClear.disabled = !hasEditableSelection
    el.miniTextToolClear.disabled = !hasEditableSelection
    el.textFontFamily.disabled = !hasExpandedSelection
    el.miniTextFontFamily.disabled = !hasExpandedSelection
    el.textFontSize.disabled = !hasExpandedSelection
    el.miniTextFontSize.disabled = !hasExpandedSelection
    el.textFontColor.disabled = !hasExpandedSelection
    el.miniTextFontColor.disabled = !hasExpandedSelection
  }

  function setTextToolState(button, enabled, active) {
    button.disabled = !enabled
    button.classList.toggle('is-active', Boolean(enabled && active))
  }

  function getCurrentTextCommandState() {
    const host =
      getSelectionRichTextHost() ||
      getCachedRichTextSelectionHost() ||
      getActiveRichTextHost() ||
      getInlineStyleNodeHost()
    if (!host) {
      return { bold: false, italic: false, underline: false }
    }

    const probe = getTextStyleProbeNode(host) || getReusableInlineStyleNode(host) || host
    const probeElement =
      probe instanceof Element
        ? probe
        : probe instanceof Node && probe.parentElement
          ? probe.parentElement
          : host

    let computed
    try {
      computed = window.getComputedStyle(probeElement)
    } catch {
      return { bold: false, italic: false, underline: false }
    }

    const weightText = asText(computed.fontWeight).toLowerCase()
    const numericWeight = Number.parseInt(weightText, 10)
    const bold =
      weightText === 'bold' || (Number.isFinite(numericWeight) && numericWeight >= 600)
    const italic = asText(computed.fontStyle).toLowerCase().includes('italic')
    const decorationText =
      `${asText(computed.textDecorationLine)} ${asText(computed.textDecoration)}`.toLowerCase()
    const underline = decorationText.includes('underline')

    return { bold, italic, underline }
  }

  function getSelectionRichTextHost() {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return null
    }
    const anchorHost = getRichTextHost(selection.anchorNode)
    const focusHost = getRichTextHost(selection.focusNode)
    if (!anchorHost || anchorHost !== focusHost) {
      return null
    }
    return anchorHost
  }

  function getEditingRichTextHost() {
    return getSelectionRichTextHost() || getActiveRichTextHost() || getCachedRichTextSelectionHost()
  }

  function hasNonCollapsedSelectionInHost(host) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false
    }
    return getSelectionRichTextHost() === host
  }

  function cacheRichTextSelection() {
    const selection = window.getSelection()
    const host = getSelectionRichTextHost()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !host) {
      return
    }
    try {
      state.cachedTextSelectionRange = selection.getRangeAt(0).cloneRange()
      state.cachedTextSelectionHost = host
    } catch {}
  }

  function clearCachedRichTextSelection() {
    state.cachedTextSelectionRange = null
    state.cachedTextSelectionHost = null
    state.activeInlineStyleNode = null
  }

  function getCachedRichTextSelectionHost() {
    const host = state.cachedTextSelectionHost
    const range = state.cachedTextSelectionRange
    if (!host || !range) {
      return null
    }
    if (!host.isConnected) {
      clearCachedRichTextSelection()
      return null
    }
    if (!isNodeInsideHost(host, range.startContainer) || !isNodeInsideHost(host, range.endContainer)) {
      clearCachedRichTextSelection()
      return null
    }
    return host
  }

  function restoreCachedRichTextSelection(host) {
    const cachedHost = getCachedRichTextSelectionHost()
    const range = state.cachedTextSelectionRange
    if (!cachedHost || cachedHost !== host || !range) {
      return false
    }
    const selection = window.getSelection()
    if (!selection) {
      return false
    }
    try {
      selection.removeAllRanges()
      selection.addRange(range)
      return !selection.isCollapsed
    } catch {
      return false
    }
  }

  function isNodeInsideHost(host, node) {
    if (!node) {
      return false
    }
    if (node === host) {
      return true
    }
    if (node instanceof Element) {
      return host.contains(node)
    }
    return node.parentElement ? host.contains(node.parentElement) : false
  }

  function getRichTextHost(node) {
    if (!node) {
      return null
    }
    if (node instanceof HTMLElement && node.classList.contains('rich-text-editable')) {
      return node
    }
    const element =
      node instanceof Element
        ? node
        : node.parentElement instanceof Element
          ? node.parentElement
          : null
    if (!element) {
      return null
    }
    const host = element.closest('.rich-text-editable')
    return host instanceof HTMLElement ? host : null
  }

  function getActiveRichTextHost() {
    const host = state.activeTextHost
    if (!host) {
      return null
    }
    if (!host.isConnected) {
      state.activeTextHost = null
      return null
    }
    return host
  }

  function commitRichTextHost(host, options = {}) {
    const textKey = asText(host.dataset.textKey)
    if (!textKey) {
      return
    }
    if (isLiveBoundTextKey(textKey)) {
      host.dataset.richTextHtml = sanitizeRichTextHtml(host.innerHTML)
      return
    }
    const normalizeDom = options.normalizeDom === true
    const recordHistory = options.recordHistory !== false && !historyState.applying
    const historyMode = asText(options.historyMode).toLowerCase()
    const historyLabel = asText(options.historyLabel) || 'Edit text'
    const sanitized = sanitizeRichTextHtml(host.innerHTML)
    if (normalizeDom && host.innerHTML !== sanitized) {
      host.innerHTML = sanitized
    }
    const hadValue = Object.prototype.hasOwnProperty.call(state.textOverrides, textKey)
    if (!hadValue || state.textOverrides[textKey] !== sanitized) {
      state.textOverrides[textKey] = sanitized
      saveTextOverrides(state.textOverrides)
      if (recordHistory) {
        if (historyMode === 'typing') {
          scheduleTypingHistoryCheckpoint()
        } else {
          recordHistoryCheckpoint(historyLabel)
        }
      }
    }
    host.dataset.richTextHtml = sanitized
  }

  function renderRichText(node, textKey, fallbackText) {
    const fallbackHtml = textToRichHtml(fallbackText)
    const allowOverrides = !isLiveBoundTextKey(textKey)
    const hadOverride =
      allowOverrides && Object.prototype.hasOwnProperty.call(state.textOverrides, textKey)
    let hasOverride = hadOverride
    if (
      hasOverride &&
      isPollQuestionTextKey(textKey) &&
      isStaleQuestionOverride(state.textOverrides[textKey])
    ) {
      delete state.textOverrides[textKey]
      saveTextOverrides(state.textOverrides)
      hasOverride = false
    }
    const nextHtml = hasOverride ? state.textOverrides[textKey] : fallbackHtml
    if (!allowOverrides && Object.prototype.hasOwnProperty.call(state.textOverrides, textKey)) {
      delete state.textOverrides[textKey]
      saveTextOverrides(state.textOverrides)
    }

    node.classList.add('rich-text-editable')
    node.setAttribute('contenteditable', 'true')
    node.setAttribute('spellcheck', 'true')
    const previousTextKey = asText(node.dataset.textKey)
    node.dataset.textKey = textKey

    if (
      state.activeTextHost === node &&
      document.activeElement === node &&
      previousTextKey === textKey
    ) {
      return
    }
    if (node.dataset.richTextHtml !== nextHtml) {
      node.innerHTML = nextHtml
      node.dataset.richTextHtml = nextHtml
    }
  }

  function isRichTextEditingActive() {
    const host = getActiveRichTextHost()
    const inlineHost = getInlineStyleNodeHost()
    const resolvedHost = host || inlineHost
    if (!resolvedHost) {
      return false
    }
    if (document.activeElement === resolvedHost) {
      return true
    }
    if (isTextControlElement(document.activeElement) && getCachedRichTextSelectionHost() === resolvedHost) {
      return true
    }
    if (state.activeInlineStyleNode && state.activeInlineStyleNode.isConnected && resolvedHost.contains(state.activeInlineStyleNode)) {
      return true
    }
    if (isTextControlInteractionActive()) {
      const cachedHost = getCachedRichTextSelectionHost()
      if (cachedHost && cachedHost === resolvedHost) {
        return true
      }
    }
    return false
  }

  function flushRichTextHostsToOverrides() {
    if (historyState.applying) {
      return
    }
    const hosts = el.wrap.querySelectorAll('.rich-text-editable[data-text-key]')
    for (const host of hosts) {
      if (!(host instanceof HTMLElement)) {
        continue
      }
      commitRichTextHost(host, { normalizeDom: false, recordHistory: false })
    }
  }

  function showTextEditFeedback(text, type) {
    el.textEditFeedback.textContent = text
    if (type === 'success') {
      el.textEditFeedback.style.color = '#216e43'
      return
    }
    if (type === 'error') {
      el.textEditFeedback.style.color = '#b53a4e'
      return
    }
    el.textEditFeedback.style.color = '#5f7ea3'
  }

  return {
    clearCachedRichTextSelection,
    extractFontFamilyName,
    fillSelectOptions,
    flushRichTextHostsToOverrides,
    getActiveRichTextHost,
    getEditingRichTextHost,
    getRichTextHost,
    handleRichTextFocusIn,
    handleRichTextFocusOut,
    handleRichTextInput,
    handleRichTextKeydown,
    handleRichTextPaste,
    handleRichTextPointerDown,
    handleRichTextSelectionChange,
    hideSelectionToolbar,
    isRichTextEditingActive,
    isTextControlElement,
    normalizeFontFamilyChoice,
    normalizeFontSizeChoice,
    normalizeFontSizeCss,
    pxToPoints,
    refreshTextToolStates,
    renderRichText,
    scheduleSelectionToolbarUpdate,
    setupRichTextEditor,
    syncTextSelectOption,
    syncTextStyleControlsFromSelection
  }
}

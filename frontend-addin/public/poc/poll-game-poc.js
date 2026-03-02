;(() => {
  const DEFAULT_API_BASE = 'https://prezo-backend-production.up.railway.app'
  const DEFAULT_POLL_SELECTOR = 'latest/open'
  const THEME_LIBRARY_KEY = 'prezo.poll-game-poc.themes.v1'
  const THEME_DRAFT_KEY = 'prezo.poll-game-poc.theme-draft.v1'
  const RIBBON_TAB_KEY = 'prezo.poll-game-poc.ribbon-tab.v1'
  const RIBBON_COLLAPSED_KEY = 'prezo.poll-game-poc.ribbon-collapsed.v1'
  const RIBBON_HIDDEN_KEY = 'prezo.poll-game-poc.ribbon-hidden.v1'
  const RIBBON_ADVANCED_KEY = 'prezo.poll-game-poc.ribbon-advanced.v1'
  const TEXT_OVERRIDES_KEY = 'prezo.poll-game-poc.text-overrides.v1'
  const TEXT_FONT_FAMILIES = [
    'Aptos',
    'Arial',
    'Bahnschrift',
    'Calibri',
    'Cambria',
    'Candara',
    'Comic Sans MS',
    'Consolas',
    'Constantia',
    'Corbel',
    'Courier New',
    'Franklin Gothic Medium',
    'Garamond',
    'Georgia',
    'Impact',
    'Lucida Sans Unicode',
    'Palatino Linotype',
    'Segoe UI',
    'Tahoma',
    'Times New Roman',
    'Trebuchet MS',
    'Verdana'
  ]
  const TEXT_FONT_SIZES = [
    8,
    9,
    10,
    10.5,
    11,
    12,
    14,
    16,
    18,
    20,
    24,
    28,
    32,
    36,
    40,
    44,
    48,
    54,
    60,
    66,
    72
  ]

  const query = new URLSearchParams(window.location.search)

  const parsePollSelector = (raw) => {
    const value = asText(raw)
    if (!value) {
      return { mode: 'latestOpen', descriptor: DEFAULT_POLL_SELECTOR, explicitId: '' }
    }
    const lower = value.toLowerCase()
    if (lower === 'latest/open' || lower === 'open/latest' || lower === 'latestopen') {
      return { mode: 'latestOpen', descriptor: 'latest/open', explicitId: '' }
    }
    if (lower === 'latest') {
      return { mode: 'latest', descriptor: 'latest', explicitId: '' }
    }
    if (lower === 'open') {
      return { mode: 'open', descriptor: 'open', explicitId: '' }
    }
    return { mode: 'id', descriptor: value, explicitId: value }
  }

  const pollSelector = parsePollSelector(query.get('pollId'))
  const state = {
    apiBase: normalizeApiBase(query.get('apiBase')) || DEFAULT_API_BASE,
    sessionId: asText(query.get('sessionId')),
    code: normalizeCode(query.get('code')),
    pollSelector,
    snapshot: null,
    currentPoll: null,
    socket: null,
    socketStatus: 'connecting',
    reconnectTimer: null,
    pollTimer: null,
    fetchPromise: null,
    isUnloading: false,
    lastRenderKey: '',
    raceRows: new Map(),
    racePollId: null,
    raceAnimFrameId: null,
    raceAnimLastTs: 0,
    textOverrides: loadTextOverrides(),
    activeTextHost: null,
    selectionToolbarRafId: null,
    cachedTextSelectionRange: null,
    cachedTextSelectionHost: null,
    isSyncingTextStyleControls: false,
    textControlInteractionUntil: 0,
    textControlInteractionLocked: false,
    activeInlineStyleNode: null
  }

  const el = {
    bgImage: must('bg-image'),
    bgOverlay: must('bg-overlay'),
    gridBg: must('grid-bg'),
    wrap: must('canvas-wrap'),
    settingsRibbon: must('settings-ribbon'),
    settingsToggle: must('settings-toggle'),
    ribbonAdvancedToggle: must('ribbon-advanced-toggle'),
    settingsMinimized: must('settings-minimized'),
    settingsBackdrop: must('settings-backdrop'),
    selectionToolbar: must('selection-toolbar'),
    settingsPanel: must('settings-panel'),
    settingsClose: must('settings-close'),
    dragModeEnabled: must('drag-mode-enabled'),
    themeName: must('theme-name'),
    themeSelect: must('theme-select'),
    saveTheme: must('save-theme'),
    loadTheme: must('load-theme'),
    deleteTheme: must('delete-theme'),
    exportTheme: must('export-theme'),
    importTheme: must('import-theme'),
    resetTheme: must('reset-theme'),
    themeFeedback: must('theme-feedback'),
    textEditFeedback: must('text-edit-feedback'),
    textToolBold: must('text-tool-bold'),
    textToolItalic: must('text-tool-italic'),
    textToolUnderline: must('text-tool-underline'),
    textToolClear: must('text-tool-clear'),
    textFontFamily: must('text-font-family'),
    textFontSize: must('text-font-size'),
    textFontColor: must('text-font-color'),
    miniTextToolBold: must('mini-text-tool-bold'),
    miniTextToolItalic: must('mini-text-tool-italic'),
    miniTextToolUnderline: must('mini-text-tool-underline'),
    miniTextToolClear: must('mini-text-tool-clear'),
    miniTextFontFamily: must('mini-text-font-family'),
    miniTextFontSize: must('mini-text-font-size'),
    miniTextFontColor: must('mini-text-font-color'),
    question: must('question'),
    status: must('status'),
    votes: must('votes'),
    options: must('options'),
    footer: must('footer'),
    dot: document.querySelector('.dot'),
    customLogo: must('custom-logo'),
    customAsset: must('custom-asset'),
    headLeft: must('head-left'),
    headRight: must('head-right'),
    metaBar: must('meta-bar')
  }
  const ribbonTabs = [...document.querySelectorAll('.ribbon-tab')]
  const ribbonPanes = [...document.querySelectorAll('.ribbon-pane')]

  const defaultTheme = Object.freeze({
    bgImageUrl: '',
    bgImageOpacity: 0,
    bgA: '#f4f8ff',
    bgB: '#dff0ff',
    overlayColor: '#eef5ff',
    overlayOpacity: 0.22,
    gridVisible: true,
    gridOpacity: 0.1,
    panelColor: '#ffffff',
    panelOpacity: 0.82,
    panelBorder: '#9bc5ef',
    textMain: '#16375e',
    textSub: '#55769d',
    trackColor: '#c7d8ea',
    trackOpacity: 0.58,
    fillA: '#64c8ff',
    fillB: '#4a89ff',
    barHeight: 24,
    barRadius: 999,
    questionSize: 62,
    labelSize: 24,
    visualMode: 'classic',
    raceCar: 'car',
    raceCarImageUrl: '',
    raceCarSize: 30,
    raceTrackColor: '#d7e6f6',
    raceTrackOpacity: 0.88,
    raceSpeed: 0.78,
    logoUrl: '',
    logoWidth: 140,
    logoOpacity: 1,
    logoX: 88,
    logoY: 10,
    assetUrl: '',
    assetWidth: 320,
    assetOpacity: 0.38,
    assetX: 50,
    assetY: 50,
    panelX: 0,
    panelY: 0,
    bgImageX: 0,
    bgImageY: 0,
    bgOverlayX: 0,
    bgOverlayY: 0,
    gridX: 0,
    gridY: 0,
    titleX: 0,
    titleY: 0,
    metaX: 0,
    metaY: 0,
    optionsX: 0,
    optionsY: 0,
    footerX: 0,
    footerY: 0,
    optionOffsets: {},
    fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif'
  })

  const themeControls = [
    { id: 'theme-bg-image-url', key: 'bgImageUrl', type: 'text' },
    { id: 'theme-bg-a', key: 'bgA', type: 'color' },
    { id: 'theme-bg-b', key: 'bgB', type: 'color' },
    { id: 'theme-overlay-color', key: 'overlayColor', type: 'color' },
    { id: 'theme-bg-image-opacity', key: 'bgImageOpacity', type: 'number' },
    { id: 'theme-overlay-opacity', key: 'overlayOpacity', type: 'number' },
    { id: 'theme-grid-visible', key: 'gridVisible', type: 'checkbox' },
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
    { id: 'theme-race-car', key: 'raceCar', type: 'text' },
    { id: 'theme-race-car-image-url', key: 'raceCarImageUrl', type: 'text' },
    { id: 'theme-race-car-size', key: 'raceCarSize', type: 'number' },
    { id: 'theme-race-track-color', key: 'raceTrackColor', type: 'color' },
    { id: 'theme-race-track-opacity', key: 'raceTrackOpacity', type: 'number' },
    { id: 'theme-race-speed', key: 'raceSpeed', type: 'number' },
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

  const controlElements = Object.fromEntries(
    themeControls.map((spec) => [spec.id, document.getElementById(spec.id)])
  )

  let themeLibrary = loadThemeLibrary()
  let currentTheme = loadInitialTheme(themeLibrary)
  const dragState = {
    enabled: false,
    active: null
  }
  const ribbonState = {
    activeTab: 'home',
    collapsed: false,
    hidden: false,
    advanced: false
  }

  init()

  function init() {
    setupSettingsPanel()
    setupThemeEditor()
    setupRichTextEditor()
    setupDragInteractions()
    setupRibbonOffsetTracking()
    setupCanvasFitBehavior()
    applyTheme(currentTheme)
    syncThemeControls()
    refreshThemeSelect(themeLibrary.activeName)
    renderInitialState()
    void startSessionFeed()
    window.addEventListener('beforeunload', handleUnload)
  }

  function setupSettingsPanel() {
    const storedTab = asText(safeStorageGet(RIBBON_TAB_KEY))
    setActiveRibbonTab(storedTab || 'home', { persist: false })
    setRibbonAdvanced(safeStorageGet(RIBBON_ADVANCED_KEY) === '1', { persist: false })
    setRibbonCollapsed(safeStorageGet(RIBBON_COLLAPSED_KEY) === '1', { persist: false })
    setRibbonHidden(safeStorageGet(RIBBON_HIDDEN_KEY) === '1', { persist: false })

    for (const tab of ribbonTabs) {
      tab.addEventListener('click', () => {
        const nextTab = asText(tab.dataset.ribbonTab)
        setActiveRibbonTab(nextTab)
        if (ribbonState.hidden) {
          setRibbonHidden(false)
        }
        if (ribbonState.collapsed) {
          setRibbonCollapsed(false)
        }
      })
    }

    el.settingsToggle.addEventListener('click', () => {
      if (ribbonState.hidden) {
        setRibbonHidden(false)
      }
      setRibbonCollapsed(!ribbonState.collapsed)
    })
    el.ribbonAdvancedToggle.addEventListener('click', () => {
      setRibbonAdvanced(!ribbonState.advanced)
    })
    el.settingsClose.addEventListener('click', () => {
      setRibbonHidden(true)
    })
    el.settingsMinimized.addEventListener('click', () => {
      setRibbonHidden(false)
      setRibbonCollapsed(false)
    })
    el.settingsBackdrop.addEventListener('click', () => {
      if (!ribbonState.hidden) {
        setRibbonCollapsed(true)
      }
    })
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return
      }
      if (ribbonState.hidden) {
        return
      }
      if (!ribbonState.collapsed) {
        setRibbonCollapsed(true)
        return
      }
      setRibbonHidden(true)
    })
  }

  function setupRibbonOffsetTracking() {
    applyRibbonLayoutMode()
  }

  function scheduleRibbonOffsetUpdate() {
    applyRibbonLayoutMode()
  }

  function updateRibbonOffset() {
    applyRibbonLayoutMode()
  }

  function setupCanvasFitBehavior() {
    el.wrap.addEventListener('pointerdown', handleCanvasPointerDown)
    applyRibbonLayoutMode()
  }

  function handleCanvasPointerDown(event) {
    if (ribbonState.hidden || dragState.enabled) {
      return
    }
    if (event.target instanceof Element && event.target.closest('#selection-toolbar')) {
      return
    }
    if (event.target instanceof Element && event.target.closest('.rich-text-editable')) {
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    setRibbonHidden(true)
  }

  function scheduleCanvasFitUpdate() {
    applyRibbonLayoutMode()
  }

  function updateCanvasScale() {
    applyRibbonLayoutMode()
  }

  function applyRibbonLayoutMode() {
    const isHidden = ribbonState.hidden
    const isEditing = !isHidden && !ribbonState.collapsed
    const offset = isHidden ? 0 : isEditing ? 197 : 42
    const canvasScale = isEditing ? 0.85 : 1

    document.body.classList.toggle('ribbon-editing', isEditing)
    document.documentElement.style.setProperty('--ribbon-offset', `${offset}px`)
    document.documentElement.style.setProperty('--canvas-scale', `${canvasScale}`)
  }

  function setActiveRibbonTab(tabName, options = {}) {
    const persist = options.persist !== false
    const availableTabs = new Set(
      ribbonTabs.map((tab) => asText(tab.dataset.ribbonTab)).filter(Boolean)
    )
    const nextTab = availableTabs.has(tabName) ? tabName : 'home'
    ribbonState.activeTab = nextTab

    for (const tab of ribbonTabs) {
      const tabId = asText(tab.dataset.ribbonTab)
      const isActive = tabId === nextTab
      tab.classList.toggle('active', isActive)
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false')
    }
    for (const pane of ribbonPanes) {
      const paneId = asText(pane.dataset.ribbonPane)
      pane.classList.toggle('active', paneId === nextTab)
    }
    if (persist) {
      try {
        localStorage.setItem(RIBBON_TAB_KEY, nextTab)
      } catch {}
    }
    scheduleRibbonOffsetUpdate()
  }

  function setRibbonCollapsed(collapsed, options = {}) {
    const persist = options.persist !== false
    ribbonState.collapsed = Boolean(collapsed)

    el.settingsPanel.classList.toggle('open', !ribbonState.collapsed)
    document.body.classList.toggle('ribbon-collapsed', ribbonState.collapsed && !ribbonState.hidden)
    el.settingsToggle.textContent = ribbonState.collapsed ? 'Expand' : 'Collapse'

    if (persist) {
      try {
        localStorage.setItem(RIBBON_COLLAPSED_KEY, ribbonState.collapsed ? '1' : '0')
      } catch {}
    }
    scheduleRibbonOffsetUpdate()
  }

  function setRibbonHidden(hidden, options = {}) {
    const persist = options.persist !== false
    ribbonState.hidden = Boolean(hidden)

    el.settingsRibbon.classList.toggle('hidden', ribbonState.hidden)
    el.settingsMinimized.classList.toggle('hidden', !ribbonState.hidden)
    document.body.classList.toggle('ribbon-hidden', ribbonState.hidden)
    document.body.classList.toggle('ribbon-collapsed', ribbonState.collapsed && !ribbonState.hidden)

    if (persist) {
      try {
        localStorage.setItem(RIBBON_HIDDEN_KEY, ribbonState.hidden ? '1' : '0')
      } catch {}
    }
    scheduleRibbonOffsetUpdate()
  }

  function setRibbonAdvanced(advanced, options = {}) {
    const persist = options.persist !== false
    ribbonState.advanced = Boolean(advanced)
    document.body.classList.toggle('ribbon-advanced', ribbonState.advanced)
    el.ribbonAdvancedToggle.classList.toggle('is-active', ribbonState.advanced)
    el.ribbonAdvancedToggle.setAttribute('aria-pressed', ribbonState.advanced ? 'true' : 'false')
    el.ribbonAdvancedToggle.textContent = ribbonState.advanced ? 'Advanced On' : 'Advanced'

    if (persist) {
      try {
        localStorage.setItem(RIBBON_ADVANCED_KEY, ribbonState.advanced ? '1' : '0')
      } catch {}
    }
    scheduleRibbonOffsetUpdate()
  }

  function setupThemeEditor() {
    for (const spec of themeControls) {
      const input = controlElements[spec.id]
      if (!input) {
        continue
      }
      const eventName =
        spec.type === 'checkbox' || spec.type === 'select' ? 'change' : 'input'
      input.addEventListener(eventName, () => {
        const value = readControlValue(input, spec.type)
        updateTheme({ [spec.key]: value })
        if (
          state.snapshot &&
          (spec.key === 'visualMode' ||
            (currentTheme.visualMode === 'race' && spec.key.startsWith('race')))
        ) {
          renderFromSnapshot(true)
        }
      })
    }

    el.saveTheme.addEventListener('click', saveTheme)
    el.loadTheme.addEventListener('click', loadThemeFromSelect)
    el.deleteTheme.addEventListener('click', deleteThemeFromSelect)
    el.exportTheme.addEventListener('click', exportCurrentTheme)
    el.importTheme.addEventListener('change', importThemeFromFile)
    el.resetTheme.addEventListener('click', resetThemeDraft)

    bindImageUpload('theme-bg-image-upload', 'bgImageUrl', 'Background image applied.')
    bindImageUpload('theme-race-car-upload', 'raceCarImageUrl', 'Race car image applied.')
    bindImageUpload('theme-logo-upload', 'logoUrl', 'Logo applied.')
    bindImageUpload('theme-asset-upload', 'assetUrl', 'Overlay asset applied.')
  }

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
    commitRichTextHost(host, { normalizeDom: !preservingSelectionForControl })
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
    commitRichTextHost(host)
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
    commitRichTextHost(host)
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
    commitRichTextHost(host)
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
      commitRichTextHost(host, { normalizeDom: false })
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
    commitRichTextHost(host, { normalizeDom: false })
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
      normalizeFontFamilyChoice(currentTheme.fontFamily)
    const fontSize =
      snapshot?.fontSize ||
      (isTextControlInteractionActive() ? normalizeFontSizeChoice(el.textFontSize.value) : '') ||
      '24'
    const fontColor =
      snapshot?.color ||
      (isTextControlInteractionActive() ? sanitizeHex(el.textFontColor.value, '') : '') ||
      sanitizeHex(currentTheme.textMain, '#16375e')

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

  function normalizeColorToHex(colorText) {
    const directHex = sanitizeHex(colorText, '')
    if (directHex) {
      return directHex.toLowerCase()
    }
    const rgbMatch = /rgba?\(([^)]+)\)/i.exec(asText(colorText))
    if (!rgbMatch) {
      return '#16375e'
    }
    const channels = rgbMatch[1]
      .split(',')
      .map((entry) => Number.parseFloat(entry.trim()))
      .filter((entry, index) => Number.isFinite(entry) && index < 3)
    if (channels.length < 3) {
      return '#16375e'
    }
    const r = clamp(Math.round(channels[0]), 0, 255, 0)
    const g = clamp(Math.round(channels[1]), 0, 255, 0)
    const b = clamp(Math.round(channels[2]), 0, 255, 0)
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
  }

  function toHexByte(value) {
    return Number(value).toString(16).padStart(2, '0')
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
    const normalizeDom = options.normalizeDom === true
    const sanitized = sanitizeRichTextHtml(host.innerHTML)
    if (normalizeDom && host.innerHTML !== sanitized) {
      host.innerHTML = sanitized
    }
    const hadValue = Object.prototype.hasOwnProperty.call(state.textOverrides, textKey)
    if (!hadValue || state.textOverrides[textKey] !== sanitized) {
      state.textOverrides[textKey] = sanitized
      saveTextOverrides(state.textOverrides)
    }
    host.dataset.richTextHtml = sanitized
  }

  function renderRichText(node, textKey, fallbackText) {
    const fallbackHtml = textToRichHtml(fallbackText)
    const hasOverride = Object.prototype.hasOwnProperty.call(state.textOverrides, textKey)
    const nextHtml = hasOverride ? state.textOverrides[textKey] : fallbackHtml

    node.classList.add('rich-text-editable')
    node.setAttribute('contenteditable', 'true')
    node.setAttribute('spellcheck', 'true')
    node.dataset.textKey = textKey

    if (state.activeTextHost === node && document.activeElement === node) {
      return
    }
    if (node.dataset.richTextHtml !== nextHtml) {
      node.innerHTML = nextHtml
      node.dataset.richTextHtml = nextHtml
    }
  }

  function clearRichTextNode(node) {
    if (state.activeTextHost === node) {
      state.activeTextHost = null
      refreshTextToolStates()
      hideSelectionToolbar()
    }
    if (state.cachedTextSelectionHost === node) {
      clearCachedRichTextSelection()
    }
    if (state.activeInlineStyleNode && node.contains(state.activeInlineStyleNode)) {
      state.activeInlineStyleNode = null
    }
    node.classList.remove('rich-text-editable')
    node.removeAttribute('contenteditable')
    node.removeAttribute('spellcheck')
    delete node.dataset.textKey
    delete node.dataset.richTextHtml
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

  function setupDragInteractions() {
    el.dragModeEnabled.addEventListener('change', () => {
      setDragMode(Boolean(el.dragModeEnabled.checked))
    })

    window.addEventListener('pointermove', handleDragPointerMove)
    window.addEventListener('pointerup', handleDragPointerRelease)
    window.addEventListener('pointercancel', handleDragPointerRelease)

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
    registerDragTarget(el.headLeft, 'titleX', 'titleY', {
      unit: 'px',
      minX: -1600,
      maxX: 1600,
      minY: -1200,
      maxY: 1200,
      skipWhenHidden: false
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
      skipWhenHidden: false
    })
  }

  function setDragMode(enabled) {
    dragState.enabled = Boolean(enabled)
    el.dragModeEnabled.checked = dragState.enabled
    document.body.classList.toggle('drag-mode', dragState.enabled)
    if (dragState.enabled && (currentTheme.panelX !== 0 || currentTheme.panelY !== 0)) {
      updateTheme({ panelX: 0, panelY: 0 }, { persist: false })
      syncSingleControlValue('panelX', 0)
      syncSingleControlValue('panelY', 0)
    }
    if (!dragState.enabled && dragState.active) {
      dragState.active.node.classList.remove('dragging')
      dragState.active = null
    }
    showThemeFeedback(
      dragState.enabled
        ? 'Drag mode enabled. Drag objects independently (title, option labels, poll bars, background layers, logos/assets).'
        : 'Drag mode disabled.',
      'success'
    )
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
    const getPosition = typeof options.getPosition === 'function' ? options.getPosition : null
    const setPosition = typeof options.setPosition === 'function' ? options.setPosition : null
    const onCommit = typeof options.onCommit === 'function' ? options.onCommit : null

    node.addEventListener('pointerdown', (event) => {
      if (!dragState.enabled || (skipWhenHidden && node.classList.contains('hidden'))) {
        return
      }
      if (requireDirectTarget && event.target !== node) {
        return
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return
      }
      const wrapRect = getWrapRect()
      if (!wrapRect || wrapRect.width <= 0 || wrapRect.height <= 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const startPosition = getPosition ? getPosition() : null
      dragState.active = {
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
        startX: clamp(startPosition?.x ?? currentTheme[xKey], minX, maxX, defaultX),
        startY: clamp(startPosition?.y ?? currentTheme[yKey], minY, maxY, defaultY),
        setPosition,
        onCommit
      }
      node.classList.add('dragging')
      try {
        node.setPointerCapture(event.pointerId)
      } catch {}
    })
  }

  function handleDragPointerMove(event) {
    const active = dragState.active
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
    const deltaX =
      active.unit === 'px'
        ? event.clientX - active.startClientX
        : ((event.clientX - active.startClientX) / wrapRect.width) * 100
    const deltaY =
      active.unit === 'px'
        ? event.clientY - active.startClientY
        : ((event.clientY - active.startClientY) / wrapRect.height) * 100
    const nextX = clamp(active.startX + deltaX, active.minX, active.maxX, active.startX)
    const nextY = clamp(active.startY + deltaY, active.minY, active.maxY, active.startY)

    if (active.setPosition) {
      active.setPosition(nextX, nextY)
      return
    }

    if (active.xKey && active.yKey) {
      updateTheme(
        {
          [active.xKey]: nextX,
          [active.yKey]: nextY
        },
        { persist: false }
      )
      syncSingleControlValue(active.xKey, nextX)
      syncSingleControlValue(active.yKey, nextY)
    }
  }

  function handleDragPointerRelease(event) {
    const active = dragState.active
    if (!active || active.pointerId !== event.pointerId) {
      return
    }

    active.node.classList.remove('dragging')
    try {
      active.node.releasePointerCapture(event.pointerId)
    } catch {}
    dragState.active = null
    if (active.onCommit) {
      active.onCommit()
      return
    }
    saveThemeDraft(currentTheme)
    showThemeFeedback('Object position updated. Save theme to keep it in a named preset.', 'success')
  }

  function ensureOptionOffsets() {
    if (!currentTheme.optionOffsets || typeof currentTheme.optionOffsets !== 'object') {
      currentTheme.optionOffsets = {}
    }
    return currentTheme.optionOffsets
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

  function applyOptionOffsetTransform(node, optionId, part = 'row') {
    const offset = getOptionDragOffset(optionId, part)
    node.style.transform = `translate(${offset.x}px, ${offset.y}px)`
  }

  function registerOptionDragTarget(node, optionId, part = 'row') {
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
      getPosition: () => getOptionDragOffset(optionId, part),
      setPosition: (x, y) => {
        setOptionDragOffset(optionId, x, y, part)
        node.style.transform = `translate(${x}px, ${y}px)`
      }
    })
  }

  function registerRaceOptionDragTarget(row) {
    if (!row || !row.optionId || row.root.dataset.dragRegistered === '1') {
      return
    }
    row.root.dataset.dragRegistered = '1'
    row.root.classList.add('drag-target')
    attachDragBehavior(row.root, null, null, {
      unit: 'px',
      minX: -2400,
      maxX: 2400,
      minY: -2400,
      maxY: 2400,
      skipWhenHidden: false,
      getPosition: () => ({
        x: row.dragOffsetX,
        y: row.dragOffsetY
      }),
      setPosition: (x, y) => {
        row.dragOffsetX = x
        row.dragOffsetY = y
        setOptionDragOffset(row.optionId, x, y, 'row')
        applyRaceRowTransform(row)
      }
    })
  }

  function applyRaceRowTransform(row) {
    row.root.style.transform = `translate(${row.dragOffsetX}px, ${row.currentY + row.dragOffsetY}px)`
  }

  function getWrapRect() {
    return el.wrap.getBoundingClientRect()
  }

  function renderInitialState() {
    clearRichTextNode(el.question)
    el.question.textContent = 'Waiting for poll data...'
    el.options.innerHTML = ''
    el.footer.textContent = `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, poll: ${state.pollSelector.descriptor}`
    updateMeta(null, 0)
  }

  async function startSessionFeed() {
    if (!state.sessionId && !state.code) {
      renderMissingSession()
      return
    }

    try {
      if (!state.sessionId && state.code) {
        const resolvedSession = await fetchJson(
          `/sessions/code/${encodeURIComponent(state.code)}`
        )
        state.sessionId = asText(resolvedSession.id)
        state.code = normalizeCode(resolvedSession.code) || state.code
      }

      if (!state.sessionId) {
        renderError('Unable to resolve session.')
        return
      }

      connectSocket()
      await refreshSnapshot(true)
      startSnapshotPolling()
    } catch (error) {
      renderError(errorToMessage(error))
    }
  }

  function startSnapshotPolling() {
    stopSnapshotPolling()
    state.pollTimer = window.setInterval(() => {
      void refreshSnapshot(false)
    }, 6000)
  }

  function stopSnapshotPolling() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer)
      state.pollTimer = null
    }
  }

  async function refreshSnapshot(forceRender) {
    if (!state.sessionId) {
      return null
    }
    if (state.fetchPromise) {
      return state.fetchPromise
    }

    state.fetchPromise = fetchJson(`/sessions/${encodeURIComponent(state.sessionId)}/snapshot`)
      .then((snapshot) => {
        state.snapshot = snapshot
        if (snapshot?.session?.code) {
          state.code = normalizeCode(snapshot.session.code) || state.code
        }
        renderFromSnapshot(forceRender)
        return snapshot
      })
      .catch((error) => {
        if (!state.snapshot) {
          throw error
        }
      })
      .finally(() => {
        state.fetchPromise = null
      })

    return state.fetchPromise
  }

  function connectSocket() {
    if (!state.sessionId) {
      return
    }

    disconnectSocket()
    state.socketStatus = 'connecting'
    updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))

    const url = `${toWsBase(state.apiBase)}/ws/sessions/${encodeURIComponent(state.sessionId)}`
    let socket
    try {
      socket = new WebSocket(url)
    } catch {
      state.socketStatus = 'error'
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
      return
    }

    state.socket = socket
    socket.addEventListener('open', () => {
      if (state.socket !== socket) {
        return
      }
      state.socketStatus = 'connected'
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
    })

    socket.addEventListener('message', (event) => {
      handleSocketMessage(event.data)
    })

    socket.addEventListener('close', () => {
      if (state.socket !== socket) {
        return
      }
      state.socket = null
      if (state.isUnloading) {
        return
      }
      state.socketStatus = 'disconnected'
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
      scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      if (state.socket !== socket) {
        return
      }
      state.socketStatus = 'error'
      updateMeta(state.currentPoll, getTotalVotes(state.currentPoll))
    })
  }

  function scheduleReconnect() {
    if (state.reconnectTimer || state.isUnloading) {
      return
    }
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null
      connectSocket()
      void refreshSnapshot(false)
    }, 2800)
  }

  function disconnectSocket() {
    if (!state.socket) {
      return
    }
    const activeSocket = state.socket
    state.socket = null
    try {
      activeSocket.close()
    } catch {}
  }

  function handleSocketMessage(raw) {
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object') {
      return
    }

    const eventPayload = payload.payload && typeof payload.payload === 'object' ? payload.payload : {}
    if (payload.type === 'session_snapshot' && eventPayload.snapshot) {
      state.snapshot = eventPayload.snapshot
      if (state.snapshot?.session?.code) {
        state.code = normalizeCode(state.snapshot.session.code) || state.code
      }
      renderFromSnapshot(false)
      return
    }

    let hasPatch = false
    if (eventPayload.session && typeof eventPayload.session === 'object') {
      ensureSnapshotContainer()
      state.snapshot.session = eventPayload.session
      if (eventPayload.session.code) {
        state.code = normalizeCode(eventPayload.session.code) || state.code
      }
      hasPatch = true
    }
    if (eventPayload.poll && typeof eventPayload.poll === 'object') {
      ensureSnapshotContainer()
      mergePoll(eventPayload.poll)
      hasPatch = true
    }

    if (hasPatch) {
      renderFromSnapshot(false)
      return
    }

    void refreshSnapshot(false)
  }

  function ensureSnapshotContainer() {
    if (state.snapshot) {
      return
    }
    state.snapshot = {
      session: {
        id: state.sessionId || '',
        code: state.code || '',
        status: 'active'
      },
      questions: [],
      polls: [],
      prompts: []
    }
  }

  function mergePoll(nextPoll) {
    const polls = Array.isArray(state.snapshot?.polls) ? state.snapshot.polls : []
    const index = polls.findIndex((poll) => poll.id === nextPoll.id)
    if (index >= 0) {
      polls[index] = nextPoll
      return
    }
    polls.push(nextPoll)
  }

  function renderFromSnapshot(forceRender) {
    flushRichTextHostsToOverrides()

    const polls = Array.isArray(state.snapshot?.polls) ? state.snapshot.polls : []
    const poll = selectPoll(polls)
    state.currentPoll = poll

    if (!forceRender && isRichTextEditingActive()) {
      updateMeta(poll, getTotalVotes(poll))
      updateFooter()
      return
    }

    const renderKey = getRenderKey(poll)
    if (!forceRender && renderKey === state.lastRenderKey) {
      updateFooter()
      updateMeta(poll, getTotalVotes(poll))
      return
    }
    state.lastRenderKey = renderKey

    if (!poll) {
      renderMissingPoll()
      return
    }

    const totalVotes = getTotalVotes(poll)
    renderRichText(
      el.question,
      getQuestionTextKey(poll),
      asText(poll.question) || 'Untitled poll'
    )
    if (currentTheme.visualMode === 'race') {
      renderRaceOptions(poll, totalVotes)
    } else {
      renderClassicOptions(poll, totalVotes)
    }
    updateMeta(poll, totalVotes)
    updateFooter()
  }

  function flushRichTextHostsToOverrides() {
    const hosts = el.wrap.querySelectorAll('.rich-text-editable[data-text-key]')
    for (const host of hosts) {
      if (!(host instanceof HTMLElement)) {
        continue
      }
      commitRichTextHost(host, { normalizeDom: false })
    }
  }

  function renderClassicOptions(poll, totalVotes) {
    if (el.options.classList.contains('race-mode') || state.raceRows.size > 0) {
      clearRaceRows()
    }
    const fragment = document.createDocumentFragment()
    const options = Array.isArray(poll.options) ? poll.options : []
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index]
      const optionId = asText(option.id) || `option-${index}`
      const votes = toInt(option.votes)
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0

      const optionNode = document.createElement('div')
      optionNode.className = 'option'
      optionNode.dataset.optionDragId = optionId

      const labelRow = document.createElement('div')
      labelRow.className = 'label-row'

      const label = document.createElement('span')
      label.className = 'label'
      renderRichText(
        label,
        getOptionTextKey(poll, option, index),
        asText(option.label) || 'Option'
      )

      const stats = document.createElement('span')
      stats.className = 'stats'
      stats.textContent = `${votes} (${pct}%)`

      labelRow.append(label, stats)

      const track = document.createElement('div')
      track.className = 'track'

      const fill = document.createElement('div')
      fill.className = 'fill'
      fill.style.width = `${pct}%`

      track.appendChild(fill)
      optionNode.append(labelRow, track)
      applyOptionOffsetTransform(labelRow, optionId, 'label')
      applyOptionOffsetTransform(track, optionId, 'bar')
      registerOptionDragTarget(labelRow, optionId, 'label')
      registerOptionDragTarget(track, optionId, 'bar')
      fragment.appendChild(optionNode)
    }

    el.options.replaceChildren(fragment)
  }

  function renderRaceOptions(poll, totalVotes) {
    const pollId = asText(poll?.id)
    if (state.racePollId && pollId && state.racePollId !== pollId) {
      clearRaceRows()
      el.options.replaceChildren()
    }
    if (!el.options.classList.contains('race-mode')) {
      el.options.replaceChildren()
      state.raceRows.clear()
    }

    el.options.classList.add('race-mode')
    state.racePollId = pollId || state.racePollId

    const foreignNodes = [...el.options.children].filter(
      (node) => !(node instanceof HTMLElement) || !node.classList.contains('race-option')
    )
    for (const node of foreignNodes) {
      node.remove()
    }

    const options = Array.isArray(poll.options) ? poll.options : []
    const sorted = [...options].sort((left, right) => {
      const voteDiff = toInt(right.votes) - toInt(left.votes)
      if (voteDiff !== 0) {
        return voteDiff
      }
      return asText(left.label).localeCompare(asText(right.label))
    })
    const rowHeight = Math.max(74, currentTheme.raceCarSize + 46)

    const liveIds = new Set()
    for (let index = 0; index < sorted.length; index += 1) {
      const option = sorted[index]
      const optionId = asText(option.id) || `option-${index}`
      liveIds.add(optionId)
      const votes = toInt(option.votes)
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0

      let row = state.raceRows.get(optionId)
      if (!row) {
        row = createRaceRow(index * rowHeight, pct, optionId)
        state.raceRows.set(optionId, row)
        el.options.appendChild(row.root)
        registerRaceOptionDragTarget(row)
      }
      const dragOffset = getOptionDragOffset(optionId, 'row')
      row.dragOffsetX = dragOffset.x
      row.dragOffsetY = dragOffset.y
      renderRichText(
        row.label,
        getOptionTextKey(poll, option, index),
        asText(option.label) || 'Option'
      )
      row.stats.textContent = `${votes} (${pct}%)`
      row.targetY = index * rowHeight
      row.targetProgress = pct
      row.root.classList.toggle('leading', index === 0)
      row.root.style.zIndex = `${sorted.length - index}`
      applyRaceRowTransform(row)
      applyRaceCarContent(row.car)
    }

    for (const [optionId, row] of state.raceRows) {
      if (liveIds.has(optionId)) {
        continue
      }
      row.root.remove()
      state.raceRows.delete(optionId)
    }

    el.options.style.height = `${rowHeight * sorted.length}px`
    startRaceAnimationLoop()
  }

  function createRaceRow(initialY = 0, initialProgress = 0, optionId = '') {
    const root = document.createElement('article')
    root.className = 'race-option'
    root.style.transform = `translateY(${initialY}px)`
    root.style.opacity = '1'
    if (optionId) {
      root.dataset.optionDragId = optionId
    }

    const top = document.createElement('div')
    top.className = 'race-top'

    const label = document.createElement('span')
    label.className = 'race-label'

    const stats = document.createElement('span')
    stats.className = 'stats'

    const track = document.createElement('div')
    track.className = 'race-track'

    const fill = document.createElement('div')
    fill.className = 'race-fill'

    const car = document.createElement('div')
    car.className = 'race-car'
    car.style.left = `${initialProgress}%`

    fill.style.width = `${initialProgress}%`

    top.append(label, stats)
    track.append(fill, car)
    root.append(top, track)

    return {
      root,
      label,
      stats,
      fill,
      car,
      optionId,
      dragOffsetX: 0,
      dragOffsetY: 0,
      currentY: initialY,
      targetY: initialY,
      currentProgress: initialProgress,
      targetProgress: initialProgress
    }
  }

  function startRaceAnimationLoop() {
    if (state.raceAnimFrameId != null) {
      return
    }
    state.raceAnimLastTs = 0
    state.raceAnimFrameId = requestAnimationFrame(stepRaceAnimation)
  }

  function stopRaceAnimationLoop() {
    if (state.raceAnimFrameId == null) {
      return
    }
    cancelAnimationFrame(state.raceAnimFrameId)
    state.raceAnimFrameId = null
    state.raceAnimLastTs = 0
  }

  function stepRaceAnimation(ts) {
    if (state.raceRows.size === 0 || currentTheme.visualMode !== 'race') {
      stopRaceAnimationLoop()
      return
    }

    const prevTs = state.raceAnimLastTs || ts
    const dt = Math.min(0.05, Math.max(0.001, (ts - prevTs) / 1000))
    state.raceAnimLastTs = ts

    const speed = clamp(currentTheme.raceSpeed, 0.35, 1.8, defaultTheme.raceSpeed)
    const yAlpha = 1 - Math.exp(-(9.5 * speed) * dt)
    const pAlpha = 1 - Math.exp(-(10.5 * speed) * dt)

    let hasMotion = false
    for (const row of state.raceRows.values()) {
      row.currentY += (row.targetY - row.currentY) * yAlpha
      row.currentProgress += (row.targetProgress - row.currentProgress) * pAlpha

      if (Math.abs(row.targetY - row.currentY) < 0.2) {
        row.currentY = row.targetY
      } else {
        hasMotion = true
      }
      if (Math.abs(row.targetProgress - row.currentProgress) < 0.15) {
        row.currentProgress = row.targetProgress
      } else {
        hasMotion = true
      }

      applyRaceRowTransform(row)
      row.fill.style.width = `${row.currentProgress}%`
      row.car.style.left = `${row.currentProgress}%`
    }

    if (hasMotion) {
      state.raceAnimFrameId = requestAnimationFrame(stepRaceAnimation)
      return
    }

    state.raceAnimFrameId = null
    state.raceAnimLastTs = 0
  }

  function clearRaceRows() {
    stopRaceAnimationLoop()
    for (const row of state.raceRows.values()) {
      row.root.remove()
    }
    state.raceRows.clear()
    state.racePollId = null
    const orphanRows = el.options.querySelectorAll('.race-option')
    for (const row of orphanRows) {
      row.remove()
    }
    el.options.classList.remove('race-mode')
    el.options.style.height = ''
    if (!getActiveRichTextHost()) {
      refreshTextToolStates()
    }
  }

  function renderMissingSession() {
    clearRaceRows()
    state.currentPoll = null
    state.lastRenderKey = ''
    clearRichTextNode(el.question)
    el.question.textContent = 'Missing required query param'
    el.options.innerHTML = ''
    const note = document.createElement('p')
    note.className = 'empty'
    note.innerHTML = 'Open with <code>?sessionId=&lt;id&gt;</code> or <code>?code=&lt;join_code&gt;</code>'
    el.options.appendChild(note)
    updateMeta(null, 0, 'missing session', 'error')
    updateFooter()
  }

  function renderMissingPoll() {
    clearRaceRows()
    clearRichTextNode(el.question)
    const message =
      state.pollSelector.mode === 'id'
        ? `Poll "${state.pollSelector.explicitId}" was not found in this session.`
        : 'No poll is available in this session yet.'
    el.question.textContent = message
    el.options.innerHTML = ''
    const note = document.createElement('p')
    note.className = 'empty'
    note.textContent = 'Create and open a poll in Host Console to render it here.'
    el.options.appendChild(note)
    updateMeta(null, 0)
    updateFooter()
  }

  function renderError(message) {
    clearRaceRows()
    state.currentPoll = null
    state.lastRenderKey = ''
    clearRichTextNode(el.question)
    el.question.textContent = 'Unable to load poll data'
    el.options.innerHTML = ''
    const note = document.createElement('p')
    note.className = 'empty'
    note.textContent = message
    el.options.appendChild(note)
    updateMeta(null, 0, 'error', 'error')
    updateFooter()
  }

  function updateFooter() {
    el.footer.textContent =
      `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, poll: ${state.pollSelector.descriptor}`
  }

  function updateMeta(poll, totalVotes, forcedStatusText, forcedTone) {
    const tone =
      forcedTone ||
      (forcedStatusText
        ? 'error'
        : poll
          ? poll.status === 'open'
            ? state.socketStatus === 'connected'
              ? 'live'
              : 'connecting'
            : 'closed'
          : state.socketStatus === 'connected'
            ? 'connected'
            : state.socketStatus === 'error'
              ? 'error'
              : 'connecting')

    const statusText =
      forcedStatusText ||
      (poll
        ? poll.status === 'open'
          ? state.socketStatus === 'connected'
            ? 'live'
            : 'syncing'
          : 'closed'
        : state.socketStatus === 'connected'
          ? 'connected'
          : state.socketStatus === 'error'
            ? 'error'
            : 'connecting')

    el.status.textContent = statusText
    el.votes.textContent = `${totalVotes} votes`
    applyDotTone(tone)
  }

  function applyDotTone(tone) {
    if (!el.dot) {
      return
    }
    if (tone === 'live' || tone === 'connected') {
      el.dot.style.background = '#58f08c'
      el.dot.style.animation = 'pulse 1.8s infinite'
      return
    }
    if (tone === 'closed') {
      el.dot.style.background = '#f1be53'
      el.dot.style.animation = 'none'
      return
    }
    if (tone === 'error') {
      el.dot.style.background = '#ff6078'
      el.dot.style.animation = 'none'
      return
    }
    el.dot.style.background = '#84b4ff'
    el.dot.style.animation = 'pulse 1.8s infinite'
  }

  function selectPoll(polls) {
    if (!Array.isArray(polls) || polls.length === 0) {
      return null
    }
    const sorted = [...polls].sort((a, b) => {
      const left = Date.parse(asText(a.created_at)) || 0
      const right = Date.parse(asText(b.created_at)) || 0
      return right - left
    })

    if (state.pollSelector.mode === 'id') {
      return sorted.find((poll) => poll.id === state.pollSelector.explicitId) || null
    }
    if (state.pollSelector.mode === 'open') {
      return sorted.find((poll) => poll.status === 'open') || null
    }
    if (state.pollSelector.mode === 'latest') {
      return sorted[0] || null
    }
    return sorted.find((poll) => poll.status === 'open') || sorted[0] || null
  }

  function getQuestionTextKey(poll) {
    const pollId = asText(poll?.id) || 'unknown'
    return `poll:${pollId}:question`
  }

  function getOptionTextKey(poll, option, index) {
    const pollId = asText(poll?.id) || 'unknown'
    const optionId = asText(option?.id) || `index-${index}`
    return `poll:${pollId}:option:${optionId}`
  }

  function getRenderKey(poll) {
    if (!poll) {
      return 'no-poll'
    }
    return JSON.stringify({
      id: poll.id,
      status: poll.status,
      question: poll.question,
      options: (poll.options || []).map((option) => [
        option.id,
        option.label,
        toInt(option.votes)
      ])
    })
  }

  function getTotalVotes(poll) {
    if (!poll || !Array.isArray(poll.options)) {
      return 0
    }
    return poll.options.reduce((sum, option) => sum + toInt(option.votes), 0)
  }

  async function fetchJson(path) {
    const response = await fetch(`${state.apiBase}${path}`)
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status})`
      throw new Error(detail)
    }
    return response.json()
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
        updateTheme({ [themeKey]: dataUrl })
        showThemeFeedback(successText, 'success')
      } catch {
        showThemeFeedback('File upload failed.', 'error')
      } finally {
        input.value = ''
      }
    })
  }

  function saveTheme() {
    const name = normalizeThemeName(el.themeName.value)
    if (!name) {
      showThemeFeedback('Theme name is required.', 'error')
      return
    }
    themeLibrary.themes[name] = clone(currentTheme)
    themeLibrary.activeName = name
    saveThemeLibrary(themeLibrary)
    saveThemeDraft(currentTheme)
    refreshThemeSelect(name)
    el.themeName.value = name
    showThemeFeedback(`Theme "${name}" saved.`, 'success')
  }

  function loadThemeFromSelect() {
    const name = asText(el.themeSelect.value)
    if (!name || !themeLibrary.themes[name]) {
      showThemeFeedback('Select a saved theme first.', 'error')
      return
    }
    currentTheme = sanitizeTheme(themeLibrary.themes[name])
    applyTheme(currentTheme)
    syncThemeControls()
    themeLibrary.activeName = name
    saveThemeLibrary(themeLibrary)
    saveThemeDraft(currentTheme)
    el.themeName.value = name
    if (state.snapshot) {
      renderFromSnapshot(true)
    }
    showThemeFeedback(`Theme "${name}" loaded.`, 'success')
  }

  function deleteThemeFromSelect() {
    const name = asText(el.themeSelect.value)
    if (!name || !themeLibrary.themes[name]) {
      showThemeFeedback('Nothing selected to delete.', 'error')
      return
    }
    delete themeLibrary.themes[name]
    if (themeLibrary.activeName === name) {
      themeLibrary.activeName = null
    }
    saveThemeLibrary(themeLibrary)
    refreshThemeSelect(themeLibrary.activeName)
    showThemeFeedback(`Theme "${name}" deleted.`, 'success')
  }

  function exportCurrentTheme() {
    const preferredName =
      normalizeThemeName(el.themeName.value) ||
      asText(el.themeSelect.value) ||
      'prezo-theme'
    const payload = {
      version: 1,
      name: preferredName,
      exportedAt: new Date().toISOString(),
      theme: currentTheme
    }
    const filename = `${preferredName.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').toLowerCase()}.json`
    downloadText(filename, JSON.stringify(payload, null, 2))
    showThemeFeedback('Theme exported.', 'success')
  }

  async function importThemeFromFile(event) {
    const file = event.target?.files?.[0]
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const importedTheme = sanitizeTheme(
        parsed?.theme && typeof parsed.theme === 'object' ? parsed.theme : parsed
      )
      const importedName =
        normalizeThemeName(parsed?.name) ||
        normalizeThemeName(file.name.replace(/\.[^.]+$/, '')) ||
        `imported-${new Date().toISOString().slice(0, 10)}`

      currentTheme = importedTheme
      applyTheme(currentTheme)
      syncThemeControls()
      saveThemeDraft(currentTheme)
      themeLibrary.themes[importedName] = clone(currentTheme)
      themeLibrary.activeName = importedName
      saveThemeLibrary(themeLibrary)
      refreshThemeSelect(importedName)
      el.themeName.value = importedName
      if (state.snapshot) {
        renderFromSnapshot(true)
      }
      showThemeFeedback(`Theme "${importedName}" imported.`, 'success')
    } catch {
      showThemeFeedback('Invalid theme file.', 'error')
    } finally {
      el.importTheme.value = ''
    }
  }

  function resetThemeDraft() {
    currentTheme = clone(defaultTheme)
    applyTheme(currentTheme)
    syncThemeControls()
    saveThemeDraft(currentTheme)
    if (state.snapshot) {
      renderFromSnapshot(true)
    }
    showThemeFeedback('Theme reset to defaults.', 'success')
  }

  function updateTheme(partialTheme, options = {}) {
    const persist = options.persist !== false
    const nextTheme = {
      ...currentTheme,
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

    currentTheme = sanitizeTheme(nextTheme)
    applyTheme(currentTheme)
    if (
      partialTheme &&
      Object.prototype.hasOwnProperty.call(partialTheme, 'visualMode') &&
      state.snapshot
    ) {
      renderFromSnapshot(true)
    }
    if (persist) {
      saveThemeDraft(currentTheme)
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
    root.setProperty('--grid-opacity', `${theme.gridOpacity}`)
    root.setProperty('--race-track', hexToRgba(theme.raceTrackColor, theme.raceTrackOpacity))
    root.setProperty('--race-car-size', `${theme.raceCarSize}px`)
    root.setProperty('--race-speed-ms', `${Math.round(theme.raceSpeed * 1000)}ms`)
    root.setProperty('--wrap-offset-x', `${clamp(theme.panelX, -2400, 2400, 0)}px`)
    root.setProperty('--wrap-offset-y', `${clamp(theme.panelY, -2400, 2400, 0)}px`)

    el.bgImage.style.backgroundImage = theme.bgImageUrl
      ? `url("${theme.bgImageUrl.replace(/"/g, '\\"')}")`
      : 'none'
    el.bgImage.style.opacity = `${theme.bgImageOpacity}`
    el.bgOverlay.style.backgroundColor = theme.overlayColor
    el.bgOverlay.style.opacity = `${theme.overlayOpacity}`
    el.gridBg.style.display = theme.gridVisible ? 'block' : 'none'
    el.gridBg.style.opacity = `${theme.gridOpacity}`
    applyElementOffset(el.bgImage, theme.bgImageX, theme.bgImageY)
    applyElementOffset(el.bgOverlay, theme.bgOverlayX, theme.bgOverlayY)
    applyElementOffset(el.gridBg, theme.gridX, theme.gridY)
    applyElementOffset(el.headLeft, theme.titleX, theme.titleY)
    applyElementOffset(el.metaBar, theme.metaX, theme.metaY)
    applyElementOffset(el.footer, theme.footerX, theme.footerY)

    applyImageAsset(el.customLogo, {
      url: theme.logoUrl,
      width: `${theme.logoWidth}px`,
      opacity: `${theme.logoOpacity}`,
      left: `${theme.logoX}%`,
      top: `${theme.logoY}%`
    })

    applyImageAsset(el.customAsset, {
      url: theme.assetUrl,
      width: `${theme.assetWidth}px`,
      opacity: `${theme.assetOpacity}`,
      left: `${theme.assetX}%`,
      top: `${theme.assetY}%`
    })
    syncRaceThemeVisuals()
  }

  function applyElementOffset(node, offsetX, offsetY) {
    if (!node) {
      return
    }
    const safeX = clamp(offsetX, -2400, 2400, 0)
    const safeY = clamp(offsetY, -2400, 2400, 0)
    node.style.transform = `translate(${safeX}px, ${safeY}px)`
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
  }

  function syncRaceThemeVisuals() {
    const cars = el.options.querySelectorAll('.race-car')
    for (const car of cars) {
      applyRaceCarContent(car)
    }
  }

  function applyRaceCarContent(carNode) {
    const imageUrl = asText(currentTheme.raceCarImageUrl)
    if (imageUrl) {
      carNode.textContent = ''
      carNode.style.backgroundImage = `url("${imageUrl.replace(/"/g, '\\"')}")`
      carNode.classList.add('image-car')
      return
    }
    carNode.style.backgroundImage = 'none'
    carNode.classList.remove('image-car')
    carNode.textContent = normalizeRaceCar(currentTheme.raceCar)
  }

  function syncThemeControls() {
    for (const spec of themeControls) {
      const input = controlElements[spec.id]
      if (!input) {
        continue
      }
      const value = currentTheme[spec.key]
      if (spec.type === 'checkbox') {
        input.checked = Boolean(value)
      } else {
        input.value = value == null ? '' : String(value)
      }
    }
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

  function refreshThemeSelect(selectedName) {
    const names = Object.keys(themeLibrary.themes).sort((a, b) => a.localeCompare(b))
    el.themeSelect.innerHTML = ''

    if (names.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No saved themes'
      el.themeSelect.appendChild(option)
      return
    }

    for (const name of names) {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      el.themeSelect.appendChild(option)
    }

    const preferred =
      selectedName && themeLibrary.themes[selectedName] ? selectedName : names[0]
    el.themeSelect.value = preferred
    if (!el.themeName.value) {
      el.themeName.value = preferred
    }
  }

  function loadInitialTheme(library) {
    const draft = loadThemeDraft()
    if (library.activeName && library.themes[library.activeName]) {
      return sanitizeTheme(library.themes[library.activeName])
    }
    if (draft) {
      if (isLegacyDarkTheme(draft)) {
        saveThemeDraft(defaultTheme)
        return clone(defaultTheme)
      }
      return draft
    }
    return clone(defaultTheme)
  }

  function isLegacyDarkTheme(theme) {
    if (!theme || typeof theme !== 'object') {
      return false
    }
    return (
      asText(theme.bgA).toLowerCase() === '#04112b' &&
      asText(theme.bgB).toLowerCase() === '#0a2457' &&
      asText(theme.panelColor).toLowerCase() === '#040c20' &&
      asText(theme.textMain).toLowerCase() === '#e8f2ff'
    )
  }

  function loadThemeLibrary() {
    const parsed = safeJsonParse(safeStorageGet(THEME_LIBRARY_KEY))
    if (!parsed || typeof parsed !== 'object') {
      return { themes: {}, activeName: null }
    }
    const incomingThemes =
      parsed.themes && typeof parsed.themes === 'object' ? parsed.themes : {}
    const themes = {}
    for (const [name, theme] of Object.entries(incomingThemes)) {
      const normalizedName = normalizeThemeName(name)
      if (!normalizedName) {
        continue
      }
      themes[normalizedName] = sanitizeTheme(theme)
    }
    const activeName =
      typeof parsed.activeName === 'string' && themes[parsed.activeName]
        ? parsed.activeName
        : null
    return { themes, activeName }
  }

  function saveThemeLibrary(library) {
    try {
      localStorage.setItem(THEME_LIBRARY_KEY, JSON.stringify(library))
    } catch {}
  }

  function loadThemeDraft() {
    const parsed = safeJsonParse(safeStorageGet(THEME_DRAFT_KEY))
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    return sanitizeTheme(parsed)
  }

  function saveThemeDraft(theme) {
    try {
      localStorage.setItem(THEME_DRAFT_KEY, JSON.stringify(theme))
    } catch {}
  }

  function showThemeFeedback(text, type) {
    el.themeFeedback.textContent = text
    if (type === 'success') {
      el.themeFeedback.style.color = '#216e43'
      return
    }
    if (type === 'error') {
      el.themeFeedback.style.color = '#b53a4e'
      return
    }
    el.themeFeedback.style.color = '#5f7ea3'
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

  function loadTextOverrides() {
    const parsed = safeJsonParse(safeStorageGet(TEXT_OVERRIDES_KEY))
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }
    const overrides = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string' || !key) {
        continue
      }
      overrides[key] = sanitizeRichTextHtml(value)
    }
    return overrides
  }

  function saveTextOverrides(overrides) {
    try {
      localStorage.setItem(TEXT_OVERRIDES_KEY, JSON.stringify(overrides))
    } catch {}
  }

  function textToRichHtml(text) {
    const normalized = asText(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    return escapeHtml(normalized).replace(/\n/g, '<br>')
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function sanitizeRichTextHtml(input) {
    const container = document.createElement('div')
    container.innerHTML = typeof input === 'string' ? input : ''

    const fragment = document.createDocumentFragment()
    for (const child of [...container.childNodes]) {
      appendSanitizedNode(fragment, child)
    }

    const clean = document.createElement('div')
    clean.appendChild(fragment)
    return clean.innerHTML
  }

  function appendSanitizedNode(parent, node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent || ''))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }
    const element = node
    const tag = element.tagName.toUpperCase()
    if (tag === 'BR') {
      parent.appendChild(document.createElement('br'))
      return
    }

    if (tag === 'SPAN') {
      const safeStyle = sanitizeInlineTextStyle(asText(element.getAttribute('style')))
      if (!safeStyle) {
        for (const child of [...element.childNodes]) {
          appendSanitizedNode(parent, child)
        }
        return
      }
      const safeSpan = document.createElement('span')
      safeSpan.setAttribute('style', safeStyle)
      for (const child of [...element.childNodes]) {
        appendSanitizedNode(safeSpan, child)
      }
      parent.appendChild(safeSpan)
      return
    }

    const allowedTag = tag === 'B' || tag === 'STRONG' || tag === 'I' || tag === 'EM' || tag === 'U'
    if (!allowedTag) {
      for (const child of [...element.childNodes]) {
        appendSanitizedNode(parent, child)
      }
      return
    }

    const safe = document.createElement(tag.toLowerCase())
    for (const child of [...element.childNodes]) {
      appendSanitizedNode(safe, child)
    }
    parent.appendChild(safe)
  }

  function sanitizeInlineTextStyle(styleText) {
    if (!styleText) {
      return ''
    }

    const cleanParts = []
    const declarations = styleText.split(';')
    for (const declaration of declarations) {
      const separator = declaration.indexOf(':')
      if (separator < 0) {
        continue
      }
      const rawProp = declaration.slice(0, separator).trim().toLowerCase()
      const rawValue = declaration.slice(separator + 1).trim()
      if (!rawProp || !rawValue) {
        continue
      }
      const lowerValue = rawValue.toLowerCase()

      if (rawProp === 'font-weight') {
        const value = sanitizeFontWeightValue(lowerValue)
        if (value) {
          cleanParts.push(`font-weight: ${value}`)
        }
        continue
      }
      if (rawProp === 'font-style') {
        const value = sanitizeFontStyleValue(lowerValue)
        if (value) {
          cleanParts.push(`font-style: ${value}`)
        }
        continue
      }
      if (rawProp === 'text-decoration' || rawProp === 'text-decoration-line') {
        const value = sanitizeTextDecorationValue(lowerValue)
        if (value) {
          cleanParts.push(`text-decoration: ${value}`)
        }
        continue
      }
      if (rawProp === 'font-family') {
        const value = sanitizeInlineFontFamilyValue(rawValue)
        if (value) {
          cleanParts.push(`font-family: ${value}`)
        }
        continue
      }
      if (rawProp === 'font-size') {
        const value = sanitizeInlineFontSizeValue(lowerValue)
        if (value) {
          cleanParts.push(`font-size: ${value}`)
        }
        continue
      }
      if (rawProp === 'color') {
        const value = sanitizeInlineColorValue(lowerValue)
        if (value) {
          cleanParts.push(`color: ${value}`)
        }
      }
    }

    if (cleanParts.length === 0) {
      return ''
    }
    return cleanParts.join('; ')
  }

  function sanitizeFontWeightValue(value) {
    if (value === 'normal' || value === 'bold') {
      return value
    }
    if (/^[1-9]00$/.test(value)) {
      return value
    }
    return ''
  }

  function sanitizeFontStyleValue(value) {
    if (value === 'normal' || value === 'italic') {
      return value
    }
    return ''
  }

  function sanitizeTextDecorationValue(value) {
    if (value.includes('underline')) {
      return 'underline'
    }
    if (value.includes('none')) {
      return 'none'
    }
    return ''
  }

  function sanitizeInlineFontFamilyValue(value) {
    const sanitized = sanitizeFontFamily(value, '')
    if (!sanitized) {
      return ''
    }
    const parts = sanitized
      .split(',')
      .map((part) => part.trim().replace(/^["']|["']$/g, ''))
      .filter((part) => /^[a-z0-9 .\-]+$/i.test(part))
    if (parts.length === 0) {
      return ''
    }
    return parts.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(', ')
  }

  function sanitizeInlineFontSizeValue(value) {
    const match = /^([0-9]+(?:\.[0-9]+)?)(pt|px|em|rem|%)$/.exec(value)
    if (!match) {
      return ''
    }
    const amount = Number(match[1])
    if (!Number.isFinite(amount) || amount <= 0) {
      return ''
    }
    const clamped = Math.min(300, Math.max(4, amount))
    const printable = Number.isInteger(clamped) ? String(clamped) : String(clamped)
    return `${printable}${match[2]}`
  }

  function sanitizeInlineColorValue(value) {
    const hex = sanitizeHex(value, '')
    if (hex) {
      return hex.toLowerCase()
    }
    const funcMatch = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(asText(value))
    if (!funcMatch) {
      return ''
    }

    let channelText = funcMatch[1].trim()
    if (!channelText) {
      return ''
    }
    if (channelText.includes('/')) {
      channelText = channelText.split('/')[0].trim()
    }
    const parts = channelText.includes(',')
      ? channelText
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : channelText.split(/\s+/).filter(Boolean)
    if (parts.length < 3) {
      return ''
    }

    const channels = []
    for (let index = 0; index < 3; index += 1) {
      const part = parts[index]
      if (!part) {
        return ''
      }
      let channelValue = Number.parseFloat(part)
      if (!Number.isFinite(channelValue)) {
        return ''
      }
      if (part.endsWith('%')) {
        channelValue = (channelValue / 100) * 255
      }
      channels.push(clamp(Math.round(channelValue), 0, 255, 0))
    }

    const [r, g, b] = channels
    return `rgb(${r}, ${g}, ${b})`
  }

  function readControlValue(input, type) {
    if (type === 'checkbox') {
      return Boolean(input.checked)
    }
    if (type === 'number') {
      return Number(input.value)
    }
    return input.value
  }

  function sanitizeTheme(theme) {
    const incoming = theme && typeof theme === 'object' ? theme : {}
    return {
      bgImageUrl: sanitizeUrl(incoming.bgImageUrl, defaultTheme.bgImageUrl),
      bgImageOpacity: clamp(incoming.bgImageOpacity, 0, 1, defaultTheme.bgImageOpacity),
      bgA: sanitizeHex(incoming.bgA, defaultTheme.bgA),
      bgB: sanitizeHex(incoming.bgB, defaultTheme.bgB),
      overlayColor: sanitizeHex(incoming.overlayColor, defaultTheme.overlayColor),
      overlayOpacity: clamp(incoming.overlayOpacity, 0, 1, defaultTheme.overlayOpacity),
      gridVisible: Boolean(incoming.gridVisible ?? defaultTheme.gridVisible),
      gridOpacity: clamp(incoming.gridOpacity, 0, 0.5, defaultTheme.gridOpacity),
      panelColor: sanitizeHex(incoming.panelColor, defaultTheme.panelColor),
      panelOpacity: clamp(incoming.panelOpacity, 0, 1, defaultTheme.panelOpacity),
      panelBorder: sanitizeHex(incoming.panelBorder, defaultTheme.panelBorder),
      textMain: sanitizeHex(incoming.textMain, defaultTheme.textMain),
      textSub: sanitizeHex(incoming.textSub, defaultTheme.textSub),
      trackColor: sanitizeHex(incoming.trackColor, defaultTheme.trackColor),
      trackOpacity: clamp(incoming.trackOpacity, 0, 1, defaultTheme.trackOpacity),
      fillA: sanitizeHex(incoming.fillA, defaultTheme.fillA),
      fillB: sanitizeHex(incoming.fillB, defaultTheme.fillB),
      barHeight: clamp(incoming.barHeight, 8, 44, defaultTheme.barHeight),
      barRadius: clamp(incoming.barRadius, 0, 999, defaultTheme.barRadius),
      questionSize: clamp(incoming.questionSize, 42, 90, defaultTheme.questionSize),
      labelSize: clamp(incoming.labelSize, 14, 36, defaultTheme.labelSize),
      visualMode: sanitizeVisualMode(incoming.visualMode, defaultTheme.visualMode),
      raceCar: normalizeRaceCar(incoming.raceCar),
      raceCarImageUrl: sanitizeUrl(incoming.raceCarImageUrl, defaultTheme.raceCarImageUrl),
      raceCarSize: clamp(incoming.raceCarSize, 20, 56, defaultTheme.raceCarSize),
      raceTrackColor: sanitizeHex(incoming.raceTrackColor, defaultTheme.raceTrackColor),
      raceTrackOpacity: clamp(incoming.raceTrackOpacity, 0, 1, defaultTheme.raceTrackOpacity),
      raceSpeed: clamp(incoming.raceSpeed, 0.35, 1.8, defaultTheme.raceSpeed),
      logoUrl: sanitizeUrl(incoming.logoUrl, defaultTheme.logoUrl),
      logoWidth: clamp(incoming.logoWidth, 40, 280, defaultTheme.logoWidth),
      logoOpacity: clamp(incoming.logoOpacity, 0, 1, defaultTheme.logoOpacity),
      logoX: clamp(incoming.logoX, 0, 100, defaultTheme.logoX),
      logoY: clamp(incoming.logoY, 0, 100, defaultTheme.logoY),
      assetUrl: sanitizeUrl(incoming.assetUrl, defaultTheme.assetUrl),
      assetWidth: clamp(incoming.assetWidth, 60, 720, defaultTheme.assetWidth),
      assetOpacity: clamp(incoming.assetOpacity, 0, 1, defaultTheme.assetOpacity),
      assetX: clamp(incoming.assetX, 0, 100, defaultTheme.assetX),
      assetY: clamp(incoming.assetY, 0, 100, defaultTheme.assetY),
      panelX: clamp(incoming.panelX, -2400, 2400, defaultTheme.panelX),
      panelY: clamp(incoming.panelY, -2400, 2400, defaultTheme.panelY),
      bgImageX: clamp(incoming.bgImageX, -2400, 2400, defaultTheme.bgImageX),
      bgImageY: clamp(incoming.bgImageY, -2400, 2400, defaultTheme.bgImageY),
      bgOverlayX: clamp(incoming.bgOverlayX, -2400, 2400, defaultTheme.bgOverlayX),
      bgOverlayY: clamp(incoming.bgOverlayY, -2400, 2400, defaultTheme.bgOverlayY),
      gridX: clamp(incoming.gridX, -2400, 2400, defaultTheme.gridX),
      gridY: clamp(incoming.gridY, -2400, 2400, defaultTheme.gridY),
      titleX: clamp(incoming.titleX, -2400, 2400, defaultTheme.titleX),
      titleY: clamp(incoming.titleY, -2400, 2400, defaultTheme.titleY),
      metaX: clamp(incoming.metaX, -2400, 2400, defaultTheme.metaX),
      metaY: clamp(incoming.metaY, -2400, 2400, defaultTheme.metaY),
      optionsX: clamp(incoming.optionsX, -2400, 2400, defaultTheme.optionsX),
      optionsY: clamp(incoming.optionsY, -2400, 2400, defaultTheme.optionsY),
      footerX: clamp(incoming.footerX, -2400, 2400, defaultTheme.footerX),
      footerY: clamp(incoming.footerY, -2400, 2400, defaultTheme.footerY),
      optionOffsets: sanitizeOptionOffsets(incoming.optionOffsets, defaultTheme.optionOffsets),
      fontFamily: sanitizeFontFamily(incoming.fontFamily, defaultTheme.fontFamily)
    }
  }

  function sanitizeOptionOffsets(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback
    if (!source || typeof source !== 'object') {
      return {}
    }
    const sanitized = {}
    for (const [rawId, rawOffset] of Object.entries(source)) {
      const optionId = asText(rawId)
      if (!optionId || !rawOffset || typeof rawOffset !== 'object') {
        continue
      }
      sanitized[optionId] = {
        x: clamp(rawOffset.x, -2400, 2400, 0),
        y: clamp(rawOffset.y, -2400, 2400, 0)
      }
    }
    return sanitized
  }

  function sanitizeFontFamily(value, fallback) {
    const text = asText(value)
    if (!text) {
      return fallback
    }
    return text.replace(/[{};]/g, '').slice(0, 120)
  }

  function sanitizeVisualMode(value, fallback) {
    const mode = asText(value).toLowerCase()
    if (mode === 'race' || mode === 'classic') {
      return mode
    }
    return fallback
  }

  function normalizeRaceCar(value) {
    const text = asText(value)
    if (!text) {
      return defaultTheme.raceCar
    }
    return Array.from(text).slice(0, 2).join('')
  }

  function sanitizeUrl(value, fallback) {
    const text = asText(value)
    if (!text) {
      return fallback
    }
    return text
  }

  function sanitizeHex(value, fallback) {
    const text = asText(value)
    if (!text) {
      return fallback
    }
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
    return match ? text : fallback
  }

  function hexToRgba(hex, alpha) {
    const clean = sanitizeHex(hex, '#000000').replace('#', '')
    const full = clean.length === 3 ? clean.split('').map((ch) => `${ch}${ch}`).join('') : clean
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    const a = clamp(alpha, 0, 1, 1)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  function clamp(value, min, max, fallback) {
    const num = Number(value)
    if (!Number.isFinite(num)) {
      return fallback
    }
    return Math.min(max, Math.max(min, num))
  }

  function toInt(value) {
    const num = Number(value)
    if (!Number.isFinite(num)) {
      return 0
    }
    return Math.max(0, Math.round(num))
  }

  function normalizeApiBase(value) {
    const text = asText(value)
    if (!text) {
      return ''
    }
    return text.replace(/\/+$/, '')
  }

  function toWsBase(apiBase) {
    try {
      const parsed = new URL(apiBase)
      const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${parsed.host}`
    } catch {
      return ''
    }
  }

  function normalizeCode(value) {
    const text = asText(value)
    return text ? text.toUpperCase() : ''
  }

  function normalizeThemeName(value) {
    const text = asText(value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64)
    return text
  }

  function asText(value) {
    return typeof value === 'string' ? value.trim() : ''
  }

  function must(id) {
    const node = document.getElementById(id)
    if (!node) {
      throw new Error(`Missing element: ${id}`)
    }
    return node
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function safeJsonParse(value) {
    if (!value) {
      return null
    }
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function errorToMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message
    }
    return 'Unexpected error'
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('read_failed'))
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.readAsDataURL(file)
    })
  }

  function downloadText(filename, content) {
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function handleUnload() {
    state.isUnloading = true
    stopSnapshotPolling()
    hideSelectionToolbar()
    clearCachedRichTextSelection()
    state.textControlInteractionLocked = false
    state.textControlInteractionUntil = 0
    state.activeInlineStyleNode = null
    el.wrap.removeEventListener('pointerdown', handleCanvasPointerDown)
    el.wrap.removeEventListener('focusin', handleRichTextFocusIn)
    el.wrap.removeEventListener('focusout', handleRichTextFocusOut)
    el.wrap.removeEventListener('input', handleRichTextInput)
    el.wrap.removeEventListener('paste', handleRichTextPaste)
    el.wrap.removeEventListener('keydown', handleRichTextKeydown)
    document.removeEventListener('selectionchange', handleRichTextSelectionChange)
    document.removeEventListener('pointerdown', handleRichTextPointerDown, true)
    window.removeEventListener('resize', scheduleSelectionToolbarUpdate)
    window.removeEventListener('scroll', scheduleSelectionToolbarUpdate, true)
    if (state.selectionToolbarRafId != null) {
      cancelAnimationFrame(state.selectionToolbarRafId)
      state.selectionToolbarRafId = null
    }
    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer)
      state.reconnectTimer = null
    }
    disconnectSocket()
  }
})()

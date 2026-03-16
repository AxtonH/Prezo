import {
  AI_BOX_RESIZE_TARGETS,
  AI_CHAT_MAX_MESSAGES,
  AI_DEFAULT_MODEL,
  AI_LEGACY_MODELS,
  AI_MODEL_STORAGE_KEY,
  AI_MOVE_TARGETS,
  AI_SCALE_RESIZE_TARGETS,
  AI_TARGET_ALIASES,
  AI_THEME_ALLOWED_KEYS,
  AI_THEME_COLOR_KEYS,
  AI_THEME_NUMBER_RANGES,
  ARTIFACT_LIBRARY_KEY,
  DEFAULT_API_BASE,
  DEFAULT_POLL_SELECTOR,
  DRAG_START_THRESHOLD_PX,
  HISTORY_LIMIT,
  LIBRARY_SYNC_TOKEN_KEY,
  MIN_RESIZE_HANDLE_SIZE_PX,
  RIBBON_COLLAPSED_KEY,
  RIBBON_HIDDEN_KEY,
  RIBBON_TAB_KEY,
  TEXT_FONT_FAMILIES,
  TEXT_FONT_SIZES,
  TEXT_OVERRIDES_KEY,
  THEME_DRAFT_KEY,
  THEME_LIBRARY_KEY,
  AI_CHAT_OPEN_KEY
} from './poll-game-gamified-constants.js'
import {
  ARTIFACT_CONVERSATION_STEPS,
  ARTIFACT_DEFAULT_PLACEHOLDER,
  ARTIFACT_EDIT_QUICK_ACTIONS,
  ARTIFACT_EDIT_PLACEHOLDER,
  ARTIFACT_EDIT_READY_STATUS,
  ARTIFACT_LAYOUT_HORIZONTAL,
  ARTIFACT_WAITING_STATUS,
  ARTIFACT_VISUAL_MODE,
  buildArtifactConversationPrompt,
  buildArtifactEditPrompt,
  buildArtifactRepairPrompt,
  buildArtifactAiPrompt,
  createEmptyArtifactAnswers,
  sanitizeArtifactLayout
} from './poll-game-gamified-artifact-mode.js'
import {
  buildArtifactSrcDoc,
  normalizeArtifactMarkup
} from './poll-game-gamified-artifact-runtime.js'
import { createPollGameArtifactBridge } from './poll-game-gamified-artifact-bridge.js'
import { createPollGameLibraryStorage } from './poll-game-gamified-library-storage.js'
import { createPollGameLibrarySyncManager } from './poll-game-gamified-library-sync.js'

;(() => {
  const ARTIFACT_STAGE_ASPECT_RATIO = 16 / 9
  const ARTIFACT_SAFE_FIT_SCALE = 0.98
  const ARTIFACT_READY_MESSAGE_TYPE = 'prezo-artifact-ready'
  const ARTIFACT_SIZE_MESSAGE_TYPE = 'prezo-artifact-size'
  const ARTIFACT_RENDER_OK_MESSAGE_TYPE = 'prezo-artifact-render-ok'
  const ARTIFACT_RENDER_ERROR_MESSAGE_TYPE = 'prezo-artifact-render-error'
  const LIBRARY_SYNC_MESSAGE_TYPE = 'prezo:library-sync'
  const LIBRARY_SYNC_REQUEST_MESSAGE_TYPE = 'prezo:request-library-sync'
  const ARTIFACT_STAGE_SURFACE_HIDDEN = 'hidden'
  const ARTIFACT_STAGE_SURFACE_LOADING = 'loading'
  const ARTIFACT_STAGE_SURFACE_FRAME = 'frame'
  const ARTIFACT_STAGE_SURFACE_PLACEHOLDER = 'placeholder'
  const ARTIFACT_BUILD_TIMEOUT_MS = 300000
  const LIVE_SNAPSHOT_RENDER_BATCH_MS = 70
  const ARTIFACT_STATE_PUSH_BATCH_MS = 90
  const ARTIFACT_EDIT_RENDER_CONFIRM_TIMEOUT_MS = 5000
  const ARTIFACT_LAYOUT_REFIT_DELAY_MS = 220
  const EDITOR_DOCK_GAP_PX = 0
  const EDITOR_DOCK_SIDE_PADDING_PX = 48
  const EDITOR_DOCK_BREAKPOINT_PX = 900
  const ARTIFACT_LOADER_SIZE_PX = 120
  const ARTIFACT_LOADER_COLOR = '#3f7cff'
  const ARTIFACT_LOADER_RING_COUNT = 4
  const SOCKET_RECONNECT_INITIAL_DELAY_MS = 2800
  const SOCKET_RECONNECT_MAX_DELAY_MS = 20000
  const SNAPSHOT_POLL_DISCONNECTED_MS = 15000

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
    reconnectDelayMs: SOCKET_RECONNECT_INITIAL_DELAY_MS,
    pollTimer: null,
    snapshotRenderTimer: null,
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
    activeInlineStyleNode: null,
    resetModalInvoker: null,
    artifact: {
      busy: false,
      lastPrompt: '',
      lastAnswers: createEmptyArtifactAnswers(),
      html: '',
      lastStableHtml: '',
      rollbackHtml: '',
      pendingSuccessMessage: '',
      activeEditRequest: '',
      autoRepairInFlight: false,
      repairAttemptCount: 0,
      lastRuntimeError: '',
      floatingOpen: false,
      editHistory: [],
      stageSurface: ARTIFACT_STAGE_SURFACE_HIDDEN,
      instanceId: 0,
      pendingRequestKind: '',
      frameReady: false,
      renderConfirmed: false,
      renderErrorCount: 0,
      lastPayloadKey: '',
      lastDeliveredPayload: null,
      pendingPayload: null,
      pendingPayloadTimerId: null,
      postLoadReplayTimerIds: [],
      renderWatchdogTimerId: null,
      reportedContentWidth: 0,
      reportedContentHeight: 0,
      frameHeight: 520,
      loaderFrameId: 0,
      loaderTime: 0,
      conversationStepIndex: 0,
      conversationAnswers: createEmptyArtifactAnswers()
    },
    ai: {
      open: false,
      busy: false,
      queue: [],
      activePrompt: '',
      messageSeq: 0,
      model: ''
    },
    library: {
      status: 'pending',
      detail: ''
    },
    presentMode: false,
    presentModeUsingFullscreen: false
  }

  const el = {
    bgImage: must('bg-image'),
    bgOverlay: must('bg-overlay'),
    gridBg: must('grid-bg'),
    wrap: must('canvas-wrap'),
    panelBgDrag: must('panel-bg-drag'),
    panelDragTop: must('panel-drag-top'),
    panelDragRight: must('panel-drag-right'),
    panelDragBottom: must('panel-drag-bottom'),
    panelDragLeft: must('panel-drag-left'),
    panelDragTl: must('panel-drag-tl'),
    panelDragTr: must('panel-drag-tr'),
    panelDragBr: must('panel-drag-br'),
    panelDragBl: must('panel-drag-bl'),
    settingsRibbon: must('settings-ribbon'),
    settingsToggle: must('settings-toggle'),
    settingsMinimized: must('settings-minimized'),
    settingsBackdrop: must('settings-backdrop'),
    selectionToolbar: must('selection-toolbar'),
    resizeSelection: must('resize-selection'),
    settingsPanel: must('settings-panel'),
    settingsClose: must('settings-close'),
    historyUndo: must('history-undo'),
    historyRedo: must('history-redo'),
    deleteSelectedObject: must('delete-selected-object'),
    presentModeToggle: must('present-mode-toggle'),
    resetPositions: document.getElementById('reset-positions'),
    themeName: must('theme-name'),
    themeSelect: must('theme-select'),
    saveTheme: must('save-theme'),
    loadTheme: must('load-theme'),
    deleteTheme: must('delete-theme'),
    exportTheme: must('export-theme'),
    importThemeButton: must('import-theme-button'),
    importTheme: must('import-theme'),
    resetTheme: must('reset-theme'),
    themeFeedback: must('theme-feedback'),
    artifactName: must('artifact-name'),
    artifactSelect: must('artifact-select'),
    saveArtifact: must('save-artifact'),
    loadArtifact: must('load-artifact'),
    deleteArtifact: must('delete-artifact'),
    artifactFeedback: must('artifact-feedback'),
    librarySyncStatus: must('library-sync-status'),
    librarySyncStatusText: must('library-sync-status-text'),
    textEditFeedback: must('text-edit-feedback'),
    aiChatShell: must('ai-chat-shell'),
    aiChatFab: must('ai-chat-fab'),
    aiChatPanel: must('ai-chat-panel'),
    aiChatCollapse: must('ai-chat-collapse'),
    aiChatStatus: must('ai-chat-status'),
    aiChatQueue: must('ai-chat-queue'),
    aiChatMessages: must('ai-chat-messages'),
    aiChatForm: must('ai-chat-form'),
    aiChatInput: must('ai-chat-input'),
    aiChatSend: must('ai-chat-send'),
    artifactComposer: must('artifact-composer'),
    artifactComposerAnchor: must('artifact-composer-anchor'),
    artifactComposerCollapse: must('artifact-composer-collapse'),
    artifactComposerFab: must('artifact-composer-fab'),
    artifactComposerSubtitle: must('artifact-composer-subtitle'),
    artifactChatLog: must('artifact-chat-log'),
    artifactEditQuickActions: must('artifact-edit-quick-actions'),
    artifactPromptForm: must('artifact-prompt-form'),
    artifactPromptInput: must('artifact-prompt-input'),
    artifactPromptSubmit: must('artifact-prompt-submit'),
    artifactPromptStatus: must('artifact-prompt-status'),
    artifactStage: must('artifact-stage'),
    artifactStageLoader: must('artifact-stage-loader'),
    artifactLoaderCanvas: must('artifact-loader-canvas'),
    artifactLoaderText: must('artifact-loader-text'),
    artifactFrame: must('artifact-frame'),
    artifactStagePlaceholder: must('artifact-stage-placeholder'),
    resetPositionsModal: must('reset-positions-modal'),
    resetPositionsAccept: must('reset-positions-accept'),
    resetPositionsCancel: must('reset-positions-cancel'),
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
    resizeHandles: [...document.querySelectorAll('#resize-selection [data-resize-handle]')],
    question: must('question'),
    eyebrow: must('eyebrow'),
    status: must('status'),
    votes: must('votes'),
    options: must('options'),
    footer: must('footer'),
    dot: document.querySelector('.dot'),
    customLogo: must('custom-logo'),
    customAsset: must('custom-asset'),
    pollHead: must('poll-head'),
    headLeft: must('head-left'),
    headRight: must('head-right'),
    metaBar: must('meta-bar'),
    aiQuickActions: [...document.querySelectorAll('.ai-quick-action')]
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
    artifactLayout: ARTIFACT_LAYOUT_HORIZONTAL,
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
    panelScaleX: 1,
    panelScaleY: 1,
    bgImageX: 0,
    bgImageY: 0,
    bgOverlayX: 0,
    bgOverlayY: 0,
    gridX: 0,
    gridY: 0,
    bgImageScaleX: 1,
    bgImageScaleY: 1,
    bgOverlayScaleX: 1,
    bgOverlayScaleY: 1,
    gridScaleX: 1,
    gridScaleY: 1,
    eyebrowX: 0,
    eyebrowY: 0,
    eyebrowBoxWidth: null,
    eyebrowBoxHeight: null,
    questionX: 0,
    questionY: 0,
    questionBoxWidth: null,
    questionBoxHeight: null,
    metaX: 0,
    metaY: 0,
    metaBoxWidth: null,
    metaBoxHeight: null,
    metaScaleX: 1,
    metaScaleY: 1,
    optionsX: 0,
    optionsY: 0,
    footerX: 0,
    footerY: 0,
    footerBoxWidth: null,
    footerBoxHeight: null,
    footerScaleX: 1,
    footerScaleY: 1,
    logoScaleX: 1,
    logoScaleY: 1,
    assetScaleX: 1,
    assetScaleY: 1,
    optionOffsets: {},
    optionSizes: {},
    optionScales: {},
    optionAnchors: {},
    deletedObjects: {},
    fontFamily: '"Inter", "Segoe UI", "Trebuchet MS", sans-serif'
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

  const libraryStorage = createPollGameLibraryStorage({
    themeLibraryKey: THEME_LIBRARY_KEY,
    artifactLibraryKey: ARTIFACT_LIBRARY_KEY,
    themeDraftKey: THEME_DRAFT_KEY,
    defaultTheme,
    clone,
    asText,
    safeJsonParse,
    safeStorageGet,
    normalizeThemeName,
    sanitizeTheme,
    normalizeArtifactMarkup,
    createEmptyArtifactAnswers,
    cloneArtifactConversationAnswers,
    artifactVisualMode: ARTIFACT_VISUAL_MODE
  })
  const {
    loadInitialTheme,
    loadThemeLibrary,
    saveThemeLibrary,
    loadArtifactLibrary,
    saveArtifactLibrary,
    saveThemeDraft,
    sanitizeSavedArtifactRecord
  } = libraryStorage
  const librarySyncManager = createPollGameLibrarySyncManager({
    librarySyncStorageKey: LIBRARY_SYNC_TOKEN_KEY,
    librarySyncMessageType: LIBRARY_SYNC_MESSAGE_TYPE,
    librarySyncRequestMessageType: LIBRARY_SYNC_REQUEST_MESSAGE_TYPE,
    normalizeApiBase,
    asText,
    errorToMessage,
    getSupabaseAccessToken,
    getApiBase: () => state.apiBase,
    setApiBase: (apiBase) => {
      state.apiBase = apiBase
    },
    mergeRemoteThemeLibrary,
    mergeRemoteArtifactLibrary,
    setStatus: setLibrarySyncStatus,
    showArtifactFeedback
  })
  const {
    hydrateSavedLibraries,
    handleLibrarySyncMessage,
    handleLibrarySyncStatusClick,
    persistThemeToAccount,
    deleteThemeFromAccount,
    persistArtifactToAccount,
    deleteArtifactFromAccount,
    reflectLibrarySyncResult,
    dispose: disposeLibrarySyncManager
  } = librarySyncManager
  const artifactBridge = createPollGameArtifactBridge({
    artifactState: state.artifact,
    stageEl: el.artifactStage,
    frameEl: el.artifactFrame,
    getIsArtifactMode: () => currentTheme.visualMode === ARTIFACT_VISUAL_MODE,
    getCurrentPollPayload: () => {
      if (currentTheme.visualMode !== ARTIFACT_VISUAL_MODE || !state.currentPoll) {
        return null
      }
      return buildArtifactPollPayload(state.currentPoll, getTotalVotes(state.currentPoll))
    },
    buildPayloadKey: buildArtifactPayloadKey,
    clone,
    clamp,
    stageAspectRatio: ARTIFACT_STAGE_ASPECT_RATIO,
    safeFitScale: ARTIFACT_SAFE_FIT_SCALE,
    statePushBatchMs: ARTIFACT_STATE_PUSH_BATCH_MS,
    editRenderConfirmTimeoutMs: ARTIFACT_EDIT_RENDER_CONFIRM_TIMEOUT_MS,
    onRenderWatchdogTimeout: () => {
      restoreArtifactAfterFailedEdit(
        'The updated artifact never confirmed a successful render after the edit.'
      )
    }
  })
  let themeLibrary = loadThemeLibrary()
  let artifactLibrary = loadArtifactLibrary()
  let currentTheme = loadInitialTheme(themeLibrary)
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
  const artifactLayoutRefitState = {
    rafId: 0,
    timerIds: []
  }
  const editorDockLayoutState = {
    rafId: 0,
    timerIds: []
  }
  const historyState = {
    initialized: false,
    applying: false,
    present: null,
    undoStack: [],
    redoStack: [],
    typingTimerId: null
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
    setupAiChat()
    setupArtifactMode()
    setupPresentMode()
    setupHistoryControls()
    setupDeleteControls()
    setupDragInteractions()
    setupResizeInteractions()
    setupRibbonOffsetTracking()
    setupCanvasFitBehavior()
    applyTheme(currentTheme)
    syncThemeControls()
    refreshThemeSelect(themeLibrary.activeName)
    refreshArtifactSelect(artifactLibrary.activeName)
    renderInitialState()
    initializeHistoryState()
    void hydrateSavedLibraries()
    void startSessionFeed()
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('message', handleLibrarySyncMessage)
    el.librarySyncStatus.addEventListener('click', handleLibrarySyncStatusClick)
  }

  function setupSettingsPanel() {
    const storedTab = asText(safeStorageGet(RIBBON_TAB_KEY))
    setActiveRibbonTab(storedTab || 'home', { persist: false })
    setRibbonAdvanced(true)
    setRibbonCollapsed(safeStorageGet(RIBBON_COLLAPSED_KEY) === '1', { persist: false })
    setRibbonHidden(safeStorageGet(RIBBON_HIDDEN_KEY) === '1', { persist: false })

    for (const tab of ribbonTabs) {
      tab.addEventListener('click', () => {
        const nextTab = asText(tab.dataset.ribbonTab)
        if (ribbonState.hidden) {
          setRibbonHidden(false)
        }
        const isActiveExpanded =
          !ribbonState.hidden &&
          !ribbonState.collapsed &&
          nextTab &&
          nextTab === ribbonState.activeTab
        if (isActiveExpanded) {
          setRibbonCollapsed(true)
          return
        }
        setActiveRibbonTab(nextTab)
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
      if (isResetPositionsModalOpen()) {
        event.preventDefault()
        closeResetPositionsModal()
        return
      }
      if (state.presentMode) {
        event.preventDefault()
        setPresentMode(false)
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
    scheduleArtifactLayoutRefit()
  }

  function setupCanvasFitBehavior() {
    el.wrap.addEventListener('pointerdown', handleCanvasPointerDown)
    el.wrap.addEventListener('transitionend', handleCanvasLayoutTransitionEnd)
    applyRibbonLayoutMode()
  }

  function clearArtifactLayoutRefitSchedule() {
    if (artifactLayoutRefitState.rafId) {
      window.cancelAnimationFrame(artifactLayoutRefitState.rafId)
      artifactLayoutRefitState.rafId = 0
    }
    if (!artifactLayoutRefitState.timerIds.length) {
      return
    }
    for (const timerId of artifactLayoutRefitState.timerIds) {
      window.clearTimeout(timerId)
    }
    artifactLayoutRefitState.timerIds = []
  }

  function clearEditorDockLayoutSchedule() {
    if (editorDockLayoutState.rafId) {
      window.cancelAnimationFrame(editorDockLayoutState.rafId)
      editorDockLayoutState.rafId = 0
    }
    if (!editorDockLayoutState.timerIds.length) {
      return
    }
    for (const timerId of editorDockLayoutState.timerIds) {
      window.clearTimeout(timerId)
    }
    editorDockLayoutState.timerIds = []
  }

  function applyEditorDockLayout() {
    const rootStyle = document.documentElement.style
    const isDocked = document.body.classList.contains('editor-docked')
    if (!isDocked || window.innerWidth <= EDITOR_DOCK_BREAKPOINT_PX) {
      rootStyle.setProperty('--editor-sidebar-width', '0px')
      rootStyle.setProperty('--editor-dock-reserve', '0px')
      rootStyle.setProperty('--editor-dock-shift', '0px')
      rootStyle.setProperty('--wrap-width-limit', '1100px')
      if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
        scheduleArtifactLayoutRefit({ includeSettledPass: false })
      }
      return
    }
    const activeDockPanel =
      currentTheme.visualMode === ARTIFACT_VISUAL_MODE && state.artifact.floatingOpen
        ? el.artifactComposer
        : state.ai.open
          ? el.aiChatPanel
          : null
    const activePanelRect = activeDockPanel ? activeDockPanel.getBoundingClientRect() : null
    const shellRect = el.aiChatShell.getBoundingClientRect()
    const fallbackShellWidth = Math.min(420, Math.max(320, window.innerWidth - 64))
    const measuredPanelWidth =
      activePanelRect && Number.isFinite(activePanelRect.width) && activePanelRect.width > 0
        ? activePanelRect.width
        : 0
    const measuredShellWidth =
      Number.isFinite(shellRect.width) && shellRect.width > 0 ? shellRect.width : 0
    const shellWidth = Math.round(
      clamp(
        measuredPanelWidth || measuredShellWidth || fallbackShellWidth,
        320,
        Math.max(320, Math.min(460, window.innerWidth - 64))
      )
    )
    const reserve = Math.round(shellWidth + EDITOR_DOCK_GAP_PX)
    const widthLimit = Math.max(
      320,
      Math.min(1100, Math.round(window.innerWidth - reserve - EDITOR_DOCK_SIDE_PADDING_PX))
    )
    const shift = 0
    rootStyle.setProperty('--editor-sidebar-width', `${Math.round(shellWidth)}px`)
    rootStyle.setProperty('--editor-dock-reserve', `${reserve}px`)
    rootStyle.setProperty('--editor-dock-shift', `${shift}px`)
    rootStyle.setProperty('--wrap-width-limit', `${widthLimit}px`)
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      scheduleArtifactLayoutRefit({ includeSettledPass: false })
    }
  }

  function scheduleEditorDockLayoutRefresh(options = {}) {
    const includeSettledPass = options.includeSettledPass !== false
    clearEditorDockLayoutSchedule()
    editorDockLayoutState.rafId = window.requestAnimationFrame(() => {
      editorDockLayoutState.rafId = 0
      applyEditorDockLayout()
    })
    if (!includeSettledPass) {
      return
    }
    const timerId = window.setTimeout(() => {
      editorDockLayoutState.timerIds = editorDockLayoutState.timerIds.filter(
        (activeId) => activeId !== timerId
      )
      applyEditorDockLayout()
    }, ARTIFACT_LAYOUT_REFIT_DELAY_MS)
    editorDockLayoutState.timerIds.push(timerId)
  }

  function handleEditorDockViewportResize() {
    scheduleEditorDockLayoutRefresh()
  }

  function handleEditorDockShellTransitionEnd(event) {
    if (event.target !== el.aiChatShell) {
      return
    }
    scheduleEditorDockLayoutRefresh({ includeSettledPass: false })
  }

  function scheduleArtifactLayoutRefit(options = {}) {
    const includeSettledPass = options.includeSettledPass !== false
    if (
      currentTheme.visualMode !== ARTIFACT_VISUAL_MODE ||
      state.artifact.stageSurface === ARTIFACT_STAGE_SURFACE_HIDDEN
    ) {
      clearArtifactLayoutRefitSchedule()
      return
    }
    clearArtifactLayoutRefitSchedule()
    artifactLayoutRefitState.rafId = window.requestAnimationFrame(() => {
      artifactLayoutRefitState.rafId = 0
      artifactBridge.setFrameHeight(state.artifact.frameHeight, { force: true })
    })
    if (!includeSettledPass) {
      return
    }
    const timerId = window.setTimeout(() => {
      artifactLayoutRefitState.timerIds = artifactLayoutRefitState.timerIds.filter(
        (activeId) => activeId !== timerId
      )
      artifactBridge.setFrameHeight(state.artifact.frameHeight, { force: true })
    }, ARTIFACT_LAYOUT_REFIT_DELAY_MS)
    artifactLayoutRefitState.timerIds.push(timerId)
  }

  function handleCanvasLayoutTransitionEnd(event) {
    if (event.target !== el.wrap) {
      return
    }
    const propertyName = asText(event.propertyName)
    if (propertyName !== 'transform' && !propertyName.startsWith('margin')) {
      return
    }
    scheduleArtifactLayoutRefit({ includeSettledPass: false })
  }

  function handleCanvasPointerDown(event) {
    if (state.presentMode || ribbonState.hidden || dragState.active) {
      return
    }
    if (event.target instanceof Element && event.target.closest('#present-mode-toggle')) {
      return
    }
    if (event.target instanceof Element && event.target.closest('#selection-toolbar')) {
      return
    }
    if (event.target instanceof Element && event.target.closest('#resize-selection')) {
      return
    }
    if (event.target instanceof Element) {
      const resizeNode = event.target.closest('.resizable-target')
      if (resizeNode && resizeProfiles.has(resizeNode)) {
        setActiveResizeTarget(resizeNode)
      } else if (!event.target.closest('.rich-text-editable')) {
        clearActiveResizeTarget()
      }
    }
    if (event.target instanceof Element && event.target.closest('.rich-text-editable')) {
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    setRibbonHidden(true)
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

  function setRibbonAdvanced(advanced) {
    ribbonState.advanced = Boolean(advanced)
    document.body.classList.toggle('ribbon-advanced', ribbonState.advanced)
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
        updateTheme({ [spec.key]: value }, { historyLabel: 'Update design' })
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
    el.importThemeButton.addEventListener('click', () => {
      el.importTheme.click()
    })
    el.importTheme.addEventListener('change', importThemeFromFile)
    el.resetTheme.addEventListener('click', resetThemeDraft)
    el.saveArtifact.addEventListener('click', saveArtifactToLibrary)
    el.loadArtifact.addEventListener('click', loadArtifactFromSelect)
    el.deleteArtifact.addEventListener('click', deleteArtifactFromSelect)
    if (el.resetPositions) {
      el.resetPositions.addEventListener('click', openResetPositionsModal)
    }
    el.resetPositionsCancel.addEventListener('click', () => {
      closeResetPositionsModal()
    })
    el.resetPositionsAccept.addEventListener('click', acceptResetPositions)
    el.resetPositionsModal.addEventListener('click', (event) => {
      if (event.target === el.resetPositionsModal) {
        closeResetPositionsModal()
      }
    })
    window.addEventListener('keydown', handleResetPositionsModalKeydown, true)

    bindImageUpload('theme-bg-image-upload', 'bgImageUrl', 'Background image applied.')
    bindImageUpload('theme-race-car-upload', 'raceCarImageUrl', 'Race car image applied.')
    bindImageUpload('theme-logo-upload', 'logoUrl', 'Logo applied.')
    bindImageUpload('theme-asset-upload', 'assetUrl', 'Overlay asset applied.')
  }

  function setupAiChat() {
    try {
      localStorage.removeItem('prezo.poll-game-poc.gemini-api-key.v1')
    } catch {}
    state.ai.model = resolveAiModel()
    const storedOpen = safeStorageGet(AI_CHAT_OPEN_KEY)
    setAiChatOpen(storedOpen === '1', { persist: false })
    updateAiComposerState()

    el.aiChatFab.addEventListener('click', handleAiChatFabClick)
    el.aiChatCollapse.addEventListener('click', handleAiChatCollapseClick)
    el.aiChatForm.addEventListener('submit', handleAiChatFormSubmit)
    el.aiChatInput.addEventListener('keydown', handleAiChatInputKeydown)
    el.aiChatShell.addEventListener('transitionend', handleEditorDockShellTransitionEnd)
    window.addEventListener('resize', handleEditorDockViewportResize)
    for (const quickAction of el.aiQuickActions) {
      quickAction.addEventListener('click', handleAiQuickActionClick)
    }

    appendAiChatMessage(
      'assistant',
      'AI editor is ready. Ask for design or text changes and I will apply them directly.'
    )
    updateAiChatStatus('Ready for edits.', 'success')
    scheduleEditorDockLayoutRefresh({ includeSettledPass: false })
  }

  function setupPresentMode() {
    syncPresentModeUi()
    el.presentModeToggle.addEventListener('pointerdown', handlePresentModeTogglePointerDown)
    el.presentModeToggle.addEventListener('click', handlePresentModeToggleClick)
    document.addEventListener('fullscreenchange', handlePresentModeFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handlePresentModeFullscreenChange)
  }

  function handlePresentModeTogglePointerDown(event) {
    event.stopPropagation()
  }

  function handlePresentModeToggleClick() {
    void setPresentMode(!state.presentMode)
  }

  function getPresentModeFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null
  }

  async function requestPresentModeFullscreen() {
    const target = document.documentElement
    if (typeof target.requestFullscreen === 'function') {
      try {
        await target.requestFullscreen({ navigationUI: 'hide' })
      } catch (error) {
        if (!(error instanceof TypeError)) {
          throw error
        }
        await target.requestFullscreen()
      }
      return true
    }
    if (typeof target.webkitRequestFullscreen === 'function') {
      target.webkitRequestFullscreen()
      return true
    }
    return false
  }

  async function exitPresentModeFullscreen() {
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen()
      return true
    }
    if (typeof document.webkitExitFullscreen === 'function') {
      document.webkitExitFullscreen()
      return true
    }
    return false
  }

  function handlePresentModeFullscreenChange() {
    const isFullscreen = Boolean(getPresentModeFullscreenElement())
    state.presentModeUsingFullscreen = isFullscreen
    syncPresentModeUi()
    scheduleArtifactLayoutRefit()
    if (!isFullscreen && state.presentMode) {
      applyPresentModeState(false)
    }
  }

  function syncPresentModeUi() {
    document.body.classList.toggle('present-mode', state.presentMode)
    document.body.classList.toggle('present-mode-fullscreen', state.presentModeUsingFullscreen)
    el.presentModeToggle.classList.toggle('is-active', state.presentMode)
    el.presentModeToggle.setAttribute('aria-pressed', state.presentMode ? 'true' : 'false')
    el.presentModeToggle.setAttribute(
      'aria-label',
      state.presentMode ? 'Exit present mode' : 'Enter present mode'
    )
    el.presentModeToggle.setAttribute(
      'title',
      state.presentMode ? 'Exit present mode' : 'Enter present mode'
    )
    el.presentModeToggle.textContent = state.presentMode ? '×' : '+'
  }

  function applyPresentModeState(enabled) {
    const nextValue = Boolean(enabled)
    if (state.presentMode === nextValue) {
      return
    }
    state.presentMode = nextValue
    const activeRichTextHost = getActiveRichTextHost()
    if (state.presentMode && activeRichTextHost && typeof activeRichTextHost.blur === 'function') {
      activeRichTextHost.blur()
      state.activeTextHost = null
      clearCachedRichTextSelection()
    }
    hideSelectionToolbar()
    clearActiveResizeTarget()
    syncPresentModeUi()
    syncEditorDockingState()
    scheduleArtifactLayoutRefit()
  }

  async function setPresentMode(enabled) {
    const nextValue = Boolean(enabled)
    if (nextValue) {
      applyPresentModeState(true)
      try {
        state.presentModeUsingFullscreen = await requestPresentModeFullscreen()
      } catch (error) {
        state.presentModeUsingFullscreen = false
      }
      syncPresentModeUi()
      scheduleArtifactLayoutRefit()
      return
    }

    const isFullscreen = Boolean(getPresentModeFullscreenElement())
    state.presentModeUsingFullscreen = false
    if (isFullscreen) {
      try {
        await exitPresentModeFullscreen()
      } catch {}
    }
    applyPresentModeState(false)
  }

  function syncEditorDockingState() {
    const isArtifactMode = currentTheme.visualMode === ARTIFACT_VISUAL_MODE
    const hasDockedAiEditor = !state.presentMode && !isArtifactMode && state.ai.open
    const hasDockedArtifactEditor =
      !state.presentMode &&
      isArtifactMode &&
      Boolean(state.artifact.html) &&
      state.artifact.floatingOpen
    document.body.classList.toggle('editor-docked', hasDockedAiEditor || hasDockedArtifactEditor)
    document.body.classList.toggle('ai-editor-docked', hasDockedAiEditor)
    document.body.classList.toggle('artifact-editor-docked', hasDockedArtifactEditor)
    scheduleEditorDockLayoutRefresh()
  }

  function setupArtifactMode() {
    syncArtifactComposerVisibility()
    resetArtifactConversation({ preserveInput: false })
    syncArtifactComposerBusyState()
    renderArtifactEditQuickActions()
    hideArtifactStagePlaceholder()
    hideArtifactStage()
    artifactBridge.setFrameHeight(state.artifact.frameHeight, { force: true })
    el.artifactFrame.addEventListener('load', handleArtifactFrameLoad)
    window.addEventListener('resize', artifactBridge.handleViewportResize)
    window.addEventListener('message', handleArtifactFrameMessage)
    el.artifactComposerFab.addEventListener('click', handleArtifactComposerFabClick)
    el.artifactComposerCollapse.addEventListener('click', handleArtifactComposerCollapseClick)
    el.artifactPromptForm.addEventListener('submit', handleArtifactPromptFormSubmit)
    el.artifactEditQuickActions.addEventListener('click', handleArtifactEditQuickActionClick)
  }

  function syncArtifactComposerVisibility() {
    const isArtifactMode = currentTheme.visualMode === ARTIFACT_VISUAL_MODE
    const shouldFloatComposer = isArtifactMode && Boolean(state.artifact.html)
    const shouldShowComposer =
      isArtifactMode && (!shouldFloatComposer || state.artifact.floatingOpen)
    syncArtifactComposerDocking(shouldFloatComposer)
    const shouldShowArtifactShell = isArtifactMode && shouldFloatComposer
    el.aiChatShell.classList.toggle('artifact-shell-active', shouldShowArtifactShell)
    el.aiChatShell.classList.toggle('hidden', isArtifactMode ? !shouldShowArtifactShell : false)
    if (shouldShowArtifactShell) {
      el.aiChatPanel.classList.add('hidden')
      el.aiChatFab.classList.add('hidden')
      el.aiChatShell.classList.toggle('is-open', state.artifact.floatingOpen)
      el.aiChatShell.classList.toggle('is-collapsed', !state.artifact.floatingOpen)
    } else if (!isArtifactMode) {
      setAiChatOpen(state.ai.open, { persist: false })
    }
    el.artifactComposer.classList.toggle('is-floating', shouldFloatComposer)
    el.artifactComposer.classList.toggle('hidden', !shouldShowComposer)
    el.artifactComposerCollapse.classList.toggle('hidden', !shouldFloatComposer)
    el.artifactComposerFab.classList.toggle(
      'hidden',
      !(shouldFloatComposer && !state.artifact.floatingOpen)
    )
    el.artifactComposerFab.setAttribute(
      'aria-expanded',
      shouldFloatComposer && state.artifact.floatingOpen ? 'true' : 'false'
    )
    syncEditorDockingState()
    syncArtifactStageVisibility(isArtifactMode)
    if (isArtifactMode) {
      syncArtifactConversationUi()
      scheduleArtifactLayoutRefit()
    }
  }

  function syncArtifactComposerDocking(shouldDock) {
    const inlineParent = el.artifactComposerAnchor.parentElement
    if (shouldDock) {
      if (el.artifactComposer.parentElement !== el.aiChatShell) {
        el.aiChatShell.insertBefore(el.artifactComposer, el.artifactComposerFab)
      }
      return
    }
    if (
      inlineParent &&
      (el.artifactComposer.parentElement !== inlineParent ||
        el.artifactComposer.nextElementSibling !== el.artifactComposerAnchor)
    ) {
      inlineParent.insertBefore(el.artifactComposer, el.artifactComposerAnchor)
    }
  }

  function syncArtifactStageVisibility(isArtifactMode = currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
    const shouldShowStage =
      isArtifactMode && state.artifact.stageSurface !== ARTIFACT_STAGE_SURFACE_HIDDEN
    el.artifactStage.classList.toggle('hidden', !shouldShowStage)
    el.options.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.pollHead.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.footer.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.customLogo.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.customAsset.classList.toggle('hidden-by-artifact', isArtifactMode)
    if (!shouldShowStage) {
      stopArtifactLoaderAnimation()
    }
    if (!isArtifactMode) {
      return
    }
    if (state.artifact.stageSurface === ARTIFACT_STAGE_SURFACE_LOADING && shouldShowStage) {
      startArtifactLoaderAnimation()
    }
    const activeRichTextHost = getActiveRichTextHost()
    const shouldBlurHost =
      activeRichTextHost &&
      (el.options.contains(activeRichTextHost) ||
        el.pollHead.contains(activeRichTextHost) ||
        el.footer.contains(activeRichTextHost))
    if (shouldBlurHost) {
      if (typeof activeRichTextHost.blur === 'function') {
        activeRichTextHost.blur()
      }
      state.activeTextHost = null
      clearCachedRichTextSelection()
      hideSelectionToolbar()
    }
    clearActiveResizeTarget()
    if (!shouldShowStage) {
      return
    }
    requestAnimationFrame(() => {
      artifactBridge.setFrameHeight(state.artifact.frameHeight, { force: true })
    })
  }

  function syncArtifactComposerBusyState() {
    const canEditArtifact = Boolean(state.artifact.html) && isArtifactConversationComplete()
    el.artifactPromptSubmit.disabled = Boolean(state.artifact.busy)
    el.artifactPromptInput.disabled = Boolean(state.artifact.busy)
    el.artifactPromptSubmit.textContent = state.artifact.busy
      ? 'Working...'
      : canEditArtifact
        ? 'Apply'
        : 'Send'
  }

  function setArtifactComposerFloatingOpen(open) {
    state.artifact.floatingOpen = Boolean(open)
    syncArtifactComposerVisibility()
    if (state.artifact.floatingOpen && currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      window.setTimeout(() => {
        el.artifactPromptInput.focus()
      }, 0)
    }
  }

  function resetArtifactConversation(options = {}) {
    state.artifact.conversationStepIndex = 0
    state.artifact.conversationAnswers = createEmptyArtifactAnswers()
    if (options.clearEditHistory !== false) {
      state.artifact.editHistory = []
    }
    if (!options.preserveInput) {
      el.artifactPromptInput.value = ''
    }
    syncArtifactConversationUi()
  }

  function syncArtifactConversationUi() {
    const currentStep = getArtifactConversationStep()
    const canEditArtifact = Boolean(state.artifact.html) && isArtifactConversationComplete()
    el.artifactPromptInput.placeholder = currentStep
      ? currentStep.placeholder
      : canEditArtifact
        ? ARTIFACT_EDIT_PLACEHOLDER
        : ARTIFACT_DEFAULT_PLACEHOLDER
    el.artifactComposerSubtitle.textContent = currentStep
      ? 'Answer 3 short questions to generate the first artifact.'
      : canEditArtifact
        ? 'Refine the current artifact with targeted changes. Small edits work best.'
        : 'Answer the first question to begin building an artifact.'
    renderArtifactConversation()
    renderArtifactEditQuickActions()
    syncArtifactComposerBusyState()
    if (state.artifact.busy) {
      return
    }
    if (currentStep) {
      setArtifactComposerStatus(
        `Question ${state.artifact.conversationStepIndex + 1} of ${ARTIFACT_CONVERSATION_STEPS.length}`,
        'pending'
      )
      return
    }
    setArtifactComposerStatus(
      canEditArtifact
        ? ARTIFACT_EDIT_READY_STATUS
        : ARTIFACT_WAITING_STATUS,
      'success'
    )
  }

  function renderArtifactConversation() {
    const currentStepIndex = state.artifact.conversationStepIndex
    const canEditArtifact = Boolean(state.artifact.html) && isArtifactConversationComplete()
    const fragment = document.createDocumentFragment()
    if (canEditArtifact) {
      const summary = buildArtifactConversationSummary(state.artifact.lastAnswers)
      if (summary) {
        fragment.appendChild(createArtifactChatMessage(summary, 'assistant summary'))
      }
      if (!state.artifact.editHistory.length) {
        fragment.appendChild(
          createArtifactChatMessage(
            'Ask for one focused change at a time. For larger reworks, say so explicitly.',
            'assistant'
          )
        )
      }
    } else {
      for (let index = 0; index < ARTIFACT_CONVERSATION_STEPS.length; index += 1) {
        const step = ARTIFACT_CONVERSATION_STEPS[index]
        const answer = asText(state.artifact.conversationAnswers?.[step.key]).trim()
        if (index > currentStepIndex && !answer) {
          break
        }
        if (index < currentStepIndex || index === currentStepIndex) {
          fragment.appendChild(createArtifactChatMessage(step.question, 'assistant'))
        }
        if (answer) {
          fragment.appendChild(createArtifactChatMessage(answer, 'user'))
        }
        if (index === currentStepIndex && !answer) {
          break
        }
      }
    }
    const editHistory = Array.isArray(state.artifact.editHistory) ? state.artifact.editHistory : []
    for (const message of editHistory) {
      if (!message || typeof message !== 'object') {
        continue
      }
      fragment.appendChild(createArtifactChatMessage(message.text, message.tone))
    }
    el.artifactChatLog.replaceChildren(fragment)
  }

  function createArtifactChatMessage(text, tone) {
    const node = document.createElement('div')
    const normalizedTone = asText(tone).trim().toLowerCase()
    node.className = `artifact-chat-message ${normalizedTone === 'user' ? 'user' : 'assistant'}`
    if (normalizedTone.includes('summary')) {
      node.classList.add('summary')
    }
    node.textContent = asText(text)
    return node
  }

  function renderArtifactEditQuickActions() {
    const canEditArtifact = Boolean(state.artifact.html) && isArtifactConversationComplete()
    el.artifactEditQuickActions.classList.toggle('hidden', !canEditArtifact)
    if (!canEditArtifact) {
      el.artifactEditQuickActions.replaceChildren()
      return
    }
    const fragment = document.createDocumentFragment()
    for (const action of ARTIFACT_EDIT_QUICK_ACTIONS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'artifact-edit-quick-action'
      button.dataset.artifactPrompt = asText(action?.prompt)
      button.textContent = asText(action?.label)
      fragment.appendChild(button)
    }
    el.artifactEditQuickActions.replaceChildren(fragment)
  }

  function handleArtifactEditQuickActionClick(event) {
    const button = event.target instanceof HTMLElement ? event.target.closest('button') : null
    if (!(button instanceof HTMLButtonElement)) {
      return
    }
    const prompt = asText(button.dataset.artifactPrompt).trim()
    if (!prompt || state.artifact.busy) {
      return
    }
    el.artifactPromptInput.value = prompt
    el.artifactPromptInput.focus()
    setArtifactComposerStatus('Suggested edit loaded. Review it and click Apply.', 'idle')
  }

  function getArtifactConversationStep(index = state.artifact.conversationStepIndex) {
    return ARTIFACT_CONVERSATION_STEPS[index] || null
  }

  function isArtifactConversationComplete() {
    return state.artifact.conversationStepIndex >= ARTIFACT_CONVERSATION_STEPS.length
  }

  function cloneArtifactConversationAnswers(answers) {
    return {
      artifactType: asText(answers?.artifactType),
      audienceSize: asText(answers?.audienceSize),
      designGuidelines: asText(answers?.designGuidelines)
    }
  }

  function buildArtifactConversationSummary(answers) {
    const artifactType = asText(answers?.artifactType).trim()
    const audienceSize = asText(answers?.audienceSize).trim()
    const designGuidelines = asText(answers?.designGuidelines).trim()
    const parts = []
    if (artifactType) {
      parts.push(`Type: ${artifactType}`)
    }
    if (audienceSize) {
      parts.push(`Audience: ${audienceSize}`)
    }
    if (designGuidelines) {
      parts.push(`Guidelines: ${designGuidelines}`)
    }
    if (parts.length === 0) {
      return ''
    }
    return `Current artifact brief\n${parts.join('\n')}`
  }

  function setArtifactComposerStatus(text, type = 'idle') {
    el.artifactPromptStatus.textContent = asText(text) || ARTIFACT_WAITING_STATUS
    el.artifactPromptStatus.classList.remove('status-success', 'status-error', 'status-pending')
    if (type === 'success') {
      el.artifactPromptStatus.classList.add('status-success')
      return
    }
    if (type === 'error') {
      el.artifactPromptStatus.classList.add('status-error')
      return
    }
    if (type === 'pending') {
      el.artifactPromptStatus.classList.add('status-pending')
    }
  }

  function setArtifactStagePlaceholder(text, type = 'pending') {
    el.artifactStagePlaceholder.textContent =
      asText(text) || 'Artifact editor is ready. Answer the questions to generate your artifact.'
    el.artifactStagePlaceholder.classList.remove(
      'status-success',
      'status-error',
      'status-pending'
    )
    if (type === 'success') {
      el.artifactStagePlaceholder.classList.add('status-success')
      return
    }
    if (type === 'error') {
      el.artifactStagePlaceholder.classList.add('status-error')
      return
    }
    el.artifactStagePlaceholder.classList.add('status-pending')
  }

  function hideArtifactStagePlaceholder() {
    el.artifactStagePlaceholder.classList.add('hidden')
    el.artifactStagePlaceholder.classList.remove(
      'status-success',
      'status-error',
      'status-pending'
    )
  }

  function setArtifactStageSurface(surface, options = {}) {
    const normalizedSurface = normalizeArtifactStageSurface(surface)
    const loaderText = asText(options.loaderText)
    if (loaderText) {
      el.artifactLoaderText.textContent = loaderText
    }
    state.artifact.stageSurface = normalizedSurface
    el.artifactStageLoader.classList.toggle(
      'hidden',
      normalizedSurface !== ARTIFACT_STAGE_SURFACE_LOADING
    )
    el.artifactFrame.classList.toggle('hidden', normalizedSurface !== ARTIFACT_STAGE_SURFACE_FRAME)
    el.artifactStagePlaceholder.classList.toggle(
      'hidden',
      normalizedSurface !== ARTIFACT_STAGE_SURFACE_PLACEHOLDER
    )
    if (normalizedSurface === ARTIFACT_STAGE_SURFACE_LOADING) {
      startArtifactLoaderAnimation()
    } else {
      stopArtifactLoaderAnimation()
    }
    syncArtifactStageVisibility()
  }

  function normalizeArtifactStageSurface(surface) {
    if (
      surface === ARTIFACT_STAGE_SURFACE_LOADING ||
      surface === ARTIFACT_STAGE_SURFACE_FRAME ||
      surface === ARTIFACT_STAGE_SURFACE_PLACEHOLDER
    ) {
      return surface
    }
    return ARTIFACT_STAGE_SURFACE_HIDDEN
  }

  function showArtifactStagePlaceholder(text, type = 'pending') {
    setArtifactStagePlaceholder(text, type)
    setArtifactStageSurface(ARTIFACT_STAGE_SURFACE_PLACEHOLDER)
  }

  function hideArtifactStage() {
    setArtifactStageSurface(ARTIFACT_STAGE_SURFACE_HIDDEN)
  }

  function showArtifactStageLoader(text = 'Generating artifact canvas...') {
    setArtifactStageSurface(ARTIFACT_STAGE_SURFACE_LOADING, { loaderText: text })
  }

  function showArtifactStageFrame() {
    hideArtifactStagePlaceholder()
    setArtifactStageSurface(ARTIFACT_STAGE_SURFACE_FRAME)
  }

  function startArtifactLoaderAnimation() {
    if (state.artifact.loaderFrameId) {
      return
    }
    const canvas = el.artifactLoaderCanvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    const size = ARTIFACT_LOADER_SIZE_PX
    const dpr = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    state.artifact.loaderTime = 0

    const render = () => {
      state.artifact.loaderTime += 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)

      const centerX = size / 2
      const centerY = size / 2
      for (let ringIndex = 0; ringIndex < ARTIFACT_LOADER_RING_COUNT; ringIndex += 1) {
        const baseRadius = size * 0.1 + ringIndex * (size * 0.15)
        const pulse = Math.sin(state.artifact.loaderTime * 0.03 - ringIndex * 0.5) * (size * 0.05)
        const radius = Math.min(baseRadius + pulse, size / 2 - 2)
        const opacity = clamp(
          0.2 + Math.sin(state.artifact.loaderTime * 0.03 - ringIndex * 0.5) * 0.3,
          0.08,
          0.95,
          0.3
        )

        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.strokeStyle = toLoaderRgba(ARTIFACT_LOADER_COLOR, opacity)
        ctx.lineWidth = 2
        ctx.stroke()

        const dotCount = 8
        for (let dotIndex = 0; dotIndex < dotCount; dotIndex += 1) {
          const angle =
            (dotIndex / dotCount) * Math.PI * 2 +
            state.artifact.loaderTime * 0.02 * (ringIndex % 2 === 1 ? 1 : -1)
          const dotX = centerX + Math.cos(angle) * radius
          const dotY = centerY + Math.sin(angle) * radius

          ctx.beginPath()
          ctx.arc(dotX, dotY, 2, 0, Math.PI * 2)
          ctx.fillStyle = ARTIFACT_LOADER_COLOR
          ctx.fill()
        }
      }

      const centerPulse = Math.sin(state.artifact.loaderTime * 0.05) * 0.3 + 0.7
      ctx.beginPath()
      ctx.arc(centerX, centerY, 5 * centerPulse, 0, Math.PI * 2)
      ctx.fillStyle = ARTIFACT_LOADER_COLOR
      ctx.fill()

      state.artifact.loaderFrameId = window.requestAnimationFrame(render)
    }

    render()
  }

  function stopArtifactLoaderAnimation() {
    if (state.artifact.loaderFrameId) {
      window.cancelAnimationFrame(state.artifact.loaderFrameId)
      state.artifact.loaderFrameId = 0
    }
    const canvas = el.artifactLoaderCanvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function toLoaderRgba(hex, alpha) {
    const normalized = asText(hex).replace('#', '')
    if (!/^[0-9a-f]{6}$/i.test(normalized)) {
      return `rgba(95, 134, 216, ${clamp(alpha, 0, 1, 1)})`
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16)
    const g = Number.parseInt(normalized.slice(2, 4), 16)
    const b = Number.parseInt(normalized.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1, 1)})`
  }

  function handleArtifactPromptFormSubmit(event) {
    event.preventDefault()
    const answer = asText(el.artifactPromptInput.value).trim()
    if (!answer) {
      setArtifactComposerStatus('Answer the current artifact question first.', 'error')
      return
    }
    if (Boolean(state.artifact.html) && isArtifactConversationComplete()) {
      void submitArtifactEditRequest(answer)
      return
    }
    if (isArtifactConversationComplete()) {
      resetArtifactConversation({ preserveInput: true })
    }
    void submitArtifactConversationAnswer(answer)
  }

  function appendArtifactEditMessage(tone, text) {
    const normalizedText = asText(text).trim()
    if (!normalizedText) {
      return
    }
    state.artifact.editHistory.push({
      tone: tone === 'user' ? 'user' : 'assistant',
      text: normalizedText
    })
    renderArtifactConversation()
  }

  function handleArtifactComposerFabClick() {
    if (!state.artifact.html || currentTheme.visualMode !== ARTIFACT_VISUAL_MODE) {
      return
    }
    setArtifactComposerFloatingOpen(true)
  }

  function handleArtifactComposerCollapseClick() {
    if (!state.artifact.html || currentTheme.visualMode !== ARTIFACT_VISUAL_MODE) {
      return
    }
    setArtifactComposerFloatingOpen(false)
  }

  function handleArtifactFrameLoad() {
    artifactBridge.handleFrameLoad()
  }

  function handleArtifactFrameMessage(event) {
    const frameWindow = el.artifactFrame.contentWindow
    if (!frameWindow || event.source !== frameWindow) {
      return
    }
    const message = event.data
    if (!message || typeof message !== 'object') {
      return
    }
    const isArtifactFrameMessage =
      message.type === ARTIFACT_READY_MESSAGE_TYPE ||
      message.type === ARTIFACT_SIZE_MESSAGE_TYPE ||
      message.type === ARTIFACT_RENDER_OK_MESSAGE_TYPE ||
      message.type === ARTIFACT_RENDER_ERROR_MESSAGE_TYPE
    if (isArtifactFrameMessage && Number(message.instanceId) !== state.artifact.instanceId) {
      return
    }
    if (message.type === ARTIFACT_READY_MESSAGE_TYPE) {
      artifactBridge.handleReadyMessage()
      return
    }
    if (message.type === ARTIFACT_SIZE_MESSAGE_TYPE) {
      artifactBridge.updateReportedContentSize(message.width, message.height)
      return
    }
    if (message.type === ARTIFACT_RENDER_OK_MESSAGE_TYPE) {
      if (shouldRejectArtifactRenderHealth(message?.renderHealth)) {
        restoreArtifactAfterFailedEdit(buildArtifactRenderHealthErrorMessage(message?.renderHealth))
        return
      }
      confirmArtifactRenderSuccess()
      return
    }
    if (message.type === ARTIFACT_RENDER_ERROR_MESSAGE_TYPE) {
      handleArtifactRenderError(message)
    }
  }

  function confirmArtifactRenderSuccess() {
    artifactBridge.clearRenderWatchdog()
    const completedRequestKind = state.artifact.pendingRequestKind
    const successMessage = asText(state.artifact.pendingSuccessMessage)
    state.artifact.renderConfirmed = true
    state.artifact.renderErrorCount = 0
    if (state.artifact.html) {
      state.artifact.lastStableHtml = state.artifact.html
    }
    state.artifact.rollbackHtml = ''
    state.artifact.pendingSuccessMessage = ''
    state.artifact.pendingRequestKind = ''
    if (successMessage) {
      setArtifactComposerStatus(successMessage, 'success')
      if (completedRequestKind === 'edit') {
        appendArtifactEditMessage('assistant', successMessage)
      }
    }
  }

  function handleArtifactRenderError(message) {
    state.artifact.renderErrorCount = Math.max(
      state.artifact.renderErrorCount + 1,
      toInt(message?.failureCount)
    )
    if (state.artifact.renderConfirmed || state.artifact.pendingRequestKind !== 'edit') {
      return
    }
    if (!state.artifact.rollbackHtml || state.artifact.renderErrorCount < 3) {
      return
    }
    restoreArtifactAfterFailedEdit(asText(message?.message))
  }

  function restoreArtifactAfterFailedEdit(errorMessage) {
    artifactBridge.clearRenderWatchdog()
    const failedArtifactHtml = normalizeArtifactMarkup(state.artifact.html)
    const rollbackHtml = normalizeArtifactMarkup(
      state.artifact.rollbackHtml || state.artifact.lastStableHtml
    )
    if (!rollbackHtml) {
      return
    }
    const detail = asText(errorMessage)
    const statusMessage = 'Artifact edit was reverted because the updated artifact failed to render.'
    state.artifact.pendingSuccessMessage = ''
    applyArtifactMarkup(rollbackHtml, { requestKind: 'rollback' })
    showArtifactStageFrame()
    state.artifact.lastRuntimeError = detail
    if (
      state.artifact.activeEditRequest &&
      !state.artifact.autoRepairInFlight &&
      state.artifact.repairAttemptCount < 1
    ) {
      state.artifact.repairAttemptCount += 1
      state.artifact.autoRepairInFlight = true
      const retryMessage =
        'The edited artifact failed at runtime. Retrying the edit against the last working artifact.'
      setArtifactComposerStatus(retryMessage, 'pending')
      appendArtifactEditMessage(
        'assistant',
        detail ? `${retryMessage} ${detail}` : retryMessage
      )
      void submitArtifactRuntimeRepairRequest({
        request: state.artifact.activeEditRequest,
        runtimeError: detail,
        failedArtifactHtml,
        baseArtifactHtml: rollbackHtml
      })
      return
    }
    setArtifactComposerStatus(statusMessage, 'error')
    appendArtifactEditMessage(
      'assistant',
      detail ? `${statusMessage} ${detail}` : statusMessage
    )
  }

  async function submitArtifactRuntimeRepairRequest({
    request,
    runtimeError,
    failedArtifactHtml,
    baseArtifactHtml
  }) {
    const normalizedRequest = asText(request).trim()
    if (!normalizedRequest) {
      state.artifact.autoRepairInFlight = false
      return
    }

    state.artifact.busy = true
    syncArtifactComposerBusyState()

    try {
      const context = buildAiEditorContext()
      const repairPrompt = buildArtifactRepairPrompt(
        normalizedRequest,
        runtimeError,
        state.artifact.lastAnswers
      )
      context.artifact = buildArtifactContext(
        {
          prompt: repairPrompt,
          answers: state.artifact.lastAnswers,
          mode: 'repair',
          originalEditRequest: normalizedRequest,
          runtimeRenderError: runtimeError,
          failedMarkup: failedArtifactHtml,
          baseMarkup: baseArtifactHtml
        },
        context.poll
      )
      const buildResult = await requestAiArtifactBuild(repairPrompt, context)
      const applied = applyArtifactMarkup(buildResult.html, { requestKind: 'edit' })
      if (!applied) {
        const message =
          'Artifact repair failed because the AI returned empty markup. The previous working artifact was kept.'
        setArtifactComposerStatus(message, 'error')
        appendArtifactEditMessage('assistant', message)
        return
      }
      renderFromSnapshot(true)
      showArtifactStageFrame()
      const statusMessage = appendArtifactModelLabel(
        asText(buildResult.assistantMessage) === 'Artifact ready. Keep prompting to iterate.'
          ? 'Artifact repaired and updated.'
          : asText(buildResult.assistantMessage) || 'Artifact repaired and updated.',
        buildResult.model
      )
      state.artifact.pendingSuccessMessage = statusMessage
      setArtifactComposerStatus('Artifact repair applied. Verifying updated render...', 'pending')
    } catch (error) {
      const message = `Artifact repair failed: ${errorToMessage(error)}`
      state.artifact.pendingSuccessMessage = ''
      setArtifactComposerStatus(message, 'error')
      appendArtifactEditMessage('assistant', message)
    } finally {
      state.artifact.busy = false
      state.artifact.autoRepairInFlight = false
      syncArtifactComposerBusyState()
    }
  }

  function shouldRejectArtifactRenderHealth(renderHealth) {
    if (
      currentTheme.visualMode !== ARTIFACT_VISUAL_MODE ||
      state.artifact.pendingRequestKind !== 'edit' ||
      state.artifact.renderConfirmed ||
      !state.artifact.rollbackHtml ||
      !renderHealth ||
      typeof renderHealth !== 'object'
    ) {
      return false
    }
    const paleAllowed = artifactEditAllowsPaleBackground(state.artifact.activeEditRequest)
    const requiresVisibleBackground =
      isArtifactBackgroundEditRequest(state.artifact.activeEditRequest) && !paleAllowed
    const runtimeBackgroundVisibleCount = Math.max(
      0,
      toInt(renderHealth?.runtimeBackgroundVisibleCount)
    )
    return (
      Boolean(renderHealth.likelyBlank) ||
      (requiresVisibleBackground && runtimeBackgroundVisibleCount === 0) ||
      (Boolean(renderHealth.likelyWashedOut) && !paleAllowed)
    )
  }

  function artifactEditAllowsPaleBackground(request) {
    const text = asText(request).toLowerCase()
    if (!text) {
      return false
    }
    return /\b(?:white|minimal|airy|pale|soft white|foggy|washed|monochrome|snow)\b/.test(text)
  }

  function buildArtifactRenderHealthErrorMessage(renderHealth) {
    const visibleElementCount = Math.max(0, toInt(renderHealth?.visibleElementCount))
    const mediaCount = Math.max(0, toInt(renderHealth?.mediaCount))
    const textLength = Math.max(0, toInt(renderHealth?.textLength))
    const darkCoverCount = Math.max(0, toInt(renderHealth?.largeDarkCoverCount))
    const paleCoverCount = Math.max(0, toInt(renderHealth?.largePaleCoverCount))
    const runtimeBackgroundVisibleCount = Math.max(
      0,
      toInt(renderHealth?.runtimeBackgroundVisibleCount)
    )
    if (
      isArtifactBackgroundEditRequest(state.artifact.activeEditRequest) &&
      !artifactEditAllowsPaleBackground(state.artifact.activeEditRequest) &&
      runtimeBackgroundVisibleCount === 0
    ) {
      return (
        'The updated artifact did not attach a visible background treatment to the rendered scene. ' +
        `Visible elements: ${visibleElementCount}. Media elements: ${mediaCount}. ` +
        `Text length: ${textLength}. Visible runtime background layers: ${runtimeBackgroundVisibleCount}.`
      )
    }
    if (Boolean(renderHealth?.likelyWashedOut)) {
      return (
        'The updated artifact rendered a washed-out light frame instead of a meaningful scene. ' +
        `Visible elements: ${visibleElementCount}. Media elements: ${mediaCount}. ` +
        `Text length: ${textLength}. Pale full-frame layers: ${paleCoverCount}.`
      )
    }
    return (
      'The updated artifact rendered a near-empty dark frame instead of the expected scene. ' +
      `Visible elements: ${visibleElementCount}. Media elements: ${mediaCount}. ` +
      `Text length: ${textLength}. Dark full-frame layers: ${darkCoverCount}.`
    )
  }

  async function submitArtifactConversationAnswer(answer) {
    const currentStep = getArtifactConversationStep()
    if (!currentStep) {
      return
    }
    state.artifact.conversationAnswers[currentStep.key] = answer
    el.artifactPromptInput.value = ''
    state.artifact.conversationStepIndex += 1
    syncArtifactConversationUi()

    if (!isArtifactConversationComplete()) {
      return
    }

    const conversationAnswers = cloneArtifactConversationAnswers(state.artifact.conversationAnswers)
    const prompt = buildArtifactConversationPrompt(conversationAnswers)
    await submitArtifactPrompt(prompt, { conversationAnswers })
  }

  async function submitArtifactEditRequest(request) {
    const normalizedRequest = asText(request).trim()
    if (!normalizedRequest) {
      return
    }
    const resolvedRequest = resolveArtifactEditRequest(normalizedRequest)
    state.artifact.activeEditRequest = resolvedRequest || normalizedRequest
    state.artifact.autoRepairInFlight = false
    state.artifact.repairAttemptCount = 0
    state.artifact.lastRuntimeError = ''
    appendArtifactEditMessage('user', normalizedRequest)
    el.artifactPromptInput.value = ''
    if (isArtifactQuestionRequest(normalizedRequest)) {
      state.artifact.activeEditRequest = ''
      await submitArtifactQuestionRequest(normalizedRequest)
      return
    }
    const prompt = buildArtifactEditPrompt(
      resolvedRequest || normalizedRequest,
      state.artifact.lastAnswers
    )
    await submitArtifactPrompt(prompt, {
      conversationAnswers: state.artifact.lastAnswers,
      requestKind: 'edit',
      originalEditRequest: resolvedRequest || normalizedRequest
    })
  }

  async function submitArtifactQuestionRequest(request) {
    if (state.artifact.busy) {
      setArtifactComposerStatus('Artifact request is already running. Wait for it to finish.', 'error')
      return
    }

    state.artifact.busy = true
    syncArtifactComposerBusyState()
    setArtifactComposerStatus('Answering your artifact question...', 'pending')

    try {
      const context = buildAiEditorContext()
      context.artifact = buildArtifactContext(
        {
          prompt: request,
          answers: state.artifact.lastAnswers,
          mode: 'question'
        },
        context.poll
      )
      const answer = await requestAiArtifactAnswer(request, context)
      appendArtifactEditMessage('assistant', answer.text)
      setArtifactComposerStatus('Question answered.', 'success')
    } catch (error) {
      const message = `Artifact question failed: ${errorToMessage(error)}`
      appendArtifactEditMessage('assistant', message)
      setArtifactComposerStatus(message, 'error')
    } finally {
      state.artifact.busy = false
      syncArtifactComposerBusyState()
    }
  }

  async function submitArtifactPrompt(prompt, options = {}) {
    if (state.artifact.busy) {
      setArtifactComposerStatus('Artifact request is already running. Wait for it to finish.', 'error')
      return
    }

    const requestKind = options.requestKind === 'edit' ? 'edit' : 'build'
    const conversationAnswers =
      options.conversationAnswers && typeof options.conversationAnswers === 'object'
        ? options.conversationAnswers
        : state.artifact.lastAnswers
    const originalEditRequest = asText(options.originalEditRequest)
    state.artifact.busy = true
    syncArtifactComposerBusyState()
    state.artifact.lastPrompt = prompt
    state.artifact.lastAnswers = cloneArtifactConversationAnswers(conversationAnswers)
    setArtifactComposerStatus(
      requestKind === 'edit'
        ? 'Applying your artifact edits...'
        : 'Generating artifact from your answers...',
      'pending'
    )
    showArtifactStageLoader(
      requestKind === 'edit' ? 'Updating artifact canvas...' : 'Generating artifact canvas...'
    )
    if (state.snapshot) {
      renderFromSnapshot(true)
    }

    try {
      const context = buildAiEditorContext()
      context.artifact = buildArtifactContext(
        {
          prompt,
          answers: state.artifact.lastAnswers,
          mode: requestKind,
          originalEditRequest
        },
        context.poll
      )
      const aiPrompt = buildArtifactAiPrompt(prompt, context.artifact)
      const buildResult = await requestAiArtifactBuild(aiPrompt, context)
      const applied = applyArtifactMarkup(buildResult.html, { requestKind })
      if (!applied) {
        state.artifact.pendingSuccessMessage = ''
        setArtifactComposerStatus(
          'Artifact request returned empty markup. Try a more specific prompt.',
          'error'
        )
        showArtifactStagePlaceholder('Artifact request returned empty markup.', 'error')
        if (requestKind === 'edit') {
          appendArtifactEditMessage(
            'assistant',
            'Artifact edit failed because the AI returned empty markup.'
          )
        }
      } else {
        renderFromSnapshot(true)
        showArtifactStageFrame()
        const statusMessage = appendArtifactModelLabel(
          requestKind === 'edit'
            ? asText(buildResult.assistantMessage) === 'Artifact ready. Keep prompting to iterate.'
              ? 'Artifact updated. Keep prompting to iterate.'
              : asText(buildResult.assistantMessage) || 'Artifact updated. Keep prompting to iterate.'
            : asText(buildResult.assistantMessage) || 'Artifact generated. Keep prompting to iterate.',
          buildResult.model
        )
        if (requestKind === 'edit') {
          state.artifact.pendingSuccessMessage = statusMessage
          setArtifactComposerStatus('Artifact update applied. Verifying updated render...', 'pending')
        } else {
          setArtifactComposerStatus(statusMessage, 'success')
        }
      }
    } catch (error) {
      const message = `Artifact request failed: ${errorToMessage(error)}`
      state.artifact.pendingSuccessMessage = ''
      setArtifactComposerStatus(message, 'error')
      showArtifactStagePlaceholder(message, 'error')
      if (requestKind === 'edit') {
        appendArtifactEditMessage('assistant', message)
      }
    } finally {
      state.artifact.busy = false
      syncArtifactComposerBusyState()
    }
  }

  function buildArtifactContext(artifactInput, pollContext = null) {
    const sessionId = asText(state.sessionId)
    const code = asText(state.code)
    const apiBase = asText(state.apiBase)
    const encodedSession = sessionId ? encodeURIComponent(sessionId) : '{session_id}'
    const encodedCode = code ? encodeURIComponent(code) : '{code}'
    const wsBase = toWsBase(apiBase)
    const prompt =
      typeof artifactInput === 'string' ? artifactInput : asText(artifactInput?.prompt)
    const answers =
      artifactInput && typeof artifactInput === 'object'
        ? cloneArtifactConversationAnswers(artifactInput.answers)
        : createEmptyArtifactAnswers()
    const requestMode =
      artifactInput && typeof artifactInput === 'object' ? asText(artifactInput.mode) : ''
    const baseArtifactMarkup =
      artifactInput && typeof artifactInput === 'object'
        ? asText(artifactInput.baseMarkup) || state.artifact.html
        : state.artifact.html
    const failedArtifactMarkup =
      artifactInput && typeof artifactInput === 'object' ? asText(artifactInput.failedMarkup) : ''
    const runtimeRenderError =
      artifactInput && typeof artifactInput === 'object'
        ? asText(artifactInput.runtimeRenderError)
        : ''
    const originalEditRequest =
      artifactInput && typeof artifactInput === 'object'
        ? asText(artifactInput.originalEditRequest)
        : ''
    const voteCapacity = estimateArtifactVoteCapacity(pollContext || state.currentPoll, answers)

    return {
      enabled: true,
      lastPrompt: prompt,
      requestMode: requestMode || (state.artifact.html ? 'edit' : 'build'),
      hasExistingArtifact: Boolean(baseArtifactMarkup),
      currentArtifactFullHtml: asText(baseArtifactMarkup).trim(),
      currentArtifactHtml: buildArtifactEditContextMarkup(baseArtifactMarkup),
      currentArtifactLiveHooks: buildArtifactLiveHookContext(baseArtifactMarkup),
      failedArtifactHtml: buildArtifactEditContextMarkup(failedArtifactMarkup),
      runtimeRenderError,
      originalEditRequest: originalEditRequest || prompt,
      recentEditRequests: buildArtifactRecentEditRequests(state.artifact.editHistory),
      runtimeApi: {
        setRenderer: 'window.prezoSetPollRenderer(fn)',
        renderHook: 'window.prezoRenderPoll(state)',
        getState: 'window.prezoGetPollState()'
      },
      pollTitle: asText(state.currentPoll?.question) || asText(pollContext?.question) || '',
      pollSelector: asText(state.pollSelector?.descriptor),
      artifactType: answers.artifactType,
      audienceSize: answers.audienceSize,
      designGuidelines: answers.designGuidelines,
      expectedMaxVotes: voteCapacity.expectedMaxVotes,
      recommendedVisibleUnits: voteCapacity.recommendedVisibleUnits,
      recommendedVotesPerUnit: voteCapacity.recommendedVotesPerUnit,
      avoidOneToOneVoteObjects: voteCapacity.avoidOneToOneVoteObjects,
      dataEndpoints: {
        sessionByCode: `${apiBase}/sessions/code/${encodedCode}`,
        sessionSnapshot: `${apiBase}/sessions/${encodedSession}/snapshot`,
        pollsList: `${apiBase}/sessions/${encodedSession}/polls`,
        pollOpen: `${apiBase}/sessions/${encodedSession}/polls/{poll_id}/open`,
        pollClose: `${apiBase}/sessions/${encodedSession}/polls/{poll_id}/close`,
        pollVote: `${apiBase}/sessions/${encodedSession}/polls/{poll_id}/vote`,
        liveSocket: wsBase ? `${wsBase}/ws/sessions/${encodedSession}` : ''
      }
    }
  }

  function buildArtifactEditContextMarkup(markup) {
    const text = asText(markup)
    if (!text) {
      return ''
    }
    const normalized = text.trim()
    if (normalized.length <= 40000) {
      return normalized
    }
    const scriptMatches = [...normalized.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
    const hookScripts = scriptMatches
      .map((match) => asText(match?.[0]))
      .filter(
        (scriptText) =>
          scriptText.includes('prezoSetPollRenderer') ||
          scriptText.includes('prezoRenderPoll') ||
          scriptText.includes('prezo:poll-update') ||
          scriptText.includes('__PREZO_POLL_STATE') ||
          scriptText.includes('prezoGetPollState')
      )
      .join('\n\n')
    const head = normalized.slice(0, 18000)
    const tail = normalized.slice(-6000)
    const combined = [head, hookScripts, tail].filter(Boolean).join('\n\n<!-- artifact-context-cut -->\n\n')
    return combined.length > 52000 ? `${combined.slice(0, 52000)}...` : combined
  }

  function buildArtifactLiveHookContext(markup) {
    const text = asText(markup)
    if (!text) {
      return ''
    }
    const scriptMatches = [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)]
    const hookScripts = scriptMatches
      .map((match) => asText(match?.[0]).trim())
      .filter(
        (scriptText) =>
          scriptText.includes('prezoSetPollRenderer') ||
          scriptText.includes('prezoRenderPoll') ||
          scriptText.includes('prezo:poll-update') ||
          scriptText.includes('__PREZO_POLL_STATE') ||
          scriptText.includes('prezoGetPollState')
      )
    if (hookScripts.length === 0) {
      return ''
    }
    return hookScripts.join('\n\n')
  }

  function buildArtifactRecentEditRequests(history) {
    if (!Array.isArray(history)) {
      return []
    }
    return history
      .filter((entry) => entry && typeof entry === 'object' && asText(entry.tone) === 'user')
      .slice(-6)
      .map((entry) => asText(entry.text).trim())
      .filter(Boolean)
  }

  function isArtifactBackgroundEditRequest(value) {
    const text = asText(value).trim().toLowerCase()
    if (!text) {
      return false
    }
    return /\b(?:background|backdrop|sky|track|road|ground|terrain|landscape|sunrise|sunset|daytime|nighttime|lighting|light|ambient|weather|day\b|night\b|city|cityscape|urban|skyline|downtown|building|buildings|skyscraper)\b/.test(
      text
    )
  }

  function isArtifactFeedbackFollowupRequest(value) {
    const text = asText(value).trim().toLowerCase()
    if (!text) {
      return false
    }
    return /\b(?:nothing changed|no change|still white|still blank|still the same|didn't work|didnt work|not a city|not a skyline|isn't a city|isnt a city|too white|too blank|can't see|cant see|background didn't change|background didnt change)\b/.test(
      text
    )
  }

  function findPreviousArtifactTargetedRequest(history, currentRequest) {
    if (!Array.isArray(history)) {
      return ''
    }
    const normalizedCurrent = asText(currentRequest).trim()
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index]
      if (!entry || typeof entry !== 'object' || asText(entry.tone) !== 'user') {
        continue
      }
      const text = asText(entry.text).trim()
      if (!text || text === normalizedCurrent || isArtifactFeedbackFollowupRequest(text)) {
        continue
      }
      return text
    }
    return ''
  }

  function resolveArtifactEditRequest(request) {
    const normalized = asText(request).trim()
    if (!normalized || !isArtifactFeedbackFollowupRequest(normalized)) {
      return normalized
    }
    const previousRequest = findPreviousArtifactTargetedRequest(
      state.artifact.editHistory,
      normalized
    )
    if (!previousRequest) {
      return normalized
    }
    if (isArtifactBackgroundEditRequest(previousRequest)) {
      return [
        'Retry the previous background-only edit more strongly.',
        `Previous request: ${previousRequest}.`,
        `User feedback on the last attempt: ${normalized}.`,
        'Keep cars, labels, layout, vote visuals, and foreground gameplay art unchanged.',
        'The background change must be clearly visible across the full scene and must not result in a pale, blank, or nearly white background.'
      ].join(' ')
    }
    return [
      'Retry the previous targeted edit more faithfully.',
      `Previous request: ${previousRequest}.`,
      `User feedback on the last attempt: ${normalized}.`,
      'Keep unrelated visuals unchanged.'
    ].join(' ')
  }

  function isArtifactQuestionRequest(value) {
    const text = asText(value).trim().toLowerCase()
    if (!text) {
      return false
    }
    const looksLikeEditRequest = /\b(?:change|make|update|edit|set|use|swap|replace|turn|move|resize|add|remove|background|backdrop|image|photo|picture|logo|asset|color|layout|spacing|animation|font)\b/.test(
      text
    )
    if (looksLikeEditRequest && /^(can|could|would|should|please)\b/.test(text)) {
      return false
    }
    if (text.endsWith('?')) {
      return true
    }
    return /^(what|why|how|when|where|which|who|can|could|would|should|does|do|did|is|are|was|were|tell me|explain)\b/.test(
      text
    )
  }

  function estimateArtifactVoteCapacity(poll, answers = null) {
    const options = Array.isArray(poll?.options) ? poll.options : []
    const optionCount = Math.max(2, options.length || 0)
    const totalVotes = options.reduce((sum, option) => sum + toInt(option?.votes), 0)
    const explicitAudienceSize = parseArtifactAudienceSize(answers?.audienceSize)
    const expectedMaxVotes =
      explicitAudienceSize > 0
        ? explicitAudienceSize
        : roundArtifactCapacityUp(Math.max(100, optionCount * 20, totalVotes * 2))
    const recommendedVisibleUnits =
      expectedMaxVotes <= 10 ? expectedMaxVotes : expectedMaxVotes <= 40 ? 10 : expectedMaxVotes <= 100 ? 20 : 25
    const recommendedVotesPerUnit = Math.max(
      1,
      Math.ceil(expectedMaxVotes / recommendedVisibleUnits)
    )

    return {
      expectedMaxVotes,
      recommendedVisibleUnits,
      recommendedVotesPerUnit,
      avoidOneToOneVoteObjects: expectedMaxVotes > 24
    }
  }

  function parseArtifactAudienceSize(value) {
    const digits = asText(value).match(/\d+/)
    if (!digits) {
      return 0
    }
    return clamp(Number(digits[0]), 0, 100000, 0)
  }

  function roundArtifactCapacityUp(value) {
    const numeric = Math.max(1, toInt(value))
    const steps = [10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000]
    for (const step of steps) {
      if (numeric <= step) {
        return step
      }
    }
    return Math.ceil(numeric / 1000) * 1000
  }

  function resolveAiModel() {
    const queryModel =
      asText(query.get('aiModel')) ||
      asText(query.get('geminiModel'))
    if (queryModel) {
      try {
        localStorage.setItem(AI_MODEL_STORAGE_KEY, queryModel)
      } catch {}
      return queryModel
    }
    const storedModel = asText(safeStorageGet(AI_MODEL_STORAGE_KEY))
    if (storedModel && AI_LEGACY_MODELS.has(storedModel)) {
      try {
        localStorage.removeItem(AI_MODEL_STORAGE_KEY)
      } catch {}
      return AI_DEFAULT_MODEL
    }
    if (storedModel) {
      return storedModel
    }
    return AI_DEFAULT_MODEL
  }

  function handleAiChatFabClick() {
    setAiChatOpen(true)
  }

  function handleAiChatCollapseClick() {
    setAiChatOpen(false)
  }

  function handleAiChatFormSubmit(event) {
    event.preventDefault()
    const prompt = asText(el.aiChatInput.value)
    if (!prompt) {
      return
    }
    el.aiChatInput.value = ''
    enqueueAiPrompt(prompt)
  }

  function handleAiChatInputKeydown(event) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    const prompt = asText(el.aiChatInput.value)
    if (!prompt) {
      return
    }
    el.aiChatInput.value = ''
    enqueueAiPrompt(prompt)
  }

  function handleAiQuickActionClick(event) {
    const button = event.currentTarget
    if (!(button instanceof HTMLButtonElement)) {
      return
    }
    const prompt = asText(button.dataset.aiPrompt)
    if (!prompt) {
      return
    }
    enqueueAiPrompt(prompt)
  }

  function setAiChatOpen(open, options = {}) {
    const persist = options.persist !== false
    state.ai.open = Boolean(open)
    const isArtifactMode = currentTheme.visualMode === ARTIFACT_VISUAL_MODE
    el.aiChatShell.classList.toggle('hidden', isArtifactMode)
    if (isArtifactMode) {
      el.aiChatPanel.classList.add('hidden')
      el.aiChatFab.classList.add('hidden')
      el.aiChatShell.classList.remove('is-open', 'is-collapsed')
      syncEditorDockingState()
      if (persist) {
        try {
          localStorage.setItem(AI_CHAT_OPEN_KEY, state.ai.open ? '1' : '0')
        } catch {}
      }
      return
    }
    el.aiChatPanel.classList.toggle('hidden', !state.ai.open)
    el.aiChatFab.classList.toggle('hidden', state.ai.open)
    el.aiChatShell.classList.toggle('is-open', state.ai.open)
    el.aiChatShell.classList.toggle('is-collapsed', !state.ai.open)
    el.aiChatFab.setAttribute('aria-expanded', state.ai.open ? 'true' : 'false')
    syncEditorDockingState()
    if (persist) {
      try {
        localStorage.setItem(AI_CHAT_OPEN_KEY, state.ai.open ? '1' : '0')
        } catch {}
    }
    if (state.ai.open) {
      window.setTimeout(() => {
        el.aiChatInput.focus()
      }, 0)
    }
  }

  function enqueueAiPrompt(prompt) {
    const normalized = asText(prompt)
    if (!normalized) {
      return
    }
    if (state.ai.queue.length >= 12) {
      appendAiChatMessage('system', 'AI queue is full. Wait for pending prompts to complete.')
      updateAiChatStatus('Queue is full. Wait for current edits to finish.', 'error')
      return
    }
    state.ai.queue.push({
      id: ++state.ai.messageSeq,
      prompt: normalized
    })
    appendAiChatMessage('user', normalized)
    renderAiChatQueue()
    if (!state.ai.open) {
      setAiChatOpen(true)
    }
    void processAiPromptQueue()
  }

  async function processAiPromptQueue() {
    if (state.ai.busy || state.ai.queue.length === 0 || state.isUnloading) {
      return
    }
    const next = state.ai.queue.shift()
    if (!next) {
      renderAiChatQueue()
      updateAiComposerState()
      return
    }
    state.ai.busy = true
    state.ai.activePrompt = next.prompt
    updateAiComposerState()
    renderAiChatQueue()
    updateAiChatStatus('Applying your edit request...', 'pending')

    try {
      const context = buildAiEditorContext()
      const plan = await requestAiEditPlan(next.prompt, context)
      const outcome = applyAiPlanActions(plan)
      appendAiChatMessage('assistant', summarizeAiOutcome(plan, outcome))
      if (outcome.changed) {
        updateAiChatStatus('Edit applied.', 'success')
      } else {
        updateAiChatStatus('No visible change was applied for that prompt.', 'error')
      }
    } catch (error) {
      const message = errorToMessage(error)
      appendAiChatMessage('system', `Unable to apply edit: ${message}`)
      updateAiChatStatus(`AI request failed: ${message}`, 'error')
    } finally {
      state.ai.busy = false
      state.ai.activePrompt = ''
      updateAiComposerState()
      renderAiChatQueue()
      if (state.ai.queue.length > 0) {
        window.setTimeout(() => {
          void processAiPromptQueue()
        }, 0)
      }
    }
  }

  function updateAiComposerState() {
    el.aiChatSend.textContent = state.ai.busy ? 'Queue' : 'Send'
  }

  function renderAiChatQueue() {
    const items = []
    if (state.ai.activePrompt) {
      items.push({ label: 'Running', text: state.ai.activePrompt })
    }
    for (const item of state.ai.queue.slice(0, 4)) {
      items.push({ label: 'Queued', text: item.prompt })
    }
    if (items.length === 0) {
      el.aiChatQueue.classList.add('hidden')
      el.aiChatQueue.replaceChildren()
      return
    }
    el.aiChatQueue.classList.remove('hidden')
    el.aiChatQueue.replaceChildren()
    const label = document.createElement('span')
    label.className = 'ai-chat-queue-label'
    label.textContent = 'Prompt Queue'
    el.aiChatQueue.appendChild(label)
    for (const item of items) {
      const chip = document.createElement('span')
      chip.className = 'ai-chat-queue-item'
      chip.textContent = `${item.label}: ${trimForQueueLabel(item.text)}`
      el.aiChatQueue.appendChild(chip)
    }
  }

  function trimForQueueLabel(text, maxLength = 40) {
    const value = asText(text)
    if (value.length <= maxLength) {
      return value
    }
    return `${value.slice(0, maxLength - 1)}...`
  }

  function appendAiChatMessage(role, text) {
    const message = asText(text)
    if (!message) {
      return
    }
    const normalizedRole =
      role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant'
    const node = document.createElement('article')
    node.className = `ai-chat-message message-${normalizedRole}`
    node.textContent = message
    el.aiChatMessages.appendChild(node)
    while (el.aiChatMessages.children.length > AI_CHAT_MAX_MESSAGES) {
      el.aiChatMessages.removeChild(el.aiChatMessages.firstElementChild)
    }
    el.aiChatMessages.scrollTop = el.aiChatMessages.scrollHeight
  }

  function updateAiChatStatus(text, type = 'idle') {
    el.aiChatStatus.textContent = asText(text) || 'Ready'
    el.aiChatStatus.classList.remove('status-success', 'status-error', 'status-pending')
    if (type === 'success') {
      el.aiChatStatus.classList.add('status-success')
      return
    }
    if (type === 'error') {
      el.aiChatStatus.classList.add('status-error')
      return
    }
    if (type === 'pending') {
      el.aiChatStatus.classList.add('status-pending')
    }
  }

  async function requestAiEditPlan(prompt, context) {
    const model = asText(state.ai.model) || AI_DEFAULT_MODEL
    const endpoint = `${state.apiBase}/ai/poll-game-edit-plan`
    const body = {
      prompt,
      context,
      model
    }
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        asText(payload?.detail) ||
        asText(payload?.error?.message) ||
        `Request failed (${response.status})`
      throw new Error(message)
    }
    const text = asText(payload?.text) || extractGeminiText(payload)
    if (!text) {
      throw new Error('AI service returned an empty response.')
    }
    return parseAiJsonResponse(text)
  }

  function appendArtifactModelLabel(message, model) {
    const base = asText(message).trim()
    const normalizedModel = asText(model).trim()
    if (!normalizedModel) {
      return base
    }
    const suffix = `[Model: ${normalizedModel}]`
    if (!base) {
      return suffix
    }
    return base.includes(suffix) ? base : `${base} ${suffix}`
  }

  async function requestAiArtifactBuild(prompt, context) {
    const model = asText(state.ai.model) || AI_DEFAULT_MODEL
    const endpoint = `${state.apiBase}/ai/poll-game-artifact-build`
    const body = {
      prompt,
      context,
      model
    }
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, ARTIFACT_BUILD_TIMEOUT_MS)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = extractApiErrorMessage(payload, response.status)
      throw new Error(message)
    }

    const html = normalizeArtifactMarkup(asText(payload?.html) || asText(payload?.text))
    if (!html) {
      throw new Error('AI service returned empty artifact markup.')
    }
    return {
      html,
      assistantMessage: asText(payload?.assistantMessage),
      model: asText(payload?.model)
    }
  }

  async function requestAiArtifactAnswer(prompt, context) {
    const model = asText(state.ai.model) || AI_DEFAULT_MODEL
    const endpoint = `${state.apiBase}/ai/poll-game-artifact-answer`
    const body = {
      prompt,
      context,
      model
    }
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = extractApiErrorMessage(payload, response.status)
      throw new Error(message)
    }
    const text = asText(payload?.text)
    if (!text) {
      throw new Error('Artifact assistant returned an empty answer.')
    }
    return {
      text,
      assistantMessage: text
    }
  }

  function applyArtifactMarkup(markup, options = {}) {
    const normalized = normalizeArtifactMarkup(markup)
    if (!normalized) {
      return false
    }
    artifactBridge.clearRenderWatchdog()
    const requestKind = asText(options.requestKind).toLowerCase()
    if (requestKind === 'edit') {
      state.artifact.rollbackHtml = normalizeArtifactMarkup(
        state.artifact.lastStableHtml || state.artifact.html
      )
      state.artifact.pendingRequestKind = 'edit'
    } else if (requestKind === 'build') {
      state.artifact.rollbackHtml = ''
      state.artifact.pendingRequestKind = 'build'
    } else {
      state.artifact.rollbackHtml = ''
      state.artifact.pendingRequestKind = ''
    }
    state.artifact.pendingSuccessMessage = ''
    artifactBridge.clearPostLoadReplays()
    artifactBridge.clearPendingPayloadTimer()
    state.artifact.html = normalized
    state.artifact.instanceId += 1
    state.artifact.frameReady = false
    state.artifact.renderConfirmed = false
    state.artifact.renderErrorCount = 0
    state.artifact.lastPayloadKey = ''
    state.artifact.lastDeliveredPayload = null
    state.artifact.pendingPayload = null
    state.artifact.reportedContentWidth = 0
    state.artifact.reportedContentHeight = 0
    state.artifact.floatingOpen = true
    const srcDoc = buildArtifactSrcDoc(normalized, { instanceId: state.artifact.instanceId })
    if (!srcDoc) {
      return false
    }
    artifactBridge.setFrameHeight(520, { force: true })
    el.artifactFrame.srcdoc = srcDoc
    syncArtifactComposerVisibility()
    return true
  }

  function clearArtifactMarkup() {
    artifactBridge.clearRenderWatchdog()
    artifactBridge.clearPostLoadReplays()
    artifactBridge.clearPendingPayloadTimer()
    state.artifact.html = ''
    state.artifact.lastStableHtml = ''
    state.artifact.rollbackHtml = ''
    state.artifact.pendingSuccessMessage = ''
    state.artifact.instanceId += 1
    state.artifact.frameReady = false
    state.artifact.pendingRequestKind = ''
    state.artifact.renderConfirmed = false
    state.artifact.renderErrorCount = 0
    state.artifact.lastPayloadKey = ''
    state.artifact.lastDeliveredPayload = null
    state.artifact.pendingPayload = null
    state.artifact.reportedContentWidth = 0
    state.artifact.reportedContentHeight = 0
    state.artifact.floatingOpen = false
    artifactBridge.setFrameHeight(520, { force: true })
    el.artifactFrame.removeAttribute('srcdoc')
    syncArtifactComposerVisibility()
  }

  function pushArtifactPollState(poll, totalVotes, options = {}) {
    if (currentTheme.visualMode !== ARTIFACT_VISUAL_MODE) {
      return
    }
    const force = Boolean(options.force)
    const payload = buildArtifactPollPayload(poll, totalVotes)
    const payloadKey = buildArtifactPayloadKey(payload)
    if (!state.artifact.frameReady || !el.artifactFrame.contentWindow) {
      state.artifact.pendingPayload = payload
      return
    }
    if (!force && payloadKey === state.artifact.lastPayloadKey) {
      return
    }
    artifactBridge.queuePayload(payload, { force })
  }

  function buildArtifactPollPayload(poll, totalVotes) {
    const voteCapacity = estimateArtifactVoteCapacity(poll, state.artifact.lastAnswers)
    const options = Array.isArray(poll?.options)
      ? poll.options.map((option, index) => {
          const votes = toInt(option?.votes)
          const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
          return {
            id: asText(option?.id) || `option-${index}`,
            label: asText(option?.label) || `Option ${index + 1}`,
            votes,
            percentage
          }
        })
      : []

    return {
      poll: {
        id: asText(poll?.id),
        question: asText(poll?.question),
        status: asText(poll?.status),
        options
      },
      totalVotes,
      meta: {
        sessionId: asText(state.sessionId),
        code: asText(state.code),
        selector: asText(state.pollSelector?.descriptor),
        socketStatus: asText(state.socketStatus),
        expectedMaxVotes: voteCapacity.expectedMaxVotes,
        recommendedVisibleUnits: voteCapacity.recommendedVisibleUnits,
        recommendedVotesPerUnit: voteCapacity.recommendedVotesPerUnit,
        avoidOneToOneVoteObjects: voteCapacity.avoidOneToOneVoteObjects
      }
    }
  }

  function buildArtifactPayloadKey(payload) {
    const poll = payload && typeof payload === 'object' ? payload.poll : {}
    const options = Array.isArray(poll?.options) ? poll.options : []
    const stable = {
      poll: {
        id: asText(poll?.id),
        question: asText(poll?.question),
        status: asText(poll?.status),
        options: options.map((option, index) => ({
          id: asText(option?.id) || `option-${index}`,
          label: asText(option?.label),
          votes: toInt(option?.votes),
          percentage: toInt(option?.percentage)
        }))
      },
      totalVotes: toInt(payload?.totalVotes)
    }
    return JSON.stringify(stable)
  }

  function buildAiEditorContext() {
    const poll = state.currentPoll
    const options = Array.isArray(poll?.options)
      ? poll.options.map((option, index) => ({
          index,
          id: asText(option?.id) || `index-${index}`,
          label: asText(option?.label) || '',
          votes: toInt(option?.votes)
        }))
      : []
    return {
      visualMode: currentTheme.visualMode,
      artifact:
        currentTheme.visualMode === ARTIFACT_VISUAL_MODE
          ? buildArtifactContext(
              {
                prompt: state.artifact.lastPrompt || '',
                answers: state.artifact.lastAnswers
              },
              poll
            )
          : { enabled: false },
      currentText: {
        eyebrow: extractPlainTextFromHtml(el.eyebrow.innerHTML),
        question: extractPlainTextFromHtml(el.question.innerHTML)
      },
      poll: poll
        ? {
            id: asText(poll.id),
            question: asText(poll.question),
            options
          }
        : null,
      theme: {
        bgA: currentTheme.bgA,
        bgB: currentTheme.bgB,
        panelColor: currentTheme.panelColor,
        textMain: currentTheme.textMain,
        textSub: currentTheme.textSub,
        fillA: currentTheme.fillA,
        fillB: currentTheme.fillB,
        barHeight: currentTheme.barHeight,
        questionSize: currentTheme.questionSize,
        labelSize: currentTheme.labelSize,
        fontFamily: currentTheme.fontFamily
      }
    }
  }

  function extractGeminiText(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts) || parts.length === 0) {
      return ''
    }
    return parts.map((part) => asText(part?.text)).filter(Boolean).join('\n')
  }

  function parseAiJsonResponse(rawText) {
    const direct = safeJsonParse(rawText)
    if (direct && typeof direct === 'object') {
      return normalizeAiPlanResponse(direct, rawText)
    }

    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(rawText)
    if (fenced && fenced[1]) {
      const parsed = safeJsonParse(fenced[1])
      if (parsed && typeof parsed === 'object') {
        return normalizeAiPlanResponse(parsed, rawText)
      }
    }

    const start = rawText.indexOf('{')
    const end = rawText.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const sliced = rawText.slice(start, end + 1)
      const parsed = safeJsonParse(sliced)
      if (parsed && typeof parsed === 'object') {
        return normalizeAiPlanResponse(parsed, rawText)
      }
    }
    return normalizeAiPlanResponse(null, rawText)
  }

  function normalizeAiPlanResponse(value, rawText = '') {
    if (Array.isArray(value)) {
      return {
        assistantMessage: 'Applied parsed action list.',
        actions: value.filter((item) => item && typeof item === 'object')
      }
    }

    if (!value || typeof value !== 'object') {
      return {
        assistantMessage:
          'AI response was not valid JSON. No structured actions were applied.',
        actions: []
      }
    }

    const assistantMessage =
      asText(value.assistantMessage) ||
      asText(value.message) ||
      asText(rawText).slice(0, 220) ||
      'AI response parsed.'
    const actionCandidates = Array.isArray(value.actions)
      ? value.actions
      : Array.isArray(value.edits)
        ? value.edits
        : Array.isArray(value.operations)
          ? value.operations
          : []

    return {
      assistantMessage,
      actions: actionCandidates.filter((item) => item && typeof item === 'object')
    }
  }

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
        const patch = sanitizeAiThemePatch(rawAction.theme)
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

  function summarizeAiOutcome(plan, outcome) {
    const assistantMessage = asText(plan?.assistantMessage)
    if (!outcome.changed) {
      return assistantMessage || 'No editable change was applied from that prompt.'
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
    const builtSummary = summaryParts.length > 0 ? `Applied ${summaryParts.join(', ')}.` : 'Applied edits.'
    if (!assistantMessage) {
      return builtSummary
    }
    return `${assistantMessage}\n\n${builtSummary}`
  }

  function sanitizeAiThemePatch(rawTheme) {
    if (!rawTheme || typeof rawTheme !== 'object') {
      return {}
    }
    const patch = {}
    for (const [rawKey, rawValue] of Object.entries(rawTheme)) {
      const key = asText(rawKey)
      if (!AI_THEME_ALLOWED_KEYS.has(key)) {
        continue
      }
      const normalized = sanitizeAiThemeValue(key, rawValue)
      if (normalized == null && normalized !== 0 && normalized !== false) {
        continue
      }
      patch[key] = normalized
    }
    return patch
  }

  function sanitizeAiThemeValue(key, value) {
    if (AI_THEME_COLOR_KEYS.has(key)) {
      return sanitizeHex(asText(value), currentTheme[key])
    }
    if (Object.prototype.hasOwnProperty.call(AI_THEME_NUMBER_RANGES, key)) {
      const [min, max] = AI_THEME_NUMBER_RANGES[key]
      return clamp(value, min, max, currentTheme[key])
    }
    if (key === 'gridVisible') {
      return Boolean(value)
    }
    if (key === 'visualMode') {
      return sanitizeVisualMode(value, currentTheme.visualMode)
    }
    if (key === 'artifactLayout') {
      return sanitizeArtifactLayout(value, currentTheme.artifactLayout)
    }
    if (key === 'raceCar') {
      return normalizeRaceCar(value)
    }
    if (key === 'fontFamily') {
      return sanitizeFontFamily(value, currentTheme.fontFamily)
    }
    if (key === 'bgImageUrl' || key === 'raceCarImageUrl' || key === 'logoUrl' || key === 'assetUrl') {
      return sanitizeUrl(value, currentTheme[key])
    }
    return null
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
        : Number(currentTheme[config.xKey])
    const baseY =
      Object.prototype.hasOwnProperty.call(themePatch, config.yKey) &&
      Number.isFinite(Number(themePatch[config.yKey]))
        ? Number(themePatch[config.yKey])
        : Number(currentTheme[config.yKey])
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
              currentTheme[config.widthKey],
              config.minW,
              config.maxW,
              null
            )
      const baseHeight =
        Object.prototype.hasOwnProperty.call(themePatch, config.heightKey) &&
        Number.isFinite(Number(themePatch[config.heightKey]))
          ? Number(themePatch[config.heightKey])
          : sanitizeOptionalDimension(
              currentTheme[config.heightKey],
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
        : Number(currentTheme[config.xKey])
    const baseScaleY =
      Object.prototype.hasOwnProperty.call(themePatch, config.yKey) &&
      Number.isFinite(Number(themePatch[config.yKey]))
        ? Number(themePatch[config.yKey])
        : Number(currentTheme[config.yKey])
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

  async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, timeoutMs)
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Request timed out for ${url}.`)
      }
      throw new Error(`Unable to reach ${url}: ${errorToMessage(error)}`)
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  function setupHistoryControls() {
    el.historyUndo.addEventListener('click', () => {
      performUndo()
    })
    el.historyRedo.addEventListener('click', () => {
      performRedo()
    })
    window.addEventListener('keydown', handleHistoryKeydown, true)
    updateHistoryControls()
  }

  function setupDeleteControls() {
    el.deleteSelectedObject.addEventListener('click', handleDeleteSelectedObjectClick)
    window.addEventListener('keydown', handleDeleteKeydown, true)
  }

  function handleDeleteSelectedObjectClick() {
    deleteSelectedObject()
  }

  function handleDeleteKeydown(event) {
    if (event.defaultPrevented || isResetPositionsModalOpen()) {
      return
    }
    const key = asText(event.key).toLowerCase()
    if (key !== 'delete' && key !== 'backspace') {
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }
    const target = event.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
      return
    }
    if (isTextControlElement(target)) {
      return
    }
    const host = getRichTextHost(target)
    if (host && document.activeElement === host) {
      return
    }
    if (deleteSelectedObject()) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function deleteSelectedObject() {
    flushTypingHistoryCheckpoint()
    const node = getActiveResizeTarget()
    if (!node) {
      showThemeFeedback('Select an element first.', 'error')
      return false
    }
    const target = resolveDeleteTarget(node)
    if (!target) {
      showThemeFeedback('This element cannot be deleted yet.', 'error')
      return false
    }
    if (isThemeObjectDeleted(target.key)) {
      showThemeFeedback('This element is already deleted.', 'error')
      return false
    }

    setThemeObjectDeleted(target.key, true)
    updateTheme(
      { deletedObjects: clone(currentTheme.deletedObjects) },
      { recordHistory: false, historyLabel: 'Delete object' }
    )
    clearActiveResizeTarget()
    clearCachedRichTextSelection()
    hideSelectionToolbar()
    state.activeTextHost = null
    state.activeInlineStyleNode = null
    if (state.snapshot) {
      renderFromSnapshot(true)
    } else {
      renderInitialState()
    }
    refreshTextToolStates()
    syncTextStyleControlsFromSelection()
    recordHistoryCheckpoint('Delete object')
    showThemeFeedback(`${target.label} deleted. Use Undo to restore.`, 'success')
    return true
  }

  function resolveDeleteTarget(node) {
    if (!(node instanceof HTMLElement)) {
      return null
    }
    if (node === el.panelBgDrag) {
      return { key: 'panel', label: 'Panel' }
    }
    if (node === el.bgImage) {
      return { key: 'bgImage', label: 'Background image' }
    }
    if (node === el.bgOverlay) {
      return { key: 'overlay', label: 'Overlay' }
    }
    if (node === el.gridBg) {
      return { key: 'grid', label: 'Grid' }
    }
    if (node === el.customLogo) {
      return { key: 'logo', label: 'Logo' }
    }
    if (node === el.customAsset) {
      return { key: 'asset', label: 'Asset' }
    }
    if (node === el.eyebrow) {
      return { key: 'eyebrow', label: 'Eyebrow text' }
    }
    if (node === el.question) {
      return { key: 'question', label: 'Question text' }
    }
    if (node === el.metaBar) {
      return { key: 'meta', label: 'Meta badge' }
    }
    if (node === el.options) {
      return { key: 'options', label: 'Options block' }
    }
    if (node === el.footer) {
      return { key: 'footer', label: 'Footer text' }
    }

    const optionTarget = getOptionDeleteTarget(node)
    if (optionTarget) {
      return optionTarget
    }
    return null
  }

  function getOptionDeleteTarget(node) {
    if (!(node instanceof HTMLElement)) {
      return null
    }
    const optionContainer = node.closest('[data-option-drag-id]')
    if (!(optionContainer instanceof HTMLElement)) {
      return null
    }
    const optionId = asText(optionContainer.dataset.optionDragId)
    if (!optionId) {
      return null
    }
    const part = resolveOptionPartForNode(node)
    if (!part) {
      return null
    }
    const key = getOptionDeleteTargetKey(state.currentPoll, optionId, part)
    if (!key) {
      return null
    }
    const label = part === 'label' ? 'Option label' : part === 'stats' ? 'Option stats' : part === 'bar' ? 'Option bar' : 'Option row'
    return { key, label }
  }

  function resolveOptionPartForNode(node) {
    const part = asText(node.dataset.optionDragPart).toLowerCase()
    if (part === 'label' || part === 'stats' || part === 'bar' || part === 'row') {
      return part
    }
    if (node.classList.contains('label') || node.classList.contains('race-label')) {
      return 'label'
    }
    if (node.classList.contains('stats')) {
      return 'stats'
    }
    if (node.classList.contains('track') || node.classList.contains('race-track')) {
      return 'bar'
    }
    if (node.classList.contains('option') || node.classList.contains('race-option')) {
      return 'row'
    }
    return ''
  }

  function getOptionDeleteTargetKey(poll, optionId, part = 'row') {
    const safeOptionId = asText(optionId)
    if (!safeOptionId) {
      return ''
    }
    const pollId = asText(poll?.id) || 'unknown'
    const safePart = asText(part).toLowerCase() || 'row'
    return `poll:${pollId}:option:${safeOptionId}:deleted:${safePart}`
  }

  function initializeHistoryState() {
    historyState.present = captureHistorySnapshot()
    historyState.undoStack = []
    historyState.redoStack = []
    historyState.initialized = true
    clearTypingHistoryTimer()
    updateHistoryControls()
  }

  function handleHistoryKeydown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return
    }
    if (isResetPositionsModalOpen()) {
      return
    }
    const key = asText(event.key).toLowerCase()
    const target = event.target
    const host = getRichTextHost(target)
    const inNativeTextField =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    if (inNativeTextField && !host) {
      return
    }

    if (key === 'z' && !event.shiftKey) {
      event.preventDefault()
      performUndo()
      return
    }
    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault()
      performRedo()
    }
  }

  function canUndo() {
    return historyState.undoStack.length > 0
  }

  function canRedo() {
    return historyState.redoStack.length > 0
  }

  function updateHistoryControls() {
    const hasPendingTypingEntry = historyState.typingTimerId != null
    el.historyUndo.disabled = !(canUndo() || hasPendingTypingEntry)
    el.historyRedo.disabled = !canRedo()
  }

  function captureHistorySnapshot() {
    return {
      theme: clone(currentTheme),
      textOverrides: clone(state.textOverrides)
    }
  }

  function historySnapshotsEqual(left, right) {
    if (!left || !right) {
      return false
    }
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    } catch {
      return false
    }
  }

  function clearTypingHistoryTimer() {
    if (historyState.typingTimerId != null) {
      window.clearTimeout(historyState.typingTimerId)
      historyState.typingTimerId = null
      updateHistoryControls()
    }
  }

  function scheduleTypingHistoryCheckpoint() {
    if (!historyState.initialized || historyState.applying) {
      return
    }
    clearTypingHistoryTimer()
    historyState.typingTimerId = window.setTimeout(() => {
      historyState.typingTimerId = null
      recordHistoryCheckpoint('Edit text', { skipFlush: true })
    }, 850)
    updateHistoryControls()
  }

  function flushTypingHistoryCheckpoint() {
    if (historyState.typingTimerId == null) {
      return
    }
    clearTypingHistoryTimer()
    recordHistoryCheckpoint('Edit text', { skipFlush: true })
  }

  function recordHistoryCheckpoint(actionLabel = 'Edit', options = {}) {
    if (!historyState.initialized || historyState.applying) {
      return false
    }
    if (!options.skipFlush) {
      flushTypingHistoryCheckpoint()
    }
    const nextSnapshot = captureHistorySnapshot()
    if (historySnapshotsEqual(historyState.present, nextSnapshot)) {
      return false
    }
    if (historyState.present) {
      historyState.undoStack.push({
        snapshot: historyState.present,
        label: asText(actionLabel) || 'Edit'
      })
      if (historyState.undoStack.length > HISTORY_LIMIT) {
        historyState.undoStack.splice(0, historyState.undoStack.length - HISTORY_LIMIT)
      }
    }
    historyState.present = nextSnapshot
    historyState.redoStack = []
    updateHistoryControls()
    return true
  }

  function applyHistorySnapshot(snapshot) {
    if (!snapshot || historyState.applying) {
      return
    }
    historyState.applying = true
    clearTypingHistoryTimer()
    try {
      currentTheme = sanitizeTheme(snapshot.theme)
      state.textOverrides = sanitizeTextOverridesMap(snapshot.textOverrides)
      saveThemeDraft(currentTheme)
      saveTextOverrides(state.textOverrides)
      applyTheme(currentTheme)
      syncThemeControls()
      clearCachedRichTextSelection()
      hideSelectionToolbar()
      state.activeTextHost = null
      state.activeInlineStyleNode = null
      if (state.snapshot) {
        renderFromSnapshot(true)
      } else {
        renderInitialState()
      }
      refreshTextToolStates()
      syncTextStyleControlsFromSelection()
    } finally {
      historyState.applying = false
    }
  }

  function performUndo() {
    flushTypingHistoryCheckpoint()
    if (!canUndo()) {
      return false
    }
    const entry = historyState.undoStack.pop()
    if (!entry) {
      updateHistoryControls()
      return false
    }
    historyState.redoStack.push({
      snapshot: historyState.present,
      label: entry.label
    })
    historyState.present = entry.snapshot
    applyHistorySnapshot(historyState.present)
    updateHistoryControls()
    showThemeFeedback('Undo applied.', 'success')
    return true
  }

  function performRedo() {
    flushTypingHistoryCheckpoint()
    if (!canRedo()) {
      return false
    }
    const entry = historyState.redoStack.pop()
    if (!entry) {
      updateHistoryControls()
      return false
    }
    historyState.undoStack.push({
      snapshot: historyState.present,
      label: entry.label
    })
    historyState.present = entry.snapshot
    applyHistorySnapshot(historyState.present)
    updateHistoryControls()
    showThemeFeedback('Redo applied.', 'success')
    return true
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

  function isLiveBoundTextKey(textKey) {
    const key = asText(textKey)
    if (!key) {
      return false
    }
    if (key === 'chrome:status' || key === 'chrome:votes' || key === 'chrome:footer') {
      return true
    }
    return /^poll:[^:]+:option:[^:]+:stats$/i.test(key)
  }

  function isPollQuestionTextKey(textKey) {
    return /^poll:[^:]+:question$/i.test(asText(textKey))
  }

  function isStaleQuestionOverride(html) {
    const plain = normalizeWhitespace(extractPlainTextFromHtml(html)).toLowerCase()
    return (
      plain === 'waiting for poll data...' ||
      plain === 'missing required query param' ||
      plain === 'unable to load poll data'
    )
  }

  function extractPlainTextFromHtml(html) {
    const container = document.createElement('div')
    container.innerHTML = typeof html === 'string' ? html : ''
    return container.textContent || ''
  }

  function normalizeWhitespace(text) {
    return asText(text).replace(/\s+/g, ' ')
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
          root.setProperty('--panel-offset-x', `${clamp(currentTheme.panelX, -2400, 2400, 0)}px`)
          root.setProperty('--panel-offset-y', `${clamp(currentTheme.panelY, -2400, 2400, 0)}px`)
          root.setProperty(
            '--panel-scale-x',
            `${clamp(currentTheme.panelScaleX, 0.35, 2.8, 1)}`
          )
          root.setProperty(
            '--panel-scale-y',
            `${clamp(currentTheme.panelScaleY, 0.35, 2.8, 1)}`
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
            currentTheme.bgImageX,
            currentTheme.bgImageY,
            currentTheme.bgImageScaleX,
            currentTheme.bgImageScaleY
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
            currentTheme.bgOverlayX,
            currentTheme.bgOverlayY,
            currentTheme.bgOverlayScaleX,
            currentTheme.bgOverlayScaleY
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
            currentTheme.gridX,
            currentTheme.gridY,
            currentTheme.gridScaleX,
            currentTheme.gridScaleY
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
          applyElementOffset(el.metaBar, currentTheme.metaX, currentTheme.metaY, 1, 1)
          applyElementBoxSize(el.metaBar, currentTheme.metaBoxWidth, currentTheme.metaBoxHeight)
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
          applyElementOffset(el.footer, currentTheme.footerX, currentTheme.footerY, 1, 1)
          applyElementBoxSize(el.footer, currentTheme.footerBoxWidth, currentTheme.footerBoxHeight)
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
          el.customLogo.style.left = `${currentTheme.logoX}%`
          el.customLogo.style.top = `${currentTheme.logoY}%`
          el.customLogo.style.transform = `translate(-50%, -50%) scale(${clamp(
            currentTheme.logoScaleX,
            0.25,
            5,
            1
          )}, ${clamp(currentTheme.logoScaleY, 0.25, 5, 1)})`
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
          el.customAsset.style.left = `${currentTheme.assetX}%`
          el.customAsset.style.top = `${currentTheme.assetY}%`
          el.customAsset.style.transform = `translate(-50%, -50%) scale(${clamp(
            currentTheme.assetScaleX,
            0.25,
            5,
            1
          )}, ${clamp(currentTheme.assetScaleY, 0.25, 5, 1)})`
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
        x: xKey ? clamp(currentTheme[xKey], minX, maxX, 0) : 0,
        y: yKey ? clamp(currentTheme[yKey], minY, maxY, 0) : 0
      }),
      setPosition: (x, y) => {
        if (xKey) {
          currentTheme[xKey] = clamp(x, minX, maxX, currentTheme[xKey])
        }
        if (yKey) {
          currentTheme[yKey] = clamp(y, minY, maxY, currentTheme[yKey])
        }
        apply()
      },
      getScale: () => ({
        x: scaleXKey ? clamp(currentTheme[scaleXKey], minScaleX, maxScaleX, 1) : 1,
        y: scaleYKey ? clamp(currentTheme[scaleYKey], minScaleY, maxScaleY, 1) : 1
      }),
      setScale: (scaleX, scaleY) => {
        if (scaleXKey) {
          currentTheme[scaleXKey] = clamp(scaleX, minScaleX, maxScaleX, currentTheme[scaleXKey])
        }
        if (scaleYKey) {
          currentTheme[scaleYKey] = clamp(scaleY, minScaleY, maxScaleY, currentTheme[scaleYKey])
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
        x: xKey ? clamp(currentTheme[xKey], minX, maxX, 0) : 0,
        y: yKey ? clamp(currentTheme[yKey], minY, maxY, 0) : 0
      }),
      setPosition: (x, y) => {
        if (xKey) {
          currentTheme[xKey] = clamp(x, minX, maxX, currentTheme[xKey])
        }
        if (yKey) {
          currentTheme[yKey] = clamp(y, minY, maxY, currentTheme[yKey])
        }
        apply()
      },
      getSize: () => ({
        width: widthKey
          ? sanitizeOptionalDimension(currentTheme[widthKey], minWidth, maxWidth, null)
          : null,
        height: heightKey
          ? sanitizeOptionalDimension(currentTheme[heightKey], minHeight, maxHeight, null)
          : null
      }),
      setSize: (width, height) => {
        if (widthKey) {
          currentTheme[widthKey] = sanitizeOptionalDimension(width, minWidth, maxWidth, null)
        }
        if (heightKey) {
          currentTheme[heightKey] = sanitizeOptionalDimension(height, minHeight, maxHeight, null)
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
                x: clamp(currentTheme[dragProfile.xKey], minX, maxX, 0),
                y: clamp(currentTheme[dragProfile.yKey], minY, maxY, 0)
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
        saveThemeDraft(currentTheme)
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
        startX: clamp(startPosition?.x ?? currentTheme[xKey], minX, maxX, defaultX),
        startY: clamp(startPosition?.y ?? currentTheme[yKey], minY, maxY, defaultY),
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
    saveThemeDraft(currentTheme)
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
    currentTheme[xKey] = xValue
    currentTheme[yKey] = yValue

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
        currentTheme.bgImageScaleX,
        currentTheme.bgImageScaleY
      )
      return
    }
    if (xKey === 'bgOverlayX' && yKey === 'bgOverlayY') {
      applyElementOffset(
        el.bgOverlay,
        xValue,
        yValue,
        currentTheme.bgOverlayScaleX,
        currentTheme.bgOverlayScaleY
      )
      return
    }
    if (xKey === 'gridX' && yKey === 'gridY') {
      applyElementOffset(
        el.gridBg,
        xValue,
        yValue,
        currentTheme.gridScaleX,
        currentTheme.gridScaleY
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
      applyElementBoxSize(el.metaBar, currentTheme.metaBoxWidth, currentTheme.metaBoxHeight)
      return
    }
    if (xKey === 'footerX' && yKey === 'footerY') {
      applyElementOffset(el.footer, xValue, yValue, 1, 1)
      applyElementBoxSize(el.footer, currentTheme.footerBoxWidth, currentTheme.footerBoxHeight)
      return
    }
    if (xKey === 'logoX' && yKey === 'logoY') {
      el.customLogo.style.left = `${xValue}%`
      el.customLogo.style.top = `${yValue}%`
      el.customLogo.style.transform = `translate(-50%, -50%) scale(${clamp(
        currentTheme.logoScaleX,
        0.25,
        5,
        1
      )}, ${clamp(currentTheme.logoScaleY, 0.25, 5, 1)})`
      return
    }
    if (xKey === 'assetX' && yKey === 'assetY') {
      el.customAsset.style.left = `${xValue}%`
      el.customAsset.style.top = `${yValue}%`
      el.customAsset.style.transform = `translate(-50%, -50%) scale(${clamp(
        currentTheme.assetScaleX,
        0.25,
        5,
        1
      )}, ${clamp(currentTheme.assetScaleY, 0.25, 5, 1)})`
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
    if (!currentTheme.deletedObjects || typeof currentTheme.deletedObjects !== 'object') {
      currentTheme.deletedObjects = {}
    }
    return currentTheme.deletedObjects
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
    if (!currentTheme.optionOffsets || typeof currentTheme.optionOffsets !== 'object') {
      currentTheme.optionOffsets = {}
    }
    return currentTheme.optionOffsets
  }

  function ensureOptionScales() {
    if (!currentTheme.optionScales || typeof currentTheme.optionScales !== 'object') {
      currentTheme.optionScales = {}
    }
    return currentTheme.optionScales
  }

  function ensureOptionSizes() {
    if (!currentTheme.optionSizes || typeof currentTheme.optionSizes !== 'object') {
      currentTheme.optionSizes = {}
    }
    return currentTheme.optionSizes
  }

  function ensureOptionAnchors() {
    if (!currentTheme.optionAnchors || typeof currentTheme.optionAnchors !== 'object') {
      currentTheme.optionAnchors = {}
    }
    return currentTheme.optionAnchors
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
    registerOptionResizeTarget(row.root, row.optionId, 'row', {
      resizeMode: 'box',
      minWidth: 180,
      maxWidth: 2600,
      minHeight: 42,
      maxHeight: 900,
      adjustPositionOnResize: false
    })
  }

  function applyRaceRowTransform(row) {
    row.root.style.transform = `translate(${row.dragOffsetX}px, ${row.currentY + row.dragOffsetY}px)`
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

  function renderInitialState() {
    clearArtifactModeClasses()
    syncArtifactComposerVisibility()
    renderRichText(el.eyebrow, getEyebrowTextKey(), 'Prezo Game Mode PoC')
    renderRichText(
      el.question,
      getQuestionStateTextKey('loading'),
      'Waiting for poll data...'
    )
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      if (state.artifact.busy) {
        showArtifactStageLoader('Generating artifact canvas...')
      } else if (asText(state.artifact.html)) {
        showArtifactStageFrame()
      } else {
        hideArtifactStage()
      }
    } else {
      el.options.replaceChildren()
    }
    renderRichText(
      el.footer,
      getFooterTextKey(),
      `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, poll: ${state.pollSelector.descriptor}`
    )
    updateMeta(null, 0)
    scheduleResizeSelectionUpdate()
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
      if (state.socketStatus === 'connected') {
        return
      }
      void refreshSnapshot(false)
    }, SNAPSHOT_POLL_DISCONNECTED_MS)
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
        if (forceRender) {
          renderFromSnapshot(true)
        } else {
          scheduleSnapshotRender()
        }
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

  function scheduleSnapshotRender() {
    if (state.snapshotRenderTimer) {
      return
    }
    state.snapshotRenderTimer = window.setTimeout(() => {
      state.snapshotRenderTimer = null
      renderFromSnapshot(false)
    }, LIVE_SNAPSHOT_RENDER_BATCH_MS)
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
      state.reconnectDelayMs = SOCKET_RECONNECT_INITIAL_DELAY_MS
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
    const delay = Math.min(
      Number.isFinite(state.reconnectDelayMs) ? state.reconnectDelayMs : SOCKET_RECONNECT_INITIAL_DELAY_MS,
      SOCKET_RECONNECT_MAX_DELAY_MS
    )
    state.reconnectTimer = window.setTimeout(() => {
      state.reconnectTimer = null
      connectSocket()
    }, delay)
    state.reconnectDelayMs = Math.min(delay * 2, SOCKET_RECONNECT_MAX_DELAY_MS)
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
      scheduleSnapshotRender()
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
      scheduleSnapshotRender()
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
    renderRichText(el.eyebrow, getEyebrowTextKey(), 'Prezo Game Mode PoC')
    syncArtifactComposerVisibility()

    const polls = Array.isArray(state.snapshot?.polls) ? state.snapshot.polls : []
    const poll = selectPoll(polls)
    state.currentPoll = poll

    const editingHost = !forceRender && isRichTextEditingActive() ? getEditingRichTextHost() : null
    const editingWithinOptions =
      editingHost instanceof HTMLElement ? el.options.contains(editingHost) : false

    const renderKey = getRenderKey(poll)
    if (!forceRender && renderKey === state.lastRenderKey) {
      if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
        renderArtifactExperience(poll, getTotalVotes(poll))
      }
      updateFooter()
      updateMeta(poll, getTotalVotes(poll))
      scheduleResizeSelectionUpdate()
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
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      renderArtifactExperience(poll, totalVotes)
    } else if (!editingWithinOptions) {
      if (currentTheme.visualMode === 'race') {
        renderRaceOptions(poll, totalVotes)
      } else {
        renderClassicOptions(poll, totalVotes)
      }
    }
    updateMeta(poll, totalVotes)
    updateFooter()
    scheduleResizeSelectionUpdate()
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

  function hasArtifactPrompt() {
    return Boolean(asText(state.artifact.lastPrompt))
  }

  function renderArtifactExperience(poll, totalVotes) {
    if (el.options.classList.contains('race-mode') || state.raceRows.size > 0) {
      clearRaceRows()
    }
    clearArtifactModeClasses()
    if (state.artifact.busy) {
      showArtifactStageLoader('Generating artifact canvas...')
      return
    }

    if (!hasArtifactPrompt()) {
      renderArtifactAwaitingPrompt()
      return
    }

    if (!asText(state.artifact.html)) {
      if (state.artifact.stageSurface === ARTIFACT_STAGE_SURFACE_PLACEHOLDER) {
        syncArtifactStageVisibility(true)
        return
      }
      hideArtifactStage()
      return
    }

    showArtifactStageFrame()
    pushArtifactPollState(poll, totalVotes)
  }

  function renderArtifactAwaitingPrompt() {
    hideArtifactStage()
  }

  function renderClassicOptions(poll, totalVotes) {
    if (el.options.classList.contains('race-mode') || state.raceRows.size > 0) {
      clearRaceRows()
    }
    clearArtifactModeClasses()
    const fragment = document.createDocumentFragment()
    const renderedNodes = []
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
      renderRichText(
        stats,
        getOptionStatsTextKey(poll, option, index),
        `${votes} (${pct}%)`
      )

      labelRow.append(label, stats)

      const track = document.createElement('div')
      track.className = 'track'

      const fill = document.createElement('div')
      fill.className = 'fill'
      fill.style.width = `${pct}%`

      track.appendChild(fill)
      applyDeletedOptionTarget(optionNode, poll, optionId, 'row')
      applyDeletedOptionTarget(label, poll, optionId, 'label')
      applyDeletedOptionTarget(stats, poll, optionId, 'stats')
      applyDeletedOptionTarget(track, poll, optionId, 'bar')
      optionNode.append(labelRow, track)
      registerOptionDragTarget(label, optionId, 'label', { edgeGrabPadding: 12 })
      registerOptionResizeTarget(label, optionId, 'label', {
        resizeMode: 'box',
        minWidth: 40,
        maxWidth: 1600,
        minHeight: 20,
        maxHeight: 800
      })
      registerOptionDragTarget(stats, optionId, 'stats', { edgeGrabPadding: 12 })
      registerOptionResizeTarget(stats, optionId, 'stats', {
        resizeMode: 'box',
        minWidth: 40,
        maxWidth: 1100,
        minHeight: 20,
        maxHeight: 800
      })
      registerOptionDragTarget(track, optionId, 'bar')
      registerOptionResizeTarget(track, optionId, 'bar', {
        minScaleX: 0.35,
        maxScaleX: 4.5,
        minScaleY: 0.4,
        maxScaleY: 4.5
      })
      renderedNodes.push({ optionId, label, stats, track })
      fragment.appendChild(optionNode)
    }

    el.options.replaceChildren(fragment)
    for (const item of renderedNodes) {
      applyOptionBoxSize(item.label, item.optionId, 'label')
      applyOptionBoxSize(item.stats, item.optionId, 'stats')
      applyOptionOffsetTransform(item.label, item.optionId, 'label')
      applyOptionOffsetTransform(item.stats, item.optionId, 'stats')
      applyOptionOffsetTransform(item.track, item.optionId, 'bar')
    }
  }

  function renderRaceOptions(poll, totalVotes) {
    clearArtifactModeClasses()
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
      renderRichText(
        row.stats,
        getOptionStatsTextKey(poll, option, index),
        `${votes} (${pct}%)`
      )
      row.targetY = index * rowHeight
      row.targetProgress = pct
      row.root.classList.toggle('leading', index === 0)
      row.root.style.zIndex = `${sorted.length - index}`
      applyDeletedOptionTarget(row.root, poll, optionId, 'row')
      applyDeletedOptionTarget(row.label, poll, optionId, 'label')
      applyDeletedOptionTarget(row.stats, poll, optionId, 'stats')
      applyDeletedOptionTarget(row.track, poll, optionId, 'bar')
      applyRaceRowTransform(row)
      applyOptionBoxSize(row.root, optionId, 'row')
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
      track,
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
    scheduleResizeSelectionUpdate()
  }

  function clearArtifactModeClasses() {
    for (const className of [...el.options.classList]) {
      if (className === 'artifact-mode' || className.startsWith('artifact-')) {
        el.options.classList.remove(className)
      }
    }
  }

  function renderMissingSession() {
    clearRaceRows()
    clearArtifactModeClasses()
    syncArtifactComposerVisibility()
    state.currentPoll = null
    state.lastRenderKey = ''
    renderRichText(
      el.question,
      getQuestionStateTextKey('missing-session'),
      'Missing required query param'
    )
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      showArtifactStagePlaceholder('Open with ?sessionId=<id> or ?code=<join_code>.', 'error')
    } else {
      renderEmptyStateNote(
        'missing-session',
        'Open with ?sessionId=<id> or ?code=<join_code>.'
      )
    }
    updateMeta(null, 0, 'missing session', 'error')
    updateFooter()
    scheduleResizeSelectionUpdate()
  }

  function renderMissingPoll() {
    clearRaceRows()
    clearArtifactModeClasses()
    syncArtifactComposerVisibility()
    const message =
      state.pollSelector.mode === 'id'
        ? `Poll "${state.pollSelector.explicitId}" was not found in this session.`
        : 'No poll is available in this session yet.'
    renderRichText(el.question, getQuestionStateTextKey('missing-poll'), message)
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      showArtifactStagePlaceholder(
        'Create and open a poll in Host Console to render it here.',
        'pending'
      )
    } else {
      renderEmptyStateNote(
        'missing-poll',
        'Create and open a poll in Host Console to render it here.'
      )
    }
    updateMeta(null, 0)
    updateFooter()
    scheduleResizeSelectionUpdate()
  }

  function renderError(message) {
    clearRaceRows()
    clearArtifactModeClasses()
    syncArtifactComposerVisibility()
    state.currentPoll = null
    state.lastRenderKey = ''
    renderRichText(
      el.question,
      getQuestionStateTextKey('error'),
      'Unable to load poll data'
    )
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      showArtifactStagePlaceholder(message, 'error')
    } else {
      renderEmptyStateNote('error-detail', message)
    }
    updateMeta(null, 0, 'error', 'error')
    updateFooter()
    scheduleResizeSelectionUpdate()
  }

  function renderEmptyStateNote(stateKey, fallbackText) {
    const note = document.createElement('p')
    note.className = 'empty'
    renderRichText(note, getOptionsStateTextKey(stateKey), fallbackText)
    el.options.replaceChildren(note)
  }

  function updateFooter() {
    renderRichText(
      el.footer,
      getFooterTextKey(),
      `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, poll: ${state.pollSelector.descriptor}`
    )
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

    renderRichText(el.status, getStatusTextKey(), statusText)
    renderRichText(el.votes, getVotesTextKey(), `${totalVotes} votes`)
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

  function getQuestionStateTextKey(stateKey) {
    const normalizedStateKey = asText(stateKey) || 'default'
    return `chrome:question-state:${normalizedStateKey}`
  }

  function getEyebrowTextKey() {
    return 'chrome:eyebrow'
  }

  function getStatusTextKey() {
    return 'chrome:status'
  }

  function getVotesTextKey() {
    return 'chrome:votes'
  }

  function getFooterTextKey() {
    return 'chrome:footer'
  }

  function getOptionTextKey(poll, option, index) {
    const pollId = asText(poll?.id) || 'unknown'
    const optionId = asText(option?.id) || `index-${index}`
    return `poll:${pollId}:option:${optionId}`
  }

  function getOptionStatsTextKey(poll, option, index) {
    const pollId = asText(poll?.id) || 'unknown'
    const optionId = asText(option?.id) || `index-${index}`
    return `poll:${pollId}:option:${optionId}:stats`
  }

  function getOptionsStateTextKey(stateKey) {
    const normalizedStateKey = asText(stateKey) || 'default'
    return `chrome:options-state:${normalizedStateKey}`
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
    let response
    try {
      response = await fetch(`${state.apiBase}${path}`)
    } catch (error) {
      const message = errorToMessage(error)
      throw new Error(`Unable to reach API base ${state.apiBase}: ${message}`)
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status})`
      throw new Error(`${detail} [API ${state.apiBase}]`)
    }
    return response.json()
  }

  function getSupabaseAccessToken() {
    try {
      if (!window.localStorage) {
        return null
      }
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) {
          continue
        }
        const raw = localStorage.getItem(key)
        if (!raw) {
          continue
        }
        try {
          const data = JSON.parse(raw)
          const token =
            data && (data.access_token || (data.currentSession && data.currentSession.access_token))
          if (token) {
            return token
          }
        } catch {
          // Ignore malformed auth storage entries.
        }
      }
    } catch {
      return null
    }
    return null
  }

  function setLibrarySyncStatus(type, text, detail = '') {
    state.library.status = type
    state.library.detail = detail
    el.librarySyncStatus.classList.remove('status-pending', 'status-success', 'status-warning', 'status-error')
    el.librarySyncStatus.classList.add(
      type === 'success'
        ? 'status-success'
        : type === 'warning'
          ? 'status-warning'
          : type === 'error'
            ? 'status-error'
            : 'status-pending'
    )
    el.librarySyncStatusText.textContent = text
    el.librarySyncStatus.title = detail || text
  }

  function mergeRemoteThemeLibrary(records) {
    if (!Array.isArray(records)) {
      return
    }
    for (const record of records) {
      const name = normalizeThemeName(record?.name)
      if (!name || !record || typeof record.theme !== 'object' || !record.theme) {
        continue
      }
      themeLibrary.themes[name] = sanitizeTheme(record.theme)
    }
    saveThemeLibrary(themeLibrary)
    refreshThemeSelect(themeLibrary.activeName)
  }

  function mergeRemoteArtifactLibrary(records) {
    if (!Array.isArray(records)) {
      return
    }
    for (const record of records) {
      const name = normalizeThemeName(record?.name)
      const normalizedRecord = sanitizeSavedArtifactRecord(record)
      if (!name || !normalizedRecord) {
        continue
      }
      artifactLibrary.artifacts[name] = normalizedRecord
    }
    saveArtifactLibrary(artifactLibrary)
    refreshArtifactSelect(artifactLibrary.activeName)
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
        updateTheme({ [themeKey]: dataUrl }, { historyLabel: 'Update image asset' })
        showThemeFeedback(successText, 'success')
      } catch {
        showThemeFeedback('File upload failed.', 'error')
      } finally {
        input.value = ''
      }
    })
  }

  async function saveTheme() {
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
    const syncResult = await persistThemeToAccount(name, currentTheme)
    showThemeFeedback(syncResult.message || `Theme "${name}" saved.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
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
    recordHistoryCheckpoint('Load theme')
    showThemeFeedback(`Theme "${name}" loaded.`, 'success')
  }

  async function deleteThemeFromSelect() {
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
    const syncResult = await deleteThemeFromAccount(name)
    showThemeFeedback(syncResult.message || `Theme "${name}" deleted.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
  }

  async function saveArtifactToLibrary() {
    const name = normalizeThemeName(el.artifactName.value)
    if (!name) {
      showArtifactFeedback('Artifact name is required.', 'error')
      return
    }
    const artifactRecord = buildSavedArtifactRecord()
    if (!artifactRecord) {
      showArtifactFeedback('Generate an artifact before saving it.', 'error')
      return
    }
    artifactLibrary.artifacts[name] = artifactRecord
    artifactLibrary.activeName = name
    saveArtifactLibrary(artifactLibrary)
    refreshArtifactSelect(name)
    el.artifactName.value = name
    const syncResult = await persistArtifactToAccount(name, artifactRecord)
    showArtifactFeedback(syncResult.message || `Artifact "${name}" saved.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
  }

  function loadArtifactFromSelect() {
    const name = asText(el.artifactSelect.value)
    const artifactRecord = name ? artifactLibrary.artifacts[name] : null
    if (!name || !artifactRecord) {
      showArtifactFeedback('Select a saved artifact first.', 'error')
      return
    }
    const nextTheme = sanitizeTheme({
      ...(artifactRecord.themeSnapshot || currentTheme),
      visualMode: ARTIFACT_VISUAL_MODE
    })
    currentTheme = nextTheme
    artifactLibrary.activeName = name
    saveArtifactLibrary(artifactLibrary)
    saveThemeDraft(currentTheme)
    applyTheme(currentTheme)
    syncThemeControls()
    state.artifact.lastPrompt = asText(artifactRecord.lastPrompt)
    state.artifact.lastAnswers = cloneArtifactConversationAnswers(artifactRecord.lastAnswers)
    state.artifact.conversationAnswers = cloneArtifactConversationAnswers(
      artifactRecord.lastAnswers
    )
    state.artifact.conversationStepIndex = ARTIFACT_CONVERSATION_STEPS.length
    state.artifact.editHistory = []
    state.artifact.activeEditRequest = ''
    state.artifact.autoRepairInFlight = false
    state.artifact.repairAttemptCount = 0
    state.artifact.lastRuntimeError = ''
    const applied = applyArtifactMarkup(artifactRecord.html, { requestKind: 'build' })
    syncArtifactConversationUi()
    el.artifactName.value = name
    if (state.snapshot) {
      renderFromSnapshot(true)
    } else if (applied) {
      showArtifactStageFrame()
    }
    recordHistoryCheckpoint('Load artifact')
    showArtifactFeedback(
      applied ? `Artifact "${name}" loaded.` : `Artifact "${name}" could not be loaded.`,
      applied ? 'success' : 'error'
    )
  }

  async function deleteArtifactFromSelect() {
    const name = asText(el.artifactSelect.value)
    if (!name || !artifactLibrary.artifacts[name]) {
      showArtifactFeedback('Nothing selected to delete.', 'error')
      return
    }
    delete artifactLibrary.artifacts[name]
    if (artifactLibrary.activeName === name) {
      artifactLibrary.activeName = null
    }
    saveArtifactLibrary(artifactLibrary)
    refreshArtifactSelect(artifactLibrary.activeName)
    const syncResult = await deleteArtifactFromAccount(name)
    showArtifactFeedback(syncResult.message || `Artifact "${name}" deleted.`, syncResult.type)
    reflectLibrarySyncResult(syncResult)
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
      const syncResult = await persistThemeToAccount(importedName, currentTheme)
      if (state.snapshot) {
        renderFromSnapshot(true)
      }
      recordHistoryCheckpoint('Import theme')
      showThemeFeedback(
        syncResult.message || `Theme "${importedName}" imported.`,
        syncResult.type
      )
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
    recordHistoryCheckpoint('Reset theme')
    showThemeFeedback('Theme reset to defaults.', 'success')
  }

  function isResetPositionsModalOpen() {
    return el.resetPositionsModal.classList.contains('open')
  }

  function openResetPositionsModal() {
    if (isResetPositionsModalOpen()) {
      return
    }
    state.resetModalInvoker =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.resetPositionsModal.classList.add('open')
    el.resetPositionsModal.setAttribute('aria-hidden', 'false')
    el.resetPositionsAccept.focus()
  }

  function closeResetPositionsModal() {
    if (!isResetPositionsModalOpen()) {
      return
    }
    el.resetPositionsModal.classList.remove('open')
    el.resetPositionsModal.setAttribute('aria-hidden', 'true')
    if (state.resetModalInvoker && state.resetModalInvoker.isConnected) {
      state.resetModalInvoker.focus()
    }
    state.resetModalInvoker = null
  }

  function handleResetPositionsModalKeydown(event) {
    if (!isResetPositionsModalOpen()) {
      return
    }
    if (event.key !== 'Escape') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    closeResetPositionsModal()
  }

  function acceptResetPositions() {
    closeResetPositionsModal()
    resetAllElementPositions()
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
      for (const row of state.raceRows.values()) {
        row.dragOffsetX = 0
        row.dragOffsetY = 0
        row.root.style.removeProperty('width')
        row.root.style.removeProperty('height')
        applyRaceRowTransform(row)
      }
    }
    showThemeFeedback('All object positions reset to defaults.', 'success')
  }

  function updateTheme(partialTheme, options = {}) {
    const persist = options.persist !== false
    const recordHistory = options.recordHistory !== false && persist && !historyState.applying
    const historyLabel = asText(options.historyLabel) || 'Update design'
    const previousVisualMode = currentTheme.visualMode
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
    if (
      !state.artifact.busy &&
      previousVisualMode !== ARTIFACT_VISUAL_MODE &&
      currentTheme.visualMode === ARTIFACT_VISUAL_MODE
    ) {
      state.artifact.lastPrompt = ''
      state.artifact.lastAnswers = createEmptyArtifactAnswers()
      clearArtifactMarkup()
      resetArtifactConversation({ preserveInput: false })
      hideArtifactStage()
    }
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
    if (recordHistory) {
      recordHistoryCheckpoint(historyLabel)
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
    root.setProperty('--artifact-layout', theme.artifactLayout)
    root.setProperty('--grid-opacity', `${theme.gridOpacity}`)
    root.setProperty('--race-track', hexToRgba(theme.raceTrackColor, theme.raceTrackOpacity))
    root.setProperty('--race-car-size', `${theme.raceCarSize}px`)
    root.setProperty('--race-speed-ms', `${Math.round(theme.raceSpeed * 1000)}ms`)
    root.setProperty('--wrap-offset-x', '0px')
    root.setProperty('--wrap-offset-y', '0px')
    root.setProperty('--panel-offset-x', `${clamp(theme.panelX, -2400, 2400, 0)}px`)
    root.setProperty('--panel-offset-y', `${clamp(theme.panelY, -2400, 2400, 0)}px`)
    root.setProperty('--panel-scale-x', `${clamp(theme.panelScaleX, 0.35, 2.8, 1)}`)
    root.setProperty('--panel-scale-y', `${clamp(theme.panelScaleY, 0.35, 2.8, 1)}`)

    el.bgImage.style.backgroundImage = theme.bgImageUrl
      ? `url("${theme.bgImageUrl.replace(/"/g, '\\"')}")`
      : 'none'
    el.bgImage.style.opacity = `${theme.bgImageOpacity}`
    el.bgOverlay.style.backgroundColor = theme.overlayColor
    el.bgOverlay.style.opacity = `${theme.overlayOpacity}`
    el.gridBg.style.display = theme.gridVisible ? 'block' : 'none'
    el.gridBg.style.opacity = `${theme.gridOpacity}`
    applyElementOffset(
      el.bgImage,
      theme.bgImageX,
      theme.bgImageY,
      theme.bgImageScaleX,
      theme.bgImageScaleY
    )
    applyElementOffset(
      el.bgOverlay,
      theme.bgOverlayX,
      theme.bgOverlayY,
      theme.bgOverlayScaleX,
      theme.bgOverlayScaleY
    )
    applyElementOffset(el.gridBg, theme.gridX, theme.gridY, theme.gridScaleX, theme.gridScaleY)
    applyElementOffset(el.headLeft, 0, 0, 1, 1)
    applyHeaderTextObjects()
    applyElementOffset(el.metaBar, theme.metaX, theme.metaY, 1, 1)
    applyElementOffset(el.footer, theme.footerX, theme.footerY, 1, 1)
    applyElementBoxSize(el.headLeft, null, null)
    applyElementBoxSize(el.metaBar, theme.metaBoxWidth, theme.metaBoxHeight)
    applyElementBoxSize(el.footer, theme.footerBoxWidth, theme.footerBoxHeight)

    applyImageAsset(el.customLogo, {
      url: theme.logoUrl,
      width: `${theme.logoWidth}px`,
      opacity: `${theme.logoOpacity}`,
      left: `${theme.logoX}%`,
      top: `${theme.logoY}%`,
      scaleX: theme.logoScaleX,
      scaleY: theme.logoScaleY
    })

    applyImageAsset(el.customAsset, {
      url: theme.assetUrl,
      width: `${theme.assetWidth}px`,
      opacity: `${theme.assetOpacity}`,
      left: `${theme.assetX}%`,
      top: `${theme.assetY}%`,
      scaleX: theme.assetScaleX,
      scaleY: theme.assetScaleY
    })
    applyDeletedStaticTargets(theme)
    syncRaceThemeVisuals()
    syncArtifactComposerVisibility()
    scheduleResizeSelectionUpdate()
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
    const width = sanitizeOptionalDimension(currentTheme[widthKey], 24, 4000, null)
    const height = sanitizeOptionalDimension(currentTheme[heightKey], 18, 2400, null)
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
      clamp(currentTheme.eyebrowX, -2400, 2400, 0),
      clamp(currentTheme.eyebrowY, -2400, 2400, 0),
      { containerRect, nodeRect: eyebrowRect }
    )
    detachHeaderTextFromFlow(
      el.question,
      clamp(currentTheme.questionX, -2400, 2400, 0),
      clamp(currentTheme.questionY, -2400, 2400, 0),
      { containerRect, nodeRect: questionRect }
    )
  }

  function applyHeaderTextObjects() {
    applyElementOffset(
      el.eyebrow,
      clamp(currentTheme.eyebrowX, -2400, 2400, 0),
      clamp(currentTheme.eyebrowY, -2400, 2400, 0),
      1,
      1
    )
    applyElementOffset(
      el.question,
      clamp(currentTheme.questionX, -2400, 2400, 0),
      clamp(currentTheme.questionY, -2400, 2400, 0),
      1,
      1
    )
    syncHeaderTextFlow()
    applyElementBoxSize(el.eyebrow, currentTheme.eyebrowBoxWidth, currentTheme.eyebrowBoxHeight)
    applyElementBoxSize(el.question, currentTheme.questionBoxWidth, currentTheme.questionBoxHeight)
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

  function buildSavedArtifactRecord() {
    const html = normalizeArtifactMarkup(state.artifact.html)
    if (!html) {
      return null
    }
    return sanitizeSavedArtifactRecord({
      html,
      lastPrompt: state.artifact.lastPrompt,
      lastAnswers: state.artifact.lastAnswers,
      themeSnapshot: {
        ...clone(currentTheme),
        visualMode: ARTIFACT_VISUAL_MODE
      }
    })
  }

  function refreshArtifactSelect(selectedName) {
    const names = Object.keys(artifactLibrary.artifacts).sort((a, b) => a.localeCompare(b))
    el.artifactSelect.innerHTML = ''

    if (names.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No saved artifacts'
      el.artifactSelect.appendChild(option)
      return
    }

    for (const name of names) {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      el.artifactSelect.appendChild(option)
    }

    const preferred =
      selectedName && artifactLibrary.artifacts[selectedName] ? selectedName : names[0]
    el.artifactSelect.value = preferred
    if (!el.artifactName.value) {
      el.artifactName.value = preferred
    }
  }

  function showThemeFeedback(text, type) {
    el.themeFeedback.textContent = text
    el.themeFeedback.style.color = feedbackColor(type)
  }

  function showArtifactFeedback(text, type) {
    el.artifactFeedback.textContent = text
    el.artifactFeedback.style.color = feedbackColor(type)
  }

  function feedbackColor(type) {
    if (type === 'success') {
      return '#216e43'
    }
    if (type === 'error') {
      return '#b53a4e'
    }
    if (type === 'warning') {
      return '#b54708'
    }
    return '#5f7ea3'
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
    return sanitizeTextOverridesMap(parsed)
  }

  function sanitizeTextOverridesMap(value) {
    if (!value || typeof value !== 'object') {
      return {}
    }
    const overrides = {}
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry !== 'string' || !key) {
        continue
      }
      overrides[key] = sanitizeRichTextHtml(entry)
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

  function hasThemeValue(value) {
    return value !== undefined && value !== null && value !== ''
  }

  function migrateLegacyTitleThemeFields(theme) {
    const incoming = theme && typeof theme === 'object' ? theme : {}
    const migrated = { ...incoming }

    const legacyX = Number(incoming.titleX)
    if (Number.isFinite(legacyX)) {
      if (!Number.isFinite(Number(incoming.eyebrowX))) {
        migrated.eyebrowX = legacyX
      }
      if (!Number.isFinite(Number(incoming.questionX))) {
        migrated.questionX = legacyX
      }
    }

    const legacyY = Number(incoming.titleY)
    if (Number.isFinite(legacyY)) {
      if (!Number.isFinite(Number(incoming.eyebrowY))) {
        migrated.eyebrowY = legacyY
      }
      if (!Number.isFinite(Number(incoming.questionY))) {
        migrated.questionY = legacyY
      }
    }

    if (hasThemeValue(incoming.titleBoxWidth)) {
      if (!hasThemeValue(incoming.eyebrowBoxWidth)) {
        migrated.eyebrowBoxWidth = incoming.titleBoxWidth
      }
      if (!hasThemeValue(incoming.questionBoxWidth)) {
        migrated.questionBoxWidth = incoming.titleBoxWidth
      }
    }

    if (hasThemeValue(incoming.titleBoxHeight)) {
      if (!hasThemeValue(incoming.eyebrowBoxHeight)) {
        migrated.eyebrowBoxHeight = incoming.titleBoxHeight
      }
      if (!hasThemeValue(incoming.questionBoxHeight)) {
        migrated.questionBoxHeight = incoming.titleBoxHeight
      }
    }

    delete migrated.titleX
    delete migrated.titleY
    delete migrated.titleBoxWidth
    delete migrated.titleBoxHeight
    delete migrated.titleScaleX
    delete migrated.titleScaleY

    return migrated
  }

  function sanitizeTheme(theme) {
    const incoming = migrateLegacyTitleThemeFields(theme)
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
      artifactLayout: sanitizeArtifactLayout(incoming.artifactLayout, defaultTheme.artifactLayout),
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
      panelScaleX: clamp(incoming.panelScaleX, 0.35, 2.8, defaultTheme.panelScaleX),
      panelScaleY: clamp(incoming.panelScaleY, 0.35, 2.8, defaultTheme.panelScaleY),
      bgImageX: clamp(incoming.bgImageX, -2400, 2400, defaultTheme.bgImageX),
      bgImageY: clamp(incoming.bgImageY, -2400, 2400, defaultTheme.bgImageY),
      bgImageScaleX: clamp(incoming.bgImageScaleX, 0.35, 3.5, defaultTheme.bgImageScaleX),
      bgImageScaleY: clamp(incoming.bgImageScaleY, 0.35, 3.5, defaultTheme.bgImageScaleY),
      bgOverlayX: clamp(incoming.bgOverlayX, -2400, 2400, defaultTheme.bgOverlayX),
      bgOverlayY: clamp(incoming.bgOverlayY, -2400, 2400, defaultTheme.bgOverlayY),
      bgOverlayScaleX: clamp(
        incoming.bgOverlayScaleX,
        0.35,
        3.5,
        defaultTheme.bgOverlayScaleX
      ),
      bgOverlayScaleY: clamp(
        incoming.bgOverlayScaleY,
        0.35,
        3.5,
        defaultTheme.bgOverlayScaleY
      ),
      gridX: clamp(incoming.gridX, -2400, 2400, defaultTheme.gridX),
      gridY: clamp(incoming.gridY, -2400, 2400, defaultTheme.gridY),
      gridScaleX: clamp(incoming.gridScaleX, 0.35, 3.5, defaultTheme.gridScaleX),
      gridScaleY: clamp(incoming.gridScaleY, 0.35, 3.5, defaultTheme.gridScaleY),
      eyebrowX: clamp(incoming.eyebrowX, -2400, 2400, defaultTheme.eyebrowX),
      eyebrowY: clamp(incoming.eyebrowY, -2400, 2400, defaultTheme.eyebrowY),
      eyebrowBoxWidth: sanitizeOptionalDimension(
        incoming.eyebrowBoxWidth,
        60,
        1800,
        defaultTheme.eyebrowBoxWidth
      ),
      eyebrowBoxHeight: sanitizeOptionalDimension(
        incoming.eyebrowBoxHeight,
        14,
        420,
        defaultTheme.eyebrowBoxHeight
      ),
      questionX: clamp(incoming.questionX, -2400, 2400, defaultTheme.questionX),
      questionY: clamp(incoming.questionY, -2400, 2400, defaultTheme.questionY),
      questionBoxWidth: sanitizeOptionalDimension(
        incoming.questionBoxWidth,
        120,
        2200,
        defaultTheme.questionBoxWidth
      ),
      questionBoxHeight: sanitizeOptionalDimension(
        incoming.questionBoxHeight,
        40,
        1400,
        defaultTheme.questionBoxHeight
      ),
      metaX: clamp(incoming.metaX, -2400, 2400, defaultTheme.metaX),
      metaY: clamp(incoming.metaY, -2400, 2400, defaultTheme.metaY),
      metaBoxWidth: sanitizeOptionalDimension(
        incoming.metaBoxWidth,
        90,
        1000,
        defaultTheme.metaBoxWidth
      ),
      metaBoxHeight: sanitizeOptionalDimension(
        incoming.metaBoxHeight,
        28,
        220,
        defaultTheme.metaBoxHeight
      ),
      metaScaleX: clamp(incoming.metaScaleX, 0.45, 3.2, defaultTheme.metaScaleX),
      metaScaleY: clamp(incoming.metaScaleY, 0.45, 3.2, defaultTheme.metaScaleY),
      optionsX: clamp(incoming.optionsX, -2400, 2400, defaultTheme.optionsX),
      optionsY: clamp(incoming.optionsY, -2400, 2400, defaultTheme.optionsY),
      footerX: clamp(incoming.footerX, -2400, 2400, defaultTheme.footerX),
      footerY: clamp(incoming.footerY, -2400, 2400, defaultTheme.footerY),
      footerBoxWidth: sanitizeOptionalDimension(
        incoming.footerBoxWidth,
        120,
        2200,
        defaultTheme.footerBoxWidth
      ),
      footerBoxHeight: sanitizeOptionalDimension(
        incoming.footerBoxHeight,
        18,
        420,
        defaultTheme.footerBoxHeight
      ),
      footerScaleX: clamp(incoming.footerScaleX, 0.45, 3, defaultTheme.footerScaleX),
      footerScaleY: clamp(incoming.footerScaleY, 0.45, 3, defaultTheme.footerScaleY),
      logoScaleX: clamp(incoming.logoScaleX, 0.25, 5, defaultTheme.logoScaleX),
      logoScaleY: clamp(incoming.logoScaleY, 0.25, 5, defaultTheme.logoScaleY),
      assetScaleX: clamp(incoming.assetScaleX, 0.25, 5, defaultTheme.assetScaleX),
      assetScaleY: clamp(incoming.assetScaleY, 0.25, 5, defaultTheme.assetScaleY),
      optionOffsets: sanitizeOptionOffsets(incoming.optionOffsets, defaultTheme.optionOffsets),
      optionSizes: sanitizeOptionSizes(incoming.optionSizes, defaultTheme.optionSizes),
      optionScales: sanitizeOptionScales(incoming.optionScales, defaultTheme.optionScales),
      optionAnchors: sanitizeOptionAnchors(incoming.optionAnchors, defaultTheme.optionAnchors),
      deletedObjects: sanitizeDeletedObjects(incoming.deletedObjects, defaultTheme.deletedObjects),
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

  function sanitizeOptionScales(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback
    if (!source || typeof source !== 'object') {
      return {}
    }
    const sanitized = {}
    for (const [rawId, rawScale] of Object.entries(source)) {
      const optionId = asText(rawId)
      if (!optionId || !rawScale || typeof rawScale !== 'object') {
        continue
      }
      sanitized[optionId] = {
        x: clamp(rawScale.x, 0.25, 5, 1),
        y: clamp(rawScale.y, 0.25, 5, 1)
      }
    }
    return sanitized
  }

  function sanitizeOptionSizes(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback
    if (!source || typeof source !== 'object') {
      return {}
    }
    const sanitized = {}
    for (const [rawId, rawSize] of Object.entries(source)) {
      const optionId = asText(rawId)
      if (!optionId || !rawSize || typeof rawSize !== 'object') {
        continue
      }
      sanitized[optionId] = {
        width: sanitizeOptionalDimension(rawSize.width, 24, 2600, null),
        height: sanitizeOptionalDimension(rawSize.height, 18, 1400, null)
      }
    }
    return sanitized
  }

  function sanitizeOptionAnchors(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback
    if (!source || typeof source !== 'object') {
      return {}
    }
    const sanitized = {}
    for (const [rawId, rawAnchor] of Object.entries(source)) {
      const optionId = asText(rawId)
      if (!optionId || !rawAnchor || typeof rawAnchor !== 'object') {
        continue
      }
      const x = Number.isFinite(rawAnchor.x) ? clamp(rawAnchor.x, -2400, 2400, 0) : null
      const y = Number.isFinite(rawAnchor.y) ? clamp(rawAnchor.y, -2400, 2400, 0) : null
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue
      }
      sanitized[optionId] = { x, y }
    }
    return sanitized
  }

  function sanitizeDeletedObjects(value, fallback) {
    const source = value && typeof value === 'object' ? value : fallback
    if (!source || typeof source !== 'object') {
      return {}
    }
    const sanitized = {}
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = asText(rawKey)
      if (!key || !rawValue) {
        continue
      }
      sanitized[key] = true
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
    if (mode === 'race' || mode === 'classic' || mode === ARTIFACT_VISUAL_MODE) {
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

  function sanitizeOptionalDimension(value, min, max, fallback = null) {
    if (value == null) {
      return fallback
    }
    if (typeof value === 'string' && !value.trim()) {
      return fallback
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return fallback
    }
    return Math.min(max, Math.max(min, numeric))
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

  function extractApiErrorMessage(payload, status) {
    const directDetail = asText(payload?.detail)
    if (directDetail) {
      return directDetail
    }
    if (Array.isArray(payload?.detail) && payload.detail.length > 0) {
      const first = payload.detail[0]
      const parts = [
        asText(first?.msg),
        Array.isArray(first?.loc) ? first.loc.join('.') : ''
      ].filter(Boolean)
      if (parts.length > 0) {
        return parts.join(' [')
          .replace(/\[$/, '')
          .replace(/^(.+?) \[(.+)$/, '$1 [$2]')
      }
    }
    return asText(payload?.error?.message) || `Request failed (${status})`
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
    clearArtifactLayoutRefitSchedule()
    clearEditorDockLayoutSchedule()
    state.textControlInteractionLocked = false
    state.textControlInteractionUntil = 0
    state.activeInlineStyleNode = null
    clearActiveResizeTarget()
    el.wrap.removeEventListener('pointerdown', handleCanvasPointerDown)
    el.wrap.removeEventListener('transitionend', handleCanvasLayoutTransitionEnd)
    el.wrap.removeEventListener('focusin', handleRichTextFocusIn)
    el.wrap.removeEventListener('focusout', handleRichTextFocusOut)
    el.wrap.removeEventListener('input', handleRichTextInput)
    el.wrap.removeEventListener('paste', handleRichTextPaste)
    el.wrap.removeEventListener('keydown', handleRichTextKeydown)
    el.aiChatFab.removeEventListener('click', handleAiChatFabClick)
    el.aiChatCollapse.removeEventListener('click', handleAiChatCollapseClick)
    el.presentModeToggle.removeEventListener('pointerdown', handlePresentModeTogglePointerDown)
    el.presentModeToggle.removeEventListener('click', handlePresentModeToggleClick)
    document.removeEventListener('fullscreenchange', handlePresentModeFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', handlePresentModeFullscreenChange)
    el.aiChatForm.removeEventListener('submit', handleAiChatFormSubmit)
    el.aiChatInput.removeEventListener('keydown', handleAiChatInputKeydown)
    el.aiChatShell.removeEventListener('transitionend', handleEditorDockShellTransitionEnd)
    el.artifactComposerFab.removeEventListener('click', handleArtifactComposerFabClick)
    el.artifactComposerCollapse.removeEventListener('click', handleArtifactComposerCollapseClick)
    el.artifactPromptForm.removeEventListener('submit', handleArtifactPromptFormSubmit)
    el.artifactEditQuickActions.removeEventListener('click', handleArtifactEditQuickActionClick)
    el.artifactFrame.removeEventListener('load', handleArtifactFrameLoad)
    window.removeEventListener('resize', artifactBridge.handleViewportResize)
    window.removeEventListener('resize', handleEditorDockViewportResize)
    window.removeEventListener('message', handleArtifactFrameMessage)
    window.removeEventListener('message', handleLibrarySyncMessage)
    el.librarySyncStatus.removeEventListener('click', handleLibrarySyncStatusClick)
    artifactBridge.dispose()
    disposeLibrarySyncManager()
    for (const quickAction of el.aiQuickActions) {
      quickAction.removeEventListener('click', handleAiQuickActionClick)
    }
    document.removeEventListener('selectionchange', handleRichTextSelectionChange)
    document.removeEventListener('pointerdown', handleRichTextPointerDown, true)
    document.removeEventListener('pointerdown', handleResizeSelectionPointerDown, true)
    for (const handle of el.resizeHandles) {
      handle.removeEventListener('pointerdown', handleResizeHandlePointerDown)
    }
    window.removeEventListener('pointermove', handleDragPointerMove)
    window.removeEventListener('pointerup', handleDragPointerRelease)
    window.removeEventListener('pointercancel', handleDragPointerRelease)
    window.removeEventListener('pointermove', handleResizePointerMove)
    window.removeEventListener('pointerup', handleResizePointerRelease)
    window.removeEventListener('pointercancel', handleResizePointerRelease)
    window.removeEventListener('resize', scheduleSelectionToolbarUpdate)
    window.removeEventListener('scroll', scheduleSelectionToolbarUpdate, true)
    window.removeEventListener('resize', scheduleResizeSelectionUpdate)
    window.removeEventListener('scroll', scheduleResizeSelectionUpdate, true)
    window.removeEventListener('keydown', handleHistoryKeydown, true)
    window.removeEventListener('keydown', handleDeleteKeydown, true)
    window.removeEventListener('keydown', handleResetPositionsModalKeydown, true)
    el.deleteSelectedObject.removeEventListener('click', handleDeleteSelectedObjectClick)
    clearTypingHistoryTimer()
    if (state.selectionToolbarRafId != null) {
      cancelAnimationFrame(state.selectionToolbarRafId)
      state.selectionToolbarRafId = null
    }
    if (resizeState.rafId != null) {
      cancelAnimationFrame(resizeState.rafId)
      resizeState.rafId = null
    }
    if (state.reconnectTimer) {
      window.clearTimeout(state.reconnectTimer)
      state.reconnectTimer = null
    }
    if (state.snapshotRenderTimer) {
      window.clearTimeout(state.snapshotRenderTimer)
      state.snapshotRenderTimer = null
    }
    stopArtifactLoaderAnimation()
    state.artifact.busy = false
    state.artifact.frameReady = false
    state.artifact.lastPayloadKey = ''
    state.artifact.lastDeliveredPayload = null
    state.artifact.pendingPayload = null
    state.ai.queue = []
    state.ai.activePrompt = ''
    state.ai.busy = false
    disconnectSocket()
  }
})()

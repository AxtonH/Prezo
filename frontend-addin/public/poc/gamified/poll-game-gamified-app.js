import {
  AI_BOX_RESIZE_TARGETS,
  AI_CHAT_MAX_MESSAGES,
  AI_DEFAULT_MODEL,
  AI_LEGACY_MODELS,
  AI_MODEL_STORAGE_KEY,
  AI_MOVE_TARGETS,
  AI_SCALE_RESIZE_TARGETS,
  AI_TARGET_ALIASES,
  ARTIFACT_LIBRARY_KEY,
  ARTIFACT_BRAND_REFERENCE_VALUE,
  DEFAULT_API_BASE,
  DRAG_START_THRESHOLD_PX,
  HISTORY_LIMIT,
  LIBRARY_SYNC_TOKEN_KEY,
  MAX_INLINE_ATTACHMENTS,
  MIN_RESIZE_HANDLE_SIZE_PX,
  RIBBON_COLLAPSED_KEY,
  RIBBON_HIDDEN_KEY,
  RIBBON_TAB_KEY,
  TEXT_FONT_FAMILIES,
  TEXT_FONT_SIZES,
  THEME_DRAFT_KEY,
  THEME_LIBRARY_KEY,
  AI_CHAT_OPEN_KEY,
  EDITOR_SHELL_EXPANDED_KEY,
  EDITOR_PANEL_HEIGHT_KEY
} from './poll-game-gamified-constants.js'
import {
  ARTIFACT_CONVERSATION_STEPS,
  ARTIFACT_DEFAULT_PLACEHOLDER,
  ARTIFACT_EDIT_PLACEHOLDER,
  ARTIFACT_VISUAL_MODE,
  buildArtifactAiPrompt,
  cloneArtifactConversationAnswers,
  createEmptyArtifactAnswers,
  mergeArtifactDesignGuidelines,
  normalizeArtifactActivityKind

} from './poll-game-gamified-artifact-mode.js'
import {
  buildArtifactPayloadKey,
  buildArtifactQnaPayloadKey,
  createArtifactPayloadBuilders
} from './poll-game-gamified-artifact-payloads.js'
import { createAiTransport } from './poll-game-gamified-ai-transport.js'
import {
  buildArtifactRenderHealthErrorMessage,
  createArtifactWizard,
  shouldRejectArtifactRenderHealth
} from './poll-game-gamified-artifact-wizard.js'
import {
  defaultTheme,
  hexLuminance,
  normalizeColorToHex,
  sanitizeAiThemePatch,
  sanitizeHex,
  sanitizeOptionalDimension,
  sanitizeTheme

} from './poll-game-gamified-theme.js'
import {
  buildArtifactSrcDoc,
  normalizeArtifactMarkup
} from './poll-game-gamified-artifact-runtime.js'
import {
  buildSegmentedArtifactPackage,
  resolveArtifactHtmlFromPackage,
  sanitizeArtifactPackage
} from './poll-game-gamified-artifact-package.js'
import {
  clearComposer,
  createInlineImageChip,
  insertChipAtCaret,
  refreshComposerPlaceholder,
  removeChipNode,
  serializeComposer,
  setChipState

} from './poll-game-gamified-inline-attachments.js'
import {
  asText,
  clamp,
  clone,
  errorToMessage,
  extractPlainTextFromHtml,
  fetchWithTimeout,
  normalizeApiBase,
  normalizeCode,
  normalizeThemeName,
  normalizeWhitespace,
  parsePollSelector,
  parsePromptSelector,
  safeJsonParse,
  safeStorageGet,
  toInt

} from './poll-game-gamified-utils.js'
import {
  SOCKET_RECONNECT_INITIAL_DELAY_MS,
  createSessionFeed,
  getQnaTotalVotes,
  getTotalVotes,
  qnaViewAsPollShape
} from './poll-game-gamified-session-feed.js'
import { createPollGameArtifactBridge } from './poll-game-gamified-artifact-bridge.js'
import { createPollGameLibraryStorage } from './poll-game-gamified-library-storage.js'
import { createPollGameLibrarySyncManager } from './poll-game-gamified-library-sync.js'
import { createLibraryPanel } from './poll-game-gamified-library-ui.js'
import { createThemeEditor } from './poll-game-gamified-theme-ui.js'
import {
  getEyebrowTextKey,
  getFooterTextKey,
  getOptionStatsTextKey,
  getOptionTextKey,
  getOptionsStateTextKey,
  getQuestionStateTextKey,
  getQuestionTextKey,
  getStatusTextKey,
  getVotesTextKey,
  isLiveBoundTextKey,
  loadTextOverrides,
  sanitizeRichTextHtml,
  sanitizeTextOverridesMap,
  saveTextOverrides,
  textToRichHtml
} from './poll-game-gamified-richtext.js'
import { createRichTextEditor } from './poll-game-gamified-richtext-editor.js'
import { createArtifactTextEditHandler } from './poll-game-gamified-artifact-textedit.js'
import { createArtifactSelectionHandler } from './poll-game-gamified-artifact-select.js'
import { createArtifactPositionHandler } from './poll-game-gamified-artifact-position.js'
import { createArtifactSizeHandler } from './poll-game-gamified-artifact-size.js'
import { createArtifactDeleteHandler } from './poll-game-gamified-artifact-delete.js'
import { createArtifactHistoryHandler } from './poll-game-gamified-artifact-history.js'
import {
  createArtifactGuidesHandler

} from './poll-game-gamified-artifact-guides.js'
import {
  isArtifactCopyField,
  normalizeFooterTextToSuffix,
  extractCopyFromStyleOverrides,
  mergeCopyIntoStyleOverrides,
  buildArtifactHiddenCss
} from './poll-game-gamified-artifact-copy.js'

;(() => {
  const ARTIFACT_STAGE_ASPECT_RATIO = 16 / 9
  const ARTIFACT_READY_MESSAGE_TYPE = 'prezo-artifact-ready'
  const ARTIFACT_SIZE_MESSAGE_TYPE = 'prezo-artifact-size'
  const ARTIFACT_RENDER_OK_MESSAGE_TYPE = 'prezo-artifact-render-ok'
  const ARTIFACT_RENDER_ERROR_MESSAGE_TYPE = 'prezo-artifact-render-error'
  const ARTIFACT_TEXT_EDIT_MESSAGE_TYPE = 'prezo-text-edit'
  const ARTIFACT_TEXT_STYLE_MESSAGE_TYPE = 'prezo-text-style'
  const ARTIFACT_TEXT_HTML_MESSAGE_TYPE = 'prezo-text-html'
  const ARTIFACT_TEXT_FOCUS_MESSAGE_TYPE = 'prezo-text-focus'
  const ARTIFACT_TEXT_STYLE_INIT_MESSAGE_TYPE = 'prezo-text-style-init'
  const ARTIFACT_ELEMENT_SELECTED_MESSAGE_TYPE = 'prezo-element-selected'
  const ARTIFACT_POSITION_CHANGED_MESSAGE_TYPE = 'prezo-position-changed'
  const ARTIFACT_SIZE_CHANGED_MESSAGE_TYPE = 'prezo-size-changed'
  const ARTIFACT_POSITION_INIT_MESSAGE_TYPE = 'prezo-position-init'
  const ARTIFACT_SIZE_INIT_MESSAGE_TYPE = 'prezo-size-init'
  const ARTIFACT_ELEMENT_DELETED_MESSAGE_TYPE = 'prezo-element-deleted'
  const ARTIFACT_HIDDEN_INIT_MESSAGE_TYPE = 'prezo-hidden-init'
  const ARTIFACT_HIDDEN_APPLIED_MESSAGE_TYPE = 'prezo-hidden-applied'
  const ARTIFACT_HISTORY_SHORTCUT_MESSAGE_TYPE = 'prezo-history-shortcut'
  const ARTIFACT_GRID_CONFIG_MESSAGE_TYPE = 'prezo-grid-config'
  const LIBRARY_SYNC_MESSAGE_TYPE = 'prezo:library-sync'
  const LIBRARY_SYNC_REQUEST_MESSAGE_TYPE = 'prezo:request-library-sync'
  const ARTIFACT_STAGE_SURFACE_HIDDEN = 'hidden'
  const ARTIFACT_STAGE_SURFACE_LOADING = 'loading'
  const ARTIFACT_STAGE_SURFACE_FRAME = 'frame'
  const ARTIFACT_STAGE_SURFACE_PLACEHOLDER = 'placeholder'
  // One intake turn is a short Haiku call (a question or a small JSON brief).
  // Hard cap on an attached image; matches the backend upload + reference ceilings.
  const ARTIFACT_BUILD_REFERENCE_MAX_BYTES = 10 * 1024 * 1024
  // Images at or under this size are also sent as base64 vision (the model SEES them).
  // Larger ones still embed via their hosted URL but skip base64, keeping the request
  // under provider inline-data limits (mirrors ARTIFACT_REFERENCE_IMAGE_MAX_VISION_BYTES
  // in backend/app/api/ai.py).
  const ARTIFACT_BUILD_REFERENCE_VISION_MAX_BYTES = 5 * 1024 * 1024
  const ARTIFACT_STATE_PUSH_BATCH_MS = 90
  const ARTIFACT_EDIT_RENDER_CONFIRM_TIMEOUT_MS = 5000
  const ARTIFACT_LAYOUT_REFIT_DELAY_MS = 220
  const EDITOR_DOCK_GAP_PX = 0
  const EDITOR_DOCK_SIDE_PADDING_PX = 48
  const EDITOR_DOCK_BREAKPOINT_PX = 900
  const ARTIFACT_LOADER_SIZE_PX = 120
  const ARTIFACT_LOADER_COLOR = '#3f7cff'
  const ARTIFACT_LOADER_RING_COUNT = 4

  const query = new URLSearchParams(window.location.search)

  const resolveParentPostMessageOrigin = () => {
    const rawParam = query.get('parentOrigin')
    const raw = typeof rawParam === 'string' ? rawParam.trim() : ''
    if (raw) {
      try {
        const u = new URL(raw)
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          return u.origin
        }
      } catch {
        /* ignore */
      }
    }
    try {
      if (window.parent && window.parent !== window && window.parent.location?.href) {
        return window.parent.location.origin
      }
    } catch {
      /* Cross-origin parent: cannot read parent.location; child's origin is wrong as targetOrigin. */
    }
    /* Embedded but parent unreadable (cross-origin without valid parentOrigin): use * so delivery isn't dropped. */
    if (window.parent && window.parent !== window) {
      return '*'
    }
    return window.location.origin
  }
  const parentPostMessageOrigin = resolveParentPostMessageOrigin()

  /** True while POST /brand-profiles/extract runs for the artifact reference image control. */
  let artifactBrandReferenceBusy = false
  /** Per-chip object URLs (for preview thumbnails), keyed by attachment id, so each can
      be revoked when its chip is removed or the composer is cleared. */
  const attachmentObjectUrls = new Map()

  const pollSelector = parsePollSelector(query.get('pollId'))

  // Which activity this station instance renders: 'poll' (default), 'qna'
  // (session-level audience Q&A), or 'discussion' (a QnaPrompt the host
  // posed). See docs/artifact-activity-kinds.md for the vocabulary.
  const activityKind = normalizeArtifactActivityKind(query.get('activityKind'))
  const promptSelector = parsePromptSelector(query.get('promptId'))
  const state = {
    apiBase: normalizeApiBase(query.get('apiBase')) || DEFAULT_API_BASE,
    sessionId: asText(query.get('sessionId')),
    code: normalizeCode(query.get('code')),
    pollSelector,
    activityKind,
    promptSelector,
    snapshot: null,
    currentPoll: null,
    /** qna/discussion kinds: the selected activity view
        ({ id, title, status, questions[] }) rebuilt on every snapshot render. */
    currentQnaView: null,
    socket: null,
    socketStatus: 'connecting',
    reconnectTimer: null,
    reconnectDelayMs: SOCKET_RECONNECT_INITIAL_DELAY_MS,
    pollTimer: null,
    snapshotRenderTimer: null,
    fetchPromise: null,
    isUnloading: false,
    lastRenderKey: '',
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
      package: null,
      lastStableHtml: '',
      lastStablePackage: null,
      rollbackHtml: '',
      rollbackPackage: null,
      pendingSuccessMessage: '',
      activeEditRequest: '',
      autoRepairInFlight: false,
      repairAttemptCount: 0,
      lastRuntimeError: '',
      floatingOpen: false,
      editHistory: [],
      editPromptQueue: [],
      editQueueSeq: 0,
      editQueueActivePrompt: '',
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
      conversationAnswers: createEmptyArtifactAnswers(),
      /**
       * Conversational intake: the chat with the intake model that replaced the
       * fixed two-question wizard. `messages` is the transcript ({role, text}),
       * `done` flips when the model returns its creative brief (or the user hits
       * "Just build it"), after which the classic build flow takes over through
       * conversationAnswers. Re-seeded in resetArtifactConversation.
       */
      intake: {
        messages: [],
        busy: false,
        done: false
      },
      /**
       * Inline image attachments, keyed by chip id. Each entry:
       *   { id, filename, mediaType, data, url, status }
       * where data is the base64 (Anthropic vision on build), url is the hosted public
       * URL (embed + edit/repair vision), and status is 'uploading' | 'ready' | 'error'.
       * The chip lives inline in #artifact-prompt-input; this Map is the data mirror.
       */
      attachments: new Map(),
      /** Monotonic id source for attachment chips. */
      attachmentSeq: 0
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
    presentModeUsingFullscreen: false,
    /** Poll AI + artifact dock: show header, history, queue (vs input-only). */
    editorShellExpanded: false
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
    designerRulersToggle: must('designer-rulers-toggle'),
    designerGridToggle: must('designer-grid-toggle'),
    designerSnapToggle: must('designer-snap-toggle'),
    designerGridSpacing: must('designer-grid-spacing'),
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
    newArtifact: must('new-artifact'),
    loadArtifact: must('load-artifact'),
    deleteArtifact: must('delete-artifact'),
    artifactVersionSelect: must('artifact-version-select'),
    restoreArtifactVersion: must('restore-artifact-version'),
    artifactFeedback: must('artifact-feedback'),
    librarySyncStatus: must('library-sync-status'),
    librarySyncStatusText: must('library-sync-status-text'),
    textEditFeedback: must('text-edit-feedback'),
    aiChatShell: must('ai-chat-shell'),
    aiChatFab: must('ai-chat-fab'),
    aiChatPanel: must('ai-chat-panel'),
    aiChatPanelVisibilityToggle: must('ai-chat-panel-visibility-toggle'),
    aiChatQueue: must('ai-chat-queue'),
    aiChatMessages: must('ai-chat-messages'),
    aiChatMessagesInner: must('ai-chat-messages-inner'),
    aiChatForm: must('ai-chat-form'),
    aiChatInput: must('ai-chat-input'),
    aiEditorShellToggle: must('ai-editor-shell-toggle'),
    artifactComposer: must('artifact-composer'),
    artifactComposerAnchor: must('artifact-composer-anchor'),
    artifactComposerFab: must('artifact-composer-fab'),
    artifactPromptQueue: must('artifact-prompt-queue'),
    artifactChatLog: must('artifact-chat-log'),
    artifactPromptForm: must('artifact-prompt-form'),
    artifactTypeReferenceInline: must('artifact-type-reference-inline'),
    artifactTypeReferencePaperclip: must('artifact-type-reference-paperclip'),
    artifactTypeReferenceInput: must('artifact-type-reference-input'),
    artifactTypeReferencePreview: must('artifact-type-reference-preview'),
    artifactTypeReferencePreviewImg: must('artifact-type-reference-preview-img'),
    artifactTypeReferenceClear: must('artifact-type-reference-clear'),
    artifactTypeReferenceStatus: must('artifact-type-reference-status'),
    artifactBrandProfileSelect: must('artifact-brand-profile-select'),
    artifactIntakeBuildNow: must('artifact-intake-build-now'),
    artifactBrandReferenceInput: must('artifact-brand-reference-input'),
    artifactBrandReferenceStatus: must('artifact-brand-reference-status'),
    artifactBrandReferencePreview: must('artifact-brand-reference-preview'),
    artifactBrandReferencePreviewName: must('artifact-brand-reference-preview-name'),
    artifactBrandReferenceClear: must('artifact-brand-reference-clear'),
    artifactPromptInput: must('artifact-prompt-input'),
    artifactEditorShellToggle: must('artifact-editor-shell-toggle'),
    artifactComposerVisibilityToggle: must('artifact-composer-visibility-toggle'),
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
    artifactTextToolbar: must('artifact-text-toolbar'),
    artifactTextFontFamily: must('artifact-text-font-family'),
    artifactTextFontSize: must('artifact-text-font-size'),
    artifactTextFontColor: must('artifact-text-font-color'),
    artifactTextToolBold: must('artifact-text-tool-bold'),
    artifactTextToolItalic: must('artifact-text-tool-italic'),
    artifactTextToolClear: must('artifact-text-tool-clear'),
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
    metaBar: must('meta-bar')
  }
  const ribbonTabs = [...document.querySelectorAll('.ribbon-tab')]
  const ribbonPanes = [...document.querySelectorAll('.ribbon-pane')]

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
    // The library panel is instantiated further down (it needs the handler
    // instances declared below), so its methods arrive as deferred arrows —
    // the sync manager only invokes them post-init, once the panel consts
    // exist.
    mergeRemoteThemeLibrary: (records) => mergeRemoteThemeLibrary(records),
    mergeRemoteArtifactLibrary: (records) => mergeRemoteArtifactLibrary(records),
    setStatus: (type, text, detail) => setLibrarySyncStatus(type, text, detail),
    showArtifactFeedback: (text, type) => showArtifactFeedback(text, type)
  })
  const {
    hydrateSavedLibraries,
    handleLibrarySyncMessage,
    handleLibrarySyncStatusClick,
    persistThemeToAccount,
    deleteThemeFromAccount,
    persistArtifactToAccount,
    deleteArtifactFromAccount,
    listArtifactVersionsFromAccount,
    restoreArtifactVersionInAccount,
    reflectLibrarySyncResult,
    getLibraryAccessToken,
    dispose: disposeLibrarySyncManager
  } = librarySyncManager
  // Backend /ai route transport. Auth + brand-dropdown reads arrive as
  // callbacks; the destructured names keep every historical call site
  // unchanged.
  const aiTransport = createAiTransport({
    state,
    getLibraryAccessToken: () => getLibraryAccessToken(),
    collectArtifactBrandProfileNames: () => collectArtifactBrandProfileNames()
  })
  const {
    libraryAuthHeaders,
    requestAiEditPlan,
    requestAiArtifactBuild,
    requestAiArtifactIntake,
    requestAiArtifactAnswer
  } = aiTransport
  const artifactBridge = createPollGameArtifactBridge({
    artifactState: state.artifact,
    stageEl: el.artifactStage,
    frameEl: el.artifactFrame,
    getIsArtifactMode: () => currentTheme.visualMode === ARTIFACT_VISUAL_MODE,
    getIsPresentMode: () => Boolean(state.presentMode),
    getCurrentPollPayload: () => {
      if (currentTheme.visualMode !== ARTIFACT_VISUAL_MODE) {
        return null
      }
      if (state.activityKind !== 'poll') {
        return state.currentQnaView ? buildArtifactQnaPayload(state.currentQnaView) : null
      }
      if (!state.currentPoll) {
        return null
      }
      return buildArtifactPollPayload(state.currentPoll, getTotalVotes(state.currentPoll))
    },
    buildPayloadKey: (payload) =>
      state.activityKind !== 'poll'
        ? buildArtifactQnaPayloadKey(payload)
        : buildArtifactPayloadKey(payload),
    // qna/discussion artifacts listen on the prezo-qna-state channel; polls
    // keep the historical prezo-poll-state channel (see artifact runtime).
    pollStateMessageType: activityKind !== 'poll' ? 'prezo-qna-state' : 'prezo-poll-state',
    clone,
    clamp,
    stageAspectRatio: ARTIFACT_STAGE_ASPECT_RATIO,
    statePushBatchMs: ARTIFACT_STATE_PUSH_BATCH_MS,
    editRenderConfirmTimeoutMs: ARTIFACT_EDIT_RENDER_CONFIRM_TIMEOUT_MS,
    onRenderWatchdogTimeout: () => {
      restoreArtifactAfterFailedEdit(
        'The updated artifact never confirmed a successful render after the edit.'
      )
    }
  })
  const artifactTextEdit = createArtifactTextEditHandler({
    getState: () => state,
    getQuestionEl: () => el.question,
    getApiBase: () => state.apiBase,
    getAccessToken: () => getLibraryAccessToken(),
    onArtifactCopyEdit: (field, text, extra) => handleArtifactCopyEdit(field, text, extra),
    onTextChange: ({ field, optionId, text, priorText }) => {
      artifactHistory.push({
        kind: 'text-content',
        targetKey: optionId ? `${field}:${optionId}` : field,
        before: { field, optionId, text: priorText },
        after: { field, optionId, text },
        label: `Edit ${field}`,
        ts: Date.now()
      })
    }
  })
  // Data layer: socket + snapshot + activity selection. Rendering and status
  // chrome stay in this file and arrive as callbacks; the destructured names
  // keep every historical call site unchanged.
  const sessionFeed = createSessionFeed({
    state,
    onRenderSnapshot: (force) => renderFromSnapshot(force),
    onSocketStatusChange: () => updateCurrentActivityMeta(),
    onMissingSession: () => renderMissingSession(),
    onError: (message) => renderError(message),
    isTextEditing: () => artifactTextEdit.isEditing()
  })
  const {
    startSessionFeed,
    disconnectSocket,
    stopSnapshotPolling,
    selectPoll,
    buildQnaActivityView
  } = sessionFeed

  const artifactSelection = createArtifactSelectionHandler({
    onSelectionChange: (selection) => {
      // For now we only log; future iterations will drive a host-side
      // toolbar / move handles from this signal.
      if (selection) {
        console.log('[prezo-element-selected]', selection.kind, selection.label, selection)
      } else {
        console.log('[prezo-element-selected] cleared')
      }
    }
  })
  const artifactPosition = createArtifactPositionHandler({
    onPositionChange: (stableId, override, message) => {
      console.log('[prezo-position-changed]', stableId, override)
      // Record an undo entry. The bridge sends priorDx/priorDy alongside the
      // new dx/dy so we can capture both endpoints in a single message.
      if (message && Number.isFinite(Number(message.priorDx)) && Number.isFinite(Number(message.priorDy))) {
        artifactHistory.push({
          kind: 'position',
          targetKey: stableId,
          before: {
            dx: Number(message.priorDx),
            dy: Number(message.priorDy),
            role: override.role,
            optionId: override.optionId,
            label: override.label
          },
          after: { ...override },
          label: override.label || 'Move element',
          ts: Date.now()
        })
      }
    }
  })
  const artifactSize = createArtifactSizeHandler({
    onSizeChange: (stableId, override, message) => {
      console.log('[prezo-size-changed]', stableId, override)
      if (message && Number.isFinite(Number(message.priorSx)) && Number.isFinite(Number(message.priorSy))) {
        artifactHistory.push({
          kind: 'size',
          targetKey: stableId,
          before: {
            sx: Number(message.priorSx),
            sy: Number(message.priorSy),
            role: override.role,
            optionId: override.optionId,
            label: override.label,
            anchor: override.anchor
          },
          after: { ...override },
          label: override.label || 'Resize element',
          ts: Date.now()
        })
      }
    }
  })
  // Payload + AI-context builders: the live state pushed into the artifact
  // iframe and the model-facing build/edit context. Mutable closure bindings
  // (currentTheme, pending override maps) and DOM reads arrive as getters.
  const artifactPayloads = createArtifactPayloadBuilders({
    state,
    getCurrentTheme: () => currentTheme,
    artifactPosition,
    artifactSize,
    getPendingStyleOverrides: () => pendingArtifactStyleOverrides,
    getPendingCopyOverrides: () => pendingArtifactCopyOverrides,
    getEyebrowHtml: () => el.eyebrow.innerHTML,
    getQuestionHtml: () => el.question.innerHTML
  })
  const {
    buildArtifactPollPayload,
    buildArtifactQnaPayload,
    buildArtifactContext,
    buildAiEditorContext
  } = artifactPayloads

  // Wizard + edit queue orchestration. All DOM work (composer, chat log,
  // thinking animation, queue chips, stage) and the build orchestrator stay
  // in this file and arrive as callbacks under their original names.
  const artifactWizard = createArtifactWizard({
    state,
    requestAiArtifactIntake,
    requestAiArtifactBuild,
    requestAiArtifactAnswer,
    buildArtifactContext,
    buildAiEditorContext,
    submitArtifactPrompt: (prompt, options) => submitArtifactPrompt(prompt, options),
    appendArtifactEditMessage: (role, text) => appendArtifactEditMessage(role, text),
    clearPromptInput: () => clearComposer(el.artifactPromptInput),
    serializePromptInput: () => serializeComposer(el.artifactPromptInput),
    clearArtifactBuildReferenceUi: () => clearArtifactBuildReferenceUi(),
    renderArtifactPromptQueue: () => renderArtifactPromptQueue(),
    syncArtifactComposerBusyState: () => syncArtifactComposerBusyState(),
    syncArtifactConversationUi: () => syncArtifactConversationUi(),
    startArtifactIntakeThinking: (options) => startArtifactIntakeThinking(options),
    stopArtifactIntakeThinking: () => stopArtifactIntakeThinking(),
    setEditorShellExpanded: (expanded) => setEditorShellExpanded(expanded),
    ensureArtifactBrandProfilesLoaded: () => ensureArtifactBrandProfilesLoaded(),
    collectReferenceImagePayloads: () => collectReferenceImagePayloads(),
    collectReadyAttachmentUrls: () => collectReadyAttachmentUrls(),
    isArtifactConversationComplete: () => isArtifactConversationComplete(),
    applyArtifactMarkup: (html, options) => applyArtifactMarkup(html, options),
    renderFromSnapshot: (force) => renderFromSnapshot(force),
    showArtifactStageFrame: () => showArtifactStageFrame()
  })
  const {
    submitArtifactConversationAnswer,
    handleArtifactIntakeBuildNowClick,
    enqueueArtifactEditPrompt,
    submitArtifactRuntimeRepairRequest
  } = artifactWizard

  const artifactDelete = createArtifactDeleteHandler({
    onDelete: (stableId, override, message) => {
      console.log('[prezo-element-deleted]', stableId, override)
      // Record an undo entry only for genuine user deletes from the iframe,
      // which always carry an explicit priorHidden flag. The history re-apply
      // path (applyHistoryHiddenEntry) omits priorHidden so re-emitting an
      // undo/redo doesn't push a fresh entry — mirrors the position/size
      // handlers' priorDx/priorSx guard.
      if (!message || typeof message.priorHidden !== 'boolean') return
      artifactHistory.push({
        kind: 'hidden',
        targetKey: stableId,
        before: {
          hidden: message.priorHidden === true,
          role: override.role,
          optionId: override.optionId,
          label: override.label,
          cssLabel: override.cssLabel,
          anchor: override.anchor
        },
        after: { ...override },
        label: override.label ? `Delete ${override.label}` : 'Delete element',
        ts: Date.now()
      })
    }
  })
  // Undo/redo. Closure resolves apply* helpers at call time so they don't
  // need to be defined before this constructor runs. Scope: per-artifact —
  // we clear the stacks when the artifact is rebuilt or swapped.
  const artifactHistory = createArtifactHistoryHandler({
    applyEntry: (entry, direction) => applyArtifactHistoryEntry(entry, direction)
  })
  // Designer tools (rulers / grid / snap-to-grid). Scope: per-user
  // preference, persisted in localStorage. Present mode unconditionally
  // forces visual aids off — handled by the handler's getEffectiveConfig.
  const artifactGuides = createArtifactGuidesHandler({
    onConfigChange: () => {
      pushArtifactGridConfig()
      syncDesignerToolsUi()
    }
  })
  let themeLibrary = loadThemeLibrary()
  let artifactLibrary = loadArtifactLibrary()
  let currentTheme = loadInitialTheme(themeLibrary)
  const visualModeFromQuery = asText(query.get('visualMode')).trim()
  if (visualModeFromQuery) {
    currentTheme = sanitizeTheme({ ...currentTheme, visualMode: visualModeFromQuery })
  }

  // Library panel: theme/artifact selects, save/load/delete flows, account
  // version history, theme import/export, sync status pill, and the panel's
  // feedback lines. The panel owns its DOM (the shared el map moves with it);
  // reassignable closure bindings (currentTheme, the pending override maps)
  // arrive as accessors, and app callbacks keep their original closure names
  // so the moved bodies read unchanged. The destructured names keep every
  // historical call site unchanged.
  const libraryPanel = createLibraryPanel({
    state,
    el,
    themeLibrary,
    artifactLibrary,
    getCurrentTheme: () => currentTheme,
    setCurrentTheme: (nextTheme) => {
      currentTheme = nextTheme
    },
    getPendingStyleOverrides: () => pendingArtifactStyleOverrides,
    getPendingCopyOverrides: () => pendingArtifactCopyOverrides,
    clearPendingArtifactOverrides: () => {
      pendingArtifactStyleOverrides = {}
      pendingArtifactCopyOverrides = {}
    },
    saveThemeLibrary,
    saveArtifactLibrary,
    saveThemeDraft,
    sanitizeSavedArtifactRecord,
    persistThemeToAccount,
    deleteThemeFromAccount,
    persistArtifactToAccount,
    deleteArtifactFromAccount,
    listArtifactVersionsFromAccount,
    restoreArtifactVersionInAccount,
    reflectLibrarySyncResult,
    artifactPosition,
    artifactSize,
    artifactDelete,
    artifactHistory,
    updateTheme: (partialTheme, options) => updateTheme(partialTheme, options),
    applyTheme: (theme) => applyTheme(theme),
    syncThemeControls: () => syncThemeControls(),
    postVisualModeToParent: (reason) => postVisualModeToParent(reason),
    postActiveArtifactToParent: (reason) => postActiveArtifactToParent(reason),
    recordHistoryCheckpoint: (actionLabel) => recordHistoryCheckpoint(actionLabel),
    renderFromSnapshot: (force) => renderFromSnapshot(force),
    applyArtifactMarkup: (html, options) => applyArtifactMarkup(html, options),
    clearArtifactMarkup: () => clearArtifactMarkup(),
    resetArtifactConversation: (options) => resetArtifactConversation(options),
    hideArtifactStage: () => hideArtifactStage(),
    showArtifactStagePlaceholder: (text, type) => showArtifactStagePlaceholder(text, type),
    showArtifactStageFrame: () => showArtifactStageFrame(),
    clearArtifactEditPromptQueue: () => clearArtifactEditPromptQueue(),
    syncArtifactConversationUi: () => syncArtifactConversationUi()
  })
  const {
    setLibrarySyncStatus,
    mergeRemoteThemeLibrary,
    mergeRemoteArtifactLibrary,
    saveTheme,
    loadThemeFromSelect,
    deleteThemeFromSelect,
    startNewArtifact,
    saveArtifactToLibrary,
    applyArtifactLibraryRecord,
    loadArtifactFromSelect,
    deleteArtifactFromSelect,
    handleArtifactSelectChange,
    refreshArtifactVersionHistory,
    restoreArtifactFromVersionHistory,
    exportCurrentTheme,
    importThemeFromFile,
    resetThemeDraft,
    refreshThemeSelect,
    refreshArtifactSelect,
    showThemeFeedback,
    showArtifactFeedback
  } = libraryPanel

  const artifactNameFromQuery = asText(query.get('artifactName')).trim()
  const presentModeFromQuery = asText(query.get('presentMode')).trim() === '1'
  let pendingArtifactRestoreName = artifactNameFromQuery
  let artifactRestoreTimerId = 0
  let artifactRestoreAttempts = 0
  const ARTIFACT_RESTORE_INTERVAL_MS = 1500
  const ARTIFACT_RESTORE_MAX_ATTEMPTS = 20

  /**
   * Apply the artifact named in the URL once the user's artifact library
   * finishes syncing from the server. The library can populate at any of:
   * the very first hydrateSavedLibraries call, a later force-refresh after
   * a library-sync token arrives from the host, or a manual user retry.
   * Polling avoids tight coupling to those internal hydration paths.
   */
  function scheduleArtifactRestoreFromQuery() {
    if (!pendingArtifactRestoreName) {
      return
    }
    if (artifactRestoreTimerId) {
      return
    }
    artifactRestoreAttempts = 0
    // Defer even the first attempt so init() can return and the rest of
    // the IIFE can finish initializing the let/const declarations that
    // applyArtifactLibraryRecord touches (e.g. pendingArtifactStyleOverrides).
    // Without this, calling apply during init triggers a TDZ ReferenceError.
    artifactRestoreTimerId = window.setTimeout(runArtifactRestoreAttempt, 0)
  }

  function runArtifactRestoreAttempt() {
    artifactRestoreTimerId = 0
    if (!pendingArtifactRestoreName) {
      return
    }
    const record =
      artifactLibrary &&
      artifactLibrary.artifacts &&
      artifactLibrary.artifacts[pendingArtifactRestoreName]
    if (record) {
      const nameToApply = pendingArtifactRestoreName
      // Clear before applying so any post-apply postMessage doesn't trigger
      // another restore attempt.
      pendingArtifactRestoreName = ''
      applyArtifactLibraryRecord(nameToApply, record, {
        historyLabel: 'Restore artifact',
        successMessage: '',
      })
      return
    }
    artifactRestoreAttempts += 1
    if (artifactRestoreAttempts >= ARTIFACT_RESTORE_MAX_ATTEMPTS) {
      return
    }
    artifactRestoreTimerId = window.setTimeout(
      runArtifactRestoreAttempt,
      ARTIFACT_RESTORE_INTERVAL_MS
    )
  }

  /**
   * Tell the embed parent which named artifact (from artifactLibrary) this
   * iframe currently has active. Called from every site that mutates
   * artifactLibrary.activeName. Empty string clears the link.
   */
  function postActiveArtifactToParent(_reason) {
    try {
      if (window.parent && window.parent !== window) {
        const name = asText(artifactLibrary && artifactLibrary.activeName)
        window.parent.postMessage(
          { type: 'prezo:active-artifact', artifactName: name },
          parentPostMessageOrigin
        )
      }
    } catch {
      /* ignore cross-frame postMessage failures */
    }
  }

  /**
   * Tell the embed parent (poll-game-content.html) what visual mode this
   * iframe is currently rendering. Called from every site that mutates
   * currentTheme.visualMode — both the standard updateTheme path AND the
   * direct-assignment paths (history undo/redo, theme load, artifact preset
   * load) which bypass updateTheme. The outer embed deduplicates against its
   * own currentScreenMode, so calling here unconditionally is safe.
   */
  function postVisualModeToParent(_reason) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: 'prezo:visual-mode', visualMode: currentTheme.visualMode },
          parentPostMessageOrigin
        )
      }
    } catch {
      /* ignore cross-frame postMessage failures */
    }
  }
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
  let aiChatShellAnchorRafId = 0
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

  // Theme editor DOM half: control bindings, updateTheme/applyTheme/
  // syncThemeControls, and the image upload UI. Instantiated after
  // historyState (updateTheme reads its `applying` flag by reference) and
  // before init() runs. The canvas-object helpers stay in this file — the
  // drag/resize engine shares them — and arrive as callbacks under their
  // original names. Destructured names keep every historical call site
  // unchanged.
  const themeEditor = createThemeEditor({
    state,
    el,
    historyState,
    getCurrentTheme: () => currentTheme,
    setCurrentTheme: (nextTheme) => {
      currentTheme = nextTheme
    },
    saveThemeDraft,
    recordHistoryCheckpoint: (actionLabel) => recordHistoryCheckpoint(actionLabel),
    renderFromSnapshot: (force) => renderFromSnapshot(force),
    postVisualModeToParent: (reason) => postVisualModeToParent(reason),
    clearArtifactMarkup: () => clearArtifactMarkup(),
    resetArtifactConversation: (options) => resetArtifactConversation(options),
    hideArtifactStage: () => hideArtifactStage(),
    showThemeFeedback: (text, type) => showThemeFeedback(text, type),
    applyElementOffset: (node, offsetX, offsetY, scaleX, scaleY) =>
      applyElementOffset(node, offsetX, offsetY, scaleX, scaleY),
    applyElementBoxSize: (node, width, height) => applyElementBoxSize(node, width, height),
    applyHeaderTextObjects: () => applyHeaderTextObjects(),
    applyImageAsset: (node, options) => applyImageAsset(node, options),
    applyDeletedStaticTargets: (theme) => applyDeletedStaticTargets(theme),
    syncArtifactComposerVisibility: () => syncArtifactComposerVisibility(),
    scheduleResizeSelectionUpdate: () => scheduleResizeSelectionUpdate()
  })
  const {
    bindThemeControls,
    updateTheme,
    applyTheme,
    syncThemeControls,
    syncSingleControlValue,
    bindImageUpload,
    setupBackgroundDropzone
  } = themeEditor

  // Rich-text selection editor: contenteditable hosts, the floating
  // selection toolbar, ribbon text-style controls, and the cached-selection
  // machinery. The artifact iframe text toolbar stays in this file (it edits
  // through the bridge, not station hosts) and is invoked via the callback;
  // it reaches back into the editor for the shared select helpers.
  // Destructured names keep every historical call site unchanged.
  const richTextEditor = createRichTextEditor({
    state,
    el,
    historyState,
    getCurrentTheme: () => currentTheme,
    recordHistoryCheckpoint: (actionLabel) => recordHistoryCheckpoint(actionLabel),
    renderFromSnapshot: (force) => renderFromSnapshot(force),
    scheduleTypingHistoryCheckpoint: () => scheduleTypingHistoryCheckpoint(),
    setupArtifactTextToolbar: () => setupArtifactTextToolbar()
  })
  const {
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
  } = richTextEditor

  init()

  function init() {
    setupSettingsPanel()
    setupThemeEditor()
    setupRichTextEditor()
    setupAiChat()
    setupArtifactMode()
    setupPresentMode()
    setupDesignerTools()
    setupHistoryControls()
    setupDeleteControls()
    setupDragInteractions()
    setupResizeInteractions()
    setupRibbonOffsetTracking()
    setupCanvasFitBehavior()
    applyTheme(currentTheme)
    postVisualModeToParent('init')
    syncThemeControls()
    refreshThemeSelect(themeLibrary.activeName)
    refreshArtifactSelect(artifactLibrary.activeName)
    void refreshArtifactVersionHistory()
    renderInitialState()
    initializeHistoryState()
    void hydrateSavedLibraries()
    scheduleArtifactRestoreFromQuery()
    // Auto-enter present mode if the embed was saved that way. The outer
    // embed only sets ?presentMode=1 on the FIRST iframe load per file open
    // (latched after first use), so subsequent reloads in this session
    // won't re-trigger and won't fight a user-initiated exit. We use
    // applyPresentModeState (CSS-only) rather than setPresentMode here
    // because requestFullscreen requires a user gesture.
    if (presentModeFromQuery) {
      window.setTimeout(() => {
        try {
          applyPresentModeState(true)
        } catch {
          /* applyPresentModeState may not be defined on edge cases */
        }
      }, 0)
    }
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
    const baseWidthLimit = 2400
    if (!isDocked || window.innerWidth <= EDITOR_DOCK_BREAKPOINT_PX) {
      rootStyle.setProperty('--editor-sidebar-width', '0px')
      rootStyle.setProperty('--editor-dock-reserve', '0px')
      rootStyle.setProperty('--editor-dock-shift', '0px')
      rootStyle.setProperty('--wrap-width-limit', `${baseWidthLimit}px`)
      if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
        scheduleArtifactLayoutRefit({ includeSettledPass: false })
      }
      scheduleAiChatShellIframeAnchor()
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
      Math.min(baseWidthLimit, Math.round(window.innerWidth - reserve - EDITOR_DOCK_SIDE_PADDING_PX))
    )
    const shift = 0
    rootStyle.setProperty('--editor-sidebar-width', `${Math.round(shellWidth)}px`)
    rootStyle.setProperty('--editor-dock-reserve', `${reserve}px`)
    rootStyle.setProperty('--editor-dock-shift', `${shift}px`)
    rootStyle.setProperty('--wrap-width-limit', `${widthLimit}px`)
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      scheduleArtifactLayoutRefit({ includeSettledPass: false })
    }
    scheduleAiChatShellIframeAnchor()
  }

  /** Keep #ai-chat-shell horizontally centered on the preview iframe (or #canvas-wrap when stage hidden). */
  function scheduleAiChatShellIframeAnchor() {
    if (aiChatShellAnchorRafId) {
      return
    }
    aiChatShellAnchorRafId = window.requestAnimationFrame(() => {
      aiChatShellAnchorRafId = 0
      syncAiChatShellIframeAnchor()
    })
  }

  function syncAiChatShellIframeAnchor() {
    if (!el.aiChatShell.classList.contains('ai-chat-shell--viewport-fixed')) {
      return
    }
    if (document.body.classList.contains('editor-docked')) {
      el.aiChatShell.style.removeProperty('--ai-shell-anchor-center-x')
      return
    }
    const stageVisible = !el.artifactStage.classList.contains('hidden')
    const frameRect = el.artifactFrame.getBoundingClientRect()
    const useFrame =
      stageVisible &&
      Number.isFinite(frameRect.width) &&
      Number.isFinite(frameRect.height) &&
      frameRect.width > 2 &&
      frameRect.height > 2
    const anchorEl = useFrame ? el.artifactFrame : el.wrap
    const rect = anchorEl.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) {
      el.aiChatShell.style.removeProperty('--ai-shell-anchor-center-x')
      return
    }
    const centerX = rect.left + rect.width * 0.5
    el.aiChatShell.style.setProperty('--ai-shell-anchor-center-x', `${Math.round(centerX)}px`)
  }

  function setupAiChatShellAnchorTracking() {
    scheduleAiChatShellIframeAnchor()
    window.addEventListener('resize', scheduleAiChatShellIframeAnchor)
    window.addEventListener('scroll', scheduleAiChatShellIframeAnchor, true)
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const ro = new ResizeObserver(() => scheduleAiChatShellIframeAnchor())
    try {
      ro.observe(el.wrap)
      ro.observe(el.artifactStage)
      ro.observe(el.artifactFrame)
    } catch {}
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
    const headerHeight = 56
    const offset = isHidden ? 0 : headerHeight
    const canvasScale = 1

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
    bindThemeControls()

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
    el.newArtifact.addEventListener('click', startNewArtifact)
    el.loadArtifact.addEventListener('click', loadArtifactFromSelect)
    el.deleteArtifact.addEventListener('click', deleteArtifactFromSelect)
    el.artifactSelect.addEventListener('change', handleArtifactSelectChange)
    el.restoreArtifactVersion.addEventListener('click', restoreArtifactFromVersionHistory)
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
    bindImageUpload('theme-logo-upload', 'logoUrl', 'Logo applied.')
    bindImageUpload('theme-asset-upload', 'assetUrl', 'Overlay asset applied.')
    setupBackgroundDropzone()
  }

  function setupAiChat() {
    try {
      localStorage.removeItem('prezo.poll-game-poc.gemini-api-key.v1')
    } catch {}
    state.ai.model = resolveAiModel()
    const storedOpen = safeStorageGet(AI_CHAT_OPEN_KEY)
    setAiChatOpen(storedOpen === '1', { persist: false })
    const storedShellExpanded = safeStorageGet(EDITOR_SHELL_EXPANDED_KEY)
    setEditorShellExpanded(storedShellExpanded === '1', { persist: false })

    el.aiChatFab.addEventListener('click', handleAiChatFabClick)
    el.aiChatPanelVisibilityToggle.addEventListener('click', handleAiChatPanelVisibilityToggleClick)
    el.aiEditorShellToggle.addEventListener('click', handleEditorShellToggleClick)
    el.artifactEditorShellToggle.addEventListener('click', handleEditorShellToggleClick)
    el.aiChatForm.addEventListener('submit', handleAiChatFormSubmit)
    el.aiChatInput.addEventListener('keydown', handleAiChatInputKeydown)
    el.aiChatShell.addEventListener('transitionend', handleEditorDockShellTransitionEnd)
    el.aiChatShell.addEventListener('pointerdown', handlePanelResizePointerDown)
    window.addEventListener('resize', handleEditorDockViewportResize)
    restoreEditorPanelHeight()
    setupAiChatShellAnchorTracking()

    appendAiChatMessage(
      'assistant',
      'Poll AI is ready. Ask for design or text changes and I will apply them to the theme.',
      { skipShellExpand: true }
    )
    scheduleEditorDockLayoutRefresh({ includeSettledPass: false })
  }

  function setupPresentMode() {
    syncPresentModeUi()
    el.presentModeToggle.addEventListener('pointerdown', handlePresentModeTogglePointerDown)
    el.presentModeToggle.addEventListener('click', handlePresentModeToggleClick)
    document.addEventListener('fullscreenchange', handlePresentModeFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handlePresentModeFullscreenChange)
  }

  /**
   * Wire the Designer Tools form controls to artifactGuides + render the
   * current state into the UI. Called once during setup; the handler's
   * onConfigChange callback keeps the UI in sync on every change.
   */
  function setupDesignerTools() {
    syncDesignerToolsUi()
    el.designerRulersToggle.addEventListener('change', handleDesignerRulersToggle)
    el.designerGridToggle.addEventListener('change', handleDesignerGridToggle)
    el.designerSnapToggle.addEventListener('change', handleDesignerSnapToggle)
    el.designerGridSpacing.addEventListener('change', handleDesignerGridSpacingChange)
  }

  function syncDesignerToolsUi() {
    const cfg = artifactGuides.getConfig()
    el.designerRulersToggle.checked = !!cfg.rulersVisible
    el.designerGridToggle.checked = !!cfg.gridVisible
    el.designerSnapToggle.checked = !!cfg.snapToGrid
    // Coerce to a string so the <select> matches exactly.
    el.designerGridSpacing.value = String(cfg.gridSpacing)
  }

  function handleDesignerRulersToggle(event) {
    artifactGuides.setConfig({ rulersVisible: !!event.target.checked })
  }
  function handleDesignerGridToggle(event) {
    artifactGuides.setConfig({ gridVisible: !!event.target.checked })
  }
  function handleDesignerSnapToggle(event) {
    artifactGuides.setConfig({ snapToGrid: !!event.target.checked })
  }
  function handleDesignerGridSpacingChange(event) {
    artifactGuides.setConfig({ gridSpacing: Number(event.target.value) })
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

  function isArtifactPresentModeActive() {
    return (
      state.presentMode &&
      currentTheme.visualMode === ARTIFACT_VISUAL_MODE &&
      state.artifact.stageSurface !== ARTIFACT_STAGE_SURFACE_HIDDEN
    )
  }

  function syncPresentModeUi() {
    document.body.classList.toggle('present-mode', state.presentMode)
    document.body.classList.toggle('present-mode-fullscreen', state.presentModeUsingFullscreen)
    document.body.classList.toggle('present-mode-artifact', isArtifactPresentModeActive())
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
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: 'prezo:present-mode', active: state.presentMode },
          parentPostMessageOrigin
        )
      }
    } catch {}
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
    if (state.presentMode) {
      el.settingsPanel.classList.remove('open')
    } else {
      el.settingsPanel.classList.toggle('open', !ribbonState.collapsed)
    }
    syncPresentModeUi()
    syncEditorDockingState()
    scheduleArtifactLayoutRefit()
    // Present-mode entry/exit swaps the effective grid config (everything
    // off in present mode). Push to the iframe so visual aids hide / show.
    pushArtifactGridConfig()
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
    /* Editor now lives inside the right sidebar pane, so left-side docking
       is no longer needed. Keep the function as a no-op to preserve callers. */
    document.body.classList.remove('editor-docked', 'ai-editor-docked', 'artifact-editor-docked')
  }

  function setupArtifactMode() {
    syncArtifactComposerVisibility()
    resetArtifactConversation({ preserveInput: false })
    syncArtifactComposerBusyState()
    hideArtifactStagePlaceholder()
    hideArtifactStage()
    artifactBridge.setFrameHeight(state.artifact.frameHeight, { force: true })
    el.artifactFrame.addEventListener('load', handleArtifactFrameLoad)
    window.addEventListener('resize', artifactBridge.handleViewportResize)
    window.addEventListener('message', handleArtifactFrameMessage)
    // Cmd/Ctrl+Z / Cmd+Shift+Z / Ctrl+Y for undo/redo. Capture phase so we
    // run before any host UI element's own keydown handler.
    document.addEventListener('keydown', handleHistoryKeydown, true)
    el.artifactComposerFab.addEventListener('click', handleArtifactComposerFabClick)
    el.artifactComposerVisibilityToggle.addEventListener('click', handleArtifactComposerVisibilityToggleClick)
    el.artifactPromptForm.addEventListener('submit', handleArtifactPromptFormSubmit)
    el.artifactIntakeBuildNow.addEventListener('click', handleArtifactIntakeBuildNowClick)
    el.artifactPromptInput.addEventListener('keydown', handleArtifactPromptInputKeydown)
    el.artifactPromptInput.addEventListener('input', handleArtifactPromptInputInput)
    el.artifactBrandProfileSelect.addEventListener('change', handleArtifactBrandProfileSelectChange)
    el.artifactBrandReferenceInput.addEventListener('change', handleArtifactBrandReferenceInputChange)
    el.artifactBrandReferenceClear.addEventListener('click', handleArtifactBrandReferenceClearClick)
    el.artifactTypeReferencePaperclip.addEventListener('click', handleArtifactTypeReferencePaperclipClick)
    el.artifactPromptForm.addEventListener('dragover', handleArtifactTypeReferenceDragOver)
    el.artifactPromptForm.addEventListener('dragleave', handleArtifactTypeReferenceDragLeave)
    el.artifactPromptForm.addEventListener('drop', handleArtifactTypeReferenceDrop)
    el.artifactTypeReferenceInput.addEventListener('change', handleArtifactTypeReferenceInputChange)
    el.artifactTypeReferenceClear.addEventListener('click', handleArtifactTypeReferenceClearClick)
    document.addEventListener('paste', handleArtifactBuildReferencePaste, true)
  }

  function syncArtifactComposerModeLabel() {
    // The panel is a step-by-step "wizard" while creating (the 2-question flow) and
    // an "editor" once an artifact exists. A single static label caused mistaken
    // identity between the two modes, so reflect the mode in the kicker + labels.
    const editing = Boolean(state.artifact.html) && isArtifactConversationComplete()
    const label = editing ? 'Artifact editor' : 'Artifact wizard'
    const kicker = document.getElementById('artifact-composer-kicker')
    if (kicker) {
      kicker.textContent = label
    }
    el.artifactComposer.setAttribute('aria-label', label)
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
    if (isArtifactMode) {
      el.aiChatPanel.classList.add('hidden')
      el.aiChatFab.classList.add('hidden')
      if (shouldShowArtifactShell) {
        el.aiChatShell.classList.toggle('is-open', state.artifact.floatingOpen)
        el.aiChatShell.classList.toggle('is-collapsed', !state.artifact.floatingOpen)
      }
    } else {
      setAiChatOpen(state.ai.open, { persist: false })
    }
    el.artifactComposer.classList.toggle('is-floating', shouldFloatComposer)
    el.artifactComposer.classList.toggle('hidden', !shouldShowComposer)
    if (!shouldFloatComposer) {
      el.artifactComposer.classList.remove('artifact-composer--panel-hidden')
    }
    syncArtifactComposerModeLabel()
    if (shouldFloatComposer) {
      syncArtifactComposerPanelVisibilityToggleUi()
      syncEditorShellExpandedDom()
    }
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
    document.body.classList.toggle('artifact-mode-active', isArtifactMode)
    document.body.classList.toggle('artifact-stage-active', shouldShowStage)
    applyEditorDockLayout()
    scheduleAiChatShellIframeAnchor()
    syncPresentModeUi()
    el.options.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.pollHead.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.footer.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.customLogo.classList.toggle('hidden-by-artifact', isArtifactMode)
    el.customAsset.classList.toggle('hidden-by-artifact', isArtifactMode)
    if (isArtifactMode && dragState.enabled) {
      setDragMode(false, { announce: false })
    } else if (!isArtifactMode && !dragState.enabled) {
      setDragMode(true, { announce: false })
    }
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
    const queueFull =
      canEditArtifact && state.artifact.editPromptQueue.length >= 12
    const conversationBlocked = !canEditArtifact && state.artifact.busy

    setComposerDisabled(Boolean(queueFull || conversationBlocked))
    el.artifactBrandProfileSelect.disabled = Boolean(state.artifact.busy || artifactBrandReferenceBusy)
    el.artifactBrandReferenceInput.disabled = Boolean(
      state.artifact.busy || artifactBrandReferenceBusy || queueFull || conversationBlocked
    )
    syncArtifactTypeReferenceRow()
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
    state.artifact.intake = {
      messages: [
        { role: 'assistant', text: ARTIFACT_CONVERSATION_STEPS[0].question }
      ],
      busy: false,
      done: false
    }
    if (options.clearEditHistory !== false) {
      state.artifact.editHistory = []
    }
    clearArtifactEditPromptQueue()
    if (!options.preserveInput) {
      clearComposer(el.artifactPromptInput)
    }
    el.artifactBrandProfileSelect.value = ''
    clearArtifactReferenceFileUi()
    clearArtifactBuildReferenceUi()
    artifactBrandReferenceBusy = false
    syncArtifactConversationUi()
  }

  function guidelinesTextFromExtractPayload(payload) {
    const raw = asText(payload?.raw_summary).trim()
    if (raw) {
      return raw
    }
    const g = payload?.guidelines
    if (g && typeof g === 'object' && Object.keys(g).length > 0) {
      return `Reference image — visual guidelines (extracted):\n${JSON.stringify(g, null, 2)}`
    }
    return ''
  }

  function clearArtifactReferenceFileUi() {
    el.artifactBrandReferenceInput.value = ''
    el.artifactBrandReferenceStatus.textContent = ''
    hideArtifactBrandReferencePreview()
  }

  /** Show the chosen brand reference as a standard pill (filename label) in the footer.
   *  While `uploading`, the pill dims via the shared --uploading state, matching the
   *  inline image chips used elsewhere. */
  function showArtifactBrandReferencePreview(file, { uploading = false } = {}) {
    const filename = asText(file?.name).trim() || 'Reference image'
    el.artifactBrandReferencePreviewName.textContent = filename
    el.artifactBrandReferencePreview.title = filename
    el.artifactBrandReferencePreview.classList.toggle('artifact-image-chip--uploading', uploading)
    el.artifactBrandReferencePreview.classList.remove('hidden')
  }

  /** Drop the pill's uploading state once extraction resolves (keeps the pill visible). */
  function settleArtifactBrandReferencePreview() {
    el.artifactBrandReferencePreview.classList.remove('artifact-image-chip--uploading')
  }

  /** Hide + reset the brand reference pill. */
  function hideArtifactBrandReferencePreview() {
    el.artifactBrandReferencePreview.classList.add('hidden')
    el.artifactBrandReferencePreview.classList.remove('artifact-image-chip--uploading')
    el.artifactBrandReferencePreviewName.textContent = 'Reference image'
    el.artifactBrandReferencePreview.removeAttribute('title')
  }

  /** × on the brand reference pill: drop the uploaded reference and its extracted guidelines. */
  function handleArtifactBrandReferenceClearClick() {
    if (el.artifactBrandReferenceClear.disabled || artifactBrandReferenceBusy) {
      return
    }
    state.artifact.conversationAnswers.referenceImageGuidelines = ''
    if (el.artifactBrandProfileSelect.value === ARTIFACT_BRAND_REFERENCE_VALUE) {
      el.artifactBrandProfileSelect.value = ''
    }
    clearArtifactReferenceFileUi()
    syncArtifactConversationUi()
  }

  function revokeAttachmentObjectUrl(id) {
    const objectUrl = attachmentObjectUrls.get(id)
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      attachmentObjectUrls.delete(id)
    }
  }

  /** A contenteditable div has no native .disabled; emulate it with contenteditable +
      a class so the CSS can dim it and the user can't type. */
  function setComposerDisabled(disabled) {
    const editor = el.artifactPromptInput
    editor.setAttribute('contenteditable', disabled ? 'false' : 'true')
    editor.classList.toggle('is-disabled', Boolean(disabled))
    editor.setAttribute('aria-disabled', disabled ? 'true' : 'false')
  }

  /** Remove a single inline attachment (its chip + state + preview object URL). */
  function removeArtifactAttachment(id) {
    const key = String(id)
    removeChipNode(el.artifactPromptInput, key)
    state.artifact.attachments.delete(key)
    revokeAttachmentObjectUrl(key)
    refreshComposerPlaceholder(el.artifactPromptInput)
    syncArtifactComposerBusyState()
  }

  /** Clear every inline attachment (state + chips + preview object URLs + status text). */
  function clearArtifactBuildReferenceUi() {
    state.artifact.attachments.clear()
    for (const id of Array.from(attachmentObjectUrls.keys())) {
      revokeAttachmentObjectUrl(id)
    }
    el.artifactTypeReferenceInput.value = ''
    el.artifactTypeReferencePreview.classList.add('hidden')
    el.artifactTypeReferencePreviewImg.removeAttribute('src')
    el.artifactTypeReferenceStatus.textContent = ''
  }

  /** Ordered, deduped hosted URLs of ready attachments (for the attachedImageUrls channel). */
  function collectReadyAttachmentUrls() {
    const urls = []
    const seen = new Set()
    for (const entry of state.artifact.attachments.values()) {
      const url = asText(entry?.url).trim()
      if (!url || seen.has(url)) {
        continue
      }
      seen.add(url)
      urls.push(url)
    }
    return urls
  }

  /** Ordered base64 reference payloads of ready attachments (Anthropic vision on build). */
  function collectReferenceImagePayloads() {
    const payloads = []
    for (const entry of state.artifact.attachments.values()) {
      const data = asText(entry?.data)
      const mediaType = asText(entry?.mediaType)
      if (data && mediaType) {
        payloads.push({ media_type: mediaType, data })
      }
    }
    return payloads
  }

  function normalizeArtifactReferenceMediaType(mt) {
    const t = asText(mt).trim().toLowerCase().split(';')[0]
    if (t === 'image/jpg') {
      return 'image/jpeg'
    }
    if (t === 'image/png' || t === 'image/jpeg' || t === 'image/gif' || t === 'image/webp') {
      return t
    }
    return 'image/png'
  }

  function validateReferenceImagePayload(mediaType, b64) {
    const data = asText(b64).replace(/\s/g, '')
    if (data.length < 20) {
      return null
    }
    let binary
    try {
      binary = atob(data)
    } catch {
      return null
    }
    if (binary.length > ARTIFACT_BUILD_REFERENCE_MAX_BYTES) {
      return null
    }
    return { media_type: mediaType, data }
  }

  function dataUrlToReferencePayload(dataUrl) {
    const raw = asText(dataUrl)
    const comma = raw.indexOf(',')
    if (comma === -1) {
      return null
    }
    const header = raw.slice(0, comma)
    const b64 = raw.slice(comma + 1)
    if (!/;base64/i.test(header)) {
      return null
    }
    const mediaMatch = /^data:([^;,]+)/i.exec(header)
    const mediaType = normalizeArtifactReferenceMediaType(mediaMatch ? mediaMatch[1] : 'image/png')
    return validateReferenceImagePayload(mediaType, b64)
  }

  function syncArtifactTypeReferenceRow() {
    // Show the attach-image affordance during the whole intake conversation AND
    // in edit mode (an artifact already exists), so users can attach an image
    // to any answer or edit.
    const inEditMode = Boolean(state.artifact.html) && isArtifactConversationComplete()
    const show = !isArtifactConversationComplete() || inEditMode
    if (show && !inEditMode) {
      setEditorShellExpanded(true)
    }
    const refInteractDisabled = !show || state.artifact.busy
    el.artifactTypeReferenceInline.classList.toggle('hidden', !show)
    el.artifactTypeReferenceInput.disabled = refInteractDisabled
    el.artifactTypeReferenceClear.disabled = refInteractDisabled
    el.artifactTypeReferencePaperclip.disabled = refInteractDisabled
  }

  async function uploadArtifactBuildReferenceImage(file) {
    // Turn the attached file into a hosted public URL so the AI can embed it in the
    // artifact (or fetch it for style-matching). Best-effort: on failure we keep the
    // base64 reference so the build still works, just without an embeddable URL.
    const base = asText(state.apiBase)
    if (!base) {
      return null
    }
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetchWithTimeout(
      `${base}/library/poll-game/artifact-images/upload`,
      {
        method: 'POST',
        headers: { ...libraryAuthHeaders() },
        body: formData
      },
      60000
    )
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = asText(payload?.detail) || `Upload failed (${response.status})`
      throw new Error(message)
    }
    const url = asText(payload?.image_url) || asText(payload?.url)
    if (!url) {
      throw new Error('Upload did not return an image URL.')
    }
    return url
  }

  function setArtifactBuildReferenceFromFile(file) {
    if (!file || !/^image\//i.test(file.type)) {
      el.artifactTypeReferenceStatus.textContent = 'Choose a PNG, JPEG, GIF, or WebP image.'
      return
    }
    if (file.size > ARTIFACT_BUILD_REFERENCE_MAX_BYTES) {
      el.artifactTypeReferenceStatus.textContent = 'Image is too large (max 10MB).'
      return
    }
    if (state.artifact.attachments.size >= MAX_INLINE_ATTACHMENTS) {
      el.artifactTypeReferenceStatus.textContent = `You can attach up to ${MAX_INLINE_ATTACHMENTS} images.`
      return
    }

    // Register the attachment and drop a chip at the caret immediately so the user sees
    // it land where they were typing; the upload + base64 read happen in the background.
    state.artifact.attachmentSeq += 1
    const id = String(state.artifact.attachmentSeq)
    const filename = asText(file.name) || 'image'
    state.artifact.attachments.set(id, {
      id,
      filename,
      mediaType: '',
      data: '',
      url: '',
      status: 'uploading'
    })

    const objectUrl = URL.createObjectURL(file)
    attachmentObjectUrls.set(id, objectUrl)

    const chip = createInlineImageChip(
      { id, filename, status: 'uploading' },
      removeArtifactAttachment
    )
    insertChipAtCaret(el.artifactPromptInput, chip)
    refreshComposerPlaceholder(el.artifactPromptInput)
    el.artifactTypeReferenceStatus.textContent = 'Uploading image…'
    el.artifactTypeReferenceInput.value = ''
    syncArtifactComposerBusyState()

    void (async () => {
      // Base64 (Anthropic vision on initial build). Only for images small enough to send
      // as vision — larger ones embed via their hosted URL only, so we skip the base64
      // read to keep the request under provider inline-data limits. Non-fatal either way.
      if (file.size <= ARTIFACT_BUILD_REFERENCE_VISION_MAX_BYTES) {
        try {
          const payload = dataUrlToReferencePayload(await readFileAsDataUrl(file))
          const entry = state.artifact.attachments.get(id)
          if (entry && payload) {
            entry.mediaType = payload.media_type
            entry.data = payload.data
          }
        } catch {
          /* vision base64 is best-effort; the hosted URL still drives embedding */
        }
      }

      // Upload in the background to obtain a hosted URL the AI can embed inline.
      try {
        const url = await uploadArtifactBuildReferenceImage(file)
        const entry = state.artifact.attachments.get(id)
        // Guard against the chip being removed mid-upload (entry gone => abandon).
        if (entry) {
          entry.url = url
          entry.status = 'ready'
          setChipState(el.artifactPromptInput, id, { status: 'ready', url })
          el.artifactTypeReferenceStatus.textContent = ''
        }
      } catch (uploadError) {
        const entry = state.artifact.attachments.get(id)
        if (entry) {
          entry.status = 'error'
          setChipState(el.artifactPromptInput, id, { status: 'error', url: '' })
          el.artifactTypeReferenceStatus.textContent =
            'Could not host that image for embedding — remove it and try again.'
        }
      } finally {
        syncArtifactComposerBusyState()
      }
    })()
  }

  function handleArtifactTypeReferenceInputChange(event) {
    const file = event?.target?.files?.[0]
    if (!file) {
      return
    }
    setArtifactBuildReferenceFromFile(file)
  }

  function handleArtifactTypeReferencePaperclipClick() {
    if (el.artifactTypeReferenceInput.disabled) {
      return
    }
    el.artifactTypeReferenceInput.click()
  }

  function handleArtifactTypeReferenceDragOver(event) {
    if (el.artifactTypeReferenceInput.disabled) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    el.artifactPromptForm.closest('.artifact-prompt-bar')?.classList.add('artifact-prompt-bar--drag-over')
  }

  function handleArtifactTypeReferenceDragLeave(event) {
    if (!el.artifactPromptForm.contains(event.relatedTarget)) {
      el.artifactPromptForm.closest('.artifact-prompt-bar')?.classList.remove('artifact-prompt-bar--drag-over')
    }
  }

  function handleArtifactTypeReferenceDrop(event) {
    el.artifactPromptForm.closest('.artifact-prompt-bar')?.classList.remove('artifact-prompt-bar--drag-over')
    if (el.artifactTypeReferenceInput.disabled) {
      return
    }
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file) {
      setArtifactBuildReferenceFromFile(file)
    }
  }

  function handleArtifactTypeReferenceClearClick() {
    if (el.artifactTypeReferenceClear.disabled) {
      return
    }
    clearArtifactBuildReferenceUi()
  }

  function handleArtifactBuildReferencePaste(event) {
    if (currentTheme.visualMode !== ARTIFACT_VISUAL_MODE) {
      return
    }
    if (el.artifactComposer.classList.contains('hidden')) {
      return
    }
    const active = document.activeElement
    if (!active || !el.artifactComposer.contains(active)) {
      return
    }
    // Allow pasting an image whenever the attach affordance is shown (any intake
    // turn or edit mode), mirroring syncArtifactTypeReferenceRow.
    const inEditMode = Boolean(state.artifact.html) && isArtifactConversationComplete()
    if (isArtifactConversationComplete() && !inEditMode) {
      return
    }
    if (state.artifact.busy) {
      return
    }
    const items = event.clipboardData?.items
    if (!items) {
      return
    }
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          event.preventDefault()
          setArtifactBuildReferenceFromFile(file)
        }
        return
      }
    }
  }

  function handleArtifactBrandProfileSelectChange() {
    const raw = asText(el.artifactBrandProfileSelect.value).trim()
    if (raw === ARTIFACT_BRAND_REFERENCE_VALUE) {
      state.artifact.conversationAnswers.brandProfileName = ''
      if (!el.artifactBrandReferenceInput.disabled) {
        el.artifactBrandReferenceInput.click()
      }
      return
    }
    state.artifact.conversationAnswers.referenceImageGuidelines = ''
    clearArtifactReferenceFileUi()
    state.artifact.conversationAnswers.brandProfileName = raw
  }

  let artifactBrandProfilesFetchPromise = null
  // name → up to 3 top-ranked hexes from the profile's saved brand facts,
  // used to paint that brand's quick-reply chip as a gradient of its
  // identity colors. Empty/missing → default chip style.
  const artifactBrandChipColorsByName = new Map()

  function pickArtifactBrandChipColors(row) {
    const candidates = []
    const facts = row?.brand_facts
    if (Array.isArray(facts?.colors)) {
      // Already sorted by hierarchy_rank server-side (brand_facts.py).
      for (const item of facts.colors) {
        const hex = sanitizeHex(asText(item?.hex).trim(), '')
        if (hex) {
          candidates.push(hex)
        }
      }
    }
    const legacy = row?.guidelines?.primary_colors
    if (Array.isArray(legacy)) {
      for (const line of legacy) {
        const match = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(asText(line))
        if (match) {
          candidates.push(match[0])
        }
      }
    }
    // Top three distinct colors in rank order. The backend's grey "no hex
    // found" placeholder is skipped, and so are near-white swatches: the
    // colors paint the chip's outline and label on the white chrome, where
    // a white stop would simply vanish.
    const colors = []
    const seen = new Set()
    for (const hex of candidates) {
      const key = hex.toLowerCase()
      if (key === '#cccccc' || key === '#ccc' || seen.has(key)) {
        continue
      }
      const luminance = hexLuminance(hex)
      if (luminance == null || luminance > 0.85) {
        continue
      }
      seen.add(key)
      colors.push(hex)
      if (colors.length >= 3) {
        break
      }
    }
    return colors
  }

  async function handleArtifactBrandReferenceInputChange(event) {
    const file = event?.target?.files?.[0]
    if (!file) {
      return
    }
    const base = asText(state.apiBase)
    const token = getLibraryAccessToken()
    if (!base || !token) {
      el.artifactBrandReferenceStatus.textContent =
        'Sign in to the library to extract guidelines from an image.'
      clearArtifactReferenceFileUi()
      return
    }
    // Show the pill immediately (left of the footer) so the user sees the upload land;
    // the bolt + paperclip stay pinned right because the pill and the short status text
    // no longer claim the footer's auto-margin. The pill dims while analyzing.
    showArtifactBrandReferencePreview(file, { uploading: true })
    artifactBrandReferenceBusy = true
    el.artifactBrandReferenceStatus.textContent = 'Analyzing…'
    syncArtifactComposerBusyState()
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('purpose', 'artifact')
      const response = await fetch(`${base}/library/poll-game/brand-profiles/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          asText(payload?.detail) || `Request failed (${response.status})`
        throw new Error(message)
      }
      const text = guidelinesTextFromExtractPayload(payload)
      if (!text) {
        throw new Error('Could not read visual guidelines from that image.')
      }
      state.artifact.conversationAnswers.referenceImageGuidelines = text
      // Success is conveyed by the persistent pill (un-dimmed), not a footer sentence
      // (which would otherwise push the icons toward the center).
      settleArtifactBrandReferencePreview()
      el.artifactBrandReferenceStatus.textContent = ''
    } catch (error) {
      state.artifact.conversationAnswers.referenceImageGuidelines = ''
      el.artifactBrandReferenceStatus.textContent = errorToMessage(error)
      el.artifactBrandReferenceInput.value = ''
      hideArtifactBrandReferencePreview()
    } finally {
      artifactBrandReferenceBusy = false
      syncArtifactComposerBusyState()
    }
  }

  async function ensureArtifactBrandProfilesLoaded() {
    const token = getLibraryAccessToken()
    if (!token) {
      return
    }
    if (artifactBrandProfilesFetchPromise) {
      return artifactBrandProfilesFetchPromise
    }
    const base = asText(state.apiBase)
    if (!base) {
      return
    }
    artifactBrandProfilesFetchPromise = (async () => {
      try {
        const response = await fetch(`${base}/library/poll-game/brand-profiles`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !Array.isArray(payload)) {
          return
        }
        const select = el.artifactBrandProfileSelect
        while (select.lastChild) {
          select.removeChild(select.lastChild)
        }
        const none = document.createElement('option')
        none.value = ''
        none.textContent = 'None'
        select.appendChild(none)
        const referenceOption = document.createElement('option')
        referenceOption.value = ARTIFACT_BRAND_REFERENCE_VALUE
        referenceOption.textContent = 'Upload a reference image…'
        select.appendChild(referenceOption)
        artifactBrandChipColorsByName.clear()
        for (const row of payload) {
          const name = asText(row?.name).trim()
          if (!name) {
            continue
          }
          const option = document.createElement('option')
          option.value = name
          option.textContent = name
          select.appendChild(option)
          artifactBrandChipColorsByName.set(name, pickArtifactBrandChipColors(row))
        }
      } catch {
        artifactBrandProfilesFetchPromise = null
      }
    })()
    return artifactBrandProfilesFetchPromise
  }

  // While the intake request is in flight, the wizard's bubble types out a
  // short narration of what the turn is actually doing (read the answer,
  // check brand profiles, decide what to ask) instead of a static
  // "Thinking…" label. The provider call is not streamed, so this is a
  // local typewriter over honest pipeline descriptions, not model output.
  const ARTIFACT_INTAKE_THINKING_TICK_MS = 35
  const ARTIFACT_INTAKE_THINKING_PAUSE_TICKS = 12
  let artifactIntakeThinkingPhrases = []
  let artifactIntakeThinkingPhraseIndex = 0
  let artifactIntakeThinkingShownChars = 0
  let artifactIntakeThinkingPauseTicks = 0
  let artifactIntakeThinkingTimer = null

  function buildArtifactIntakeThinkingPhrases({ forceReady }) {
    if (forceReady) {
      return ['Skipping ahead — pulling everything you told me into a creative brief…']
    }
    const intake = state.artifact.intake
    const userTurns = intake.messages.filter((message) => message.role === 'user').length
    const phrases = [userTurns <= 1 ? 'Reading your idea…' : 'Reading your answer…']
    const chosenBrand = asText(state.artifact.conversationAnswers?.brandProfileName).trim()
    if (collectArtifactBrandProfileNames().length && !chosenBrand) {
      phrases.push('Checking your saved brand profiles…')
    }
    phrases.push('Deciding whether I have enough to build, or what to ask next…')
    return phrases
  }

  function getArtifactIntakeThinkingText() {
    const done = artifactIntakeThinkingPhrases.slice(0, artifactIntakeThinkingPhraseIndex)
    const current = artifactIntakeThinkingPhrases[artifactIntakeThinkingPhraseIndex]
    const lines = current ? [...done, current.slice(0, artifactIntakeThinkingShownChars)] : done
    return lines.filter(Boolean).join('\n')
  }

  function startArtifactIntakeThinking(options) {
    stopArtifactIntakeThinking()
    artifactIntakeThinkingPhrases = buildArtifactIntakeThinkingPhrases(options)
    artifactIntakeThinkingPhraseIndex = 0
    artifactIntakeThinkingShownChars = 0
    artifactIntakeThinkingPauseTicks = 0
    artifactIntakeThinkingTimer = window.setInterval(
      tickArtifactIntakeThinking,
      ARTIFACT_INTAKE_THINKING_TICK_MS
    )
  }

  function stopArtifactIntakeThinking() {
    if (artifactIntakeThinkingTimer) {
      window.clearInterval(artifactIntakeThinkingTimer)
      artifactIntakeThinkingTimer = null
    }
    artifactIntakeThinkingPhrases = []
    artifactIntakeThinkingPhraseIndex = 0
    artifactIntakeThinkingShownChars = 0
  }

  function tickArtifactIntakeThinking() {
    if (!state.artifact.intake?.busy) {
      stopArtifactIntakeThinking()
      return
    }
    if (artifactIntakeThinkingPauseTicks > 0) {
      artifactIntakeThinkingPauseTicks -= 1
      return
    }
    const phrase = artifactIntakeThinkingPhrases[artifactIntakeThinkingPhraseIndex]
    if (!phrase) {
      // All phrases typed; the CSS caret keeps blinking until the reply lands.
      return
    }
    artifactIntakeThinkingShownChars += 1
    if (artifactIntakeThinkingShownChars >= phrase.length) {
      artifactIntakeThinkingPhraseIndex += 1
      artifactIntakeThinkingShownChars = 0
      artifactIntakeThinkingPauseTicks = ARTIFACT_INTAKE_THINKING_PAUSE_TICKS
    }
    const node = el.artifactChatLog.querySelector('.artifact-intake-thinking')
    if (node) {
      node.textContent = getArtifactIntakeThinkingText()
    }
  }

  // Quick-reply chips replace the old labeled brand dropdown: they render
  // inside the chat log under the intake model's brand question (it labels
  // each question with a topic) and answer the turn in one click. The hidden
  // select stays as the data store — form submits re-read its value.
  function shouldShowArtifactBrandChips() {
    const intake = state.artifact.intake
    if (isArtifactConversationComplete() || intake.busy || state.artifact.busy) {
      return false
    }
    const last = intake.messages[intake.messages.length - 1]
    return (
      Boolean(last) &&
      last.role !== 'user' &&
      asText(last.topic).trim().toLowerCase() === 'brand'
    )
  }

  function createArtifactBrandChipsRow() {
    const row = document.createElement('div')
    row.className = 'artifact-intake-chips'
    let brandedIndex = 0
    const addChip = (label, secondary, onClick, brandColors = []) => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = secondary ? 'artifact-intake-chip secondary' : 'artifact-intake-chip'
      if (brandColors.length) {
        chip.classList.add('branded')
        // The outline's gradient is mostly the standard soft purple with a
        // narrow band of the brand colors at 40–56% of an oversized image;
        // the CSS animation slides that band across the ring periodically.
        const band = brandColors
          .map((hex, index) => {
            const t = brandColors.length === 1 ? 0.5 : index / (brandColors.length - 1)
            return `${hex} ${(40 + t * 16).toFixed(1)}%`
          })
          .join(', ')
        chip.style.setProperty(
          '--chip-brand-sweep',
          `linear-gradient(110deg, var(--chrome-accent-soft) 36%, ${band}, var(--chrome-accent-soft) 60%)`
        )
        // Stagger the phase so the shimmer travels across the row of chips.
        chip.style.animationDelay = `${-(brandedIndex * 0.5).toFixed(1)}s`
        brandedIndex += 1
      }
      chip.textContent = label
      chip.addEventListener('click', onClick)
      row.appendChild(chip)
    }
    for (const name of collectArtifactBrandProfileNames()) {
      addChip(
        name,
        false,
        () => handleArtifactIntakeBrandChipClick(name),
        artifactBrandChipColorsByName.get(name) || []
      )
    }
    addChip('No brand', true, () => handleArtifactIntakeBrandChipClick(''))
    if (getLibraryAccessToken()) {
      addChip('Use a reference image…', true, handleArtifactIntakeReferenceChipClick)
    }
    return row
  }

  function handleArtifactIntakeBrandChipClick(name) {
    const intake = state.artifact.intake
    if (intake.busy || state.artifact.busy || isArtifactConversationComplete()) {
      return
    }
    const select = el.artifactBrandProfileSelect
    if (name && !Array.from(select.options).some((option) => option.value === name)) {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      select.appendChild(option)
    }
    select.value = name
    handleArtifactBrandProfileSelectChange()
    void submitArtifactConversationAnswer(
      name ? `Use the "${name}" brand profile.` : 'No brand — use your judgment.'
    )
  }

  function handleArtifactIntakeReferenceChipClick() {
    const intake = state.artifact.intake
    if (intake.busy || state.artifact.busy || isArtifactConversationComplete()) {
      return
    }
    if (el.artifactBrandReferenceInput.disabled) {
      return
    }
    el.artifactBrandProfileSelect.value = ARTIFACT_BRAND_REFERENCE_VALUE
    state.artifact.conversationAnswers.brandProfileName = ''
    el.artifactBrandReferenceInput.click()
  }

  function syncArtifactConversationUi() {
    const currentStep = getArtifactConversationStep()
    const canEditArtifact = Boolean(state.artifact.html) && isArtifactConversationComplete()
    el.artifactPromptInput.setAttribute(
      'data-placeholder',
      currentStep
        ? currentStep.placeholder
        : canEditArtifact
          ? ARTIFACT_EDIT_PLACEHOLDER
          : ARTIFACT_DEFAULT_PLACEHOLDER
    )
    refreshComposerPlaceholder(el.artifactPromptInput)
    renderArtifactConversation()
    syncArtifactComposerModeLabel()
    syncArtifactComposerBusyState()
    syncArtifactIntakeBuildNowButton()
    if (state.artifact.busy) {
      return
    }
    if (currentStep) {
      return
    }
  }

  function syncArtifactIntakeBuildNowButton() {
    const intake = state.artifact.intake
    const hasUserMessage = intake.messages.some((message) => message.role === 'user')
    const show =
      !isArtifactConversationComplete() &&
      hasUserMessage &&
      !intake.busy &&
      !state.artifact.busy
    el.artifactIntakeBuildNow.classList.toggle('hidden', !show)
    el.artifactIntakeBuildNow.setAttribute('aria-hidden', show ? 'false' : 'true')
  }

  function renderArtifactConversation() {
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
      const intake = state.artifact.intake
      for (const message of intake.messages) {
        fragment.appendChild(
          createArtifactChatMessage(
            message.text,
            message.role === 'user' ? 'user' : 'assistant'
          )
        )
      }
      if (intake.busy) {
        const thinking = createArtifactChatMessage(getArtifactIntakeThinkingText(), 'assistant')
        thinking.classList.add('artifact-intake-thinking')
        fragment.appendChild(thinking)
      } else if (shouldShowArtifactBrandChips()) {
        fragment.appendChild(createArtifactBrandChipsRow())
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

  function getArtifactConversationStep() {
    if (isArtifactConversationComplete()) {
      return null
    }
    const intake = state.artifact.intake
    const userTurns = intake.messages.filter((message) => message.role === 'user').length
    let lastQuestion = ''
    for (let index = intake.messages.length - 1; index >= 0; index -= 1) {
      if (intake.messages[index].role === 'assistant') {
        lastQuestion = asText(intake.messages[index].text)
        break
      }
    }
    // The key mirrors the legacy fixed steps so key-driven UI keeps working
    // unchanged: the first question behaves like 'artifactType' (inline image
    // paperclip available), every later question behaves like
    // 'designGuidelines' (brand profile row shown).
    return {
      key: userTurns === 0 ? 'artifactType' : 'designGuidelines',
      question: lastQuestion || ARTIFACT_CONVERSATION_STEPS[0].question,
      placeholder:
        userTurns === 0
          ? ARTIFACT_CONVERSATION_STEPS[0].placeholder
          : ARTIFACT_DEFAULT_PLACEHOLDER
    }
  }

  function isArtifactConversationComplete() {
    // intake.done is the conversational path; the step-index clause keeps the
    // legacy direct assignments working (e.g. loading a saved artifact marks
    // the conversation complete by setting the index past the steps).
    return (
      Boolean(state.artifact.intake?.done) ||
      state.artifact.conversationStepIndex >= ARTIFACT_CONVERSATION_STEPS.length
    )
  }



  function buildArtifactConversationSummary(answers) {
    const artifactType = asText(answers?.artifactType).trim()
    const mergedGuidelines = mergeArtifactDesignGuidelines(answers || {})
    const brandProfileName = asText(answers?.brandProfileName).trim()
    const parts = []
    if (artifactType) {
      parts.push(`Type: ${artifactType}`)
    }
    if (brandProfileName) {
      parts.push(`Brand: ${brandProfileName}`)
    }
    if (mergedGuidelines) {
      parts.push(`Guidelines: ${mergedGuidelines}`)
    }
    if (parts.length === 0) {
      return ''
    }
    return `Current artifact brief\n${parts.join('\n')}`
  }

  function setArtifactStagePlaceholder(text, type = 'pending') {
    el.artifactStagePlaceholder.textContent =
      asText(text) || 'Artifact wizard is ready. Answer the questions to generate your artifact.'
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
    const currentStep = getArtifactConversationStep()
    if (currentStep?.key === 'designGuidelines') {
      const sel = asText(el.artifactBrandProfileSelect.value).trim()
      if (sel === ARTIFACT_BRAND_REFERENCE_VALUE) {
        state.artifact.conversationAnswers.brandProfileName = ''
      } else {
        state.artifact.conversationAnswers.brandProfileName = sel
      }
    }
    // Serialize the composer: inline image chips become `[attached image: <url>]`
    // markers at their exact position, so the answer text reads like the user's prompt
    // with each image sitting next to the element it describes. The attachments list
    // carries the hosted URLs for the attachedImageUrls / reference_images channels.
    const submission = serializeComposer(el.artifactPromptInput)
    const answer = asText(submission.text).trim()
    const attachmentUrls = submission.attachments.map((a) => a.url).filter(Boolean)
    // Block submit while any chip is still uploading (its marker would be missing).
    const hasPendingUpload = Array.from(state.artifact.attachments.values()).some(
      (entry) => entry.status === 'uploading'
    )
    if (hasPendingUpload) {
      el.artifactTypeReferenceStatus.textContent = 'Wait for attached images to finish uploading…'
      return
    }
    const brandName = asText(state.artifact.conversationAnswers?.brandProfileName).trim()
    const refGuidelines = asText(state.artifact.conversationAnswers?.referenceImageGuidelines).trim()
    if (currentStep?.key === 'designGuidelines') {
      if (!answer && !brandName && !refGuidelines) {
        appendArtifactEditMessage(
          'assistant',
          'Add design notes, choose a saved brand profile, and/or upload a reference image for guidelines.'
        )
        return
      }
    } else if (!answer) {
      appendArtifactEditMessage('assistant', 'Answer the current artifact question first.')
      return
    }
    if (Boolean(state.artifact.html) && isArtifactConversationComplete()) {
      void enqueueArtifactEditPrompt(answer, attachmentUrls)
      return
    }
    if (isArtifactConversationComplete()) {
      resetArtifactConversation({ preserveInput: true })
    }
    void submitArtifactConversationAnswer(answer, attachmentUrls)
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
    if (tone !== 'user') {
      setEditorShellExpanded(true)
    }
  }

  function handleArtifactComposerFabClick() {
    if (!state.artifact.html || currentTheme.visualMode !== ARTIFACT_VISUAL_MODE) {
      return
    }
    setArtifactComposerFloatingOpen(true)
  }

  function handleArtifactFrameLoad() {
    artifactBridge.handleFrameLoad()
    scheduleAiChatShellIframeAnchor()
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
      message.type === ARTIFACT_RENDER_ERROR_MESSAGE_TYPE ||
      message.type === ARTIFACT_TEXT_EDIT_MESSAGE_TYPE ||
      message.type === ARTIFACT_TEXT_HTML_MESSAGE_TYPE ||
      message.type === ARTIFACT_TEXT_FOCUS_MESSAGE_TYPE ||
      message.type === ARTIFACT_ELEMENT_SELECTED_MESSAGE_TYPE ||
      message.type === ARTIFACT_POSITION_CHANGED_MESSAGE_TYPE ||
      message.type === ARTIFACT_SIZE_CHANGED_MESSAGE_TYPE ||
      message.type === ARTIFACT_ELEMENT_DELETED_MESSAGE_TYPE ||
      message.type === ARTIFACT_HISTORY_SHORTCUT_MESSAGE_TYPE
    if (isArtifactFrameMessage && Number(message.instanceId) !== state.artifact.instanceId) {
      return
    }
    if (message.type === ARTIFACT_READY_MESSAGE_TYPE) {
      artifactBridge.handleReadyMessage()
      return
    }
    if (message.type === ARTIFACT_SIZE_MESSAGE_TYPE) {
      // Iframe layout is locked to the stage; child size pings are ignored (see artifact-bridge).
      return
    }
    if (message.type === ARTIFACT_RENDER_OK_MESSAGE_TYPE) {
      confirmArtifactRenderSuccess(message.renderHealth)
      return
    }
    if (message.type === ARTIFACT_RENDER_ERROR_MESSAGE_TYPE) {
      handleArtifactRenderError(message)
      return
    }
    if (message.type === ARTIFACT_TEXT_EDIT_MESSAGE_TYPE) {
      artifactTextEdit.handleTextEdit(message)
      return
    }
    if (message.type === ARTIFACT_ELEMENT_SELECTED_MESSAGE_TYPE) {
      artifactSelection.handleElementSelected(message)
      return
    }
    if (message.type === ARTIFACT_POSITION_CHANGED_MESSAGE_TYPE) {
      artifactPosition.handlePositionChanged(message)
      return
    }
    if (message.type === ARTIFACT_SIZE_CHANGED_MESSAGE_TYPE) {
      artifactSize.handleSizeChanged(message)
      return
    }
    if (message.type === ARTIFACT_ELEMENT_DELETED_MESSAGE_TYPE) {
      artifactDelete.handleElementDeleted(message)
      return
    }
    if (message.type === ARTIFACT_HIDDEN_APPLIED_MESSAGE_TYPE) {
      // The iframe finished applying hidden (delete) overrides and the browser
      // has had a frame to paint them. Safe to reveal the masked frame now —
      // deleted elements are invisible, so there's no load flicker.
      revealArtifactFrame()
      return
    }
    if (message.type === ARTIFACT_HISTORY_SHORTCUT_MESSAGE_TYPE) {
      // Shortcut forwarded from the iframe bridge. Same arbitration as the
      // host-side keydown listener — run undo or redo via artifactHistory.
      if (message.action === 'redo') {
        artifactHistory.redo()
      } else if (message.action === 'undo') {
        artifactHistory.undo()
      }
      return
    }
    if (message.type === ARTIFACT_TEXT_FOCUS_MESSAGE_TYPE) {
      handleArtifactTextFocusMessage(message)
      return
    }
    if (message.type === ARTIFACT_TEXT_HTML_MESSAGE_TYPE) {
      handleArtifactTextHtmlMessage(message)
    }
  }

  function confirmArtifactRenderSuccess(renderHealth) {
    const normalizedRenderHealth =
      renderHealth && typeof renderHealth === 'object' ? renderHealth : null
    if (
      state.artifact.pendingRequestKind === 'edit' &&
      shouldRejectArtifactRenderHealth(normalizedRenderHealth, state.artifact.activeEditRequest)
    ) {
      artifactBridge.clearRenderWatchdog()
      handleArtifactRenderError({
        message: buildArtifactRenderHealthErrorMessage(normalizedRenderHealth),
        failureCount: 3,
        recoverable: false
      })
      return
    }
    artifactBridge.clearRenderWatchdog()
    state.artifact.renderConfirmed = true
    state.artifact.renderErrorCount = 0
    if (state.artifact.html) {
      state.artifact.lastStableHtml = state.artifact.html
      state.artifact.lastStablePackage = state.artifact.package
        ? buildSegmentedArtifactPackage(state.artifact.package)
        : buildSegmentedArtifactPackage(state.artifact.html)
    }
    state.artifact.rollbackHtml = ''
    state.artifact.rollbackPackage = null
    state.artifact.activeEditRequest = ''
    state.artifact.pendingSuccessMessage = ''
    state.artifact.pendingRequestKind = ''
    // Push persisted style overrides after scanAndEnableEditing has run. The
    // bridge scans at 150ms (see runtime.js), so 160ms clears the scan with a
    // small margin while keeping the masked window short. The frame is masked
    // until just after this push so the user never sees the un-edited paint;
    // revealed one frame later (190ms) once the iframe has applied them.
    setTimeout(pushArtifactStyleOverrides, 160)
    setTimeout(pushArtifactPositionOverrides, 160)
    setTimeout(pushArtifactSizeOverrides, 160)
    setTimeout(pushArtifactHiddenOverrides, 160)
    setTimeout(pushArtifactGridConfig, 160)
    // Deleted elements are baked into the srcdoc (never paint visible), so the
    // reveal no longer needs to wait on the hide. Position/size/text overrides
    // apply fast once pushed, so reveal one frame after the push for all cases.
    setTimeout(revealArtifactFrame, 190)
  }

  function handleArtifactRenderError(message) {
    // A failed render won't push overrides, so drop the load mask immediately
    // rather than waiting on its safety timeout — the user should see whatever
    // rendered (or the error state) without delay.
    revealArtifactFrame()
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
    const failedArtifactPackage = state.artifact.package
      ? buildSegmentedArtifactPackage(state.artifact.package)
      : null
    const rollbackHtml = normalizeArtifactMarkup(
      state.artifact.rollbackHtml || state.artifact.lastStableHtml
    )
    const rollbackPackage = state.artifact.rollbackPackage
      ? buildSegmentedArtifactPackage(state.artifact.rollbackPackage)
      : state.artifact.lastStablePackage
        ? buildSegmentedArtifactPackage(state.artifact.lastStablePackage)
        : buildSegmentedArtifactPackage(rollbackHtml)
    if (!rollbackHtml) {
      return
    }
    const detail = asText(errorMessage)
    const statusMessage = 'Artifact edit was reverted because the updated artifact failed to render.'
    state.artifact.pendingSuccessMessage = ''
    applyArtifactMarkup(rollbackHtml, { requestKind: 'rollback', artifactPackage: rollbackPackage })
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
      appendArtifactEditMessage(
        'assistant',
        detail ? `${retryMessage} ${detail}` : retryMessage
      )
      void submitArtifactRuntimeRepairRequest({
        request: state.artifact.activeEditRequest,
        runtimeError: detail,
        failedArtifactHtml,
        failedArtifactPackage,
        baseArtifactHtml: rollbackHtml,
        baseArtifactPackage: rollbackPackage
      })
      return
    }
    appendArtifactEditMessage(
      'assistant',
      detail ? `${statusMessage} ${detail}` : statusMessage
    )
  }

  function collectArtifactBrandProfileNames() {
    return Array.from(el.artifactBrandProfileSelect.options)
      .map((option) => asText(option.value).trim())
      .filter((value) => value && value !== ARTIFACT_BRAND_REFERENCE_VALUE)
  }

  function clearArtifactEditPromptQueue() {
    state.artifact.editPromptQueue = []
    state.artifact.editQueueActivePrompt = ''
    renderArtifactPromptQueue()
    syncArtifactComposerBusyState()
  }

  function renderArtifactPromptQueue() {
    const items = []
    if (state.artifact.editQueueActivePrompt) {
      items.push({ label: 'Running', text: state.artifact.editQueueActivePrompt })
    }
    for (const item of state.artifact.editPromptQueue.slice(0, 4)) {
      items.push({ label: 'Queued', text: item.prompt })
    }
    if (items.length === 0) {
      el.artifactPromptQueue.classList.add('hidden')
      el.artifactPromptQueue.replaceChildren()
      el.artifactComposer.classList.add('artifact-composer--queue-hidden')
      return
    }
    el.artifactPromptQueue.classList.remove('hidden')
    el.artifactComposer.classList.remove('artifact-composer--queue-hidden')
    el.artifactPromptQueue.replaceChildren()
    const label = document.createElement('span')
    label.className = 'ai-chat-queue-label'
    label.textContent = 'Prompt Queue'
    el.artifactPromptQueue.appendChild(label)
    for (const item of items) {
      const chip = document.createElement('span')
      chip.className = 'ai-chat-queue-item'
      chip.textContent = `${item.label}: ${trimForQueueLabel(item.text)}`
      el.artifactPromptQueue.appendChild(chip)
    }
    setEditorShellExpanded(true)
  }

  async function submitArtifactPrompt(prompt, options = {}) {
    if (state.artifact.busy) {
      appendArtifactEditMessage(
        'assistant',
        'Artifact request is already running. Wait for it to finish.'
      )
      return
    }

    const requestKind = options.requestKind === 'edit' ? 'edit' : 'build'
    // Base64 vision payloads are only useful on the initial Anthropic build; edits send
    // hosted URLs only (the backend re-fetches them as Gemini vision).
    const referenceImages =
      requestKind === 'build' && Array.isArray(options.referenceImages)
        ? options.referenceImages
            .map((item) => ({
              media_type: asText(item?.media_type),
              data: asText(item?.data)
            }))
            .filter((item) => item.media_type && item.data)
        : null
    const attachedImageUrls = Array.isArray(options.attachedImageUrls)
      ? options.attachedImageUrls.map((url) => asText(url).trim()).filter(Boolean)
      : []
    const conversationAnswers =
      options.conversationAnswers && typeof options.conversationAnswers === 'object'
        ? options.conversationAnswers
        : state.artifact.lastAnswers
    const originalEditRequest = asText(options.originalEditRequest)
    state.artifact.busy = true
    syncArtifactComposerBusyState()
    state.artifact.lastPrompt = prompt
    state.artifact.lastAnswers = cloneArtifactConversationAnswers(conversationAnswers)
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
      const buildResult = await requestAiArtifactBuild(aiPrompt, context, {
        referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : null,
        attachedImageUrls: attachedImageUrls.length > 0 ? attachedImageUrls : null
      })
      const applied = applyArtifactMarkup(buildResult.html, {
        requestKind,
        artifactPackage: buildResult.package || null
      })
      if (!applied) {
        state.artifact.pendingSuccessMessage = ''
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
        const statusMessage =
          requestKind === 'edit' ? 'Artifact updated.' : 'Artifact generated.'
        if (requestKind === 'edit') {
          state.artifact.pendingSuccessMessage = statusMessage
        }
        if (requestKind === 'build') {
          clearArtifactBuildReferenceUi()
        }
      }
    } catch (error) {
      const message = `Artifact request failed: ${errorToMessage(error)}`
      state.artifact.pendingSuccessMessage = ''
      showArtifactStagePlaceholder(message, 'error')
      if (requestKind === 'edit') {
        appendArtifactEditMessage('assistant', message)
      }
    } finally {
      state.artifact.busy = false
      syncArtifactComposerBusyState()
    }
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

  function setEditorShellExpanded(expanded, options = {}) {
    state.editorShellExpanded = Boolean(expanded)
    syncEditorShellExpandedDom()
    scheduleAiChatShellIframeAnchor()
    if (options.persist !== false) {
      try {
        localStorage.setItem(EDITOR_SHELL_EXPANDED_KEY, state.editorShellExpanded ? '1' : '0')
      } catch {}
    }
  }

  function syncEditorShellExpandedDom() {
    const expanded = state.editorShellExpanded
    el.aiChatShell.classList.toggle('editor-shell--expanded', expanded)
    const label = expanded ? 'Show less' : 'Show history and activity'
    const icon = expanded ? '▼' : '▲'
    el.aiEditorShellToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
    el.aiEditorShellToggle.setAttribute('aria-label', label)
    el.aiEditorShellToggle.setAttribute('title', label)
    el.aiEditorShellToggle.textContent = icon
    if (el.artifactComposer.classList.contains('is-floating')) {
      el.artifactEditorShellToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
      el.artifactEditorShellToggle.setAttribute('aria-label', label)
      el.artifactEditorShellToggle.setAttribute('title', label)
      el.artifactEditorShellToggle.textContent = icon
    }
  }

  function handleEditorShellToggleClick() {
    setEditorShellExpanded(!state.editorShellExpanded)
  }

  function syncArtifactComposerPanelVisibilityToggleUi() {
    const hidden = el.artifactComposer.classList.contains('artifact-composer--panel-hidden')
    const modeLabel =
      Boolean(state.artifact.html) && isArtifactConversationComplete()
        ? 'Artifact editor'
        : 'Artifact wizard'
    const label = `${hidden ? 'Show' : 'Hide'} ${modeLabel} panel`
    el.artifactComposerVisibilityToggle.setAttribute('aria-expanded', hidden ? 'false' : 'true')
    el.artifactComposerVisibilityToggle.setAttribute('aria-label', label)
    el.artifactComposerVisibilityToggle.setAttribute('title', label)
  }

  function syncAiChatPanelVisibilityToggleUi() {
    const hidden = el.aiChatPanel.classList.contains('ai-chat-panel--panel-hidden')
    const label = hidden ? 'Show AI editor panel' : 'Hide AI editor panel'
    el.aiChatPanelVisibilityToggle.setAttribute('aria-expanded', hidden ? 'false' : 'true')
    el.aiChatPanelVisibilityToggle.setAttribute('aria-label', label)
    el.aiChatPanelVisibilityToggle.setAttribute('title', label)
  }

  function handleAiChatPanelVisibilityToggleClick(event) {
    event.preventDefault()
    el.aiChatPanel.classList.toggle('ai-chat-panel--panel-hidden')
    syncAiChatPanelVisibilityToggleUi()
    scheduleArtifactLayoutRefit({ includeSettledPass: false })
    scheduleEditorDockLayoutRefresh({ includeSettledPass: false })
  }

  function handleArtifactComposerVisibilityToggleClick(event) {
    event.preventDefault()
    el.artifactComposer.classList.toggle('artifact-composer--panel-hidden')
    syncArtifactComposerPanelVisibilityToggleUi()
    scheduleArtifactLayoutRefit({ includeSettledPass: false })
    scheduleEditorDockLayoutRefresh({ includeSettledPass: false })
  }

  /* ------------------------------------------------------------------
     Editor panel drag-to-resize
     ------------------------------------------------------------------ */
  const panelResize = { active: false, startY: 0, startH: 0, panel: null, handle: null, pointerId: null }
  const PANEL_MIN_HEIGHT = 120
  const PANEL_MAX_HEIGHT_VH = 0.7

  function handlePanelResizePointerDown(event) {
    if (!state.editorShellExpanded) return
    if (document.body.classList.contains('editor-docked')) return
    const handle = event.target.closest('.editor-panel-resize-handle')
    if (!handle) return
    const panel =
      el.aiChatShell.querySelector('.artifact-composer:not(.hidden)') ||
      el.aiChatShell.querySelector('.ai-chat-panel:not(.hidden)')
    if (!panel) return
    event.preventDefault()
    panelResize.active = true
    panelResize.startY = event.clientY
    panelResize.startH = panel.getBoundingClientRect().height
    panelResize.panel = panel
    panelResize.handle = handle
    panelResize.pointerId = event.pointerId
    // Capture the pointer on the handle so pointermove/up keep firing even when the
    // growing panel covers the artifact iframe (iframes otherwise swallow events,
    // freezing the drag).
    if (typeof handle.setPointerCapture === 'function' && event.pointerId != null) {
      try { handle.setPointerCapture(event.pointerId) } catch {}
    }
    document.body.classList.add('editor-panel-resizing')
    window.addEventListener('pointermove', handlePanelResizePointerMove)
    window.addEventListener('pointerup', handlePanelResizePointerUp)
    window.addEventListener('pointercancel', handlePanelResizePointerUp)
  }

  function handlePanelResizePointerMove(event) {
    if (!panelResize.active) return
    const delta = panelResize.startY - event.clientY
    const maxH = Math.round(window.innerHeight * PANEL_MAX_HEIGHT_VH)
    const newH = Math.round(
      Math.max(PANEL_MIN_HEIGHT, Math.min(maxH, panelResize.startH + delta))
    )
    el.aiChatShell.style.setProperty('--editor-panel-max-height', `${newH}px`)
  }

  function handlePanelResizePointerUp() {
    if (!panelResize.active) return
    panelResize.active = false
    panelResize.panel = null
    if (
      panelResize.handle &&
      panelResize.pointerId != null &&
      typeof panelResize.handle.releasePointerCapture === 'function'
    ) {
      try { panelResize.handle.releasePointerCapture(panelResize.pointerId) } catch {}
    }
    panelResize.handle = null
    panelResize.pointerId = null
    document.body.classList.remove('editor-panel-resizing')
    window.removeEventListener('pointermove', handlePanelResizePointerMove)
    window.removeEventListener('pointerup', handlePanelResizePointerUp)
    window.removeEventListener('pointercancel', handlePanelResizePointerUp)
    const value = el.aiChatShell.style.getPropertyValue('--editor-panel-max-height').trim()
    if (value) {
      try { localStorage.setItem(EDITOR_PANEL_HEIGHT_KEY, value) } catch {}
    }
  }

  function restoreEditorPanelHeight() {
    const saved = safeStorageGet(EDITOR_PANEL_HEIGHT_KEY)
    if (saved) {
      el.aiChatShell.style.setProperty('--editor-panel-max-height', saved)
    }
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
    el.aiChatForm.requestSubmit()
  }

  function handleArtifactPromptInputKeydown(event) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    el.artifactPromptForm.requestSubmit()
  }

  function handleArtifactPromptInputInput() {
    // Reconcile attachment state with the DOM: a chip the user deleted with Backspace
    // (rather than its × button) leaves an orphaned Map entry — drop it and revoke its
    // preview object URL so collectReadyAttachmentUrls stays in sync.
    const presentIds = new Set(
      Array.from(el.artifactPromptInput.querySelectorAll('.artifact-image-chip')).map(
        (chip) => chip.dataset.attachmentId
      )
    )
    for (const id of Array.from(state.artifact.attachments.keys())) {
      if (!presentIds.has(id)) {
        state.artifact.attachments.delete(id)
        revokeAttachmentObjectUrl(id)
      }
    }
    refreshComposerPlaceholder(el.artifactPromptInput)
  }

  /** FAB is unused in viewport-fixed dock; when hidden, do not expose aria-expanded on a non-disclosure control. */
  function syncAiChatFabAccessibility() {
    const shellViewportDock = el.aiChatShell.classList.contains(
      'ai-chat-shell--viewport-fixed',
    )
    if (shellViewportDock) {
      el.aiChatFab.removeAttribute('aria-expanded')
      return
    }
    if (el.aiChatFab.classList.contains('hidden')) {
      el.aiChatFab.removeAttribute('aria-expanded')
      return
    }
    el.aiChatFab.setAttribute('aria-expanded', state.ai.open ? 'true' : 'false')
  }

  function setAiChatOpen(open, options = {}) {
    const persist = options.persist !== false
    const wantOpen = Boolean(open)
    const isArtifactMode = currentTheme.visualMode === ARTIFACT_VISUAL_MODE
    const shellViewportDock = el.aiChatShell.classList.contains(
      'ai-chat-shell--viewport-fixed',
    )
    el.aiChatShell.classList.toggle('hidden', isArtifactMode)
    if (isArtifactMode) {
      state.ai.open = wantOpen
      el.aiChatPanel.classList.add('hidden')
      el.aiChatFab.classList.add('hidden')
      el.aiChatShell.classList.remove('is-open', 'is-collapsed')
      syncAiChatFabAccessibility()
      syncEditorDockingState()
      if (persist) {
        try {
          localStorage.setItem(AI_CHAT_OPEN_KEY, state.ai.open ? '1' : '0')
        } catch {}
      }
      return
    }
    /* Poll AI in viewport-fixed dock: same open/close contract as before; FAB stays unused (CSS + hidden). */
    if (shellViewportDock) {
      state.ai.open = wantOpen
      el.aiChatPanel.classList.toggle('hidden', !state.ai.open)
      el.aiChatFab.classList.add('hidden')
      syncAiChatFabAccessibility()
      el.aiChatShell.classList.toggle('is-open', state.ai.open)
      el.aiChatShell.classList.toggle('is-collapsed', !state.ai.open)
      syncEditorDockingState()
      if (persist) {
        try {
          localStorage.setItem(AI_CHAT_OPEN_KEY, state.ai.open ? '1' : '0')
        } catch {}
      }
      if (state.ai.open) {
        requestAnimationFrame(() => {
          syncAiChatMessagesScroll()
          requestAnimationFrame(syncAiChatMessagesScroll)
        })
        window.setTimeout(() => {
          el.aiChatInput.focus()
          syncAiChatMessagesScroll()
        }, 0)
      }
      return
    }
    state.ai.open = wantOpen
    el.aiChatPanel.classList.toggle('hidden', !state.ai.open)
    el.aiChatFab.classList.toggle('hidden', state.ai.open)
    el.aiChatShell.classList.toggle('is-open', state.ai.open)
    el.aiChatShell.classList.toggle('is-collapsed', !state.ai.open)
    syncAiChatFabAccessibility()
    syncEditorDockingState()
    if (persist) {
      try {
        localStorage.setItem(AI_CHAT_OPEN_KEY, state.ai.open ? '1' : '0')
        } catch {}
    }
    if (state.ai.open) {
      requestAnimationFrame(() => {
        syncAiChatMessagesScroll()
        requestAnimationFrame(syncAiChatMessagesScroll)
      })
      window.setTimeout(() => {
        el.aiChatInput.focus()
        syncAiChatMessagesScroll()
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
      return
    }
    state.ai.busy = true
    state.ai.activePrompt = next.prompt
    renderAiChatQueue()

    try {
      const context = buildAiEditorContext()
      const plan = await requestAiEditPlan(next.prompt, context)
      const outcome = applyAiPlanActions(plan)
      appendAiChatMessage('assistant', summarizeAiOutcome(plan, outcome))
    } catch (error) {
      const message = errorToMessage(error)
      appendAiChatMessage('system', `Unable to apply edit: ${message}`)
    } finally {
      state.ai.busy = false
      state.ai.activePrompt = ''
      renderAiChatQueue()
      if (state.ai.queue.length > 0) {
        window.setTimeout(() => {
          void processAiPromptQueue()
        }, 0)
      }
    }
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
      el.aiChatPanel.classList.add('ai-chat-panel--queue-hidden')
      return
    }
    el.aiChatQueue.classList.remove('hidden')
    el.aiChatPanel.classList.remove('ai-chat-panel--queue-hidden')
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
    setEditorShellExpanded(true)
  }

  function syncAiChatMessagesScroll() {
    const box = el.aiChatMessages
    const inner = el.aiChatMessagesInner
    if (!box || !inner) {
      return
    }
    const count = inner.children.length
    if (count <= 1) {
      box.scrollTop = 0
      return
    }
    box.scrollTop = Math.max(0, box.scrollHeight - box.clientHeight)
  }

  function trimForQueueLabel(text, maxLength = 40) {
    const value = asText(text)
    if (value.length <= maxLength) {
      return value
    }
    return `${value.slice(0, maxLength - 1)}...`
  }

  function appendAiChatMessage(role, text, options = {}) {
    const message = asText(text)
    if (!message) {
      return
    }
    const normalizedRole =
      role === 'user' || role === 'assistant' || role === 'system' ? role : 'assistant'
    const node = document.createElement('article')
    node.className = `ai-chat-message message-${normalizedRole}`
    node.textContent = message
    el.aiChatMessagesInner.appendChild(node)
    while (el.aiChatMessagesInner.children.length > AI_CHAT_MAX_MESSAGES) {
      el.aiChatMessagesInner.removeChild(el.aiChatMessagesInner.firstElementChild)
    }
    if (
      !options.skipShellExpand &&
      (normalizedRole === 'assistant' || normalizedRole === 'system')
    ) {
      setEditorShellExpanded(true)
    }
    syncAiChatMessagesScroll()
    requestAnimationFrame(() => {
      syncAiChatMessagesScroll()
      requestAnimationFrame(syncAiChatMessagesScroll)
    })
  }





  function applyArtifactMarkup(markup, options = {}) {
    const normalized = normalizeArtifactMarkup(markup)
    if (!normalized) {
      return false
    }
    const packageInput =
      options && typeof options === 'object' ? options.artifactPackage || null : null
    const normalizedPackage = buildSegmentedArtifactPackage(
      sanitizeArtifactPackage(packageInput, normalized) || normalized
    )
    const resolvedMarkup = resolveArtifactHtmlFromPackage(normalizedPackage) || normalized
    if (!resolvedMarkup) {
      return false
    }
    artifactBridge.clearRenderWatchdog()
    const requestKind = asText(options.requestKind).toLowerCase()
    // Diagnostic: stash which path applyArtifactMarkup is on so we can
    // tell from console whether AI edits are routing through 'edit'
    // (which preserves overrides) or 'build' (which wipes them).
    try {
      window.__prezoDebug = window.__prezoDebug || {}
      window.__prezoDebug.lastApply = {
        ts: Date.now(),
        requestKind,
        hadPendingPositions: Object.keys(artifactPosition.getPendingPositionOverrides() || {}).length,
        savedKeysBefore: Object.keys(state.artifact.savedStyleOverrides || {})
      }
      console.log('[prezo-debug] applyArtifactMarkup', window.__prezoDebug.lastApply)
    } catch (e) {}
    if (requestKind === 'edit') {
      state.artifact.rollbackHtml = normalizeArtifactMarkup(
        state.artifact.lastStableHtml || state.artifact.html
      )
      state.artifact.rollbackPackage = state.artifact.lastStablePackage
        ? buildSegmentedArtifactPackage(state.artifact.lastStablePackage)
        : state.artifact.package
          ? buildSegmentedArtifactPackage(state.artifact.package)
          : null
      state.artifact.pendingRequestKind = 'edit'
    } else if (requestKind === 'build') {
      state.artifact.rollbackHtml = ''
      state.artifact.rollbackPackage = null
      state.artifact.pendingRequestKind = 'build'
      pendingArtifactCopyOverrides = {}
      // Fresh build replaces the artifact entirely — drop any pending
      // position/size drags that belonged to the prior artifact.
      artifactPosition.clearPendingPositionOverrides()
      artifactSize.clearPendingSizeOverrides()
      artifactHistory.clear()
    } else {
      state.artifact.rollbackHtml = ''
      state.artifact.rollbackPackage = null
      state.artifact.pendingRequestKind = ''
      pendingArtifactCopyOverrides = {}
      artifactPosition.clearPendingPositionOverrides()
      artifactSize.clearPendingSizeOverrides()
      artifactHistory.clear()
    }
    state.artifact.pendingSuccessMessage = ''
    artifactBridge.clearPostLoadReplays()
    artifactBridge.clearPendingPayloadTimer()
    hideArtifactTextToolbar()
    state.artifact.html = resolvedMarkup
    state.artifact.package = normalizedPackage
    state.artifact.instanceId += 1
    artifactSelection.clearSelection()
    state.artifact.frameReady = false
    state.artifact.renderConfirmed = false
    state.artifact.renderErrorCount = 0
    state.artifact.lastPayloadKey = ''
    state.artifact.lastDeliveredPayload = null
    state.artifact.pendingPayload = null
    state.artifact.reportedContentWidth = 0
    state.artifact.reportedContentHeight = 0
    state.artifact.floatingOpen = true
    // Bake the deleted-element hide stylesheet into the srcdoc so deleted
    // elements never paint visible on load — eliminates the flicker at the
    // source, no masking/wait needed. Built from saved + pending hidden
    // overrides (pending wins), matching what pushArtifactHiddenOverrides sends.
    const bakedHiddenCss = buildArtifactHiddenCss(
      mergeCopyIntoStyleOverrides(
        { ...(state.artifact.savedStyleOverrides || {}) },
        { hiddenOverrides: artifactDelete.getPendingHiddenOverrides() }
      )
    )
    const srcDoc = buildArtifactSrcDoc(resolvedMarkup, {
      instanceId: state.artifact.instanceId,
      hiddenCss: bakedHiddenCss,
      activityKind: state.activityKind
    })
    if (!srcDoc) {
      return false
    }
    artifactBridge.setFrameHeight(520, { force: true })
    // Hide the frame before it paints if this artifact has manual edits, so the
    // un-edited version is never shown before the overrides land. Revealed in
    // confirmArtifactRenderSuccess after the override push (with a safety
    // timeout inside the mask helper).
    maskArtifactFrameForOverrides()
    el.artifactFrame.srcdoc = srcDoc
    syncArtifactComposerVisibility()
    if (requestKind === 'edit') {
      // Preserve any pending position/size drags through an AI edit by
      // folding them into the savedStyleOverrides map alongside text/copy
      // overrides BEFORE clearing pendings.
      const pendingCopyWithPositions = {
        ...pendingArtifactCopyOverrides,
        positionOverrides: artifactPosition.getPendingPositionOverrides(),
        sizeOverrides: artifactSize.getPendingSizeOverrides(),
        hiddenOverrides: artifactDelete.getPendingHiddenOverrides()
      }
      const merged = mergeCopyIntoStyleOverrides(
        { ...(state.artifact.savedStyleOverrides || {}), ...pendingArtifactStyleOverrides },
        pendingCopyWithPositions
      )
      pendingArtifactStyleOverrides = {}
      pendingArtifactCopyOverrides = {}
      artifactPosition.clearPendingPositionOverrides()
      artifactSize.clearPendingSizeOverrides()
      artifactDelete.clearPendingHiddenOverrides()
      // AI edits rebuild the DOM — prior undo entries reference nodes that
      // may no longer exist or whose stable ids have shifted.
      artifactHistory.clear()
      const nextOverrides = { ...merged }
      // Drop overrides whose underlying element the AI just changed. This
      // resolves the conflict where the user manually colors the title red,
      // then asks the AI for blue — without this, the red override would
      // re-apply and overwrite the AI's blue.
      const priorHtmlForDiff = asText(state.artifact.rollbackHtml || state.artifact.lastStableHtml)
      dropOverridesAiChanged(nextOverrides, priorHtmlForDiff, resolvedMarkup)
      pruneStalePollStyleOverridesInStore(nextOverrides, state.currentPoll)
      state.artifact.savedStyleOverrides = nextOverrides
      // Diagnostic: expose state for inspection. Remove after debugging.
      try {
        window.__prezoDebug = window.__prezoDebug || {}
        window.__prezoDebug.lastAiEdit = {
          ts: Date.now(),
          savedKeys: Object.keys(nextOverrides),
          savedFull: JSON.parse(JSON.stringify(nextOverrides)),
          priorHtmlLen: (priorHtmlForDiff || '').length,
          newHtmlLen: (resolvedMarkup || '').length,
          priorHtml: priorHtmlForDiff || '',
          newHtml: resolvedMarkup || ''
        }
        console.log('[prezo-debug] saved after AI edit:', window.__prezoDebug.lastAiEdit)
      } catch (e) { console.warn('[prezo-debug] failed', e) }
    }
    return true
  }

  function clearArtifactMarkup() {
    artifactBridge.clearRenderWatchdog()
    artifactBridge.clearPostLoadReplays()
    artifactBridge.clearPendingPayloadTimer()
    state.artifact.html = ''
    state.artifact.package = null
    state.artifact.lastStableHtml = ''
    state.artifact.lastStablePackage = null
    state.artifact.rollbackHtml = ''
    state.artifact.rollbackPackage = null
    state.artifact.pendingSuccessMessage = ''
    state.artifact.instanceId += 1
    artifactSelection.clearSelection()
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
    pendingArtifactCopyOverrides = {}
    artifactPosition.clearPendingPositionOverrides()
    artifactSize.clearPendingSizeOverrides()
    artifactHistory.clear()
    clearArtifactEditPromptQueue()
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
    // Re-push style overrides after each render so the renderer doesn't
    // permanently destroy manually styled HTML (subtitle, footer, stats, etc.).
    // Delay must exceed bridge batch (90ms) + renderer + scan (60ms).
    setTimeout(pushArtifactStyleOverrides, 160)
    setTimeout(pushArtifactPositionOverrides, 160)
    setTimeout(pushArtifactSizeOverrides, 160)
    setTimeout(pushArtifactHiddenOverrides, 160)
    setTimeout(pushArtifactGridConfig, 160)
  }











  function pushArtifactQnaState(view, options = {}) {
    if (currentTheme.visualMode !== ARTIFACT_VISUAL_MODE || !view) {
      return
    }
    const force = Boolean(options.force)
    const payload = buildArtifactQnaPayload(view)
    const payloadKey = buildArtifactQnaPayloadKey(payload)
    if (!state.artifact.frameReady || !el.artifactFrame.contentWindow) {
      state.artifact.pendingPayload = payload
      return
    }
    if (!force && payloadKey === state.artifact.lastPayloadKey) {
      return
    }
    artifactBridge.queuePayload(payload, { force })
    // Same override re-push discipline as pushArtifactPollState: the renderer
    // may rebuild question rows, so manual styling must be re-applied.
    setTimeout(pushArtifactStyleOverrides, 160)
    setTimeout(pushArtifactPositionOverrides, 160)
    setTimeout(pushArtifactSizeOverrides, 160)
    setTimeout(pushArtifactHiddenOverrides, 160)
    setTimeout(pushArtifactGridConfig, 160)
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
        const patch = sanitizeAiThemePatch(rawAction.theme, currentTheme)
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
    if (node.classList.contains('label')) {
      return 'label'
    }
    if (node.classList.contains('stats')) {
      return 'stats'
    }
    if (node.classList.contains('track')) {
      return 'bar'
    }
    if (node.classList.contains('option')) {
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
      postVisualModeToParent('history-snapshot')
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

  // ── Artifact iframe text style toolbar ──────────────────────────

  let artifactToolbarInteractionUntil = 0

  function markArtifactToolbarInteraction() {
    artifactToolbarInteractionUntil = Date.now() + 2000
  }

  function isArtifactToolbarInteractionActive() {
    return Date.now() < artifactToolbarInteractionUntil
  }

  function setupArtifactTextToolbar() {
    fillSelectOptions(
      [el.artifactTextFontFamily],
      TEXT_FONT_FAMILIES.map((fontName) => ({
        label: fontName,
        value: fontName,
        style: `font-family: "${fontName}", sans-serif`
      }))
    )
    fillSelectOptions(
      [el.artifactTextFontSize],
      TEXT_FONT_SIZES.map((fontSize) => ({
        label: String(fontSize),
        value: String(fontSize)
      }))
    )

    const toolbarControls = [
      el.artifactTextFontFamily,
      el.artifactTextFontSize,
      el.artifactTextFontColor,
      el.artifactTextToolBold,
      el.artifactTextToolItalic,
      el.artifactTextToolClear
    ]
    for (const ctrl of toolbarControls) {
      ctrl.addEventListener('pointerdown', () => markArtifactToolbarInteraction())
      ctrl.addEventListener('focus', () => markArtifactToolbarInteraction())
    }

    el.artifactTextFontFamily.addEventListener('change', () => {
      sendArtifactTextStyleCmd('fontFamily', normalizeFontFamilyChoice(el.artifactTextFontFamily.value))
      artifactToolbarInteractionUntil = 0
    })
    el.artifactTextFontSize.addEventListener('change', () => {
      const px = normalizeFontSizeCss(el.artifactTextFontSize.value)
      if (px) sendArtifactTextStyleCmd('fontSize', px)
      artifactToolbarInteractionUntil = 0
    })
    el.artifactTextFontColor.addEventListener('input', () => {
      sendArtifactTextStyleCmd('color', sanitizeHex(el.artifactTextFontColor.value, ''))
    })
    el.artifactTextFontColor.addEventListener('change', () => {
      sendArtifactTextStyleCmd('color', sanitizeHex(el.artifactTextFontColor.value, ''))
      artifactToolbarInteractionUntil = 0
    })
    el.artifactTextToolBold.addEventListener('click', () => {
      sendArtifactTextStyleCmd('bold', '')
      artifactToolbarInteractionUntil = 0
    })
    el.artifactTextToolItalic.addEventListener('click', () => {
      sendArtifactTextStyleCmd('italic', '')
      artifactToolbarInteractionUntil = 0
    })
    el.artifactTextToolClear.addEventListener('click', () => {
      sendArtifactTextStyleCmd('clear', '')
      artifactToolbarInteractionUntil = 0
    })
  }

  function sendArtifactTextStyleCmd(styleCmd, styleValue) {
    const frameWindow = el.artifactFrame.contentWindow
    if (!frameWindow) return
    frameWindow.postMessage(
      {
        type: ARTIFACT_TEXT_STYLE_MESSAGE_TYPE,
        instanceId: state.artifact.instanceId,
        styleCmd,
        styleValue
      },
      '*'
    )
  }

  function showArtifactTextToolbar(focusMessage) {
    const frameRect = el.artifactFrame.getBoundingClientRect()
    if (!frameRect || frameRect.width === 0) return

    // Sync current computed styles into the toolbar controls
    if (focusMessage.color) {
      const hex = normalizeColorToHex(focusMessage.color)
      if (hex) el.artifactTextFontColor.value = hex
    }
    if (focusMessage.fontSize) {
      const pts = normalizeFontSizeChoice(String(pxToPoints(focusMessage.fontSize)))
      syncTextSelectOption([el.artifactTextFontSize], pts)
    }
    if (focusMessage.fontFamily) {
      const fam = normalizeFontFamilyChoice(extractFontFamilyName(focusMessage.fontFamily))
      syncTextSelectOption([el.artifactTextFontFamily], fam)
    }

    // Position toolbar above the artifact frame, centred
    const toolbar = el.artifactTextToolbar
    const toolbarRect = toolbar.getBoundingClientRect()
    const toolbarW = toolbarRect.width || 360
    const toolbarH = toolbarRect.height || 42
    const margin = 8
    const screenPad = 8

    let left = frameRect.left + frameRect.width / 2 - toolbarW / 2
    let top = frameRect.top - toolbarH - margin

    if (top < screenPad) {
      top = frameRect.bottom + margin
    }
    left = clamp(left, screenPad, Math.max(screenPad, window.innerWidth - toolbarW - screenPad))
    top = clamp(top, screenPad, Math.max(screenPad, window.innerHeight - toolbarH - screenPad))

    toolbar.style.left = `${left}px`
    toolbar.style.top = `${top}px`
    toolbar.classList.add('visible')
    toolbar.setAttribute('aria-hidden', 'false')
  }

  function hideArtifactTextToolbar() {
    el.artifactTextToolbar.classList.remove('visible')
    el.artifactTextToolbar.setAttribute('aria-hidden', 'true')
  }

  function handleArtifactTextFocusMessage(message) {
    if (message.active) {
      showArtifactTextToolbar(message)
    } else if (!isArtifactToolbarInteractionActive()) {
      hideArtifactTextToolbar()
    }
  }

  /** In-memory style overrides for the current artifact session. Only written to
   *  localStorage when the user explicitly saves the artifact. */
  let pendingArtifactStyleOverrides = {}

  /** In-memory copy overrides (subtitle / footer suffix) for the current artifact session. */
  let pendingArtifactCopyOverrides = {}

  function handleArtifactTextHtmlMessage(message) {
    const field = typeof message.field === 'string' ? message.field : ''
    const html = typeof message.html === 'string' ? message.html : ''
    if (!field || !html) return
    if (isArtifactCopyField(field)) return
    const optionId = typeof message.optionId === 'string' ? message.optionId : ''
    const nodeKey = optionId ? `${field}:${optionId}` : field
    const priorHtml = typeof message.priorHtml === 'string' ? message.priorHtml : null
    const beforeStored = pendingArtifactStyleOverrides[nodeKey]
    pendingArtifactStyleOverrides[nodeKey] = html
    // Record an undo entry if the change is real (and we have a prior to
    // restore). Use the bridge-supplied priorHtml when available, falling
    // back to whatever we last stored in pendingArtifactStyleOverrides.
    const before = priorHtml !== null ? priorHtml : (typeof beforeStored === 'string' ? beforeStored : '')
    if (before !== html) {
      artifactHistory.push({
        kind: 'text-html',
        targetKey: nodeKey,
        before: { field, optionId, html: before },
        after: { field, optionId, html },
        label: `Style ${field}`,
        ts: Date.now()
      })
    }
  }

  /**
   * Called by the text-edit handler when a subtitle or footer field is edited.
   * Stores the copy locally — no force push needed because:
   *  - The user's typed text is already visible in the DOM.
   *  - The copy will be included in `meta.artifactCopy` on the next natural
   *    payload push (vote update, etc.) and reapplied after that render.
   *  - Force-pushing during editing triggers the animation system which can
   *    cause a full re-render that wipes all styled HTML.
   */
  function handleArtifactCopyEdit(field, text, extra) {
    if (field === 'subtitle') {
      pendingArtifactCopyOverrides.subtitle = text
    } else if (field === 'footer') {
      pendingArtifactCopyOverrides.footerSuffix = normalizeFooterTextToSuffix(text)
    } else if (field === 'text') {
      const stableId = extra && typeof extra.stableId === 'string' ? extra.stableId : ''
      if (!stableId) return
      if (!pendingArtifactCopyOverrides.textOverrides) {
        pendingArtifactCopyOverrides.textOverrides = {}
      }
      pendingArtifactCopyOverrides.textOverrides[stableId] = text
    }
  }

  /**
   * Apply a history entry in the given direction. For `undo` we apply the
   * entry's `before` snapshot; for `redo` we apply its `after` snapshot.
   * Mirrors the original commit paths so the result is indistinguishable
   * from the user redoing the action themselves.
   *
   * @param {{ kind: string, before: any, after: any }} entry
   * @param {'undo' | 'redo'} direction
   */
  function applyArtifactHistoryEntry(entry, direction) {
    if (!entry || !entry.kind) return
    const target = direction === 'undo' ? entry.before : entry.after
    if (!target) return
    if (entry.kind === 'position') {
      applyHistoryPositionEntry(target, entry.targetKey)
      return
    }
    if (entry.kind === 'size') {
      applyHistorySizeEntry(target, entry.targetKey)
      return
    }
    if (entry.kind === 'hidden') {
      applyHistoryHiddenEntry(target, entry.targetKey)
      return
    }
    if (entry.kind === 'text-content') {
      applyHistoryTextContentEntry(target)
      return
    }
    if (entry.kind === 'text-html') {
      applyHistoryTextHtmlEntry(target)
      return
    }
  }

  function applyHistoryPositionEntry(target, stableId) {
    // Mirror the position-change commit path: stash into pending overrides
    // and push a fresh position-init message so the iframe re-applies the
    // transforms.
    artifactPosition.handlePositionChanged({
      stableId,
      dx: target.dx,
      dy: target.dy,
      role: target.role,
      label: target.label,
      optionId: target.optionId,
      // Suppress further history recording when we re-emit via the handler.
      // The position handler doesn't currently re-fire onPositionChange for
      // history entries (priorDx/priorDy unset so the host filter drops
      // them) — so this is implicit, but make the intent explicit:
      priorDx: undefined,
      priorDy: undefined
    })
    pushArtifactPositionOverrides()
  }

  function applyHistorySizeEntry(target, stableId) {
    artifactSize.handleSizeChanged({
      stableId,
      sx: target.sx,
      sy: target.sy,
      role: target.role,
      label: target.label,
      optionId: target.optionId,
      anchor: target.anchor,
      priorSx: undefined,
      priorSy: undefined
    })
    pushArtifactSizeOverrides()
  }

  function applyHistoryHiddenEntry(target, stableId) {
    // Mirror the delete commit path: route the target visibility back through
    // the delete handler (priorHidden omitted so onDelete doesn't record a new
    // undo entry), then push a fresh hidden-init so the iframe shows/hides the
    // element. target.hidden === false on undo (restore), true on redo.
    artifactDelete.handleElementDeleted({
      stableId,
      hidden: target.hidden === true,
      role: target.role,
      label: target.label,
      cssLabel: target.cssLabel,
      optionId: target.optionId,
      anchor: target.anchor
    })
    pushArtifactHiddenOverrides()
  }

  function applyHistoryTextContentEntry(target) {
    const field = target.field
    const optionId = target.optionId || ''
    const text = typeof target.text === 'string' ? target.text : ''
    // Copy / generic text — route through the same persistence shape
    // handleArtifactCopyEdit uses.
    if (field === 'subtitle' || field === 'footer') {
      handleArtifactCopyEdit(field, text)
      pushArtifactPositionOverrides()  // no-op for copy but kept for symmetry
      return
    }
    if (field === 'text') {
      handleArtifactCopyEdit('text', text, { stableId: optionId })
      return
    }
    // Poll fields: question / option-label — PATCH the poll so the change
    // broadcasts to audience like a fresh edit. Use the existing textedit
    // handler's apply* helpers indirectly by re-sending a synthetic
    // prezo-text-edit message into it (no priorText so we don't loop).
    artifactTextEdit.handleTextEdit({ field, optionId, text })
  }

  function applyHistoryTextHtmlEntry(target) {
    const field = target.field
    const optionId = target.optionId || ''
    const html = typeof target.html === 'string' ? target.html : ''
    const nodeKey = optionId ? `${field}:${optionId}` : field
    if (html) {
      pendingArtifactStyleOverrides[nodeKey] = html
    } else {
      delete pendingArtifactStyleOverrides[nodeKey]
    }
    // Push styled HTML overrides back to the iframe so the rendered DOM
    // reflects the restored state immediately.
    pushArtifactStyleOverrides()
  }

  /**
   * Keyboard handler installed on the host document. The iframe bridge
   * installs its own equivalent so undo works whether the user's focus is
   * inside the artifact or anywhere in the taskpane chrome.
   */
  function handleHistoryKeydown(event) {
    const action = artifactHistory.classifyKeyEvent(event)
    if (!action) return
    // Ignore shortcuts while focus is inside a native input/textarea so we
    // don't fight the browser's built-in undo on form fields.
    const target = event.target
    if (target && target.tagName) {
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return
    }
    event.preventDefault()
    if (action === 'undo') {
      artifactHistory.undo()
    } else {
      artifactHistory.redo()
    }
  }

  /**
   * Build the merged copy object from saved + pending overrides for inclusion
   * in the artifact payload's `meta.artifactCopy`.
   */


  /**
   * Drop question / option-label override entries whose embedded plain text no longer
   * matches the live poll (same rules everywhere we merge or persist overrides).
   *
   * @param {Record<string, unknown>} store
   * @param {object | null | undefined} poll
   */
  function pruneStalePollStyleOverridesInStore(store, poll) {
    if (!poll || typeof poll !== 'object') {
      return
    }
    if (!store || typeof store !== 'object') {
      return
    }
    const expectedQuestion = normalizeWhitespace(asText(poll.question)).toLowerCase()
    const options = Array.isArray(poll.options) ? poll.options : []
    const optionById = new Map(
      options.map((opt) => [asText(opt?.id), opt]).filter(([id]) => Boolean(id))
    )

    const qHtml = store.question
    if (typeof qHtml === 'string' && qHtml.trim()) {
      const got = normalizeWhitespace(extractPlainTextFromHtml(qHtml)).toLowerCase()
      if (got !== expectedQuestion) {
        delete store.question
      }
    }
    for (const key of Object.keys(store)) {
      if (!key.startsWith('option-label:')) {
        continue
      }
      const optionId = key.slice('option-label:'.length)
      const opt = optionById.get(optionId)
      const html = store[key]
      if (typeof html !== 'string' || !html.trim()) {
        continue
      }
      if (!opt) {
        delete store[key]
        continue
      }
      const got = normalizeWhitespace(extractPlainTextFromHtml(html)).toLowerCase()
      const want = normalizeWhitespace(asText(opt.label)).toLowerCase()
      if (got !== want) {
        delete store[key]
      }
    }
  }

  /**
   * Drop overrides whose underlying element the AI just changed.
   *
   * Context: the user can manually edit text (color it red), drag elements,
   * and otherwise produce overrides that live in style_overrides. We
   * preserve those overrides through AI edits so a drag survives a styling
   * tweak. But when the AI INTENTIONALLY changes the same thing the
   * override was about (user asks 'make the title blue' after coloring it
   * red manually), the override should yield to the AI's new value.
   *
   * Detection: for each override key, locate the corresponding element in
   * both the prior HTML (what the artifact looked like before this AI
   * edit) and the new HTML (the AI's output). If the element's stable
   * signature differs between the two, the AI changed it — drop the
   * override. Conservative on uncertainty: an override we can't locate
   * in BOTH HTMLs is kept (preserves drags on decorative children, etc).
   *
   * Only the question / option-label / option-* / position override kinds
   * have a reliable locator in arbitrary AI HTML. Copy and generic text
   * overrides depend on stable DOM-path ids that don't survive AI
   * restructures — those are pruned elsewhere (pruneStalePollStyleOverridesInStore).
   *
   * @param {Record<string, unknown>} store
   * @param {string} priorHtml
   * @param {string} newHtml
   */
  function dropOverridesAiChanged(store, priorHtml, newHtml) {
    if (!store || typeof store !== 'object') return
    const prior = asText(priorHtml)
    const next = asText(newHtml)
    if (!prior || !next || prior === next) return
    let priorDoc, nextDoc
    try {
      const parser = new DOMParser()
      priorDoc = parser.parseFromString(prior, 'text/html')
      nextDoc = parser.parseFromString(next, 'text/html')
    } catch {
      return
    }
    if (!priorDoc || !nextDoc) return

    for (const key of Object.keys(store)) {
      if (key === 'question') {
        const target = locateQuestionInDoc(priorDoc)
        const aiTarget = locateQuestionInDoc(nextDoc)
        if (target && aiTarget && signaturesDiffer(target, aiTarget)) {
          delete store[key]
        }
        continue
      }
      if (key.startsWith('option-label:')) {
        const optionId = key.slice('option-label:'.length)
        const target = locateOptionLabelInDoc(priorDoc, optionId)
        const aiTarget = locateOptionLabelInDoc(nextDoc, optionId)
        if (target && aiTarget && signaturesDiffer(target, aiTarget)) {
          delete store[key]
        }
        continue
      }
      if (
        key.startsWith('option-votes:') ||
        key.startsWith('option-percentage:') ||
        key.startsWith('option-rank:')
      ) {
        // Stat fields: the renderer rewrites their text every vote, so the
        // diff signal we care about is whether the AI changed the
        // ENCLOSING option row's structure. If the row itself changed,
        // the stat field's prior styling is no longer meaningful.
        const colonIdx = key.indexOf(':')
        const optionId = key.slice(colonIdx + 1)
        const target = locateOptionRowInDoc(priorDoc, optionId)
        const aiTarget = locateOptionRowInDoc(nextDoc, optionId)
        if (target && aiTarget && signaturesDiffer(target, aiTarget)) {
          delete store[key]
        }
        continue
      }
      if (key.startsWith('__prezo_pos:')) {
        // Position overrides need careful handling because AI edits can
        // affect different elements than the user dragged:
        //   - User drags element A, asks AI to change A's position → AI
        //     moves A. We need to DROP A's override so the bridge doesn't
        //     re-apply the old drag on top of the AI's new position.
        //   - User drags element A, asks AI to change B → AI rewrites the
        //     whole artifact and may strip A's inline transform as a
        //     side-effect. We need to KEEP A's override so the bridge
        //     re-applies the drag on render. A's position is preserved.
        //
        // Detection: drop ONLY when the AI explicitly took control of
        // THIS element's position. Signals:
        //   - element has its own inline `transform:` in the AI's HTML
        //   - element has its own inline absolute/fixed positioning
        //   - element's parent layout changed meaningfully (parent class,
        //     parent inline style, sibling index)
        // Otherwise keep the override — the AI didn't move this element,
        // it just rewrote unrelated parts of the artifact.
        const stableId = key.slice('__prezo_pos:'.length)
        const parsed = safeParseJSON(store[key])
        const role = parsed && typeof parsed.role === 'string' ? parsed.role : ''
        const optionId = parsed && typeof parsed.optionId === 'string' ? parsed.optionId : ''
        const label = parsed && typeof parsed.label === 'string' ? parsed.label : ''
        const anchor = parsed && typeof parsed.anchor === 'string' ? parsed.anchor : ''
        const target = locatePositionTarget(priorDoc, stableId, role, optionId, label, anchor)
        const aiTarget = locatePositionTarget(nextDoc, stableId, role, optionId, label, anchor)
        // Diagnostic logging — remove once override-after-AI is verified
        // stable. Helps explain why a particular position override was
        // dropped on the user's machine.
        const diag = {
          key, role, optionId,
          priorFound: !!target,
          nextFound: !!aiTarget,
          aiInlineStyle: aiTarget ? (aiTarget.getAttribute('style') || '') : '',
          priorParentStyle: target && target.parentElement ? (target.parentElement.getAttribute('style') || '') : '',
          nextParentStyle: aiTarget && aiTarget.parentElement ? (aiTarget.parentElement.getAttribute('style') || '') : '',
          priorParentId: target && target.parentElement ? (target.parentElement.id || '') : '',
          nextParentId: aiTarget && aiTarget.parentElement ? (aiTarget.parentElement.id || '') : ''
        }
        // Diagnostic: stash every decision into window.__prezoDebug for
        // inspection. Remove once the override-after-AI behavior is stable.
        const recordDecision = (verdict, reason) => {
          try {
            window.__prezoDebug = window.__prezoDebug || {}
            window.__prezoDebug.overrideDecisions = window.__prezoDebug.overrideDecisions || []
            window.__prezoDebug.overrideDecisions.push({
              ts: Date.now(), verdict, reason, ...diag
            })
            console.log(`[prezo-position-override] ${verdict} (${reason})`, diag)
          } catch (e) {}
        }
        // Runtime-rendered case: the element is created by the artifact's
        // renderer at runtime (e.g. option rows built from poll data via
        // JS in <script>), so it doesn't appear in the parsed static HTML
        // on either side. We can still detect AI moves that ride on
        // stylesheet rules — the AI typically adds/edits a rule that
        // targets the row's container or class selector (e.g.
        // `.tower-col:nth-child(1) { order: 99 }`) and those rules ARE
        // present in the parsed <style>.
        if (!target && !aiTarget) {
          const runtimeSelectors = runtimeRenderedSelectors(priorDoc, nextDoc, role)
          if (runtimeSelectors.length) {
            const priorRules = extractLayoutRulesForSelectors(priorDoc, runtimeSelectors)
            const nextRules = extractLayoutRulesForSelectors(nextDoc, runtimeSelectors)
            if (priorRules !== nextRules) {
              recordDecision('DROP', 'stylesheet rules changed (runtime-rendered)')
              delete store[key]
              continue
            }
          }
          recordDecision('KEEP', 'runtime-rendered (not in static HTML)')
          continue
        }
        if (!aiTarget) {
          // Element existed in prior static HTML but the AI removed it.
          recordDecision('DROP', 'element removed by AI')
          delete store[key]
          continue
        }
        if (hasExplicitPositioning(aiTarget)) {
          recordDecision('DROP', 'AI explicit positioning')
          delete store[key]
          continue
        }
        if (target && parentLayoutChanged(target, aiTarget)) {
          recordDecision('DROP', 'parent layout changed')
          delete store[key]
          continue
        }
        // Detect AI moves made via CSS rules in <style> rather than inline
        // styles. The AI often rewrites a stylesheet rule like
        // `#poll-question { position: absolute; top: 0; right: 0 }` while
        // leaving the element's tag/class/inline-style unchanged. Without
        // this check, signaturesDiffer + parentLayoutChanged both miss it.
        if (target && stylesheetRulesChangedForElement(priorDoc, nextDoc, target, aiTarget)) {
          recordDecision('DROP', 'stylesheet rules changed for this element')
          delete store[key]
          continue
        }
        recordDecision('KEEP', 'AI did not move this element')
        // Keep override — bridge will re-apply on render.
        continue
      }
      if (key.startsWith('__prezo_size:')) {
        // Symmetric to the position branch above. Drop only when the AI
        // explicitly took control of THIS element's size (inline width/
        // height/transform:scale, or a stylesheet rule that touches any
        // of the size-affecting properties on this element's selectors).
        // Otherwise keep — the user's manual resize survives an AI edit
        // that targeted a different element.
        const stableId = key.slice('__prezo_size:'.length)
        const parsed = safeParseJSON(store[key])
        const role = parsed && typeof parsed.role === 'string' ? parsed.role : ''
        const optionId = parsed && typeof parsed.optionId === 'string' ? parsed.optionId : ''
        const label = parsed && typeof parsed.label === 'string' ? parsed.label : ''
        const anchor = parsed && typeof parsed.anchor === 'string' ? parsed.anchor : ''
        const target = locatePositionTarget(priorDoc, stableId, role, optionId, label, anchor)
        const aiTarget = locatePositionTarget(nextDoc, stableId, role, optionId, label, anchor)
        const recordSizeDecision = (verdict, reason) => {
          try {
            window.__prezoDebug = window.__prezoDebug || {}
            window.__prezoDebug.overrideDecisions = window.__prezoDebug.overrideDecisions || []
            window.__prezoDebug.overrideDecisions.push({
              ts: Date.now(), verdict, reason, key, role, optionId,
              priorFound: !!target, nextFound: !!aiTarget,
              aiInlineStyle: aiTarget ? (aiTarget.getAttribute('style') || '') : ''
            })
            console.log(`[prezo-size-override] ${verdict} (${reason})`, { key, role })
          } catch (e) {}
        }
        if (!target && !aiTarget) {
          // Runtime-rendered or otherwise untraceable in static HTML.
          // Without a target to diff, the safe default is KEEP so user
          // intent survives. The bridge's re-match fallback (label,
          // anchor) handles re-attaching at render time.
          const runtimeSelectors = runtimeRenderedSelectors(priorDoc, nextDoc, role)
          if (runtimeSelectors.length) {
            const priorRules = extractSizeRulesForSelectors(priorDoc, runtimeSelectors)
            const nextRules = extractSizeRulesForSelectors(nextDoc, runtimeSelectors)
            if (priorRules !== nextRules) {
              recordSizeDecision('DROP', 'stylesheet size rules changed (runtime-rendered)')
              delete store[key]
              continue
            }
          }
          recordSizeDecision('KEEP', 'runtime-rendered (not in static HTML)')
          continue
        }
        if (!aiTarget) {
          recordSizeDecision('DROP', 'element removed by AI')
          delete store[key]
          continue
        }
        if (hasExplicitSizing(aiTarget)) {
          recordSizeDecision('DROP', 'AI explicit sizing')
          delete store[key]
          continue
        }
        if (target && stylesheetSizeRulesChangedForElement(priorDoc, nextDoc, target, aiTarget)) {
          recordSizeDecision('DROP', 'stylesheet size rules changed for this element')
          delete store[key]
          continue
        }
        recordSizeDecision('KEEP', 'AI did not resize this element')
        continue
      }
      // Other keys (subtitle, footer, generic text) — left alone here.
      // They're handled by pruneStalePollStyleOverridesInStore against the
      // live poll data, and by the bridge's own re-match fallback.
    }
  }

  function safeParseJSON(value) {
    if (typeof value !== 'string') return null
    try { return JSON.parse(value) } catch { return null }
  }

  function locateQuestionInDoc(doc) {
    if (!doc) return null
    // 1) The bridge-tagged attribute (only present at runtime, but cheap to try).
    // 2) Common ids/classes the AI tends to emit.
    // 3) Attribute-pattern fallback for ids/classes that contain "question"
    //    or "title" but don't match the hardcoded list (e.g. #question-text,
    //    #question-area, .pollQuestionWrap). Excludes #total-votes so a
    //    "total" id doesn't fall in here.
    const direct =
      doc.querySelector(attrEqI('data-prezo-editable', 'question')) ||
      doc.querySelector(
        '#poll-question, #pollQuestion, #question, #poll-title, #pollTitle, ' +
        '#question-text, #questionText, #question-area, #questionArea, ' +
        '#poll-heading, #poll-headline, #pollHeading, #pollHeadline'
      ) ||
      doc.querySelector('.poll-question, .poll-q, .poll-title, .poll-heading, .poll-headline')
    if (direct) return direct
    return findByIdOrClassPattern(doc, /(^|[-_])(question|q\-text|q\-area|title|heading|headline)([-_]|$)/i, {
      excludeIdPattern: /total|vote/i,
      excludeClassPattern: /total|vote/i
    })
  }

  // Walk every element in `doc` and return the first whose id or any class
  // matches `pattern`. Skips elements whose id/class also matches an exclude
  // pattern (so #total-votes doesn't get picked up by a "title" search).
  function findByIdOrClassPattern(doc, pattern, options = {}) {
    if (!doc || !doc.body) return null
    const all = doc.body.querySelectorAll('*')
    const excludeId = options.excludeIdPattern || null
    const excludeClass = options.excludeClassPattern || null
    for (let i = 0; i < all.length; i++) {
      const el = all[i]
      const id = (el.id || '')
      if (id && pattern.test(id)) {
        if (excludeId && excludeId.test(id)) continue
        return el
      }
      const cls = (el.getAttribute('class') || '')
      if (cls) {
        const tokens = cls.split(/\s+/)
        for (const token of tokens) {
          if (!token) continue
          if (!pattern.test(token)) continue
          if (excludeClass && excludeClass.test(token)) { continue }
          return el
        }
      }
    }
    return null
  }

  function locatePositionTarget(doc, stableId, role, optionId, label, anchor) {
    if (!doc) return null
    if (stableId) {
      const direct = doc.querySelector(attrEqI('data-prezo-pos-id', stableId)) ||
        doc.querySelector(attrEqI('data-prezo-text-id', stableId))
      if (direct) return direct
    }
    if (role === 'option-row' && optionId) return locateOptionRowInDoc(doc, optionId)
    if (role === 'poll-question') return locateQuestionInDoc(doc)
    if (role === 'poll-footer') {
      const footerDirect =
        doc.querySelector(attrEqI('data-prezo-editable', 'footer')) ||
        doc.querySelector(
          '#total-votes-text, #total-votes-display, #total-votes, #totalVotes, ' +
          '#vote-counter, #pollFooter, #poll-footer, #footer, #vote-count, ' +
          '#total-vote-count, #pollTotal, #poll-total'
        ) ||
        doc.querySelector('.total-votes, .vote-counter, .poll-footer, .poll-total, .vote-count, .poll-vote-count')
      if (footerDirect) return footerDirect
      return findByIdOrClassPattern(doc, /(^|[-_])(footer|total[-_]?vote|vote[-_]?count|vote[-_]?counter)([-_]|$)/i)
    }
    if (role === 'poll-subtitle') {
      const subtitleDirect =
        doc.querySelector(attrEqI('data-prezo-editable', 'subtitle')) ||
        doc.querySelector('#poll-subtitle, #pollSubtitle, #subtitle, #poll-sub, #pollSub') ||
        doc.querySelector('.poll-subtitle, .subtitle, .sub-title, .poll-sub, .eyebrow')
      if (subtitleDirect) return subtitleDirect
      return findByIdOrClassPattern(doc, /(^|[-_])(subtitle|sub[-_]?title|eyebrow)([-_]|$)/i)
    }
    if (role === 'background') return doc.querySelector('[data-prezo-background-layer]')
    if (role === 'foreground') return doc.querySelector('[data-prezo-foreground-layer]')
    // Generic-element rescue: the in-iframe bridge saves a CSS-selector-shaped
    // label ("tag#id" / "tag.class" / "tag") for arbitrary selectables. Use
    // it as the locator on both sides of the diff so dropOverridesAiChanged
    // can decide DROP vs KEEP via stylesheetRulesChangedForElement instead of
    // falling through to the "runtime-rendered (KEEP)" default.
    if (role === 'element') {
      return locateLabelSelectorInDoc(doc, label, anchor)
    }
    return null
  }

  function locateLabelSelectorInDoc(doc, label, anchor) {
    if (!doc || !doc.body) return null
    const selector = typeof label === 'string' ? label.trim() : ''
    if (!selector) return null
    const anchorSel = typeof anchor === 'string' ? anchor.trim() : ''
    if (anchorSel) {
      try {
        const anchorEl = doc.body.querySelector(anchorSel)
        if (anchorEl) {
          const scoped = anchorEl.querySelector(selector)
          if (scoped) return scoped
        }
      } catch {}
    }
    try {
      return doc.body.querySelector(selector)
    } catch {
      return null
    }
  }

  /**
   * The AI took explicit control of THIS element's position. Signals are
   * limited to inline style attributes because that's the only thing we
   * can read from a parsed HTML string (computed styles need a live DOM).
   *
   *   transform: translate(...)
   *   position: absolute|fixed (with top/left/right/bottom)
   *   margin: <something> auto or auto on horizontal sides
   *
   * Returns true if any of these positioning intents appear inline on
   * the element. Stylesheet-driven moves are NOT detected here — those
   * are caught by parentLayoutChanged.
   */
  function hasExplicitPositioning(el) {
    if (!el) return false
    const style = (el.getAttribute('style') || '').toLowerCase()
    if (!style) return false
    if (/\btransform\s*:[^;]*\btranslate/i.test(style)) return true
    if (/\bposition\s*:\s*(absolute|fixed)/i.test(style)) {
      // With absolute/fixed we'd expect top/left/right/bottom alongside.
      if (/\b(top|left|right|bottom)\s*:/i.test(style)) return true
    }
    return false
  }

  /**
   * The AI changed the element's PARENT in a way that affects rendered
   * position. We look at:
   *   - the parent itself swapped to a different element (id changed)
   *   - the parent gained or lost layout-affecting inline style (display,
   *     justify-content, align-items, flex-direction, text-align)
   *
   * We deliberately do NOT trip on arbitrary parent class changes — the
   * AI often renames classes during rewrites without actually changing
   * layout, and we don't want to drop overrides on those.
   */
  function parentLayoutChanged(prior, next) {
    if (!prior || !next) return false
    const pa = prior.parentElement
    const na = next.parentElement
    if (!pa && !na) return false
    if (!pa || !na) return true
    if (pa.id !== na.id) return true
    const paStyle = (pa.getAttribute('style') || '').toLowerCase()
    const naStyle = (na.getAttribute('style') || '').toLowerCase()
    const LAYOUT_PROPS = /(display|justify-content|align-items|align-content|flex-direction|flex-wrap|text-align|grid-template|gap|column-gap|row-gap)\s*:/g
    const paLayout = (paStyle.match(LAYOUT_PROPS) || []).sort().join('|')
    const naLayout = (naStyle.match(LAYOUT_PROPS) || []).sort().join('|')
    if (paLayout !== naLayout) return true
    // Compare the actual layout property VALUES, not just presence.
    for (const prop of ['display', 'justify-content', 'align-items', 'align-content', 'flex-direction', 'text-align']) {
      if (extractInlineProp(paStyle, prop) !== extractInlineProp(naStyle, prop)) return true
    }
    return false
  }

  function extractInlineProp(styleText, prop) {
    if (!styleText) return ''
    const re = new RegExp(`\\b${prop}\\s*:\\s*([^;]+)`, 'i')
    const m = styleText.match(re)
    return m ? m[1].trim().toLowerCase() : ''
  }

  /**
   * Detect AI-driven position changes that happen via stylesheet rules
   * inside <style> blocks (rather than inline element attributes).
   *
   * The AI often "moves" an element by rewriting its CSS rule, e.g.:
   *
   *   #poll-question { position: absolute; top: 20px; right: 20px; }
   *
   * The element's own tag/class/inline-style stays identical, so
   * signaturesDiffer and parentLayoutChanged both miss the change. This
   * helper extracts all <style> text from both docs, picks out the rules
   * that target THIS element (by id selector or class selector), and
   * compares the LAYOUT-relevant declarations between prior and new.
   *
   * Heuristic; not a full CSS parser. Tracks the properties that actually
   * affect rendered position: position, top/left/right/bottom, margin,
   * transform, display, justify-content, align-items, text-align.
   */
  function stylesheetRulesChangedForElement(priorDoc, nextDoc, priorEl, nextEl) {
    if (!priorEl || !nextEl) return false
    const selectors = candidateSelectorsForElement(priorEl, nextEl)
    if (!selectors.length) return false
    const priorRules = extractLayoutRulesForSelectors(priorDoc, selectors)
    const nextRules = extractLayoutRulesForSelectors(nextDoc, selectors)
    return priorRules !== nextRules
  }

  // For elements that the artifact renders at runtime (option rows, etc.)
  // we can't pull selectors from a parsed DOM node — the node doesn't exist
  // on either side. Synthesize a selector set from the known container ids
  // for the role plus the well-known option-row class fragments. The
  // extractor only keeps rules whose body actually carries layout decls,
  // so adding extra selectors here is safe.
  function runtimeRenderedSelectors(priorDoc, nextDoc, role) {
    const out = new Set()
    if (role !== 'option-row' && role !== 'option-label' && role !== 'option-bar') {
      return Array.from(out)
    }
    out.add('#options-container')
    out.add('#options')
    out.add('#poll-options')
    out.add('#poll-options-container')
    // Common class fragments used across artifacts for option rows.
    const knownClasses = [
      'tower-col', 'option-row', 'option-item', 'option', 'opt',
      'poll-option', 'choice', 'choice-row', 'answer', 'answer-row',
      'lane', 'lane-row', 'bar-row', 'option-bar'
    ]
    for (const c of knownClasses) out.add('.' + c)
    // Also harvest selectors from the existing stylesheet text that target
    // any of the well-known container ids — covers AI rewrites that
    // introduced a child-targeting rule like `.tower-col:nth-child(1)`.
    return Array.from(out)
  }

  function candidateSelectorsForElement(priorEl, nextEl) {
    const out = new Set()
    // Include the element itself plus a few ancestor levels. The AI can move
    // an element by changing the container's text-align / align-items /
    // justify-content rather than the element's own rule; without ancestor
    // coverage those moves slip past the override-drop check.
    collectSelectorsFromChain(priorEl, out, 4)
    collectSelectorsFromChain(nextEl, out, 4)
    return Array.from(out)
  }

  function collectSelectorsFromChain(el, out, maxDepth) {
    let cur = el
    let depth = 0
    while (cur && cur.nodeType === 1 && depth <= maxDepth) {
      const id = cur.id || ''
      if (id) out.add('#' + id)
      const classes = (cur.getAttribute && (cur.getAttribute('class') || '')).split(/\s+/).filter(Boolean)
      for (const c of classes) out.add('.' + c)
      cur = cur.parentElement
      depth += 1
    }
  }

  function getAllStyleText(doc) {
    if (!doc) return ''
    let combined = ''
    try {
      const styleEls = doc.querySelectorAll('style')
      if (styleEls && styleEls.length) {
        for (let i = 0; i < styleEls.length; i++) {
          combined += (styleEls[i].textContent || '') + '\n'
        }
      }
    } catch {}
    return combined
  }

  // Layout properties whose value-changes affect rendered position.
  const LAYOUT_PROP_PATTERN = /(position|top|left|right|bottom|margin(?:-[a-z]+)?|transform|display|justify-content|align-items|align-self|text-align|float|inset|order|grid-column|grid-row|grid-area|flex-direction|flex-wrap)\s*:\s*([^;}]+)/gi

  // Size properties whose value-changes affect rendered dimensions. Used by
  // the size-override AI-edit reconciliation path: when these change for
  // the resized element, the manual scale override is dropped so the AI's
  // intent wins; otherwise the override is kept.
  const SIZE_PROP_PATTERN = /(width|height|min-width|min-height|max-width|max-height|transform|scale|flex|flex-basis|flex-grow|flex-shrink|font-size|aspect-ratio|zoom)\s*:\s*([^;}]+)/gi

  /**
   * Extract the layout-relevant declarations from all CSS rules that
   * mention any of the supplied selectors. Returns a normalised string
   * for direct equality comparison between prior and new docs.
   */
  function extractLayoutRulesForSelectors(doc, selectors) {
    return extractCssDeclsForSelectors(doc, selectors, LAYOUT_PROP_PATTERN)
  }

  function extractSizeRulesForSelectors(doc, selectors) {
    return extractCssDeclsForSelectors(doc, selectors, SIZE_PROP_PATTERN)
  }

  function extractCssDeclsForSelectors(doc, selectors, propPattern) {
    const text = getAllStyleText(doc)
    if (!text || !selectors.length) return ''
    const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '')
    const collected = []
    const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
    let m
    while ((m = ruleRegex.exec(cleaned)) !== null) {
      const selectorText = m[1].trim().toLowerCase()
      const body = m[2]
      if (!selectorText) continue
      let referenced = false
      for (const sel of selectors) {
        const needle = sel.toLowerCase()
        const tokenRe = new RegExp(`(^|[^a-z0-9_-])${escapeRegexp(needle)}([^a-z0-9_-]|$)`, 'i')
        if (tokenRe.test(selectorText)) { referenced = true; break }
      }
      if (!referenced) continue
      const decls = []
      let d
      const propRe = new RegExp(propPattern.source, 'gi')
      while ((d = propRe.exec(body)) !== null) {
        const prop = d[1].toLowerCase().trim()
        const val = d[2].replace(/\s+/g, ' ').trim().toLowerCase()
        decls.push(`${prop}:${val}`)
      }
      if (decls.length) {
        decls.sort()
        collected.push(`${selectorText}{${decls.join(';')}}`)
      }
    }
    collected.sort()
    return collected.join('|')
  }

  function stylesheetSizeRulesChangedForElement(priorDoc, nextDoc, priorEl, nextEl) {
    if (!priorEl || !nextEl) return false
    const selectors = candidateSelectorsForElement(priorEl, nextEl)
    if (!selectors.length) return false
    return extractSizeRulesForSelectors(priorDoc, selectors) !== extractSizeRulesForSelectors(nextDoc, selectors)
  }

  // Same shape as `hasExplicitPositioning` but for size: did the AI emit
  // an inline width/height/transform-scale on this element?
  function hasExplicitSizing(el) {
    if (!el) return false
    const style = (el.getAttribute('style') || '').toLowerCase()
    if (!style) return false
    if (/\btransform\s*:[^;]*\bscale\b/i.test(style)) return true
    if (/\b(?:width|height|min-width|min-height|max-width|max-height|font-size)\s*:\s*[^;]+/i.test(style)) return true
    return false
  }

  function escapeRegexp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function locateOptionRowInDoc(doc, optionId) {
    if (!doc || !optionId) return null
    return (
      doc.querySelector(attrEqI('data-option-id', optionId)) ||
      doc.querySelector(attrEqI('data-prezo-option-id', optionId)) ||
      doc.querySelector(attrEqI('data-opt-id', optionId)) ||
      doc.querySelector(attrEqI('data-poll-option-id', optionId)) ||
      doc.querySelector(attrEqI('data-lane-id', optionId))
    )
  }

  function locateOptionLabelInDoc(doc, optionId) {
    const row = locateOptionRowInDoc(doc, optionId)
    if (!row) return null
    return (
      row.querySelector(attrEqI('data-prezo-editable', 'option-label')) ||
      row.querySelector('.option-label, .opt-label, .lane-label, .bar-label, .choice-label, .answer-label, .label')
    )
  }

  function cssAttrEscape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  // Case-insensitive attribute-value matcher. The AI rebuild may re-emit
  // attribute values with different casing than the manual-edit pipeline
  // recorded (e.g. a stableId or option id round-tripped through a JSON
  // serializer or rewritten by the model). Without the `i` flag the
  // querySelector silently misses and the caller falls into "element not
  // found" branches — see the override-not-cleared bug where the user moved
  // the title, the AI moved it too, but the override re-applied on top.
  function attrEqI(name, value) {
    return `[${name}="${cssAttrEscape(value)}" i]`
  }

  /**
   * Compute a signature for an element capturing the visual presentation
   * the user would care about: inline style, classes, tag, and a normalised
   * text fingerprint. Two elements with identical signatures are treated
   * as "the AI didn't change this" for override-pruning purposes.
   */
  function signatureFor(el) {
    if (!el) return ''
    const tag = (el.tagName || '').toLowerCase()
    const style = (el.getAttribute('style') || '').replace(/\s+/g, ' ').trim()
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).sort().join(' ')
    const id = el.id || ''
    // Text fingerprint: strip whitespace; cap length so a long content
    // change registers but minor whitespace tweaks don't.
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    return `${tag}|${id}|${cls}|${style}|${text}`
  }

  function signaturesDiffer(a, b) {
    return signatureFor(a) !== signatureFor(b)
  }

  /**
   * Saved style overrides embed full HTML for question / option labels. When the same
   * artifact is used for another poll, those keys still hold the previous poll's copy;
   * applyArtifactStyleOverrides would overwrite the renderer's correct text until the
   * next vote (payload churn). Drop mismatched keys from saved + pending so we only
   * reapply styling when the underlying copy still matches the live poll.
   *
   * @param {object | null | undefined} poll
   */
  function pruneStalePollStyleOverrides(poll) {
    pruneStalePollStyleOverridesInStore(state.artifact.savedStyleOverrides, poll)
    pruneStalePollStyleOverridesInStore(pendingArtifactStyleOverrides, poll)
  }

  function pushArtifactStyleOverrides() {
    const frameWindow = el.artifactFrame.contentWindow
    if (!frameWindow) return
    pruneStalePollStyleOverrides(state.currentPoll)
    const saved = state.artifact.savedStyleOverrides || {}
    const overrides = { ...saved, ...pendingArtifactStyleOverrides }
    if (Object.keys(overrides).length === 0) return
    frameWindow.postMessage(
      {
        type: ARTIFACT_TEXT_STYLE_INIT_MESSAGE_TYPE,
        instanceId: state.artifact.instanceId,
        overrides
      },
      '*'
    )
  }

  /**
   * Push saved + pending position overrides to the iframe so dragged elements
   * appear in their saved positions immediately on load. Called after every
   * confirmed render alongside pushArtifactStyleOverrides.
   */
  function pushArtifactPositionOverrides() {
    const frameWindow = el.artifactFrame.contentWindow
    if (!frameWindow) return
    const saved = extractCopyFromStyleOverrides(state.artifact.savedStyleOverrides || {}).positionOverrides || {}
    const overrides = artifactPosition.getMergedPositionOverrides(saved)
    console.log('[prezo-position-push]', { count: Object.keys(overrides || {}).length, keys: Object.keys(overrides || {}) })
    if (!overrides || Object.keys(overrides).length === 0) return
    frameWindow.postMessage(
      {
        type: ARTIFACT_POSITION_INIT_MESSAGE_TYPE,
        instanceId: state.artifact.instanceId,
        overrides
      },
      '*'
    )
  }

  /**
   * Sibling of pushArtifactPositionOverrides — pushes the merged saved +
   * pending size overrides into the iframe so resized elements appear at
   * their scaled dimensions immediately on load. Called from the same
   * lifecycle points as the position push.
   */
  function pushArtifactSizeOverrides() {
    const frameWindow = el.artifactFrame.contentWindow
    if (!frameWindow) return
    const saved = extractCopyFromStyleOverrides(state.artifact.savedStyleOverrides || {}).sizeOverrides || {}
    const overrides = artifactSize.getMergedSizeOverrides(saved)
    console.log('[prezo-size-push]', { count: Object.keys(overrides || {}).length, keys: Object.keys(overrides || {}) })
    if (!overrides || Object.keys(overrides).length === 0) return
    frameWindow.postMessage(
      {
        type: ARTIFACT_SIZE_INIT_MESSAGE_TYPE,
        instanceId: state.artifact.instanceId,
        overrides
      },
      '*'
    )
  }

  /**
   * Sibling of pushArtifactPositionOverrides — pushes the merged saved +
   * pending hidden (delete) overrides into the iframe so deleted elements
   * stay hidden immediately on load. Called from the same lifecycle points
   * as the position/size pushes.
   */
  function pushArtifactHiddenOverrides() {
    const frameWindow = el.artifactFrame.contentWindow
    if (!frameWindow) return
    const saved = extractCopyFromStyleOverrides(state.artifact.savedStyleOverrides || {}).hiddenOverrides || {}
    const overrides = artifactDelete.getMergedHiddenOverrides(saved)
    if (!overrides || Object.keys(overrides).length === 0) return
    frameWindow.postMessage(
      {
        type: ARTIFACT_HIDDEN_INIT_MESSAGE_TYPE,
        instanceId: state.artifact.instanceId,
        overrides
      },
      '*'
    )
  }

  // ── Override-load masking (anti-snap) ────────────────────────────────
  // The override push messages land ~250-300ms after the artifact first
  // paints, so without masking the user sees the un-edited artifact "snap"
  // into the edited one. We hide the frame the moment we inject an artifact
  // that HAS saved edits, then reveal (fade-in) once the override push has
  // fired. A hard fallback timer always clears the mask so we can never strand
  // the frame invisible.
  let artifactRevealTimerId = 0

  /**
   * True when the artifact carries manual edits worth masking for — any
   * position / size / hidden / text-style / copy override. A clean artifact
   * has nothing to snap, so we don't mask it (no needless blank frame).
   */
  function artifactHasOverridesToApply() {
    const saved = state.artifact.savedStyleOverrides || {}
    if (Object.keys(saved).length > 0) return true
    if (Object.keys(pendingArtifactStyleOverrides || {}).length > 0) return true
    if (Object.keys(pendingArtifactCopyOverrides || {}).length > 0) return true
    if (Object.keys(artifactPosition.getPendingPositionOverrides() || {}).length > 0) return true
    if (Object.keys(artifactSize.getPendingSizeOverrides() || {}).length > 0) return true
    if (Object.keys(artifactDelete.getPendingHiddenOverrides() || {}).length > 0) return true
    return false
  }

  /**
   * Hide the frame ahead of the override push so the un-edited paint is never
   * shown. No-op (and immediate reveal) when there's nothing to apply.
   * `maxMaskMs` is the safety ceiling — the frame always reveals by then even
   * if the reveal call is somehow missed.
   */
  function maskArtifactFrameForOverrides() {
    if (artifactRevealTimerId) {
      clearTimeout(artifactRevealTimerId)
      artifactRevealTimerId = 0
    }
    if (!el.artifactFrame) return
    if (!artifactHasOverridesToApply()) {
      revealArtifactFrame()
      return
    }
    el.artifactFrame.classList.add('artifact-frame--overrides-pending')
    // Deleted elements are now baked into the srcdoc as a hide stylesheet, so
    // they never paint visible; the mask no longer has to wait for the hide to
    // land. A short safety ceiling is enough for position/size/text overrides,
    // which apply fast once pushed.
    artifactRevealTimerId = setTimeout(revealArtifactFrame, 700)
  }

  /**
   * Reveal the (now override-applied) frame. Deferred one extra frame after the
   * push so the iframe has applied the overrides synchronously before the
   * fade-in begins. Idempotent.
   */
  function revealArtifactFrame() {
    if (artifactRevealTimerId) {
      clearTimeout(artifactRevealTimerId)
      artifactRevealTimerId = 0
    }
    if (!el.artifactFrame) return
    el.artifactFrame.classList.remove('artifact-frame--overrides-pending')
  }

  /**
   * Push the user's designer-tool config (rulers/grid/snap) into the iframe
   * so the bridge can render or hide the visual aids. Computed via
   * getEffectiveConfig so present mode unconditionally overrides the saved
   * preference to "all off".
   */
  function pushArtifactGridConfig() {
    const frameWindow = el.artifactFrame.contentWindow
    if (!frameWindow) return
    const effective = artifactGuides.getEffectiveConfig({
      presentMode: Boolean(state.presentMode)
    })
    frameWindow.postMessage(
      {
        type: ARTIFACT_GRID_CONFIG_MESSAGE_TYPE,
        instanceId: state.artifact.instanceId,
        config: effective
      },
      '*'
    )
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
    renderRichText(el.eyebrow, getEyebrowTextKey(), 'Prezo Visual Mode PoC')
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
      `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, ${getActivityFooterDescriptor()}`
    )
    updateMeta(null, 0)
    scheduleResizeSelectionUpdate()
  }

























  /** Upsert-by-id into a snapshot collection (shared by poll, question, and
      prompt socket patches). */








  function hideInitialSkeleton() {
    // Idempotent: classList.add is a no-op once the class is present.
    // We don't remove the element from the DOM because that would require
    // tracking a flag, and a single getElementById per render is negligible.
    document
      .getElementById('initial-skeleton')
      ?.classList.add('skeleton-dismissed')
  }

  function renderFromSnapshot(forceRender) {
    // First-paint dismiss: the skeleton overlay is in the DOM from page load
    // and stays until the first real render completes, regardless of whether
    // the trigger came from the WebSocket push or the HTTP fallback.
    hideInitialSkeleton()
    flushRichTextHostsToOverrides()
    renderRichText(el.eyebrow, getEyebrowTextKey(), 'Prezo Visual Mode PoC')
    syncArtifactComposerVisibility()

    if (state.activityKind !== 'poll') {
      renderQnaFromSnapshot(forceRender)
      return
    }

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
      renderClassicOptions(poll, totalVotes)
    }
    updateMeta(poll, totalVotes)
    updateFooter()
    scheduleResizeSelectionUpdate()
  }

  function hasArtifactPrompt() {
    return Boolean(asText(state.artifact.lastPrompt))
  }

  // Shared stage gating for both activity kinds: loader while a build runs,
  // hidden stage until an artifact exists, then reveal + push live state.
  function renderArtifactExperienceWith(pushLiveState) {
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
    pushLiveState()
  }

  function renderArtifactExperience(poll, totalVotes) {
    renderArtifactExperienceWith(() => pushArtifactPollState(poll, totalVotes))
  }

  function renderQnaArtifactExperience(view) {
    renderArtifactExperienceWith(() => pushArtifactQnaState(view))
  }

  function renderArtifactAwaitingPrompt() {
    hideArtifactStage()
  }

  /** qna/discussion twin of the poll snapshot render: selects the activity,
      keeps the classic canvas usable by projecting questions as ranked rows,
      and feeds the artifact stage through the qna state channel. */
  function renderQnaFromSnapshot(forceRender) {
    const view = buildQnaActivityView()
    state.currentQnaView = view
    state.currentPoll = null

    const renderKey = getQnaRenderKey(view)
    if (!forceRender && renderKey === state.lastRenderKey) {
      // view can be null here (missing prompt renders re-key to the same
      // "no-<kind>" value); never re-reveal the artifact stage over the
      // missing-activity placeholder.
      if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE && view) {
        renderQnaArtifactExperience(view)
      }
      updateFooter()
      updateMeta(view ? qnaViewAsPollShape(view) : null, getQnaTotalVotes(view))
      scheduleResizeSelectionUpdate()
      return
    }
    state.lastRenderKey = renderKey

    if (!view) {
      renderMissingQnaActivity()
      return
    }

    renderRichText(el.question, getQnaTitleTextKey(view), view.title)
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      renderQnaArtifactExperience(view)
    } else if (view.questions.length > 0) {
      renderClassicOptions(qnaViewAsPollShape(view), getQnaTotalVotes(view))
    } else {
      clearArtifactModeClasses()
      renderEmptyStateNote(
        'qna-waiting',
        state.activityKind === 'discussion'
          ? 'No approved answers yet. Approved audience answers appear here live.'
          : 'No approved questions yet. Approved audience questions appear here live.'
      )
    }
    updateMeta(qnaViewAsPollShape(view), getQnaTotalVotes(view))
    updateFooter()
    scheduleResizeSelectionUpdate()
  }



  /** Approved questions ranked the way the audience app ranks them:
      upvotes first, then newest. Timestamps are parsed once up front so the
      comparator stays allocation- and parse-free. */




  /** Poll-shaped projection of a qna view so the shared chrome (meta, classic
      option rows, vote counter) renders ranked questions without new code. */




  function getQnaTitleTextKey(view) {
    return `${state.activityKind}:${asText(view?.id) || 'unknown'}:title`
  }

  function getQnaRenderKey(view) {
    if (!view) {
      return `no-${state.activityKind}`
    }
    return JSON.stringify({
      kind: state.activityKind,
      id: view.id,
      status: view.status,
      title: view.title,
      questions: view.questions.map((question) => [question.id, question.text, question.votes])
    })
  }

  function renderMissingQnaActivity() {
    clearArtifactModeClasses()
    syncArtifactComposerVisibility()
    const isDiscussion = state.activityKind === 'discussion'
    const message = isDiscussion
      ? state.promptSelector.mode === 'id'
        ? `Discussion "${state.promptSelector.explicitId}" was not found in this session.`
        : 'No discussion is available in this session yet.'
      : 'Session Q&A is not available yet.'
    renderRichText(el.question, getQuestionStateTextKey(`missing-${state.activityKind}`), message)
    const hint = isDiscussion
      ? 'Create an open discussion in Host Console to render it here.'
      : 'Start Q&A in Host Console to render it here.'
    if (currentTheme.visualMode === ARTIFACT_VISUAL_MODE) {
      showArtifactStagePlaceholder(hint, 'pending')
    } else {
      renderEmptyStateNote(`missing-${state.activityKind}`, hint)
    }
    updateMeta(null, 0)
    updateFooter()
    scheduleResizeSelectionUpdate()
  }

  function renderClassicOptions(poll, totalVotes) {
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

  function clearArtifactModeClasses() {
    for (const className of [...el.options.classList]) {
      if (className === 'artifact-mode' || className.startsWith('artifact-')) {
        el.options.classList.remove(className)
      }
    }
  }

  function renderMissingSession() {
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
      `session: ${state.sessionId || 'n/a'}, code: ${state.code || 'n/a'}, ${getActivityFooterDescriptor()}`
    )
  }

  /** Status chip + vote counter refresh for whichever activity this station
      instance is bound to (socket lifecycle calls this without arguments). */
  function updateCurrentActivityMeta(forcedStatusText, forcedTone) {
    if (state.activityKind !== 'poll') {
      const view = state.currentQnaView
      updateMeta(
        view ? qnaViewAsPollShape(view) : null,
        getQnaTotalVotes(view),
        forcedStatusText,
        forcedTone
      )
      return
    }
    updateMeta(state.currentPoll, getTotalVotes(state.currentPoll), forcedStatusText, forcedTone)
  }

  function getActivityFooterDescriptor() {
    if (state.activityKind === 'discussion') {
      return `discussion: ${state.promptSelector.descriptor}`
    }
    if (state.activityKind === 'qna') {
      return 'q&a: session'
    }
    return `poll: ${state.pollSelector.descriptor}`
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
    }
    showThemeFeedback('All object positions reset to defaults.', 'success')
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

  function must(id) {
    const node = document.getElementById(id)
    if (!node) {
      throw new Error(`Missing element: ${id}`)
    }
    return node
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('read_failed'))
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.readAsDataURL(file)
    })
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
    el.aiChatPanelVisibilityToggle.removeEventListener('click', handleAiChatPanelVisibilityToggleClick)
    el.aiEditorShellToggle.removeEventListener('click', handleEditorShellToggleClick)
    el.artifactEditorShellToggle.removeEventListener('click', handleEditorShellToggleClick)
    el.presentModeToggle.removeEventListener('pointerdown', handlePresentModeTogglePointerDown)
    el.presentModeToggle.removeEventListener('click', handlePresentModeToggleClick)
    document.removeEventListener('fullscreenchange', handlePresentModeFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', handlePresentModeFullscreenChange)
    el.aiChatForm.removeEventListener('submit', handleAiChatFormSubmit)
    el.aiChatInput.removeEventListener('keydown', handleAiChatInputKeydown)
    el.aiChatShell.removeEventListener('transitionend', handleEditorDockShellTransitionEnd)
    el.artifactComposerFab.removeEventListener('click', handleArtifactComposerFabClick)
    el.artifactComposerVisibilityToggle.removeEventListener('click', handleArtifactComposerVisibilityToggleClick)
    el.artifactPromptForm.removeEventListener('submit', handleArtifactPromptFormSubmit)
    el.artifactTypeReferencePaperclip.removeEventListener('click', handleArtifactTypeReferencePaperclipClick)
    el.artifactPromptForm.removeEventListener('dragover', handleArtifactTypeReferenceDragOver)
    el.artifactPromptForm.removeEventListener('dragleave', handleArtifactTypeReferenceDragLeave)
    el.artifactPromptForm.removeEventListener('drop', handleArtifactTypeReferenceDrop)
    el.artifactTypeReferenceInput.removeEventListener('change', handleArtifactTypeReferenceInputChange)
    el.artifactTypeReferenceClear.removeEventListener('click', handleArtifactTypeReferenceClearClick)
    document.removeEventListener('paste', handleArtifactBuildReferencePaste, true)
    el.artifactBrandReferenceInput.removeEventListener('change', handleArtifactBrandReferenceInputChange)
    el.artifactBrandReferenceClear.removeEventListener('click', handleArtifactBrandReferenceClearClick)
    el.artifactPromptInput.removeEventListener('keydown', handleArtifactPromptInputKeydown)
    el.artifactPromptInput.removeEventListener('input', handleArtifactPromptInputInput)
    el.artifactFrame.removeEventListener('load', handleArtifactFrameLoad)
    window.removeEventListener('resize', artifactBridge.handleViewportResize)
    window.removeEventListener('resize', handleEditorDockViewportResize)
    window.removeEventListener('message', handleArtifactFrameMessage)
    window.removeEventListener('message', handleLibrarySyncMessage)
    document.removeEventListener('keydown', handleHistoryKeydown, true)
    el.librarySyncStatus.removeEventListener('click', handleLibrarySyncStatusClick)
    artifactBridge.dispose()
    disposeLibrarySyncManager()
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
    stopArtifactIntakeThinking()
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

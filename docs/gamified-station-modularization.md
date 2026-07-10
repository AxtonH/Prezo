# Gamified station modularization (poll-game-gamified-app.js)

Status: COMPLETE — Phases 0-7 all implemented. app.js is now the composition
root only (~8,900 lines, from 13,645). The living summary of the module map
and rules moved to frontend-addin/CLAUDE.md; this doc remains as the
historical record of the phase notes and gotchas.

Phase 7 note: the rich-text subsystem moved in two pieces.
**poll-game-gamified-richtext.js** holds the pure core — text-override keys
(poll:/chrome: vocabulary) and their predicates, the localStorage override
map, textToRichHtml, and the HTML/inline-style sanitizers (the XSS gate; its
test uses a micro-DOM parser so the allowlist logic is genuinely exercised).
**poll-game-gamified-richtext-editor.js** holds the DOM engine —
createRichTextEditor with the contenteditable host lifecycle
(renderRichText/commitRichTextHost), the floating selection toolbar, ribbon
style controls, execCommand + inline-span editing, and the cached-selection
machinery. The 1,200-line engine block was moved by SCRIPT (byte-copied,
never retyped): dependency analysis found it referenced only 8 closure names
(state, el, historyState, currentTheme ×2, and 4 callbacks), the two
currentTheme reads became the getCurrentTheme seam, and the return surface
was computed empirically (block-declared names still referenced by the
remaining app.js — 27, including the teardown removeEventListener sites in
handleUnload and the select helpers the artifact text toolbar shares).
setupArtifactTextToolbar stayed in app.js: it edits artifact-iframe text
through the bridge, not station hosts. Final tidy: removed 19 orphaned
imports accumulated across all phases and the dead earlier readFileAsDataUrl
copy (it was shadowed by the later declaration via function hoisting; the
surviving copy is the one whose behavior all callers already got).

Phase 6a-dom note: the theme editor's DOM half moved into
poll-game-gamified-theme-ui.js as `createThemeEditor(deps)` — the
themeControls spec table + controlElements, the control-input bindings
(bindThemeControls, split out of setupThemeEditor), updateTheme, applyTheme,
syncThemeControls, syncSingleControlValue (the drag engine live-syncs inputs
through it), and the upload UI (bindImageUpload, setupBackgroundDropzone,
private syncBgDropzoneUi). The canvas-object helpers applyTheme delegates to
(applyElementOffset, applyElementBoxSize, applyHeaderTextObjects + the
header-flow subsystem, applyImageAsset, applyDeletedStaticTargets) stayed in
app.js because the drag/resize engine shares them — they arrive as injected
callbacks; the drag/resize engine itself is Phase 7 territory. currentTheme
uses the getCurrentTheme/setCurrentTheme seam from 6b; historyState is
injected by reference (updateTheme reads `.applying`). The factory is
instantiated after historyState and before init() (init synchronously paints
through applyTheme/syncThemeControls). Pre-existing quirk preserved: app.js
had TWO readFileAsDataUrl declarations and hoisting made the later one (Error
'read_failed' + string coercion) win everywhere; the module carries a private
copy of that winning version and both app.js copies remain for the
attachments UI.

Phase 6b note: the library panel moved into poll-game-gamified-library-ui.js
as `createLibraryPanel(deps)` — theme/artifact selects, save/load/delete,
account version history + restore, theme import/export/reset, the remote
merges, the sync status pill, and both feedback lines (~26 functions; the
version-history state object moved with it). This is the first module that
owns its DOM: the shared `el` map is injected per the ground rule that a
panel's element handles move when the whole panel does. Two seams were
introduced for reassignable closure bindings: getCurrentTheme/setCurrentTheme
(6a-dom will reuse this pair) and getPending*Overrides +
clearPendingArtifactOverrides for the unsaved override maps.
themeLibrary/artifactLibrary are mutation-only objects and pass by reference.
The circular dependency with librarySyncManager (created earlier in app.js,
calls the panel's merge/status/feedback methods) is broken by arrow-deferral
at the sync-manager wiring — safe because its constructor is side-effect
free, so those callbacks only fire post-init. bindImageUpload /
setupBackgroundDropzone stayed in app.js: they are theme-editor upload UI,
6a-dom territory.

Phase 6a was split: **6a-core (shipped)** extracted the pure theme half into
poll-game-gamified-theme.js — defaultTheme, sanitizeTheme + its ten scrubbers,
the legacy-title migration, the color utilities (sanitizeHex/hexToRgba/
hexLuminance/normalizeColorToHex/sanitizeInlineColorValue), and
sanitizeAiThemePatch (now taking currentTheme as an argument). **6a-dom
(pending)** is the DOM half — applyTheme, updateTheme, syncThemeControls, the
theme resize/drag profiles — which moves together with its `el` handles in a
follow-up, per the ground rule that a panel's DOM only moves when the whole
panel does. The split keeps the silent-failure surface (value coercion)
under test now without rushing the visually-loud DOM surface.

Phase 5 note: the wizard factory takes its UI callbacks under the ORIGINAL
closure names (appendArtifactEditMessage, renderArtifactPromptQueue, ...) so
the moved bodies read unchanged; only two composer calls were renamed
(clearPromptInput/serializePromptInput wrap clearComposer/serializeComposer
with the input element bound). Two pure seams were parameterized for
testability: resolveArtifactEditRequest now takes the edit history as an
argument, and shouldRejectArtifactRenderHealth takes the active edit request
(its single app call site passes state.artifact.activeEditRequest). The
heavyweight build orchestrator submitArtifactPrompt deliberately stayed in
app.js — it is stage-lifecycle code and belongs with Phase 6/7 territory.

Phase 4 note: `MAX_INLINE_ATTACHMENTS` moved to constants.js (shared by the
attachments UI and the transport's request caps); the classic-canvas plan
parsers (`parseAiJsonResponse`/`extractGeminiText`) moved with the transport
since the edit-plan route is their only consumer. Extraction gotcha for
future phases: the brace-matching cutter must skip default-parameter braces
(`options = {}`) in function headers, and app.js has MIXED line endings —
match both `\r\n` and `\n` or use the Edit tool.

Phase 3 note: the one deliberate behavior change was parameterizing the two
edit-context hook filters (`buildArtifactEditContextMarkup` /
`buildArtifactLiveHookContext`) by activity kind — they previously hardcoded
poll tokens, so qna/discussion artifacts over 40KB sent empty live-hook
context (the backend compensated by re-extracting from the full HTML).
`cloneArtifactConversationAnswers` also moved to artifact-mode.js next to its
sibling answer helpers.

`poll-game-gamified-app.js` is a 13,645-line module whose entire body lives in
one IIFE closure (568 functions sharing `state`, `el`, `currentTheme`). It is
the composition root that absorbed every subsystem the station grew: wizard,
AI transport, payloads, overrides, rich text, session feed, library UI, theme
engine. This is the frontend twin of the June 2026 `ai.py` split (7,287 → ~1,630
across 9 modules) and follows the same rules.

## Ground rules

- **Extraction, not rewrite.** Function bodies move verbatim; only their access
  to closure variables changes (explicit dependency injection). Any behavior
  change is a defect.
- **Follow the existing idiom.** Sibling modules already use
  `createXxxHandler({ deps })` factories (`artifact-bridge`, `artifact-textedit`,
  `library-sync`, ...). New modules use the same shape; app.js stays the
  composition root that instantiates and wires them.
- **DOM stays behind callbacks.** Extracted modules take the data and invoke
  injected callbacks for rendering; anything touching `el` directly stays in
  app.js until its whole panel moves (theme engine, library UI).
- **Test net grows with each extraction** (Phase 0). A module is only extracted
  together with `node --test` coverage of its observable behavior. No new
  dependencies: Node's built-in test runner (`node --test`, Node ≥ 20; repo is
  on 24).
- Do NOT try to share code with `public/embed/poll-game-content.html` — it is
  a deliberately standalone classic script (see auto-poll-view-control notes).
- The artifact iframe bridge contract (poll byte-identical emission) must not
  change; `tests/poll-game-artifact-runtime.test.mjs` locks it.

## Phases

| Phase | Extract | New module | ~Lines out |
| --- | --- | --- | --- |
| 0 | Test scaffold: `npm test` → `node --test tests/`; lock mode-builder + bridge behavior | `frontend-addin/tests/*.test.mjs` | — |
| 1 | Pure helpers (asText, toInt, clamp, clone, normalizeApiBase, toWsBase, normalizeCode, safeJsonParse, errorToMessage, extractApiErrorMessage, escapeHtml, normalizeWhitespace, parse*Selector, ...); dedupe the asText copies in artifact-package/runtime | `poll-game-gamified-utils.js` | ~150 |
| 2 | Session feed: socket connect/reconnect/dispatch, snapshot merges + polling + embed-cache hydrate, activity selection (selectPoll/selectPrompt/buildQnaActivityView/sortQnaQuestions/getTotalVotes/qnaViewAsPollShape) | `poll-game-gamified-session-feed.js` (`createSessionFeed`) | ~450 |
| 3 | Artifact payload + AI context builders: buildArtifactPollPayload/QnaPayload + keys + capacity heuristics + buildArtifactContext/buildAiEditorContext | `poll-game-gamified-artifact-payloads.js` | ~600 |
| 4 | AI transport: requestAiArtifactBuild/Intake/Answer, edit-plan fetch, shared error handling | `poll-game-gamified-ai-transport.js` | ~250 |
| 5 | Wizard + edit queue: intake turns, brief application, edit prompt queue, auto-repair loop | `poll-game-gamified-artifact-wizard.js` | ~1,000 |
| 6a | ✅ Theme engine: sanitize (6a-core → theme.js) + apply/update/controls/upload UI (6a-dom → theme-ui.js) | `poll-game-gamified-theme.js`, `poll-game-gamified-theme-ui.js` | ~900 |
| 6b | ✅ Library panel UI: artifact/theme selects, save/load/delete, version history | `poll-game-gamified-library-ui.js` | ~620 |
| 7 | ✅ Rich-text subsystem (pure core + selection editor); composition-root tidy; CLAUDE.md note | `poll-game-gamified-richtext.js`, `poll-game-gamified-richtext-editor.js` | ~1,540 |

Target end state: app.js ≈ 5-6k lines of state definition, `el` map, wiring,
and the render orchestrators — with every subsystem importable and testable on
its own. (Being honest: this file will never be 500 lines; the goal is that no
subsystem logic lives in the composition root.)

## Per-phase verification gates

1. `npm test` (frontend-addin) — all `node --test` suites green.
2. `npm run build` — tsc + vite.
3. Dynamic-import parse check of every touched module.
4. Bridge byte-identity test (runtime emission unchanged).
5. `git diff --color-moved=dimmed-zebra` review — extraction hunks must read
   as moves, not edits.

## Dependency direction

`constants.js` and `utils.js` are leaves. Extracted subsystem modules may
import leaves and each other downward (feed → utils; payloads → utils,
artifact-copy) but never app.js. app.js imports everything and owns `state`,
`el`, and wiring. Factories receive state and callbacks — they do not reach
into the DOM except through injected element handles when unavoidable.

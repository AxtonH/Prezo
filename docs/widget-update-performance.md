# Widget update performance (shape polls / Q&A / discussion)

Why a deck with ~10 shape-poll widgets used to grind PowerPoint to a halt
during a live run, and the invariants the fix relies on. Code:
`frontend-addin/src/office/widgetShapes.ts` (update passes),
`frontend-addin/src/App.tsx` (triggers),
`frontend-addin/src/office/widgetDataSignatures.ts` (signatures).

## The cost model

Every `context.sync()` is a cross-process round trip that PowerPoint's UI
thread must service (typically 10–50 ms on Win32 even when the batch is
trivial). Widget update passes are therefore priced in syncs, not in JS time.

Before the fix, one `updatePollWidget` pass cost:

- ~38 syncs **per widget**: 3 phased shape loads, 9 sequential per-shape
  text-state loads (`safeLoadPollTextSyncState` synced once per title /
  question / body / counter / 5 labels), ~25 per-option write flushes
  (`tryItemWrite` = write + immediate sync), 1 slide flush.
- a full shape scan (2 syncs) of **every slide without a poll shapes tag,
  every pass** — the recovery path ran before the session-match check, so
  ordinary content slides paid it too.
- in slideshows, a 20-frame bar animation (1 sync per frame) for **every**
  changed widget, including slides nobody was viewing.

10 widgets ≈ 380+ syncs ≈ 4–12 s of UI-thread work per pass. Triggers made it
continuous: every socket vote scheduled a pass (coalesced but gapless, so
passes ran back-to-back), every `DocumentSelectionChanged` click fired three
full-deck passes (Q&A + discussion + poll, the first two with no coalescing
at all), and most writes were unconditional — so every pass also dirtied the
document, grew the designer's undo stack, and churned autosave even when
nothing changed.

## The fix, in layers

1. **Per-slide applied-signature cache** (`appliedWidgetSignatures` in
   widgetShapes.ts). Each pass computes, per widget slide, a JSON signature of
   exactly what it would render (bound poll/prompt projection, join code,
   style + shapes tag values) and skips the widget — zero shape loads — when
   it matches what the last successful pass applied. Slides scanned once and
   found widget-free are cached with a data-independent `no-widget` sentinel
   and never rescanned. Bypasses: pending widgets, `forceText` passes (only
   for the edited poll), and `repairSelectedSlide` passes (below). Entries are
   dropped when a slide's update fails.
2. **Batched reads.** All text-sync states (tag + text + font) plus bar
   `fill/transparency` load in one sync per widget instead of one per shape;
   on a failed batch the old per-shape isolation (`safeLoadPollTextSyncState`)
   is the fallback.
3. **Batched writes.** Item writes are staged and flushed in one sync per
   widget; only if that flush fails does each write retry through
   `tryItemWrite` (per-item isolation, the old unconditional path). Staged
   functions must stay idempotent — the fallback re-runs them.
4. **No-op write elimination.** Text, fill transparency, line visibility, bar
   geometry (0.05 pt epsilon), group rotation, and the `PrezoPollWidgetAutoText`
   tag are all compared against loaded state before writing. A steady-state
   pass queues **zero** document mutations: no dirty flag, no undo entries,
   no autosave churn.
5. **Animation scoping.** Bars tween only on the slide currently presented
   (`getPresentedSheetId`, common API); other widgets snap silently.
6. **Trigger hygiene** (App.tsx). Q&A + discussion updates now share the same
   inFlight/queued coalescer as polls; coalesced re-runs wait
   `WIDGET_PASS_GAP_MS` (300 ms) so vote streams can't saturate the host;
   `DocumentSelectionChanged` is debounced (400 ms) into a single repair pass;
   and the data effects skip scheduling entirely when the
   `widgetDataSignatures` projection didn't change (kills the 10 s snapshot
   poller's no-op passes).

Steady state after the fix: one vote costs ~2 global syncs + ~5–6 for the one
widget bound to that poll (plus the deliberate on-screen animation); the
other nine widgets and all content slides cost nothing. A no-change pass
(selection click) is ~2 syncs plus a repair of the selected slide only.

## Repair semantics (why edits still get fixed up)

Skipping unchanged widgets means user shape-surgery is no longer re-processed
on every event — by design. The safety net is the selection-changed refresh:
it passes `repairSelectedSlide: true`, which bypasses the signature cache for
the currently selected slide only (the slide the user may have just edited).
Everything else self-heals on the next data change, because any data change
misses the cache and runs the full widget path (including shape-id recovery
and re-adoption). Two consequences to be aware of:

- A designer's manual retype of system-owned text (e.g. the Q&A panel title)
  now sticks until the next data change or a selection repair on that slide,
  instead of being reverted on the next unrelated event. Poll labels keep
  their existing template-preservation semantics (`syncPollText`) unchanged.
- Cross-deck paste of widget *shapes* onto an already-sentineled slide is
  adopted via the selection repair (pasting selects the pasted shapes). Paste
  of a whole widget *slide* is a new slide id — never sentineled, adopts as
  before.

## Invariants to keep

- Every write in an update pass must be guarded (compare loaded state first)
  or staged behind an existing guard. One unconditional write re-introduces
  undo-stack pollution for every pass that touches the widget.
- Anything a pass renders from must be part of the slide's data signature
  (`widgetShapes.ts`) — and anything the App-level effects render from must be
  part of `widgetDataSignatures.ts`. A field read by the pass but missing
  from the signature means stale widgets that "fix themselves" only on
  selection repair.
- The fallbacks (per-shape state loads, `tryItemWrite`) are the compatibility
  story for broken/exotic decks. Don't remove them when refactoring the happy
  path.
- `queuePollTextSyncStateLoad` requires `shape.type` to be loaded by an
  earlier sync on every call path (all current paths do).

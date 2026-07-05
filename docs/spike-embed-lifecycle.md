# Spike: embed webview lifecycle in slideshow mode

Feasibility spike for **auto poll view control** (the poll auto-appears on
the audience view when the host reaches the slide carrying the embed). The
candidate design has the content add-in announce "I am on screen" to the
backend, which then opens its bound poll. Whether that design works hinges
on empirical questions about PowerPoint's webview lifecycle that no
documentation answers.

## Verdict (05/07/2026, Windows desktop, PowerPoint 16.0.20131, WebView2)

Three automated runs (two warm, one cold). The lifecycle model:

1. **Webviews are long-lived, not per-slide.** An embed's webview boots the
   first time its slide is displayed (edit or show) and survives slide
   changes, the whole slideshow, and show exit. It dies only when the deck
   closes (`visibilitychange: hidden` fires, then a hard kill — no
   `pagehide`). The slideshow re-parents the same instance; no second
   instance is ever created, and revisiting a slide reuses it.
2. **Slideshows preload one slide ahead.** Starting a show (and each
   advance) boots the *next* slide's embed before that slide is displayed
   (cold run: slide 2's embed booted 1.2s after the show started on
   slide 1). "I booted during a show" does NOT mean "my slide is visible" —
   but it does mean the surface is warm before the audience sees it.
3. **`getActiveViewAsync` / `ActiveViewChanged` work inside content frames.**
   Both flip edit ↔ read instantly at show start/exit, and a show-booted
   instance reports `read` at boot. Reliable gate against editing-time
   false positives.
4. **`getSelectedDataAsync(SlideRange)` polled from inside a live embed
   tracks the PRESENTED slide during a slideshow** (1 → 2 → 3 → 4 → 5 →
   jump-back-2, correct on every heartbeat, in warm and cold runs, from
   every live instance simultaneously). This undocumented behavior is the
   current-slide signal the feature needs.
5. **First display in the show has a crisp edge:** the webview gets a
   `resize` (+ devicePixelRatio → 1.5) ~300ms after its slide first appears
   in the show window. Pairing that edge with a concurrent SlideRange read
   self-localizes the embed (which slide id it lives on) with no authoring
   cooperation. There is no edge when the slide is *left*.
6. **Dead ends, measured:** rAF cadence runs at 60fps even for off-screen
   frames once composited (~3fps only pre-composition); `visibilityState`
   stays `visible` and `document.hasFocus()` stays `false` throughout;
   heartbeat timing never throttles. None of them signal slide display.

**Design consequence:** the feature is feasible on desktop. Every live
embed polls SlideRange (~1s) while the view is `read`; embeds self-localize
(edit-boot / resize-edge + SlideRange, persisted to their embed-instance
row); the backend maps current slide id → bound poll and opens/closes/
switches. Boot/teardown beacons alone cannot work (points 1-2). PowerPoint
on the web and Mac need their own runs — this harness is reusable there.

## Questions this spike answers

1. **Instantiation timing.** Is the embed's webview created when its slide
   is displayed in the slideshow, or preloaded earlier (deck open, adjacent
   slide)? Preloading would open polls too early.
2. **Teardown timing.** Is the webview destroyed when the host moves past
   the slide? If yes, heartbeat-stop is a clean "close the poll" signal.
3. **View detection.** Does `getActiveViewAsync` return `"read"` inside the
   content frame during a show, and does `ActiveViewChanged` fire there?
   Needed to avoid opening polls while someone merely edits the deck.
4. **Instance identity.** Does the slideshow reuse the edit-view instance or
   spawn a second one? Do both run concurrently? What survives exiting the
   show, and does jumping back to a slide reuse or re-create the instance?

## Components

| Piece | Where |
| --- | --- |
| Probe (posts lifecycle events from inside the embed) | `frontend-addin/public/embed/spike-lifecycle-probe.js`, included by `poll-game-content.html` |
| Collector + live viewer | `backend/app/api/spike.py` — `POST/GET/DELETE /spike/lifecycle`, viewer at `GET /spike` |
| Slideshow driver (builds test deck, walks the protocol, posts markers) | `frontend-addin/scripts/spike-slideshow-driver.ps1` |
| Manifest repoint (embed loads from localhost instead of the deployed page) | `frontend-addin/scripts/spike-manifest-target.ps1` |
| Event log on disk | `backend/data/spike/embed-lifecycle.jsonl` |

The probe is **inert in production**: it activates only when the page is
served from localhost, or with `?spike=1`, or with
`localStorage["prezo:spike-lifecycle"]="1"`. It never mints or changes embed
identity (reads via `PrezoEmbedIdentity.peek()` only). The collector is
unauthenticated (the probe runs before any auth exists, including cold
slideshow loads) but bounded and write-only.

## Running it

1. Backend: `cd backend; .venv\Scripts\python -m uvicorn app.main:app --port 8000`
2. Probed static build: `cd frontend-addin; npm run build; npm start` (serves `dist` on :3000)
3. Close PowerPoint, then repoint the installed content add-in:
   `powershell -ExecutionPolicy Bypass -File scripts/spike-manifest-target.ps1 -Target localhost`
4. Open the viewer: <http://localhost:8000/spike>
5. Run the driver (opens PowerPoint visibly, takes ~3 minutes, hands off):
   `powershell -ExecutionPolicy Bypass -File scripts/spike-slideshow-driver.ps1`
   Then optionally re-run with `-ColdShow` to replay the slideshow against
   the saved deck with embeds that have never booted (tests mid-show cold
   boot and preload; requires the deck from a previous full run).
6. When done, restore the real manifest (PowerPoint closed again):
   `powershell -ExecutionPolicy Bypass -File scripts/spike-manifest-target.ps1 -Target railway`

The driver builds a 5-slide deck from the sanitized seed (`public/game-slide.pptx`):
slides 2 and 4 carry embeds, 1/3/5 are plain, all transitions set to None.
It then visits the embed slides in edit view (so instances boot and mint
identity), runs a slideshow advancing 1→2→3→4→5, jumps back to 2, exits, and
observes the aftermath. Every step posts a `marker` event into the same
timeline as the probe's events.

## Reading the results

Each probe instance = one webview. Interleave `marker` events with:

- `boot` — the webview was just created (this answers question 1: compare
  boot timestamps against the "advance to slide N" markers).
- `heartbeat` every 2s with `view` (`edit` / `read`), `visibility`, `focused`
  — an instance whose heartbeats stop has been torn down (question 2);
  `pagehide` / `beforeunload` / `freeze` mark graceful teardown.
- `active-view` (`via:"initial"` at ready, `via:"changed"` from
  `ActiveViewChanged`) and `handler-registered` — question 3.
- Distinct `instanceId` per webview, shared `embedId` per slide instance —
  question 4 (edit instance vs show instance vs revisit instance).

## Cleanup

Delete the probe script + its `<script>` tag, `backend/app/api/spike.py` +
its two lines in `main.py`, the two spike scripts, and this doc. The
localhost:3000 CORS defaults in `backend/app/config.py` are worth keeping
(that is the dist server's port).

# Auto poll view control

Polls open on the audience view when the slideshow reaches the slide
carrying their embed, and close when the show moves on — no host clicks.
Verified end to end in real PowerPoint on 05/07/2026 (six transitions,
~0.8s audience latency; harness in `docs/spike-embed-lifecycle.md`).

## Control model

Every poll has a `mode` (`backend/app/models.py`):

- **auto** (default for new polls): slide-driven. The on-slide embed opens
  it while its slide is presented, closes it when the show leaves.
- **open**: host pin — stays open regardless of the slideshow.
- **closed**: host pin — stays closed regardless of the slideshow.

The existing Stop/Resume buttons now PIN (`POST .../open|close` sets mode +
status); the "Follow slides" button (`POST .../mode {mode:"auto"}`) hands
control back to the slideshow. Switching to auto immediately applies the
current presentation state: open if the poll's slide is on air right now,
closed otherwise. The audience app is untouched — it keeps reacting to the
same `poll_opened`/`poll_closed` broadcasts.

## How the pieces fit

1. **Conductor (embed wrapper, `public/embed/poll-game-content.html`).**
   While the deck's view is `read`, each live embed polls
   `getSelectedDataAsync(SlideRange)` every second and compares the
   presented slide's id against its own. On-air/off-air transitions (plus a
   5s keepalive while on air) POST to the presence endpoint with the
   embed's library-sync token. Edit-view instances stay silent so a copy of
   the deck open on another machine cannot fight a live show.
2. **Self-localization (no persistence).** The embed learns which slide it
   lives on from: edit-view boot (edit only instantiates a webview when its
   slide is displayed; the reading is discarded if the host answers slower
   than 3s), or the first resize after entering `read` view (the frame is
   laid out when first composited into the show window — authoritative,
   overrides earlier guesses). Read-view boots preloaded one slide ahead
   are detected via rAF cadence and left for the resize edge.
3. **Policy (`backend/app/api/polls.py`).**
   `POST /sessions/{sid}/polls/{pid}/presence` (library auth) records the
   report in a runtime registry, flips auto-mode polls through the normal
   `set_poll_status` + broadcast path, and sweeps other auto+open polls in
   the session whose conductor has gone silent for 15s. Pinned polls only
   record presence so a later switch to auto lands on the right state.

## Latency budget

Measured locally (marker → audience WebSocket, including PowerPoint's own
slide-change time): 0.3-0.9s per transition. The budget is: conductor tick
(500ms cadence while presenting, one SlideRange host call per tick;
view-change and first-display edges trigger immediate ticks) + presence
POST round trip + backend transition (exactly one status write; keepalives
and pinned polls are storage-free thanks to a per-poll state cache) +
WebSocket push. On the deployed stack add network RTT and ~3 Supabase
queries per actual transition. If transitions feel slow in production,
check the Railway↔Supabase region pairing first — the code path pays one
`get_session` + one `PATCH polls` + one `poll_options` select per flip and
nothing per keepalive.

## Operational notes

- **Supabase migration required before deploy**: `sql/polls_mode.sql`
  (polls.mode column). `create_poll` and the mode endpoint write it.
- Presence state is in-memory: a backend restart closes auto polls on the
  next report/sweep and reopens them on the next keepalive (≤5s).
- If a deck's only embed dies mid-show (PowerPoint crash), its auto poll
  stays open until any other presence report for that session sweeps it, or
  the host pins it closed.
- Platform scope: verified on Windows desktop. PowerPoint on the web and
  Mac need the harness re-run (`docs/spike-embed-lifecycle.md`).
- Content add-ins cannot read `customXmlParts` in PowerPoint (Word-only
  API): embed auth tokens travel via the taskpane writing shared-origin
  localStorage, so a machine where the Prezo Host taskpane never ran signed
  in has embeds that cannot conduct (existing sign-in limitation, unchanged
  by this feature).

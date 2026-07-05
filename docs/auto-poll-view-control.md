# Auto poll view control

Polls, discussions, and Q&A open on the audience view when the slideshow
reaches the slide carrying their embed or widget, and close when the show
moves on — no host clicks. The poll/embed path was verified end to end in
real PowerPoint on 05/07/2026 (six transitions, sub-second audience
latency; harness in `docs/spike-embed-lifecycle.md`).

The same control model applies to all three activity kinds:

| Activity | Carrier on the slide | Mode field | Conductor |
| --- | --- | --- | --- |
| Poll | game embed or poll widget | `Poll.mode` | embed webview or taskpane |
| Discussion | discussion widget (or prompt-bound Q&A widget) | `QnaPrompt.mode` | taskpane |
| Session Q&A | Q&A widget (unbound) | `Session.qna_control_mode` | taskpane |

## Control model

Every poll has a `mode` (`backend/app/models.py`):

- **auto** (default for new polls): slide-driven. The on-slide embed opens
  it while its slide is presented, closes it when the show leaves.
- **open**: host pin — stays open regardless of the slideshow.
- **closed**: host pin — stays closed regardless of the slideshow.

Creating a poll no longer opens it: new polls start auto + closed and go
live when the slideshow reaches their slide (or when the host pins them
open). The existing Stop/Resume buttons PIN (`POST .../open|close` sets
mode + status); the "Follow slides" button (`POST .../mode {mode:"auto"}`)
hands control back to the slideshow. Switching to auto immediately applies the
current presentation state: open if the poll's slide is on air right now,
closed otherwise. The audience app is untouched — it keeps reacting to the
same `poll_opened`/`poll_closed` broadcasts.

## How the pieces fit

Two conductors feed one policy, depending on what carries the poll on the
slide:

- **Embed slides** (live game surface): the content add-in webview
  conducts for itself (below).
- **Widget slides** (native PowerPoint shapes inserted by the taskpane):
  nothing lives on the slide, so the TASKPANE conducts
  (`src/office/slideShowConductor.ts`). While the deck is in read view it
  tracks the presented slide the same way, maps it to a poll through the
  `PrezoPollWidgetSessionId` / `PrezoPollWidgetPollId` slide tags (the map
  refreshes at each show start), and reports to the same presence
  endpoint. Requirements that follow: the Prezo Host taskpane must be open
  on the presenting machine, and the widget must be explicitly bound to a
  poll ("Bind widget") — unbound follow-the-latest widgets are not
  auto-driven. If the same poll is bound to both a widget slide and an
  embed slide, a direct jump between those two slides can close-then-open
  within a few seconds (two conductors handing off); it self-heals via the
  on-air keepalive.

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

- **Supabase migrations required before deploy**: `sql/polls_mode.sql`
  (polls.mode) and `sql/qna_discussion_mode.sql` (qna_prompts.mode,
  sessions.qna_control_mode). The create and mode endpoints write these
  columns.
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

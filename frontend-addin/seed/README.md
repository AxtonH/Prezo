# Game slide seed

`public/game-slide.pptx` is the template the **Insert game slide** button
(widget dialog → function-file.js `insert-game`) feeds to
`insertSlidesFromBase64`. It is a one-slide deck with the Prezo Game
content add-in pre-embedded, sanitized so it ships with **no embedId** —
every inserted copy mints its own identity on first load, exactly like a
manual insert (see `public/embed/embed-identity.js`).

## Creating / regenerating the seed

1. Make sure the Prezo Game content add-in is installed (the installer
   registers `manifest-content.xml`).
2. In PowerPoint: new blank presentation → **Home > Add-ins > Developer
   Add-ins > Prezo Game Surface** → wait until the embed renders on the
   slide.
3. Optionally size/position the frame the way inserted slides should look.
4. Save as `frontend-addin/seed/game-slide.source.pptx` (this folder; the
   raw file is gitignored because it contains a minted embedId).
5. Run the sanitizer, then commit the regenerated template:

   ```powershell
   powershell -ExecutionPolicy Bypass -File frontend-addin/scripts/sanitize-game-slide.ps1
   ```

   It writes `public/game-slide.pptx` and reports how many embedId
   properties it stripped (warns if the file has no webextension parts or
   doesn't reference the game add-in id).

## When to regenerate

- The content add-in's **registration channel changes** — the saved
  webextension reference records store/storeType (developer registry vs
  centralized deployment vs AppSource). A seed made from a dev-registry
  install will not resolve for users who got the add-in via centralized
  deployment.
- The game add-in's **manifest id or SourceLocation domain changes**.
- You want a different default size/position/snapshot for inserted slides.

## Snapshot placeholder

`snapshot-placeholder.png` (this folder, tracked) replaces the embed's
snapshot image inside the template during sanitization. Its source is
`snapshot-placeholder.html` next to it, which documents the
headless-Chrome command to regenerate the PNG. The snapshot is
what PowerPoint paints in the frame **during slide transitions** and on
machines without the add-in; the seed's own snapshot captures whatever
the embed showed at authoring time (often the near-white signed-out
screen, which reads as a white flash mid-transition). Once a user's deck
is saved with the live embed loaded, PowerPoint refreshes the snapshot
to the game's actual look. Pass `-SnapshotImage` to the sanitizer to use
a different image; delete the file to keep the seed's own snapshot.

## Behavior notes

- Machines **without** the content add-in installed show the slide's
  static snapshot instead of the live surface (`AllowSnapshot`).
- **Transitions: keep the game slide's transition set to None/Cut.**
  PowerPoint hides every live add-in frame while a transition animation
  plays and reveals it only afterwards — confirmed empirically
  (12/06/2026): manually inserted and template-inserted embeds behave
  identically (white frame during the animation, pop after); a frame in
  "Show as Saved Image" mode rides the transition perfectly (static
  bitmaps are composited, live webviews are not); other shapes on the
  slide animate normally while the frame area alone stays blank. No
  snapshot, theme, or load-speed change affects this. Since the
  *incoming* slide's transition is the one that plays, setting None on
  the game slide eliminates the blank window while the rest of the deck
  keeps its transitions.
- Inserted copies start with no identity; duplicate detection + fork logic
  in `public/embed/poll-game-content.html` remains the backstop for users
  copy-pasting slides whose embed is already live.

# frontend-addin notes

## Gamified station (public/poc/gamified/)

`poll-game-gamified-app.js` is the **composition root**: state, the `el` map,
factory wiring, and the render orchestrators. Subsystem logic lives in
sibling modules — do not add subsystem logic back into app.js; extend the
module that owns it, or extract a new `createXxx({deps})` factory in the same
style. Full history, per-phase notes, and extraction gotchas:
`docs/gamified-station-modularization.md`.

Module map (all `poll-game-gamified-*`):
- `constants.js`, `utils.js` — leaves; everything may import them.
- `theme.js` (pure sanitizers) + `theme-ui.js` (controls/apply/upload UI).
- `richtext.js` (text keys, override storage, HTML/style sanitizers) +
  `richtext-editor.js` (selection toolbar, contenteditable hosts, commands).
- `session-feed.js` — socket/snapshot/activity selection.
- `artifact-payloads.js`, `ai-transport.js`, `artifact-wizard.js`,
  `library-ui.js` — artifact pipeline + library panel.
- Older handler modules: `artifact-bridge/-mode/-runtime/-package/-copy/
  -textedit/-select/-position/-size/-delete/-history/-guides`,
  `library-storage`, `library-sync`, `inline-attachments`.

Rules that must hold:
- **Extraction, not rewrite** — bodies move verbatim; closure refs become
  injected deps under their ORIGINAL names. Reassignable bindings
  (`currentTheme`, pending override maps) are injected as getters/setters.
- The poll artifact bridge emission must stay **byte-identical** — golden
  fixtures in `tests/` lock it (regenerate only via
  `tests/update-bridge-goldens.mjs` and review the diff).
- `npm test` = `node --test "tests/*.test.mjs"` (Node 24 built-in runner,
  zero test deps; the quoted glob is required on Windows).
- Do NOT share code with `public/embed/poll-game-content.html` — it is a
  deliberately standalone classic script.
- app.js has MIXED CRLF/LF line endings — scripted string replaces must try
  both endings, or use line-based edits.

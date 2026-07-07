# Artifact activity kinds: polls, Q&A, open discussion

Status: implemented (see phase checklist at the bottom).

Artifacts (AI-generated interactive HTML scenes rendered in the on-slide content
add-in) were poll-exclusive. This document records the design that extends
generation, editing, the creation wizard, slide binding, and live data to the
other two activity types.

## Activity kinds

One vocabulary across the stack, matching the session-dashboard product language:

| kind | Entity | Live content | UI label |
| --- | --- | --- | --- |
| `poll` | `Poll` | options + votes | Poll |
| `qna` | Session `qna_open` | `Question` rows with `prompt_id == null` | Q&A |
| `discussion` | `QnaPrompt` | `Question` rows with `prompt_id == <prompt>` | Open discussion |

Note the naming inversion inherited from the codebase: the `QnaPrompt` entity is
surfaced as "Open discussion" and the session-level flag as "Q&A". The `kind`
strings follow the UI (and the `Active*ActivityCard` names), not the entity names.

`qna` and `discussion` share one data shape (a moderated, upvoted list of audience
text submissions), so they share one runtime contract, one payload builder, and one
renderer hook family. They differ only in where the list comes from and in prompt
copy (a discussion artifact must feature the host's prompt; a Q&A artifact is a
session-level board).

## Runtime contract

The poll contract is unchanged. The qna/discussion contract is its parallel:

| | poll | qna / discussion |
| --- | --- | --- |
| Host message type | `prezo-poll-state` | `prezo-qna-state` |
| Renderer registration | `window.prezoSetPollRenderer(fn)` | `window.prezoSetQnaRenderer(fn)` |
| Render hook | `window.prezoRenderPoll(state)` | `window.prezoRenderQna(state)` |
| Pull | `window.prezoGetPollState()` | `window.prezoGetQnaState()` |
| Last state mirror | `window.__PREZO_POLL_STATE` | `window.__PREZO_QNA_STATE` |
| DOM event | `prezo:poll-update` | `prezo:qna-update` |

Payload built by the station host (`buildArtifactQnaPayload`):

```js
{
  kind: 'qna' | 'discussion',
  qna: {
    id,                  // prompt id (discussion) or session id (qna)
    title,               // discussion: the host's prompt; qna: session Q&A heading
    status,              // 'open' | 'closed'
    questions: [ { id, text, votes, percentage, rank } ],  // approved only,
    totalQuestions,      // sorted votes desc then newest
    totalVotes,
  },
  meta: { sessionId, code, socketStatus, activityKind,
          recommendedVisibleQuestions, expectedMaxQuestions, artifactCopy? },
}
```

The injected runtime normalizer aliases generously (questions/entries/items,
votes/voteCount/count, percentage/percent/pct, title/prompt/question) exactly like
the poll normalizer, so model-generated renderers survive naming drift. Both hook
families are installed by the injected bridge regardless of kind; the host only
posts the kind it is bound to. Questions are reconciled by question id; renderers
must be idempotent and must design an empty state (zero questions) since Q&A
artifacts usually go live before submissions exist.

## Where kind branches

Backend (`context.artifact.activityKind` carries the kind into the AI routes; the
route names stay `/ai/poll-game-*` for wire compat):

- `ai_prompts.py` — `build_artifact_system_instruction(kind)` (and patch/assistant
  builders). `POLL_GAME_ARTIFACT_SYSTEM_INSTRUCTION` remains the poll instance.
- `artifact_quality.py` — `resolve_artifact_activity_kind`, per-kind live-state
  token sets (`ARTIFACT_LIVE_STATE_TOKENS` is now the union used for hook
  extraction/preservation; validation gates on the kind's own set), and a
  question-list twin of the append-only option lint.
- `api/ai.py` — resolves kind once per request and threads it through build,
  patch, repair, stable recovery, and the assistant/intake routes.
- `artifact_intake.py` — kind-aware intake copy (the brief itself is kind-neutral).
- `models.py` — `SavedArtifact(.Upsert).kind` (default `poll`);
  `EmbedInstance(.Create/.Update).prompt_id` for discussion binding.
- Migration: `sql/artifact_activity_kinds.sql` (deploy gate, like `polls_mode.sql`).

Station + embed (frontend):

- `poll-game-gamified-artifact-runtime.js` — qna hook family + `normalizeQnaState`,
  injected alongside the poll bridge.
- `poll-game-gamified-app.js` — `state.activityKind` from the URL
  (`activityKind`/`promptId` params), qna snapshot selection + socket merges
  (`question_*`, `qna_prompt_*`, `qna_opened/closed`), `buildArtifactQnaPayload`,
  kind-aware build/edit context, library filtered by kind.
- `poll-game-gamified-artifact-mode.js` — kind-aware prompt builders.
- `public/embed/poll-game-content.html` — activity picker (poll/qna/discussion +
  prompt dropdown), persists `artifact_kind` + `prompt_id` on the EmbedInstance,
  conductor posts presence to the matching endpoint per kind
  (`polls/{id}/presence`, `qna-prompts/{id}/presence`, `qna/presence`).
- Task pane — Configure on Q&A and discussion cards routes to the editing station
  with `activityKind`/`promptId` (`editingStationUrl.ts`).

## Phases

1. Backend: kind vocabulary, kind-aware prompts/validation/repair, models + storage
   + migration.
2. Runtime + station data plumbing: qna state channel end to end (socket → payload
   → bridge → injected hooks), kind-aware station state.
3. Wizard/editor UX: kind-aware intake, prompt builders, copy, library filtering.
4. Embed wrapper: activity/prompt pickers, EmbedInstance persistence, conductor
   presence routing per kind.
5. Task pane: Configure entry points on Q&A/discussion cards, editing-station URL
   params.
6. Tests, builds, docs.

## Auto view control

The embed wrapper's conductor (previously poll-only) now reports slide presence
to the endpoint matching the embed's kind: `polls/{id}/presence`,
`qna-prompts/{id}/presence`, or `qna/presence`. Off-air releases target
whatever was last put on air (kind + id are remembered), so re-binding an
embed mid-session can't leave the old activity stuck open. The taskpane
widget conductor (docs/auto-poll-view-control.md) is unchanged.

## Deploy gate

Run `sql/artifact_activity_kinds.sql` on Supabase before deploying: adds
`saved_poll_game_artifacts.kind` (check-constrained to the three kinds,
default `poll`) and `embed_instances.prompt_id uuid`. Version rows don't
carry a kind — it is identity-level metadata on the artifact record.

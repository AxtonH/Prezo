-- Artifact activity kinds: extend artifacts beyond polls to Q&A and open
-- discussion (docs/artifact-activity-kinds.md).
--
-- saved_poll_game_artifacts.kind — which activity the artifact renders:
--   poll:       options + votes (all pre-existing artifacts)
--   qna:        session-level audience Q&A (questions with no prompt)
--   discussion: a QnaPrompt the host posed (prompt-bound audience answers)
-- embed_instances.prompt_id — QnaPrompt binding for discussion-kind embeds,
--   sibling of poll_id.
--
-- Apply BEFORE deploying a backend that writes these columns (saving an
-- artifact sends kind; configuring a discussion embed sends prompt_id).
-- Run in Supabase Dashboard → SQL. Companion to polls_mode.sql and
-- qna_discussion_mode.sql.

alter table public.saved_poll_game_artifacts
  add column if not exists kind text not null default 'poll'
  check (kind in ('poll', 'qna', 'discussion'));

alter table public.embed_instances
  add column if not exists prompt_id uuid;

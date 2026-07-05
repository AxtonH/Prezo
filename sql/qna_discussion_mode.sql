-- Control mode for auto view control on Q&A and discussion widgets.
-- auto:   slide-driven — the taskpane conductor opens the activity while a
--         widget slide bound to it is presented and closes it afterwards.
-- open:   host pin — stays open regardless of the slideshow.
-- closed: host pin — stays closed regardless of the slideshow.
--
-- Apply BEFORE deploying a backend that writes these columns (creating a
-- discussion and the qna/prompt mode endpoints send them). Run in Supabase
-- Dashboard → SQL. Companion to polls_mode.sql.

alter table public.qna_prompts
  add column if not exists mode text not null default 'auto'
  check (mode in ('auto', 'open', 'closed'));

alter table public.sessions
  add column if not exists qna_control_mode text not null default 'auto'
  check (qna_control_mode in ('auto', 'open', 'closed'));

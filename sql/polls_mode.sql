-- Poll control mode for auto poll view control.
-- auto:   slide-driven — presence reports from the on-slide embed open the
--         poll while its slide is presented and close it when the show moves on.
-- open:   host pin — stays open regardless of the slideshow.
-- closed: host pin — stays closed regardless of the slideshow.
--
-- Apply BEFORE deploying a backend that writes the column (create_poll and
-- POST .../polls/{id}/mode both send it). Run in Supabase Dashboard → SQL.

alter table public.polls
  add column if not exists mode text not null default 'auto'
  check (mode in ('auto', 'open', 'closed'));

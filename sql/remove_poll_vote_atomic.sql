-- Companion to vote_poll_atomic. Removes a single (poll, option, client) vote
-- and returns the updated poll with current vote counts in the same shape as
-- vote_poll_atomic. Idempotent — if the vote doesn't exist, returns the poll
-- unchanged. Errors with P0002 if poll not found, P0001 if poll is closed.
--
-- Schema assumptions (adjust if your real schema differs):
--   polls(id, session_id, question, status, allow_multiple, created_at)
--   poll_options(id, poll_id, label, position)
--   poll_votes(poll_id, option_id, client_id, created_at)
--
-- If your `vote_poll_atomic` uses different column names or table names,
-- mirror them here so the two RPCs produce identical poll payloads.

create or replace function public.remove_poll_vote_atomic(
  p_session_id uuid,
  p_poll_id uuid,
  p_option_id uuid,
  p_client_id text
)
returns jsonb
language plpgsql
as $$
declare
  v_status text;
  v_result jsonb;
begin
  select status into v_status
    from public.polls
   where id = p_poll_id
     and session_id = p_session_id;

  if not found then
    raise exception 'poll not found' using errcode = 'P0002';
  end if;

  if v_status <> 'open' then
    raise exception 'poll is closed' using errcode = 'P0001';
  end if;

  -- Idempotent delete. No-op if the vote was not present.
  delete from public.poll_votes
   where poll_id = p_poll_id
     and option_id = p_option_id
     and client_id = p_client_id;

  -- Build the same payload shape as vote_poll_atomic returns.
  select jsonb_build_object(
           'id',             p.id,
           'session_id',     p.session_id,
           'question',       p.question,
           'status',         p.status,
           'allow_multiple', p.allow_multiple,
           'created_at',     p.created_at,
           'options',        coalesce(
                               (
                                 select jsonb_agg(
                                          jsonb_build_object(
                                            'id',    o.id,
                                            'label', o.label,
                                            'votes', (
                                              select count(*)
                                                from public.poll_votes v
                                               where v.poll_id   = p.id
                                                 and v.option_id = o.id
                                            )
                                          )
                                          order by o.position
                                        )
                                   from public.poll_options o
                                  where o.poll_id = p.id
                               ),
                               '[]'::jsonb
                             )
         )
    into v_result
    from public.polls p
   where p.id = p_poll_id;

  return v_result;
end;
$$;

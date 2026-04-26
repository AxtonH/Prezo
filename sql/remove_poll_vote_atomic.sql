-- Companion to vote_poll_atomic. Removes a single (poll, option, client) vote
-- from the poll_votes table AND decrements the denormalized counter on
-- poll_options.votes, then returns the updated poll in the same payload
-- shape as vote_poll_atomic. Idempotent — if no matching row exists, the
-- counter is left alone and the unchanged poll is returned.
--
-- This MUST stay aligned with vote_poll_atomic's storage model: that
-- function inserts into poll_votes AND updates poll_options.votes, and
-- reads vote counts back from poll_options.votes (not from count(*) over
-- poll_votes). If you change one, change both.

create or replace function public.remove_poll_vote_atomic(
  p_session_id uuid,
  p_poll_id uuid,
  p_option_id uuid,
  p_client_id text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_poll polls%rowtype;
  v_option poll_options%rowtype;
  v_client_id text;
  v_deleted_count integer := 0;
begin
  v_client_id := nullif(btrim(coalesce(p_client_id, '')), '');

  select *
    into v_poll
    from polls
   where id = p_poll_id and session_id = p_session_id
   for update;

  if not found then
    raise exception 'poll not found' using errcode = 'P0002';
  end if;

  if v_poll.status <> 'open' then
    raise exception 'poll is closed' using errcode = 'P0001';
  end if;

  select *
    into v_option
    from poll_options
   where id = p_option_id and poll_id = p_poll_id
   for update;

  if not found then
    raise exception 'option not found' using errcode = 'P0002';
  end if;

  if v_client_id is not null then
    delete from poll_votes
     where poll_id = p_poll_id
       and option_id = p_option_id
       and client_id = v_client_id;

    get diagnostics v_deleted_count = row_count;

    if v_deleted_count > 0 then
      update poll_options
         set votes = greatest(0, votes - 1)
       where poll_id = p_poll_id
         and id = p_option_id;
    end if;
  end if;

  return jsonb_build_object(
    'id',             v_poll.id,
    'session_id',     v_poll.session_id,
    'question',       v_poll.question,
    'status',         v_poll.status,
    'allow_multiple', v_poll.allow_multiple,
    'created_at',     v_poll.created_at,
    'options',
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object('id', po.id, 'label', po.label, 'votes', po.votes)
                 order by po.position asc
               )
          from poll_options po
         where po.poll_id = v_poll.id
      ),
      '[]'::jsonb
    )
  );
end;
$function$;

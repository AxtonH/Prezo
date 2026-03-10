create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text unique not null,
  title text,
  status text not null default 'active',
  allow_host_join boolean not null default false,
  qna_open boolean not null default false,
  qna_mode text not null default 'audience',
  qna_prompt text,
  created_at timestamptz not null default now()
);

alter table if exists sessions
  add column if not exists allow_host_join boolean not null default false;

create table if not exists session_hosts (
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists qna_prompts (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  prompt text not null,
  status text not null default 'closed',
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  prompt_id uuid references qna_prompts(id) on delete cascade,
  text text not null,
  status text not null default 'pending',
  votes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists question_votes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  client_id text not null,
  created_at timestamptz not null default now(),
  unique (question_id, client_id)
);

create table if not exists polls (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  question text not null,
  status text not null default 'closed',
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists poll_options (
  id uuid primary key,
  poll_id uuid not null references polls(id) on delete cascade,
  label text not null,
  votes integer not null default 0,
  position integer not null default 0
);

create table if not exists poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade,
  client_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, client_id, option_id)
);

create or replace function public.vote_poll_atomic(
  p_session_id uuid,
  p_poll_id uuid,
  p_option_id uuid,
  p_client_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll polls%rowtype;
  v_option poll_options%rowtype;
  v_client_id text;
  v_previous_option_ids uuid[];
  v_inserted_count integer := 0;
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
    if not v_poll.allow_multiple then
      select array_agg(option_id)
      into v_previous_option_ids
      from poll_votes
      where poll_id = p_poll_id and client_id = v_client_id;

      if coalesce(array_length(v_previous_option_ids, 1), 0) > 0 then
        if p_option_id = any(v_previous_option_ids) then
          return jsonb_build_object(
            'id', v_poll.id,
            'session_id', v_poll.session_id,
            'question', v_poll.question,
            'status', v_poll.status,
            'allow_multiple', v_poll.allow_multiple,
            'created_at', v_poll.created_at,
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
        end if;

        delete from poll_votes
        where poll_id = p_poll_id and client_id = v_client_id;

        update poll_options
        set votes = greatest(0, votes - 1)
        where poll_id = p_poll_id and id = any(v_previous_option_ids);
      end if;
    else
      if exists(
        select 1
        from poll_votes
        where poll_id = p_poll_id
          and client_id = v_client_id
          and option_id = p_option_id
      ) then
        return jsonb_build_object(
          'id', v_poll.id,
          'session_id', v_poll.session_id,
          'question', v_poll.question,
          'status', v_poll.status,
          'allow_multiple', v_poll.allow_multiple,
          'created_at', v_poll.created_at,
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
      end if;
    end if;

    insert into poll_votes (poll_id, option_id, client_id)
    values (p_poll_id, p_option_id, v_client_id)
    on conflict (poll_id, client_id, option_id) do nothing;

    get diagnostics v_inserted_count = row_count;
    if v_inserted_count = 0 then
      return jsonb_build_object(
        'id', v_poll.id,
        'session_id', v_poll.session_id,
        'question', v_poll.question,
        'status', v_poll.status,
        'allow_multiple', v_poll.allow_multiple,
        'created_at', v_poll.created_at,
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
    end if;
  end if;

  update poll_options
  set votes = votes + 1
  where poll_id = p_poll_id and id = p_option_id;

  return jsonb_build_object(
    'id', v_poll.id,
    'session_id', v_poll.session_id,
    'question', v_poll.question,
    'status', v_poll.status,
    'allow_multiple', v_poll.allow_multiple,
    'created_at', v_poll.created_at,
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
$$;

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists session_hosts_user_id_idx on session_hosts (user_id);
create index if not exists questions_session_id_idx on questions (session_id);
create index if not exists questions_prompt_id_idx on questions (prompt_id);
create index if not exists qna_prompts_session_id_idx on qna_prompts (session_id);
create index if not exists polls_session_id_idx on polls (session_id);
create index if not exists poll_options_poll_id_idx on poll_options (poll_id);
create index if not exists poll_votes_poll_client_idx on poll_votes (poll_id, client_id);

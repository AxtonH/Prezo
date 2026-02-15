create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null,
  code text unique not null,
  title text,
  status text not null default 'active',
  qna_open boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
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

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists questions_session_id_idx on questions (session_id);
create index if not exists polls_session_id_idx on polls (session_id);
create index if not exists poll_options_poll_id_idx on poll_options (poll_id);
create index if not exists poll_votes_poll_client_idx on poll_votes (poll_id, client_id);

-- Historial de llamadas independiente de las conversaciones del chat.
create table if not exists public.cr_call_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  created_at timestamptz not null default now()
);
create index if not exists cr_call_sessions_user_started_idx
  on public.cr_call_sessions (user_id, started_at desc);

create table if not exists public.cr_call_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cr_call_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 200000),
  created_at timestamptz not null default now()
);
create index if not exists cr_call_turns_session_created_idx
  on public.cr_call_turns (session_id, created_at asc);

alter table public.cr_call_sessions enable row level security;
alter table public.cr_call_turns enable row level security;
revoke all on public.cr_call_sessions, public.cr_call_turns from anon, authenticated;
grant select, insert, update on public.cr_call_sessions to authenticated;
grant select, insert on public.cr_call_turns to authenticated;

drop policy if exists cr_call_sessions_select on public.cr_call_sessions;
create policy cr_call_sessions_select on public.cr_call_sessions
  for select to authenticated using (user_id = auth.uid() and not public.cr_is_suspended());
drop policy if exists cr_call_sessions_insert on public.cr_call_sessions;
create policy cr_call_sessions_insert on public.cr_call_sessions
  for insert to authenticated with check (user_id = auth.uid() and not public.cr_is_suspended());
drop policy if exists cr_call_sessions_update on public.cr_call_sessions;
create policy cr_call_sessions_update on public.cr_call_sessions
  for update to authenticated using (user_id = auth.uid() and not public.cr_is_suspended())
  with check (user_id = auth.uid());

drop policy if exists cr_call_turns_select on public.cr_call_turns;
create policy cr_call_turns_select on public.cr_call_turns
  for select to authenticated using (user_id = auth.uid() and not public.cr_is_suspended());
drop policy if exists cr_call_turns_insert on public.cr_call_turns;
create policy cr_call_turns_insert on public.cr_call_turns
  for insert to authenticated with check (
    user_id = auth.uid() and not public.cr_is_suspended()
    and exists (select 1 from public.cr_call_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

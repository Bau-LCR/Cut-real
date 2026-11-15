-- Proyectos generales: espacio guiado con conversación persistente por proyecto.
create table if not exists public.cr_work_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid null references public.cr_conversations(id) on delete set null,
  name text not null,
  category text not null default 'otro',
  objective text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cr_work_projects_name_length check (char_length(name) between 1 and 120),
  constraint cr_work_projects_category check (category in ('investigacion','presentacion','documento','diseno','programacion','datos','multimedia','otro'))
);
create index if not exists cr_work_projects_user_updated_idx
  on public.cr_work_projects (user_id, updated_at desc);
alter table public.cr_work_projects enable row level security;
drop policy if exists "Users read own work projects" on public.cr_work_projects;
create policy "Users read own work projects" on public.cr_work_projects
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users create own work projects" on public.cr_work_projects;
create policy "Users create own work projects" on public.cr_work_projects
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update own work projects" on public.cr_work_projects;
create policy "Users update own work projects" on public.cr_work_projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users delete own work projects" on public.cr_work_projects;
create policy "Users delete own work projects" on public.cr_work_projects
  for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.cr_work_projects to authenticated;

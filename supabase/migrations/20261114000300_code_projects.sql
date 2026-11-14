-- Proyectos de programación personales de cada usuario.
create table if not exists public.cr_code_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Mi proyecto',
  files jsonb not null default '{"index.html":"","style.css":"","script.js":""}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cr_code_projects_name_length check (char_length(name) between 1 and 100),
  constraint cr_code_projects_files_object check (jsonb_typeof(files) = 'object')
);

create index if not exists cr_code_projects_user_updated_idx
  on public.cr_code_projects (user_id, updated_at desc);

alter table public.cr_code_projects enable row level security;

drop policy if exists "Users read own code projects" on public.cr_code_projects;
create policy "Users read own code projects" on public.cr_code_projects
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users create own code projects" on public.cr_code_projects;
create policy "Users create own code projects" on public.cr_code_projects
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users update own code projects" on public.cr_code_projects;
create policy "Users update own code projects" on public.cr_code_projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users delete own code projects" on public.cr_code_projects;
create policy "Users delete own code projects" on public.cr_code_projects
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.cr_code_projects to authenticated;

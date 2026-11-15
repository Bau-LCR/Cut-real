-- Imágenes creadas por Cut-real: bucket privado y metadatos aislados por usuario.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cr-generated-images', 'cr-generated-images', false, 12582912, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 12582912, allowed_mime_types = array['image/png','image/jpeg','image/webp'];

create table if not exists public.cr_generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid null references public.cr_conversations(id) on delete set null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  prompt text not null default '',
  alt_text text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cr_generated_images_user_created_idx on public.cr_generated_images(user_id, created_at desc);
alter table public.cr_generated_images enable row level security;
drop policy if exists "Users read own generated images" on public.cr_generated_images;
create policy "Users read own generated images" on public.cr_generated_images
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.cr_generated_images from anon;
grant select on public.cr_generated_images to authenticated;

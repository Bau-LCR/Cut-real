-- Secure, one-time pairing credentials for the Memory Task integration.
-- Secrets are encrypted by Edge Functions with a key derived from the server-only
-- Supabase service-role key; no credential is exposed to browser code.

create table if not exists public.cr_memory_task_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  public_jwk jsonb not null,
  private_jwk_ciphertext text not null,
  private_jwk_iv text not null,
  api_key_ciphertext text,
  api_key_iv text,
  endpoint text,
  app_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'disconnected')),
  expires_at timestamptz not null,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cr_memory_task_connected_fields_check check (
    status <> 'connected'
    or (api_key_ciphertext is not null and api_key_iv is not null and endpoint is not null and app_id is not null and connected_at is not null)
  )
);

create index if not exists cr_memory_task_connections_owner_idx
  on public.cr_memory_task_connections(owner_id, created_at desc);
create index if not exists cr_memory_task_connections_pending_idx
  on public.cr_memory_task_connections(token_hash, expires_at)
  where status = 'pending';

alter table public.cr_memory_task_connections enable row level security;
revoke all on public.cr_memory_task_connections from anon, authenticated;
grant all on public.cr_memory_task_connections to service_role;

comment on table public.cr_memory_task_connections is
  'Credenciales cifradas de la integración Memory Task y solicitudes de vinculación de un solo uso. Solo Edge Functions de Cut-real pueden acceder.';

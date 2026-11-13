-- =====================================================================
-- Cut-real 2 · esquema inicial
-- Todas las tablas/funciones llevan el prefijo cr_ para convivir con
-- otras apps (p. ej. Memory Task) dentro del mismo proyecto de Supabase.
-- Nada se crea sobre auth.users (no hay triggers en tablas compartidas).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Esquema privado: NO expuesto por la API REST. Guarda configuración inicial.
create schema if not exists cutreal_private;
revoke all on schema cutreal_private from public, anon, authenticated;
create table if not exists cutreal_private.config (
  key text primary key,
  value text not null
);
revoke all on cutreal_private.config from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Perfiles y roles
-- ---------------------------------------------------------------------
create table public.cr_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Los roles viven en otra tabla: el usuario puede LEER su fila pero jamás escribirla.
create table public.cr_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin', 'owner')),
  suspended boolean not null default false,
  suspended_reason text,
  suspended_at timestamptz,
  updated_at timestamptz not null default now()
);
-- Un solo propietario posible.
create unique index cr_single_owner on public.cr_user_roles ((role)) where role = 'owner';

create table public.cr_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_model_id uuid,
  web_search_default boolean not null default false,
  voice jsonb not null default '{"rate":1,"auto_read":false,"engine":"browser"}'::jsonb,
  privacy_notice_ack_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Proveedores y modelos (SIN secretos: solo el NOMBRE de la variable de entorno)
-- ---------------------------------------------------------------------
create table public.cr_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]{2,40}$'),
  name text not null,
  kind text not null default 'openai_compatible' check (kind in ('openai_compatible')),
  base_url text not null check (base_url ~ '^https://'),
  api_key_env text not null check (api_key_env ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  enabled boolean not null default true,
  rpm_limit integer check (rpm_limit is null or rpm_limit > 0),     -- solicitudes/min globales del proveedor
  daily_request_limit integer check (daily_request_limit is null or daily_request_limit > 0),
  created_at timestamptz not null default now()
);

create table public.cr_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.cr_providers(id) on delete cascade,
  model_key text not null,
  display_name text not null,
  enabled boolean not null default true,
  supports_vision boolean not null default false,
  context_window integer,
  max_output_tokens integer default 4096 check (max_output_tokens is null or max_output_tokens > 0),
  sort_order integer not null default 100,
  user_rpm_limit integer not null default 20 check (user_rpm_limit > 0), -- límite por usuario
  created_at timestamptz not null default now(),
  unique (provider_id, model_key)
);
alter table public.cr_user_settings
  add constraint cr_user_settings_model_fk foreign key (default_model_id) references public.cr_models(id) on delete set null;

-- Vista segura para el cliente (sin api_key_env ni base_url).
create view public.cr_available_models as
  select m.id, m.model_key, m.display_name, m.supports_vision, m.context_window,
         m.sort_order, p.slug as provider_slug, p.name as provider_name
  from public.cr_models m join public.cr_providers p on p.id = m.provider_id
  where m.enabled and p.enabled;

-- ---------------------------------------------------------------------
-- Conversaciones y mensajes
-- ---------------------------------------------------------------------
create table public.cr_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva conversación' check (char_length(title) between 1 and 200),
  model_id uuid references public.cr_models(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index cr_conv_user_recent on public.cr_conversations (user_id, last_message_at desc);
create index cr_conv_title_trgm on public.cr_conversations using gin (title gin_trgm_ops);

create table public.cr_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  conversation_id uuid not null references public.cr_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '' check (char_length(content) <= 200000),
  status text not null default 'done' check (status in ('generating', 'done', 'error', 'cancelled', 'interrupted')),
  model_id uuid references public.cr_models(id) on delete set null,
  error text check (error is null or char_length(error) <= 500),
  sources jsonb not null default '[]'::jsonb,
  web_search_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cr_msg_conv_seq on public.cr_messages (conversation_id, seq desc);
create index cr_msg_user on public.cr_messages (user_id);
create index cr_msg_content_trgm on public.cr_messages using gin (content gin_trgm_ops);

create table public.cr_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.cr_conversations(id) on delete cascade,
  message_id uuid references public.cr_messages(id) on delete set null,
  storage_path text not null,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  -- processed: el contenido se extrajo y se envía al modelo.
  -- attached_only: se guardó pero el modelo NO lo analiza.
  status text not null default 'attached_only' check (status in ('processed', 'attached_only', 'failed')),
  extracted_text text check (extracted_text is null or char_length(extracted_text) <= 400000),
  created_at timestamptz not null default now()
);
create index cr_att_conv on public.cr_attachments (conversation_id);
create index cr_att_user on public.cr_attachments (user_id);

-- ---------------------------------------------------------------------
-- API propia, integraciones, auditoría, uso, rate limit
-- ---------------------------------------------------------------------
create table public.cr_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null,                      -- primeros caracteres, solo para identificar
  key_hash text not null unique,                 -- SHA-256 del secreto (alta entropía)
  scopes text[] not null default '{}',
  rate_limit_per_minute integer not null default 30 check (rate_limit_per_minute between 1 and 10000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

create table public.cr_integrations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'disabled' check (status in ('disabled', 'enabled')),
  allowed_scopes text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,     -- NUNCA secretos
  created_at timestamptz not null default now()
);

create table public.cr_integration_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.cr_integrations(id) on delete cascade,
  scopes text[] not null default '{}',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index cr_grant_active on public.cr_integration_grants (user_id, integration_id) where revoked_at is null;

create table public.cr_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'api_key', 'system')),
  action text not null,
  target_type text,
  target_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index cr_audit_created on public.cr_audit_logs (created_at desc);
create index cr_audit_actor on public.cr_audit_logs (actor_id);

create table public.cr_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  api_key_id uuid references public.cr_api_keys(id) on delete set null,
  conversation_id uuid,
  provider_id uuid references public.cr_providers(id) on delete set null,
  model_id uuid references public.cr_models(id) on delete set null,
  kind text not null check (kind in ('chat', 'stt', 'tts', 'search', 'api')),
  status text not null check (status in ('ok', 'error', 'cancelled', 'rate_limited')),
  error_code text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index cr_usage_created on public.cr_usage_events (created_at desc);
create index cr_usage_user on public.cr_usage_events (user_id, created_at desc);
create index cr_usage_key on public.cr_usage_events (api_key_id, created_at desc);

create table public.cr_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------
create or replace function public.cr_current_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.cr_user_roles where user_id = auth.uid()), 'user')
$$;

create or replace function public.cr_is_suspended() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select suspended from public.cr_user_roles where user_id = auth.uid()), false)
$$;

-- Crea perfil/rol/ajustes en el primer acceso (sin triggers sobre auth.users)
-- y concede el rol "owner" UNA sola vez al correo configurado en cutreal_private.config.
create or replace function public.cr_ensure_profile() returns jsonb
language plpgsql security definer set search_path = public, cutreal_private as $$
declare
  uid uuid := auth.uid();
  u record;
  initial_admin text;
  r record;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select id, email, raw_user_meta_data, email_confirmed_at into u from auth.users where id = uid;

  insert into public.cr_profiles (user_id, email, display_name, avatar_url)
  values (uid, u.email,
          left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)), 80),
          left(u.raw_user_meta_data->>'avatar_url', 500))
  on conflict (user_id) do update set last_seen_at = now(), email = excluded.email;

  insert into public.cr_user_roles (user_id) values (uid) on conflict do nothing;
  insert into public.cr_user_settings (user_id) values (uid) on conflict do nothing;

  select value into initial_admin from cutreal_private.config where key = 'initial_admin_email';
  if initial_admin is not null and u.email is not null and u.email_confirmed_at is not null
     and lower(initial_admin) = lower(u.email)
     and not exists (select 1 from public.cr_user_roles where role = 'owner') then
    update public.cr_user_roles set role = 'owner', updated_at = now() where user_id = uid;
    insert into public.cr_audit_logs (actor_id, actor_kind, action, target_type, target_id)
    values (uid, 'system', 'owner.bootstrap', 'user', uid::text);
  end if;

  select role, suspended into r from public.cr_user_roles where user_id = uid;
  return jsonb_build_object('role', r.role, 'suspended', r.suspended);
end $$;

-- Rate limit atómico por ventana fija. Solo service_role.
create or replace function public.cr_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare h integer;
begin
  insert into public.cr_rate_limits as rl (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.hits + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning hits into h;
  return h <= p_limit;
end $$;

-- Búsqueda del propio usuario (security invoker: respeta RLS).
create or replace function public.cr_search_conversations(q text)
returns setof public.cr_conversations language sql stable security invoker set search_path = public as $$
  select c.* from public.cr_conversations c
  where c.user_id = auth.uid()
    and char_length(trim(q)) >= 2
    and (c.title ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or exists (select 1 from public.cr_messages m
                 where m.conversation_id = c.id
                   and m.content ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'))
  order by c.last_message_at desc limit 30
$$;

-- El usuario revoca por sí mismo una autorización de integración.
create or replace function public.cr_revoke_my_grant(p_grant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cr_integration_grants set revoked_at = now()
  where id = p_grant_id and user_id = auth.uid() and revoked_at is null;
  insert into public.cr_audit_logs (actor_id, action, target_type, target_id)
  values (auth.uid(), 'integration.grant_revoked_by_user', 'integration_grant', p_grant_id::text);
end $$;

-- Marca como "interrupted" las generaciones abandonadas (sin actividad > 3 min).
create or replace function public.cr_sweep_stale_generations() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.cr_messages set status = 'interrupted', error = coalesce(error, 'La generación se interrumpió.')
  where status = 'generating' and updated_at < now() - interval '3 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- Estadísticas para el panel (solo service_role; la Edge Function verifica admin antes).
create or replace function public.cr_admin_stats(p_days integer default 14) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users', (select count(*) from public.cr_profiles),
    'active_users_7d', (select count(*) from public.cr_profiles where last_seen_at > now() - interval '7 days'),
    'active_users_24h', (select count(*) from public.cr_profiles where last_seen_at > now() - interval '24 hours'),
    'suspended_users', (select count(*) from public.cr_user_roles where suspended),
    'conversations', (select count(*) from public.cr_conversations),
    'messages', (select count(*) from public.cr_messages),
    'errors_24h', (select count(*) from public.cr_usage_events where status = 'error' and created_at > now() - interval '24 hours'),
    'by_model', coalesce((select jsonb_agg(x) from (
        select coalesce(m.display_name, 'eliminado') as model, count(*) as requests,
               coalesce(sum(e.prompt_tokens), 0) as prompt_tokens, coalesce(sum(e.completion_tokens), 0) as completion_tokens
        from public.cr_usage_events e left join public.cr_models m on m.id = e.model_id
        where e.kind in ('chat', 'api') and e.created_at > now() - make_interval(days => p_days)
        group by 1 order by 2 desc limit 20) x), '[]'::jsonb),
    'by_provider', coalesce((select jsonb_agg(x) from (
        select coalesce(p.name, 'n/d') as provider, count(*) as requests,
               count(*) filter (where e.status = 'error') as errors
        from public.cr_usage_events e left join public.cr_providers p on p.id = e.provider_id
        where e.created_at > now() - make_interval(days => p_days)
        group by 1 order by 2 desc) x), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(x order by x.day) from (
        select date_trunc('day', created_at)::date as day, count(*) as requests,
               count(*) filter (where status = 'error') as errors
        from public.cr_usage_events where created_at > now() - make_interval(days => p_days)
        group by 1) x), '[]'::jsonb),
    'recent_errors', coalesce((select jsonb_agg(x) from (
        select e.created_at, e.kind, e.error_code, p.name as provider
        from public.cr_usage_events e left join public.cr_providers p on p.id = e.provider_id
        where e.status = 'error' order by e.created_at desc limit 15) x), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- Permisos: se parte de cero y se concede solo lo imprescindible
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['cr_profiles','cr_user_roles','cr_user_settings','cr_providers','cr_models',
    'cr_conversations','cr_messages','cr_attachments','cr_api_keys','cr_integrations','cr_integration_grants',
    'cr_audit_logs','cr_usage_events','cr_rate_limits']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on public.cr_available_models from anon;
grant select on public.cr_available_models to authenticated;

-- Solo se tocan funciones cr_* (otras apps del mismo proyecto no se ven afectadas).
revoke execute on function public.cr_current_role(), public.cr_is_suspended(), public.cr_ensure_profile(),
  public.cr_search_conversations(text), public.cr_revoke_my_grant(uuid) from public, anon;
grant execute on function public.cr_ensure_profile(), public.cr_search_conversations(text),
  public.cr_revoke_my_grant(uuid), public.cr_current_role(), public.cr_is_suspended() to authenticated;
-- Funciones internas: solo service_role (Edge Functions).
revoke execute on function public.cr_rate_limit(text, integer, integer), public.cr_admin_stats(integer),
  public.cr_sweep_stale_generations() from public, anon, authenticated;
grant execute on function public.cr_rate_limit(text, integer, integer), public.cr_admin_stats(integer),
  public.cr_sweep_stale_generations() to service_role;

-- Perfiles: leer el propio; editar SOLO nombre y avatar (permiso por columna).
grant select on public.cr_profiles to authenticated;
grant update (display_name, avatar_url) on public.cr_profiles to authenticated;
create policy cr_profiles_select on public.cr_profiles for select to authenticated using (user_id = auth.uid());
create policy cr_profiles_update on public.cr_profiles for update to authenticated
  using (user_id = auth.uid() and not public.cr_is_suspended()) with check (user_id = auth.uid());

-- Roles: solo lectura de la propia fila. Escribe únicamente service_role.
grant select on public.cr_user_roles to authenticated;
create policy cr_roles_select on public.cr_user_roles for select to authenticated using (user_id = auth.uid());

-- Ajustes
grant select, update (default_model_id, web_search_default, voice, privacy_notice_ack_at, updated_at) on public.cr_user_settings to authenticated;
create policy cr_settings_select on public.cr_user_settings for select to authenticated using (user_id = auth.uid());
create policy cr_settings_update on public.cr_user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Conversaciones: CRUD propio (no suspendido)
grant select, insert, delete, update (title, model_id, pinned, updated_at) on public.cr_conversations to authenticated;
create policy cr_conv_select on public.cr_conversations for select to authenticated using (user_id = auth.uid() and not public.cr_is_suspended());
create policy cr_conv_insert on public.cr_conversations for insert to authenticated with check (user_id = auth.uid() and not public.cr_is_suspended());
create policy cr_conv_update on public.cr_conversations for update to authenticated
  using (user_id = auth.uid() and not public.cr_is_suspended()) with check (user_id = auth.uid());
create policy cr_conv_delete on public.cr_conversations for delete to authenticated using (user_id = auth.uid() and not public.cr_is_suspended());

-- Mensajes: lectura propia. Escritura únicamente desde las Edge Functions (service_role),
-- que validan el contenido, el límite de uso y la propiedad de la conversación.
grant select on public.cr_messages to authenticated;
create policy cr_msg_select on public.cr_messages for select to authenticated using (user_id = auth.uid() and not public.cr_is_suspended());

-- Adjuntos
grant select, insert, delete on public.cr_attachments to authenticated;
create policy cr_att_select on public.cr_attachments for select to authenticated using (user_id = auth.uid() and not public.cr_is_suspended());
create policy cr_att_insert on public.cr_attachments for insert to authenticated with check (
  user_id = auth.uid() and not public.cr_is_suspended()
  and storage_path like auth.uid()::text || '/%'
  and (conversation_id is null or exists (select 1 from public.cr_conversations c where c.id = conversation_id and c.user_id = auth.uid())));
create policy cr_att_delete on public.cr_attachments for delete to authenticated using (user_id = auth.uid());

-- Integraciones: el usuario ve el catálogo y sus propias autorizaciones.
grant select on public.cr_integrations to authenticated;
create policy cr_integrations_select on public.cr_integrations for select to authenticated using (status = 'enabled');
grant select on public.cr_integration_grants to authenticated;
create policy cr_grants_select on public.cr_integration_grants for select to authenticated using (user_id = auth.uid());

-- cr_providers, cr_models, cr_api_keys, cr_audit_logs, cr_usage_events, cr_rate_limits:
-- RLS activo y SIN políticas ni grants => inaccesibles desde el navegador.

-- ---------------------------------------------------------------------
-- Realtime (sincronización entre dispositivos; respeta RLS)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cr_conversations, public.cr_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Storage: bucket privado, cada usuario solo ve su carpeta <uid>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cr-attachments', 'cr-attachments', false, 10485760, array[
  'application/pdf', 'text/plain', 'text/csv', 'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy cr_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'cr-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy cr_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cr-attachments' and (storage.foldername(name))[1] = auth.uid()::text and not public.cr_is_suspended());
create policy cr_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cr-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- Acceso privado con aprobación manual. El propietario siempre conserva acceso.
alter table public.cr_user_roles
  add column if not exists access_status text not null default 'pending'
    check (access_status in ('pending','approved','rejected')),
  add column if not exists access_updated_at timestamptz not null default now(),
  add column if not exists access_updated_by uuid references auth.users(id) on delete set null;
update public.cr_user_roles set access_status = 'approved', access_updated_at = now() where role = 'owner';

create or replace function public.cr_ensure_profile() returns jsonb
language plpgsql security definer set search_path = public, cutreal_private as $$
declare uid uuid := auth.uid(); u record; initial_admin text; r record;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select id, email, raw_user_meta_data, email_confirmed_at into u from auth.users where id = uid;
  insert into public.cr_profiles (user_id, email, display_name, avatar_url)
  values (uid, u.email, left(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)), 80), left(u.raw_user_meta_data->>'avatar_url', 500))
  on conflict (user_id) do update set last_seen_at = now(), email = excluded.email;
  insert into public.cr_user_roles (user_id) values (uid) on conflict do nothing;
  insert into public.cr_user_settings (user_id) values (uid) on conflict do nothing;
  select value into initial_admin from cutreal_private.config where key = 'initial_admin_email';
  if initial_admin is not null and u.email is not null and u.email_confirmed_at is not null
     and lower(initial_admin) = lower(u.email)
     and not exists (select 1 from public.cr_user_roles where role = 'owner') then
    update public.cr_user_roles set role = 'owner', access_status = 'approved', updated_at = now(), access_updated_at = now() where user_id = uid;
    insert into public.cr_audit_logs (actor_id, actor_kind, action, target_type, target_id)
    values (uid, 'system', 'owner.bootstrap', 'user', uid::text);
  end if;
  select role, suspended, access_status, suspended_reason into r from public.cr_user_roles where user_id = uid;
  return jsonb_build_object('role', r.role, 'suspended', r.suspended,
    'access_status', case when r.role = 'owner' then 'approved' else r.access_status end,
    'suspended_reason', r.suspended_reason);
end $$;

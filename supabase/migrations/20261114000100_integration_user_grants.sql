-- Permite a cada usuario autorizar integraciones habilitadas con scopes limitados.
-- La escritura se realiza mediante SECURITY DEFINER; no se habilitan INSERT/UPDATE directos.

create or replace function public.cr_grant_my_integration(
  p_integration_id uuid,
  p_scopes text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_allowed text[];
  v_scopes text[];
  v_grant_id uuid;
begin
  if v_user_id is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '28000';
  end if;

  select allowed_scopes into v_allowed
    from public.cr_integrations
   where id = p_integration_id and status = 'enabled';

  if not found then
    raise exception 'La integración no existe o está deshabilitada.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct scope), '{}'::text[])
    into v_scopes
    from unnest(coalesce(p_scopes, '{}'::text[])) as scope;

  if cardinality(v_scopes) = 0 then
    raise exception 'Seleccioná al menos un permiso.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_scopes) as requested(scope)
    where not (requested.scope = any(coalesce(v_allowed, '{}'::text[])))
  ) then
    raise exception 'La integración no permite uno o más permisos seleccionados.' using errcode = '42501';
  end if;

  update public.cr_integration_grants
     set scopes = v_scopes, granted_at = now()
   where user_id = v_user_id
     and integration_id = p_integration_id
     and revoked_at is null
  returning id into v_grant_id;

  if v_grant_id is null then
    insert into public.cr_integration_grants (user_id, integration_id, scopes)
    values (v_user_id, p_integration_id, v_scopes)
    returning id into v_grant_id;
  end if;

  insert into public.cr_audit_logs (actor_id, action, target_type, target_id, metadata)
  values (v_user_id, 'integration.grant_authorized_by_user', 'integration', p_integration_id::text,
          jsonb_build_object('scopes', v_scopes));

  return v_grant_id;
end;
$$;

revoke all on function public.cr_grant_my_integration(uuid, text[]) from public, anon;
grant execute on function public.cr_grant_my_integration(uuid, text[]) to authenticated;

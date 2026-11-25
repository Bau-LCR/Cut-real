create or replace function public.cr_admin_database_storage_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_used bigint;
begin
  if v_user is null or not exists (
    select 1 from public.cr_user_roles
    where user_id = v_user
      and role in ('owner', 'admin')
      and coalesce(suspended, false) = false
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select pg_database_size(current_database())::bigint into v_used;
  return jsonb_build_object(
    'used_bytes', v_used,
    'used_mb', round(v_used / 1048576.0, 2),
    'quota_bytes', null,
    'percent', null,
    'scope', 'postgres_database_only'
  );
end;
$$;

revoke all on function public.cr_admin_database_storage_stats() from public, anon;
grant execute on function public.cr_admin_database_storage_stats() to authenticated;

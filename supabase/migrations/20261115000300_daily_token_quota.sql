-- Límite de 70.000 tokens de chat por usuario y día (UTC).
-- Las reservas evitan que varias conversaciones simultáneas salteen el límite.
create table if not exists public.cr_user_token_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists public.cr_token_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  reserved_tokens integer not null check (reserved_tokens > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  finalized_at timestamptz
);
create index if not exists cr_token_reservations_active_idx
  on public.cr_token_reservations(user_id, usage_date, expires_at)
  where finalized_at is null;

alter table public.cr_user_token_usage enable row level security;
alter table public.cr_token_reservations enable row level security;
revoke all on public.cr_user_token_usage from anon, authenticated;
revoke all on public.cr_token_reservations from anon, authenticated;

create or replace function public.cr_reserve_daily_tokens(p_user_id uuid, p_tokens integer, p_limit integer default 70000)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_used integer := 0;
  v_reserved integer := 0;
  v_id uuid;
begin
  if p_user_id is null or p_tokens < 1 or p_tokens > p_limit or p_limit <> 70000 then
    raise exception 'invalid token reservation' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select tokens_used into v_used from public.cr_user_token_usage
    where user_id = p_user_id and usage_date = v_day;
  v_used := coalesce(v_used, 0);
  select coalesce(sum(reserved_tokens), 0)::integer into v_reserved
    from public.cr_token_reservations
    where user_id = p_user_id and usage_date = v_day
      and finalized_at is null and expires_at > now();
  if v_used + v_reserved + p_tokens > p_limit then
    return jsonb_build_object(
      'allowed', false, 'used', v_used, 'reserved', v_reserved,
      'remaining', greatest(0, p_limit - v_used - v_reserved),
      'resets_at', ((v_day + 1)::timestamp at time zone 'utc')
    );
  end if;
  insert into public.cr_token_reservations(user_id, usage_date, reserved_tokens)
    values (p_user_id, v_day, p_tokens) returning id into v_id;
  return jsonb_build_object('allowed', true, 'reservation_id', v_id, 'used', v_used, 'reserved', v_reserved);
end $$;

create or replace function public.cr_finalize_daily_tokens(p_user_id uuid, p_reservation_id uuid, p_actual_tokens integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_day date;
begin
  update public.cr_token_reservations
    set finalized_at = now()
    where id = p_reservation_id and user_id = p_user_id and finalized_at is null
    returning usage_date into v_day;
  if v_day is null then return; end if;
  insert into public.cr_user_token_usage(user_id, usage_date, tokens_used, updated_at)
    values (p_user_id, v_day, greatest(0, coalesce(p_actual_tokens, 0)), now())
    on conflict (user_id, usage_date) do update
      set tokens_used = public.cr_user_token_usage.tokens_used + greatest(0, coalesce(p_actual_tokens, 0)),
          updated_at = now();
end $$;

revoke all on function public.cr_reserve_daily_tokens(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.cr_finalize_daily_tokens(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.cr_reserve_daily_tokens(uuid, integer, integer) to service_role;
grant execute on function public.cr_finalize_daily_tokens(uuid, uuid, integer) to service_role;

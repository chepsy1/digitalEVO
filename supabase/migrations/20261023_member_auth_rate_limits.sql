-- Persistent, server-side rate limiting for DigitalEVO member login/register.
-- Apply to the dedicated staging Supabase project first. No existing payment data is changed.

create table if not exists public.member_auth_rate_limits (
  action text not null check (action in ('register', 'login')),
  dimension text not null check (dimension in ('phone', 'ip')),
  key_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (action, dimension, key_hash, window_start)
);

alter table public.member_auth_rate_limits enable row level security;
revoke all on public.member_auth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.member_auth_rate_limits to service_role;

create or replace function public.member_auth_rate_limit(
  p_action text,
  p_phone_hash text,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_window interval;
  v_phone_limit integer;
  v_ip_limit integer;
  v_window_start timestamptz;
  v_phone_count integer;
  v_ip_count integer;
begin
  if p_action not in ('register', 'login') then
    raise exception 'Invalid member auth action';
  end if;
  if p_phone_hash is null or length(p_phone_hash) <> 64
     or p_ip_hash is null or length(p_ip_hash) <> 64 then
    raise exception 'Invalid rate limit key';
  end if;

  if p_action = 'register' then
    v_window := interval '1 hour';
    v_phone_limit := 3;
    v_ip_limit := 10;
  else
    v_window := interval '15 minutes';
    v_phone_limit := 10;
    v_ip_limit := 30;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / extract(epoch from v_window))
    * extract(epoch from v_window)
  );

  insert into public.member_auth_rate_limits
    (action, dimension, key_hash, window_start, attempts, updated_at)
  values
    (p_action, 'phone', p_phone_hash, v_window_start, 1, v_now)
  on conflict (action, dimension, key_hash, window_start)
  do update set attempts = public.member_auth_rate_limits.attempts + 1,
                updated_at = excluded.updated_at
  returning attempts into v_phone_count;

  insert into public.member_auth_rate_limits
    (action, dimension, key_hash, window_start, attempts, updated_at)
  values
    (p_action, 'ip', p_ip_hash, v_window_start, 1, v_now)
  on conflict (action, dimension, key_hash, window_start)
  do update set attempts = public.member_auth_rate_limits.attempts + 1,
                updated_at = excluded.updated_at
  returning attempts into v_ip_count;

  delete from public.member_auth_rate_limits
  where window_start < v_now - interval '2 days';

  return v_phone_count <= v_phone_limit and v_ip_count <= v_ip_limit;
end;
$function$;

revoke all on function public.member_auth_rate_limit(text, text, text) from public, anon, authenticated;
grant execute on function public.member_auth_rate_limit(text, text, text) to service_role;

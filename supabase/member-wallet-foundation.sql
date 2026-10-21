-- DigitalEVO Member foundation (safe additive migration)
-- Does not alter existing checkout, QRIS, or order rows.
-- Payment verification and server endpoints must be deployed before enabling this system.

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  whatsapp text not null unique,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','active','suspended')),
  registered_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_wallets (
  user_id uuid primary key references public.member_profiles(user_id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_registration_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.member_profiles(user_id) on delete cascade,
  amount bigint not null default 99000 check (amount = 99000),
  payment_reference text unique,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','expired','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.member_deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.member_profiles(user_id) on delete cascade,
  amount bigint not null check (amount > 0),
  payment_reference text unique,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','expired','failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.member_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.member_profiles(user_id) on delete cascade,
  amount bigint not null check (amount <> 0),
  transaction_type text not null
    check (transaction_type in ('registration_bonus','deposit','purchase','refund','admin_adjustment')),
  source_reference text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

-- Null means the product has not been assigned a special member price.
alter table public.products add column if not exists member_price integer;
alter table public.products drop constraint if exists products_member_price_nonnegative;
alter table public.products add constraint products_member_price_nonnegative
  check (member_price is null or member_price >= 0);

create index if not exists member_wallet_transactions_user_created_idx
  on public.member_wallet_transactions(user_id, created_at desc);
create index if not exists member_deposit_requests_user_created_idx
  on public.member_deposit_requests(user_id, created_at desc);
create index if not exists member_registration_payments_user_created_idx
  on public.member_registration_payments(user_id, created_at desc);

alter table public.member_profiles enable row level security;
alter table public.member_wallets enable row level security;
alter table public.member_registration_payments enable row level security;
alter table public.member_deposit_requests enable row level security;
alter table public.member_wallet_transactions enable row level security;

-- A member can read only their own profile and wallet history.
drop policy if exists "Members read own profile" on public.member_profiles;
create policy "Members read own profile" on public.member_profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Members read own wallet" on public.member_wallets;
create policy "Members read own wallet" on public.member_wallets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Members read own registration payments" on public.member_registration_payments;
create policy "Members read own registration payments" on public.member_registration_payments
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Members read own deposit requests" on public.member_deposit_requests;
create policy "Members read own deposit requests" on public.member_deposit_requests
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Members read own wallet transactions" on public.member_wallet_transactions;
create policy "Members read own wallet transactions" on public.member_wallet_transactions
  for select to authenticated using (auth.uid() = user_id);

-- No client-side INSERT/UPDATE/DELETE policies are granted for wallet/payment tables.
-- Privileged server endpoints using the service role must verify payments before invoking
-- privileged operations. Never expose the service-role key in browser code.

create or replace function public.member_activate_after_verified_registration(
  p_user_id uuid,
  p_payment_reference text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.member_registration_payments%rowtype;
  v_inserted integer;
begin
  select * into v_payment
  from public.member_registration_payments
  where user_id = p_user_id
    and payment_reference = p_payment_reference
    and payment_status = 'paid'
    and amount = 99000
  for update;

  if not found then
    raise exception 'Registration payment is not verified';
  end if;

  insert into public.member_wallets(user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  insert into public.member_profiles(user_id, whatsapp, status, activated_at, updated_at)
  select u.id, u.phone, 'active', now(), now()
  from auth.users u
  where u.id = p_user_id and u.phone is not null
  on conflict (user_id) do update
    set status = 'active', activated_at = coalesce(public.member_profiles.activated_at, now()), updated_at = now();

  insert into public.member_wallet_transactions(
    user_id, amount, transaction_type, source_reference, description
  ) values (
    p_user_id, 15000, 'registration_bonus',
    'registration-bonus:' || p_user_id::text,
    'Bonus saldo pendaftaran member DigitalEVO'
  )
  on conflict (source_reference) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.member_wallets
    set balance = balance + 15000, updated_at = now()
    where user_id = p_user_id;
  end if;

  return true;
end;
$$;

create or replace function public.member_debit_wallet(
  p_amount bigint,
  p_source_reference text,
  p_description text default 'Pembelian produk DigitalEVO'
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance bigint;
  v_inserted integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_source_reference is null or length(trim(p_source_reference)) = 0 then
    raise exception 'Source reference is required';
  end if;

  if not exists (
    select 1 from public.member_profiles
    where user_id = v_user_id and status = 'active'
  ) then raise exception 'Active membership required'; end if;

  insert into public.member_wallets(user_id, balance)
  values (v_user_id, 0) on conflict (user_id) do nothing;

  update public.member_wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = v_user_id and balance >= p_amount
  returning balance into v_balance;

  if not found then raise exception 'Insufficient balance'; end if;

  insert into public.member_wallet_transactions(
    user_id, amount, transaction_type, source_reference, description
  ) values (
    v_user_id, -p_amount, 'purchase', p_source_reference, coalesce(p_description, '')
  )
  on conflict (source_reference) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Idempotent retry: undo the extra debit, because this reference was already applied.
    update public.member_wallets
    set balance = balance + p_amount, updated_at = now()
    where user_id = v_user_id;
  end if;

  select balance into v_balance from public.member_wallets where user_id = v_user_id;
  return v_balance;
end;
$$;

-- Only trusted server-side service-role code may activate a member and issue the bonus.
revoke all on function public.member_activate_after_verified_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.member_activate_after_verified_registration(uuid, text) to service_role;

-- Wallet debit is callable by authenticated users but can only debit their own wallet.
revoke all on function public.member_debit_wallet(bigint, text, text) from public, anon;
grant execute on function public.member_debit_wallet(bigint, text, text) to authenticated;

grant select on public.member_profiles, public.member_wallets,
  public.member_registration_payments, public.member_deposit_requests,
  public.member_wallet_transactions to authenticated;

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
alter table public.products drop constraint if exists products_member_price_positive;
alter table public.products add constraint products_member_price_positive
  check (member_price is null or member_price > 0);

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

-- Explicitly remove direct client access to wallet/payment tables. RLS alone is not
-- a substitute for table grants. Only authenticated members may read their own rows;
-- trusted server-side endpoints using service_role perform writes after verifying payments.
-- Never expose the service-role key in browser code.
revoke all on table public.member_profiles, public.member_wallets,
  public.member_registration_payments, public.member_deposit_requests,
  public.member_wallet_transactions from public, anon, authenticated;
grant select on public.member_profiles, public.member_wallets,
  public.member_registration_payments, public.member_deposit_requests,
  public.member_wallet_transactions to authenticated;

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

-- The debit primitive is deliberately NOT callable by browser clients yet.
-- Do not enable wallet spending until an atomic server/database checkout also creates
-- the corresponding existing orders row and validates the server-calculated member price.
revoke all on function public.member_debit_wallet(bigint, text, text) from public, anon, authenticated;


-- Credit a deposit only after a trusted server has marked its request paid.
-- The unique ledger reference makes retries safe and prevents duplicate credits.
create or replace function public.member_credit_verified_deposit(
  p_user_id uuid,
  p_payment_reference text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deposit public.member_deposit_requests%rowtype;
  v_inserted integer;
  v_balance bigint;
begin
  select * into v_deposit
  from public.member_deposit_requests
  where user_id = p_user_id
    and payment_reference = p_payment_reference
    and payment_status = 'paid'
    and amount > 0
  for update;

  if not found then raise exception 'Deposit payment is not verified'; end if;

  insert into public.member_wallets(user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  insert into public.member_wallet_transactions(
    user_id, amount, transaction_type, source_reference, description
  ) values (
    p_user_id, v_deposit.amount, 'deposit',
    'deposit:' || p_payment_reference,
    'Deposit saldo member DigitalEVO'
  )
  on conflict (source_reference) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.member_wallets
    set balance = balance + v_deposit.amount, updated_at = now()
    where user_id = p_user_id;
  end if;

  select balance into v_balance
  from public.member_wallets where user_id = p_user_id;
  return v_balance;
end;
$$;

revoke all on function public.member_credit_verified_deposit(uuid, text) from public, anon, authenticated;
grant execute on function public.member_credit_verified_deposit(uuid, text) to service_role;


alter table public.orders add column if not exists account_name text;
alter table public.orders add column if not exists comment_text text;

-- Atomic member wallet checkout. This function validates the live product price,
-- creates the existing orders row, debits the wallet and writes the ledger entry
-- in the same database transaction.
create or replace function public.member_checkout_with_wallet(
  p_user_id uuid,
  p_category text,
  p_qty integer,
  p_order jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_price bigint;
  v_balance bigint;
  v_order_id uuid;
  v_invoice text;
  v_product_name text;
  v_customer_whatsapp text;
  v_account_contact text;
  v_account_name text;
  v_shopee_link text;
  v_comment_text text;
  v_photo_url text;
  v_photo_path text;
  v_now timestamptz := now();
begin
  if p_user_id is null then raise exception 'Authentication required'; end if;
  if p_category not in ('followers','account','video_views','video_likes','video_comments','product_likes') then
    raise exception 'Kategori produk tidak valid';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Paket produk tidak valid'; end if;
  if not exists (select 1 from public.member_profiles where user_id = p_user_id and status = 'active') then
    raise exception 'Keanggotaan aktif diperlukan';
  end if;

  select * into v_product from public.products
  where category = p_category and qty = p_qty
  order by updated_at desc nulls last limit 1 for share;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  v_price := coalesce(v_product.member_price, v_product.price);
  if v_price is null or v_price <= 0 then raise exception 'Harga member harus lebih dari nol'; end if;

  v_customer_whatsapp := nullif(trim(coalesce(p_order->>'customerWhatsapp', p_order->>'customer_whatsapp', '')), '');
  v_account_contact := nullif(trim(coalesce(p_order->>'accountContact', p_order->>'account_contact', '')), '');
  v_account_name := nullif(trim(coalesce(p_order->>'accountName', p_order->>'account_name', '')), '');
  v_shopee_link := nullif(trim(coalesce(p_order->>'shopeeLink', p_order->>'shopee_link', '')), '');
  v_comment_text := nullif(trim(coalesce(p_order->>'commentText', p_order->>'comment_text', '')), '');
  v_photo_url := nullif(trim(coalesce(p_order->>'photoUrl', p_order->>'photo_url', '')), '');
  v_photo_path := nullif(trim(coalesce(p_order->>'photoPath', p_order->>'photo_path', '')), '');

  if p_category = 'followers' and (v_customer_whatsapp is null or v_shopee_link is null or v_photo_path is null) then
    raise exception 'Pesanan followers memerlukan WhatsApp, link/username Shopee, dan foto akun';
  elsif p_category = 'account' and (v_account_contact is null or v_account_name is null) then
    raise exception 'Pesanan akun memerlukan nama dan kontak penerima';
  elsif p_category in ('video_views','video_likes','video_comments','product_likes')
    and (v_customer_whatsapp is null or v_shopee_link is null) then
    raise exception 'Pesanan memerlukan link produk/video dan WhatsApp';
  end if;
  if p_category = 'video_comments' then
    if v_comment_text is null or cardinality(regexp_split_to_array(v_comment_text, E'\n')) <> p_qty then
      raise exception 'Jumlah komentar harus sesuai paket';
    end if;
  end if;

  insert into public.member_wallets(user_id, balance)
  values (p_user_id, 0) on conflict (user_id) do nothing;

  update public.member_wallets
  set balance = balance - v_price, updated_at = v_now
  where user_id = p_user_id and balance >= v_price
  returning balance into v_balance;
  if not found then raise exception 'Saldo member tidak mencukupi'; end if;

  v_invoice := 'MEMBER-' || replace(gen_random_uuid()::text, '-', '');
  v_product_name := case p_category
    when 'account' then 'Akun Shopee ' || p_qty::text || ' Followers'
    when 'video_views' then 'Shopee Video ' || p_qty::text || ' Views'
    when 'video_likes' then 'Shopee Video ' || p_qty::text || ' Likes'
    when 'video_comments' then 'Shopee Video ' || p_qty::text || ' (Custom) Comments'
    when 'product_likes' then 'Shopee Produk ' || p_qty::text || ' Favorite/Likes'
    else p_qty::text || ' Followers'
  end;

  insert into public.orders (
    transaction_id, customer_whatsapp, account_contact, account_name, shopee_link, comment_text,
    photo_url, photo_path, product_id, product_name, category, quantity, amount,
    payment_status, order_status, payment_method, paid_at, updated_at
  ) values (
    v_invoice, v_customer_whatsapp, v_account_contact, v_account_name, v_shopee_link, v_comment_text,
    v_photo_url, v_photo_path, v_product.id, v_product_name, p_category, 1, v_price,
    'paid', 'queued', 'Saldo Member', v_now, v_now
  ) returning id into v_order_id;

  insert into public.member_wallet_transactions(
    user_id, amount, transaction_type, source_reference, description
  ) values (
    p_user_id, -v_price, 'purchase', 'member-order:' || v_order_id::text,
    'Pembelian ' || v_product_name || ' menggunakan saldo member'
  );

  return jsonb_build_object(
    'success', true, 'order_id', v_order_id, 'invoice', v_invoice,
    'amount', v_price, 'balance', v_balance, 'product_name', v_product_name
  );
end;
$$;

revoke all on function public.member_checkout_with_wallet(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.member_checkout_with_wallet(uuid, text, integer, jsonb) to service_role;

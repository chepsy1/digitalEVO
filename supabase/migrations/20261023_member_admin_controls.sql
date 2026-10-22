-- Member admin controls: retain financial records when an auth account is deleted.
-- Safe to run more than once.
do $$
declare
  item record;
begin
  for item in
    select tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
     and tc.table_name = kcu.table_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name in ('member_registration_payments','member_deposit_requests','member_wallet_transactions')
      and kcu.column_name = 'user_id'
  loop
    execute format('alter table public.%I drop constraint %I', item.table_name, item.constraint_name);
  end loop;
end $$;

alter table public.member_registration_payments alter column user_id drop not null;
alter table public.member_deposit_requests alter column user_id drop not null;
alter table public.member_wallet_transactions alter column user_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'member_registration_payments_user_id_fkey' and conrelid = 'public.member_registration_payments'::regclass) then
    alter table public.member_registration_payments
      add constraint member_registration_payments_user_id_fkey
      foreign key (user_id) references public.member_profiles(user_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'member_deposit_requests_user_id_fkey' and conrelid = 'public.member_deposit_requests'::regclass) then
    alter table public.member_deposit_requests
      add constraint member_deposit_requests_user_id_fkey
      foreign key (user_id) references public.member_profiles(user_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'member_wallet_transactions_user_id_fkey' and conrelid = 'public.member_wallet_transactions'::regclass) then
    alter table public.member_wallet_transactions
      add constraint member_wallet_transactions_user_id_fkey
      foreign key (user_id) references public.member_profiles(user_id) on delete set null;
  end if;
end $$;

-- Make sure the supported account status can be managed by the admin panel.
alter table public.member_profiles drop constraint if exists member_profiles_status_check;
alter table public.member_profiles
  add constraint member_profiles_status_check
  check (status in ('pending_payment','active','suspended'));

-- Prevent a repeated check of an already-paid registration from reactivating
-- a member that an administrator has suspended.
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
  select u.id, coalesce(nullif(u.phone, ''), nullif(u.raw_user_meta_data->>'whatsapp', '')), 'active', now(), now()
  from auth.users u
  where u.id = p_user_id
    and coalesce(nullif(u.phone, ''), nullif(u.raw_user_meta_data->>'whatsapp', '')) is not null
  on conflict (user_id) do update
    set status = case
          when public.member_profiles.status = 'suspended' then 'suspended'
          else 'active'
        end,
        activated_at = coalesce(public.member_profiles.activated_at, now()),
        updated_at = now();

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

revoke all on function public.member_activate_after_verified_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.member_activate_after_verified_registration(uuid, text) to service_role;

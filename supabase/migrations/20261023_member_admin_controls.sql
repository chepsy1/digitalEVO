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

alter table public.member_registration_payments
  add constraint member_registration_payments_user_id_fkey
  foreign key (user_id) references public.member_profiles(user_id) on delete set null;
alter table public.member_deposit_requests
  add constraint member_deposit_requests_user_id_fkey
  foreign key (user_id) references public.member_profiles(user_id) on delete set null;
alter table public.member_wallet_transactions
  add constraint member_wallet_transactions_user_id_fkey
  foreign key (user_id) references public.member_profiles(user_id) on delete set null;

-- Make sure the supported account status can be managed by the admin panel.
alter table public.member_profiles drop constraint if exists member_profiles_status_check;
alter table public.member_profiles
  add constraint member_profiles_status_check
  check (status in ('pending_payment','active','suspended'));

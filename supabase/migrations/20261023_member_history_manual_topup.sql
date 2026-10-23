-- DigitalEVO member history and admin manual wallet top-up.
-- Safe additive change: leaves QRIS verification and checkout RPC unchanged.

create or replace function public.admin_adjust_member_wallet(
  p_user_id uuid,
  p_amount bigint,
  p_description text default 'Pengisian saldo manual oleh admin'
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
  v_reference text;
  v_description text;
begin
  if p_user_id is null then raise exception 'ID member tidak valid'; end if;
  if p_amount is null or p_amount < 1000 or p_amount > 10000000 then
    raise exception 'Nominal isi saldo harus Rp1.000 sampai Rp10.000.000';
  end if;
  if not exists (
    select 1 from public.member_profiles
    where user_id = p_user_id and status <> 'deleted'
  ) then raise exception 'Member tidak ditemukan'; end if;

  insert into public.member_wallets(user_id, balance)
  values (p_user_id, 0) on conflict (user_id) do nothing;

  v_reference := 'admin-adjustment:' || gen_random_uuid()::text;
  v_description := left(coalesce(nullif(trim(p_description), ''), 'Pengisian saldo manual oleh admin'), 240);

  update public.member_wallets
  set balance = balance + p_amount, updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.member_wallet_transactions(
    user_id, amount, transaction_type, source_reference, description
  ) values (
    p_user_id, p_amount, 'admin_adjustment', v_reference, v_description
  );

  return v_balance;
end;
$$;

revoke all on function public.admin_adjust_member_wallet(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_member_wallet(uuid, bigint, text) to service_role;

-- DigitalEVO member auth metadata compatibility.
-- Apply ONLY to the dedicated staging Supabase project.
-- Allows server-created WhatsApp/password identities (confirmed internal email, no Phone/SMS provider)
-- to populate the member profile after the registration QRIS is verified.
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

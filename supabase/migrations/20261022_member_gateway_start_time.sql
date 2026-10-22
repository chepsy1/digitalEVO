-- Staging-first migration: preserve the timestamp used to search the production gateway.
-- Safe to run more than once; does not create QRIS or contact the payment gateway.
alter table public.member_registration_payments
  add column if not exists gateway_start_time bigint;

alter table public.member_deposit_requests
  add column if not exists gateway_start_time bigint;

-- Backfill existing rows so old pending payments continue to be checked.
update public.member_registration_payments
set gateway_start_time = floor(extract(epoch from created_at))::bigint
where gateway_start_time is null;

update public.member_deposit_requests
set gateway_start_time = floor(extract(epoch from created_at))::bigint
where gateway_start_time is null;

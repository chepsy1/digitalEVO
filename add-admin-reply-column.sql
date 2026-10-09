-- Jalankan sekali di Supabase SQL Editor untuk mengaktifkan balasan admin pada ulasan.
alter table public.comments add column if not exists admin_reply text;

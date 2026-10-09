-- Jalankan sekali di Supabase > SQL Editor, lalu klik Run.
-- Memperbaiki kolom yang diperlukan agar komentar tampil, balasan admin tersimpan, dan sampai 3 foto bisa disimpan.
alter table public.comments add column if not exists admin_reply text;
alter table public.comments add column if not exists photo_urls text[] not null default '{}';
notify pgrst, 'reload schema';

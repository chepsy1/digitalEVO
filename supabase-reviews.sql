-- digitalEVO customer reviews: jalankan sekali di Supabase SQL Editor.
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.orders(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 60),
 body text not null check(char_length(btrim(body)) between 3 and 1000),
 rating integer not null default 5 check(rating between 1 and 5),
 store_url text,
 photo_url text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 pinned boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.comments add column if not exists rating integer not null default 5;
alter table public.comments add column if not exists store_url text;
alter table public.comments add column if not exists photo_url text;
alter table public.comments add column if not exists photo_urls text[] not null default '{}';
alter table public.comments add column if not exists pinned boolean not null default false;
alter table public.comments add column if not exists admin_reply text;
alter table public.comments add column if not exists order_id uuid references public.orders(id) on delete cascade;
create unique index if not exists comments_order_id_unique_idx on public.comments(order_id) where order_id is not null;
create index if not exists comments_public_pinned_idx on public.comments(status,pinned desc,created_at desc);
alter table public.comments enable row level security;
drop policy if exists "public read approved comments" on public.comments;
drop policy if exists "public submit pending comments" on public.comments;
drop policy if exists "admin read all comments" on public.comments;
drop policy if exists "admin update comments" on public.comments;
drop policy if exists "admin delete comments" on public.comments;
drop policy if exists "review public read approved" on public.comments;
drop policy if exists "review admin read all" on public.comments;
drop policy if exists "review admin update" on public.comments;
drop policy if exists "review admin delete" on public.comments;
create policy "review public read approved" on public.comments for select to anon, authenticated using(status='approved');
create policy "review admin read all" on public.comments for select to authenticated using(public.is_admin());
create policy "review admin update" on public.comments for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "review admin delete" on public.comments for delete to authenticated using(public.is_admin());
grant select on public.comments to anon,authenticated;
grant update,delete on public.comments to authenticated;
-- Foto ulasan: bucket publik untuk menampilkan foto yang telah disetujui. Upload hanya dilakukan API server.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('review-photos','review-photos',true,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=true,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

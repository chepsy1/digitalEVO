-- digitalEVO Admin Panel - Supabase setup (AMAN / RLS)
--
-- 1) Buat project Supabase.
-- 2) Jalankan SQL ini di SQL Editor.
-- 3) Buat akun admin melalui Authentication > Users > Add user
--    (email + password). Catat UUID user tersebut.
-- 4) Setelah user dibuat, tambahkan UUID tersebut ke tabel public.admins:
--      insert into public.admins(user_id) values ('UUID-USER-ADMIN');
-- 5) Isi supabase-config.js dengan Project URL + anon/publishable key.
--
-- PENTING: jangan pernah memasukkan service_role key ke website.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('followers','account')),
  qty integer not null,
  original integer not null,
  price integer not null,
  sold text default '',
  image_url text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

-- MIGRASI AMAN: memastikan instalasi lama tetap memiliki kolom produk yang dibutuhkan admin.
alter table public.products add column if not exists qty integer;
alter table public.products add column if not exists original integer;
alter table public.products add column if not exists price integer;
alter table public.products add column if not exists sold text default '';
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists sort_order integer default 0;
alter table public.products add column if not exists updated_at timestamptz default now();
update public.products set qty = coalesce(qty, 0), original = coalesce(original, 0), price = coalesce(price, 0), sort_order = coalesce(sort_order, 0), updated_at = coalesce(updated_at, now());

-- Hak dasar PostgREST untuk client Supabase; akses tulis tetap dikunci oleh RLS/policy admin.
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- Helper yang dipakai RLS. Hanya user yang tercatat di public.admins yang dianggap admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.admins enable row level security;
alter table public.site_settings enable row level security;
alter table public.products enable row level security;

-- Admin list sengaja tidak dapat dibaca/diubah dari browser.
-- Hanya function SECURITY DEFINER di atas yang dipakai untuk pengecekan.

-- Publik boleh membaca konten toko.
drop policy if exists "public read site settings" on public.site_settings;
create policy "public read site settings" on public.site_settings
  for select using (true);

drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products
  for select using (true);

-- HANYA admin yang login boleh mengubah konten/harga/foto produk.
drop policy if exists "authenticated manage site settings" on public.site_settings;
drop policy if exists "admin manage site settings" on public.site_settings;
create policy "admin manage site settings" on public.site_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "authenticated manage products" on public.products;
drop policy if exists "admin manage products" on public.products;
create policy "admin manage products" on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Storage: publik hanya boleh melihat file; upload/update/delete hanya admin.
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "public read site assets" on storage.objects;
create policy "public read site assets" on storage.objects
  for select using (bucket_id = 'site-assets');

drop policy if exists "authenticated upload site assets" on storage.objects;
drop policy if exists "admin upload site assets" on storage.objects;
create policy "admin upload site assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "authenticated update site assets" on storage.objects;
drop policy if exists "admin update site assets" on storage.objects;
create policy "admin update site assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-assets' and public.is_admin())
  with check (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "authenticated delete site assets" on storage.objects;
drop policy if exists "admin delete site assets" on storage.objects;
create policy "admin delete site assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets' and public.is_admin());

-- Data awal website.
insert into public.site_settings(key, value) values
('site', '{
  "followerEyebrow":"PAKET FOLLOWERS",
  "followerTitle":"Paket Followers Shopee",
  "followerSubtitle":"Mulai 100 sampai 5.000 Followers",
  "followerDiscount":"DISKON hingga 37%",
  "accountEyebrow":"KATEGORI PRODUK",
  "accountTitle":"Akun Shopee Premium",
  "accountDescription":"Akun premium dengan followers tinggi untuk mendukung penjualan dan meningkatkan kredibilitas toko Anda!",
  "contactEyebrow":"BUTUH BANTUAN?",
  "contactTitle":"Hubungi admin digitalEVO",
  "contactWhatsapp":"0851 8535 3434"
}'::jsonb)
on conflict (key) do nothing;

insert into public.site_settings(key, value) values
('images', '{
  "logo":"assets/logo.webp",
  "header":"assets/header-utama.webp",
  "footer":"assets/footer-cta.webp",
  "followersBanner":"assets/promo-500-5000.webp",
  "accountBanner":"assets/akun-shopee-premium-banner.webp"
}'::jsonb)
on conflict (key) do nothing;

insert into public.products(category,qty,original,price,sold,image_url,sort_order)
select * from (values
('followers',100,9500,7800,'20+','assets/100.webp',1),
('followers',200,19000,15600,'10+','assets/200.webp',2),
('followers',300,28500,21500,'10+','assets/300.webp',3),
('followers',500,45000,29800,'20+','assets/500.webp',4),
('followers',1000,85000,57200,'50+','assets/1000.webp',5),
('followers',1500,135000,84500,'30+','assets/1500.webp',6),
('followers',2000,179000,112000,'30+','assets/2000.webp',7),
('followers',3000,266000,168000,'8+','assets/3000.webp',8),
('followers',5000,420000,275000,'10+','assets/5000.webp',9),
('account',10000,380000,325000,'','assets/akun-premium-product.webp',1),
('account',20000,595000,520000,'','assets/akun-premium-product.webp',2),
('account',30000,860000,700000,'','assets/akun-premium-product.webp',3),
('account',50000,1180000,999000,'','assets/akun-premium-product.webp',4)
) as v(category,qty,original,price,sold,image_url,sort_order)
where not exists (select 1 from public.products limit 1);


-- ============================================================
-- QRIS DANA dynamic payments
-- Customer never writes directly to this table; Edge Functions
-- use the Supabase service role for payment creation/webhook.
-- ============================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  partner_reference_no text not null unique,
  dana_reference_no text,
  category text not null check (category in ('followers','account')),
  product_qty integer not null,
  amount integer not null check (amount > 0),
  customer_whatsapp text,
  shopee_link text,
  account_contact text,
  status text not null default 'PENDING'
    check (status in ('PENDING','PAID','EXPIRED','FAILED')),
  qr_content text,
  qr_image text,
  qr_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  dana_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_status_idx on public.payments(status);
create index if not exists payments_created_at_idx on public.payments(created_at);
create index if not exists payments_dana_reference_idx on public.payments(dana_reference_no);

alter table public.payments enable row level security;

-- No public/browser access. Edge Functions use service_role.
drop policy if exists "no public payment read" on public.payments;
drop policy if exists "no public payment insert" on public.payments;
drop policy if exists "admin read payments" on public.payments;

create policy "admin read payments" on public.payments
  for select to authenticated
  using (public.is_admin());

-- Optional admin visibility in Supabase dashboard; no client insert/update/delete.
create policy "admin update payments" on public.payments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Order screenshot uploads
-- The checkout uploads buyer's Shopee screenshot before QRIS creation.
-- Files are publicly readable so the admin email can contain a direct
-- image link. Do not use this bucket for sensitive documents.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "public read order photos" on storage.objects;
create policy "public read order photos" on storage.objects
  for select using (bucket_id = 'order-photos');

drop policy if exists "public upload order photos" on storage.objects;
create policy "public upload order photos" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'order-photos' and name like 'orders/%');


-- ============================================================
-- ANALYTICS + ORDER MANAGEMENT V2
-- ============================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  transaction_id text unique,
  customer_whatsapp text,
  account_contact text,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  category text,
  quantity integer not null default 1,
  amount bigint not null default 0,
  payment_status text not null default 'pending',
  order_status text not null default 'pending',
  payment_method text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists customer_whatsapp text;
alter table public.orders add column if not exists account_contact text;
alter table public.orders add column if not exists product_id uuid;
alter table public.orders add column if not exists product_name text;
alter table public.orders add column if not exists category text;
alter table public.orders add column if not exists quantity integer not null default 1;
alter table public.orders add column if not exists amount bigint not null default 0;
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists order_status text not null default 'pending';
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists updated_at timestamptz not null default now();

create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_transaction_id_idx on public.orders(transaction_id);

alter table public.orders enable row level security;

drop policy if exists "admin read orders" on public.orders;
create policy "admin read orders" on public.orders
  for select to authenticated
  using (public.is_admin());

create table if not exists public.analytics_events (
  id bigint generated by default as identity primary key,
  visitor_id text not null,
  session_id text,
  event_type text not null check (
    event_type in ('page_view','product_click','checkout_started','checkout_paid','ad_click')
  ),
  page_path text,
  product_id text,
  product_name text,
  quantity integer,
  value bigint default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
create index if not exists analytics_events_visitor_id_idx on public.analytics_events(visitor_id);
create index if not exists analytics_events_type_idx on public.analytics_events(event_type);

alter table public.analytics_events enable row level security;

drop policy if exists "public insert analytics events" on public.analytics_events;
create policy "public insert analytics events" on public.analytics_events
  for insert to anon, authenticated
  with check (
    event_type in ('page_view','product_click','checkout_started','checkout_paid','ad_click')
    and length(visitor_id) between 8 and 128
  );

drop policy if exists "admin read analytics events" on public.analytics_events;
create policy "admin read analytics events" on public.analytics_events
  for select to authenticated
  using (public.is_admin());

create or replace function public.analytics_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select now() - interval '24 hours' as h24,
           now() - interval '7 days' as d7,
           now() - interval '30 days' as d30
  )
  select jsonb_build_object(
    'visitors24h', (select count(distinct visitor_id) from analytics_events,bounds where event_type='page_view' and created_at>=bounds.h24),
    'visitors7d',  (select count(distinct visitor_id) from analytics_events,bounds where event_type='page_view' and created_at>=bounds.d7),
    'visitors30d', (select count(distinct visitor_id) from analytics_events,bounds where event_type='page_view' and created_at>=bounds.d30),
    'visitorsAll', (select count(distinct visitor_id) from analytics_events where event_type='page_view'),
    'clicks30d',   (select count(*) from analytics_events,bounds where event_type='product_click' and created_at>=bounds.d30),
    'clicksAll',   (select count(*) from analytics_events where event_type='product_click'),
    'checkouts30d',(select count(*) from analytics_events,bounds where event_type='checkout_started' and created_at>=bounds.d30)
  );
$$;

revoke all on function public.analytics_summary() from public;
grant execute on function public.analytics_summary() to authenticated;

-- Server-side API memakai service_role untuk memasukkan order setelah pembayaran sukses.
-- Admin Free Checkout juga wajib memverifikasi is_admin() di server.


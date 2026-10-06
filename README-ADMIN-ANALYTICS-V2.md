# digitalEVO Admin Analytics V2

Versi ini menambahkan dashboard analytics profesional dan order management.

## Yang ditambahkan

- Visitor unik 24 jam / 7 hari / 30 hari / total.
- Product clicks.
- Produk terjual.
- Pendapatan 24 jam / 7 hari / 30 hari / total.
- Grafik traffic dan revenue.
- Conversion funnel.
- Ranking produk berdasarkan klik.
- Pesanan lengkap: invoice, WhatsApp/kontak, produk, quantity, harga, status, waktu checkout.
- Admin Free Checkout untuk testing internal.
- Tracking page view, product click, checkout start, paid checkout, dan klik iklan.
- Penyimpanan order paid dilakukan melalui server-side API.

## 1. Jalankan SQL Supabase

Buka Supabase SQL Editor dan jalankan isi:

`supabase.sql`

SQL tersebut menambahkan/memperbarui tabel:

- `orders`
- `analytics_events`
- function `analytics_summary()`
- RLS/policy untuk analytics dan admin orders.

## 2. Environment Variables Vercel

Tambahkan:

`SUPABASE_URL=https://PROJECT.supabase.co`

`SUPABASE_SERVICE_ROLE_KEY=...`

JANGAN pernah memasukkan `SUPABASE_SERVICE_ROLE_KEY` ke file frontend atau `supabase-config.js`.

## 3. Catatan Admin Free Checkout

Free Checkout hanya boleh dipakai oleh user yang UUID-nya terdapat di:

`public.admins`

Endpoint melakukan verifikasi session JWT lalu mengecek tabel `admins` di server sebelum membuat order `ADMIN_FREE`.

## 4. Traffic

Visitor ID dibuat di browser dan disimpan di localStorage. Satu page view untuk path yang sama dibatasi satu kali per browser session agar refresh berulang tidak langsung menggandakan angka.

Angka visitor unik dihitung berdasarkan `visitor_id` melalui function `analytics_summary()`.

## 5. Order

Saat payment gateway mengembalikan status paid, endpoint `/api/check-payment` dapat menyimpan order ke Supabase menggunakan service-role key server-side. Browser tetap tidak memiliki service-role key.

## 6. Deploy

Upload seluruh isi ZIP ke GitHub/Vercel seperti website sebelumnya. Setelah deploy:

1. Jalankan SQL Supabase.
2. Set environment variables Vercel.
3. Pastikan admin user sudah masuk tabel `public.admins`.
4. Login ke `/admin.html`.
5. Buka Dashboard dan Analytics.


### Pencatatan pembayaran QRIS
Setelah pembayaran berstatus PAID, `/api/check-payment` menyimpan order ke `orders` menggunakan `SUPABASE_SERVICE_ROLE_KEY` dan memperbarui `products.sold` jika nilai sold saat ini berupa angka.

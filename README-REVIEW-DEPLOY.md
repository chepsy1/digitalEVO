# Integrasi Review digitalEVO di Vercel

## Yang disiapkan
- Bagian ulasan di `index.html`, gaya di `styles.css`, logika publik di `devo-reviews.js`.
- API `api/reviews.js`, `api/verify-review.js`, `api/submit-review.js`.
- Moderasi admin (setujui/tolak/edit/hapus/pin) di `admin.html`, `admin.js`, `admin.css`.
- Migrasi database dan storage di `supabase-reviews.sql`.

## Langkah wajib sebelum deploy
1. Di Supabase SQL Editor jalankan `supabase-reviews.sql`. Migrasi ini menganggap `public.orders` sudah ada sesuai `supabase.sql` dan memiliki `customer_whatsapp`, `payment_status`, serta `id`.
2. Di Vercel Project → Settings → Environment Variables, tambahkan `SUPABASE_URL` (Project URL), `SUPABASE_SERVICE_ROLE_KEY` (server-side only), dan `REVIEW_TOKEN_SECRET` (nilai acak panjang minimal 32 karakter). Jangan pernah menaruh service-role key di file frontend atau mengirimkannya ke browser. `supabase-config.js` tetap menggunakan publishable/anon key.
3. Pastikan pembayaran sukses menandai `orders.payment_status` sebagai `paid` dan mengisi `customer_whatsapp` dengan nomor yang pembeli masukkan saat checkout. Endpoint verifikasi membaca tabel `orders`; kalau skema checkout Anda berbeda, endpoint perlu disesuaikan sebelum dipakai.
4. Deploy commit/project ke Vercel. Setelah deploy, login `/admin.html` memakai akun admin yang terdaftar di `public.admins`; buka menu Ulasan & Komentar.

## Catatan
- Nomor WhatsApp tidak ditampilkan pada ulasan. Token verifikasi berlaku 20 menit.
- Ulasan masuk sebagai `pending`; admin harus menyetujui agar publik melihatnya. Pin hanya mengubah urutan ulasan yang disetujui.
- Header awal menampilkan 5/5 dan “Berdasarkan 148 ulasan” sesuai permintaan; API memakai nilai rating/jumlah aktual ketika tersedia. Angka 148 sebaiknya dipastikan sesuai data nyata sebelum ditayangkan.
- Perubahan file saja belum menerbitkan website aktif. Environment variables, migrasi SQL, dan deployment di Vercel tetap harus dilakukan.

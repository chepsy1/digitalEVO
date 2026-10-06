# FIX PRODUK DIGITALeVO

Perbaikan ini menangani dua masalah admin Produk:

1. Foto produk yang kosong/rusak sekarang punya fallback ke aset bawaan (`assets/*.webp`).
2. Edit produk menggunakan update + select agar admin langsung mendapat konfirmasi bahwa baris benar-benar berubah.
3. Upload foto menggunakan `upsert` pada path produk sehingga mengganti foto lebih stabil.
4. Ada validasi ukuran maksimal 5 MB dan pesan error yang lebih jelas.
5. `supabase.sql` menambahkan migrasi aman untuk instalasi lama dan grant PostgREST yang diperlukan; RLS admin tetap menjadi pengaman.

## WAJIB setelah upload ZIP ke GitHub

Jalankan seluruh `supabase.sql` versi ini sekali di Supabase SQL Editor.

Pastikan UUID akun login ada di `public.admins`. Jika belum:

```sql
insert into public.admins (user_id)
values ('UUID-USER-ADMIN-KAMU')
on conflict (user_id) do nothing;
```

Setelah deploy, lakukan hard refresh browser (`Ctrl + F5`), login ulang, lalu buka **Produk**.

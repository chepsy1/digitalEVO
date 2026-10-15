# DigitalEVO — pencatatan pesanan sebelum pembayaran

Patch ini menambahkan pencatatan pesanan ketika QRIS berhasil dibuat, pemutakhiran status pesanan menjadi `paid` setelah gateway mengonfirmasi pembayaran, tab admin `Pesanan Masuk` / `Pembayaran Berhasil`, dan tombol hapus hanya untuk pesanan belum dibayar/kedaluwarsa.

## Sebelum deploy
1. Buat backup repo dan database terlebih dahulu.
2. Periksa file yang berubah, terutama `api/create-qris.js`, `api/check-payment.js`, `script.js`, `admin.js`, `admin.html`, dan `supabase.sql`.
3. Jalankan bagian migrasi/policy tabel `orders` di `supabase.sql` pada Supabase SQL Editor jika policy delete belum ada. Jangan mengubah atau menempelkan ulang service-role key ke frontend.
4. Deploy ke Preview Vercel terlebih dahulu, bukan langsung ke Production.
5. Uji satu checkout dengan nominal kecil: pastikan pesanan muncul di `Pesanan Masuk` sebelum membayar, foto dan detail terisi, setelah pembayaran terverifikasi pesanan berpindah ke `Pembayaran Berhasil`, dan tombol hapus tidak tampil untuk pesanan lunas.
6. Uji pesanan yang tidak dibayar. Admin menandainya sebagai `Kedaluwarsa` secara tampilan setelah 15 menit; status di database tetap `pending` sampai ada proses server yang mengubahnya. Tombol hapus tetap dibatasi oleh policy database ke status pending/expired.

## Catatan
- Batas kedaluwarsa di panel adalah 15 menit sejak `created_at`, sesuai fallback tampilan. Ini tidak membatalkan QRIS di gateway.
- Jika API gagal menyimpan pesanan pending setelah QRIS dibuat, endpoint mengembalikan error dan mencatat detail di log server. Periksa log sebelum mencoba transaksi lain.
- Jangan menyalin environment secrets ke file kode atau repo.

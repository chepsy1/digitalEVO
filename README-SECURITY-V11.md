# digitalEVO V11 — Security Hardening

V11 mempertahankan tampilan frontend, ticker, CSS, checkout UI, dan panel admin. Perubahan fokus pada backend/API dan policy database.

## Perubahan keamanan
- Harga checkout tidak lagi dipercaya dari browser. `/api/create-qris` mengambil harga dari tabel `products` berdasarkan kategori + qty.
- `/api/check-payment` kembali memverifikasi produk/harga dari database dan mengirim nominal server-side ke payment gateway.
- Nominal pembayaran dari gateway dibandingkan dengan harga produk sebelum order dicatat.
- Order QRIS dicatat secara idempotent: polling status berkali-kali tidak menggandakan `sold`.
- `quantity` order QRIS disimpan sebagai 1 order, bukan jumlah followers paket.
- `shopee_link` hanya disimpan untuk kategori followers.
- Endpoint `/api/notify-order` hanya dapat dipanggil server internal menggunakan `SUPABASE_SERVICE_ROLE_KEY`; browser tidak lagi memanggil endpoint tersebut.
- Upload bucket `order-photos` dibatasi 3 MB dan MIME type JPG/JPEG/PNG/WEBP.
- Header keamanan dasar Vercel ditambahkan tanpa mengubah tampilan.

## Environment Variables
Tidak ada secret baru yang wajib ditambahkan jika `SUPABASE_SERVICE_ROLE_KEY` sudah tersedia. Tetap gunakan:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- PAYMENT_GATEWAY_URL
- PAYMENT_GATEWAY_API_KEY (atau API_KEY untuk kompatibilitas lama)
- RESEND_API_KEY / NOTIFY_EMAIL / RESEND_FROM jika notifikasi email digunakan

Jangan pernah memasukkan `SUPABASE_SERVICE_ROLE_KEY` ke frontend atau GitHub.

## SQL
Setelah deploy V11, jalankan bagian `order-photos` dari `supabase.sql` di Supabase SQL Editor untuk menerapkan batas upload 3 MB dan MIME type. Policy lama akan dihapus/diganti oleh script tersebut.

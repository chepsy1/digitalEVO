# QRIS Payment Fix

Perbaikan yang disertakan:
- `check-payment` sekarang mengirim `paymentId`/transaction ID selain amount dan startTime.
- API proxy menerima `PAYMENT_GATEWAY_API_KEY` dan fallback `API_KEY`.
- URL gateway dinormalisasi agar tidak menghasilkan `//create-qris`.
- Timeout dan error gateway dibuat lebih jelas.
- Respons gateway dinormalisasi untuk beberapa nama field QRIS umum.
- Frontend menerima `qris_url`, `qr_url`, `qrUrl`, `qrContent`, atau `qrImage`.

## Environment

Di Vercel/Codespaces gunakan:

```env
PAYMENT_GATEWAY_URL=https://alamat-gateway-anda
PAYMENT_GATEWAY_API_KEY=secret-anda
```

Jangan memasukkan secret ke `script.js`, HTML, atau repository GitHub.

## Catatan

Project ini tetap membutuhkan payment gateway ShopeePay/QRIS yang memang menyediakan endpoint `/create-qris`, `/check-payment`, dan `/qr/:id`. Patch ini memperbaiki sisi website/proxy; kredensial atau layanan gateway eksternal tidak dibuat ulang dari secret yang tidak tersedia.

## Balasan Admin pada Ulasan
Setelah deploy file terbaru, buka Supabase SQL Editor dan jalankan isi file `add-admin-reply-column.sql` satu kali. Setelah itu buka Admin Panel > Ulasan & Komentar Pembeli, isi kolom **Balasan admin (ditampilkan di website)** pada ulasan yang diinginkan, lalu klik **Simpan edit**. Balasan muncul di website pada ulasan yang sudah disetujui.

# digitalEVO — GitHub Ready

This version adds:

- **Upload Foto/Screenshoot Akun Shopee** in the Followers checkout form.
- JPG, PNG, WEBP validation, maximum 3 MB, with preview.
- Uploaded photo is associated with the pending order and included in the admin notification email after QRIS payment is confirmed.
- A **Terima Kasih** image is shown on `success.html` only after payment is confirmed by the existing payment-check flow.
- Resend sender: `DigitalEVO <noreply@digitalevo.store>`.

## 1. Supabase Storage setup

Run the added **Order screenshot uploads** section in `supabase.sql` in the Supabase SQL Editor. It creates the `order-photos` bucket and the policies required by the checkout upload.

> Privacy note: this implementation uses a public bucket so the admin email can contain a direct image link. Do not use this bucket for identity documents or other sensitive files.

## 2. Vercel environment variables

Set these in Vercel Project Settings → Environment Variables:

- `RESEND_API_KEY` = your Resend API key
- `NOTIFY_EMAIL` = `digitalevoadmin@gmail.com`
- `RESEND_FROM` = `DigitalEVO <noreply@digitalevo.store>`
- `PAYMENT_GATEWAY_URL` = your existing QRIS gateway URL
- `PAYMENT_GATEWAY_API_KEY` = your existing gateway API key

Never commit `.env` or secret keys to GitHub.

## 3. GitHub / Vercel

Upload this project to GitHub and import the repository into Vercel. Keep the existing environment variables from your current deployment.

## 4. Checkout flow

For Followers orders:

1. Buyer enters Shopee username/link and WhatsApp.
2. Buyer uploads a screenshot.
3. Screenshot uploads to Supabase Storage.
4. QRIS is created.
5. Existing payment checker waits for confirmed payment.
6. After `paid === true`, the site sends the order notification to Resend and opens `success.html`.
7. The admin email contains the screenshot link/image.
8. The thank-you image appears on the success page.

## 5. Important

The upload is limited to 3 MB because it is performed directly from the browser using the Supabase publishable/anon key.

## Upload screenshot akun Shopee

Form **Upload Foto/Screenshoot Akun Shopee** hanya dirender pada checkout kategori **Followers Shopee**. Checkout kategori **Akun Shopee Premium** tidak menampilkan field upload tersebut.

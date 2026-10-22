# DigitalEVO Member — staging verification checklist

**Environment:** use a dedicated Supabase staging project and a Vercel preview deployment with staging-only environment variables. Never paste production secrets into tests or this file. Do not run these tests against the production database or real customer QRIS.

## 0. Isolation and setup
- [ ] Create/choose a separate Supabase staging project with a schema snapshot that matches the current production schema (including products/orders columns and category constraints).
- [ ] Configure a Vercel preview environment with staging SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PAYMENT_GATEWAY_URL, and PAYMENT_GATEWAY_API_KEY. Use a gateway sandbox/test account if available.
- [ ] Confirm the preview uses the staging Supabase URL in browser network requests and server logs.
- [ ] Apply supabase/member-wallet-foundation.sql only to staging; save the migration output and inspect RLS/grants/functions.
- [ ] Apply `supabase/migrations/20261022_member_whatsapp_password_auth.sql` in staging after the member foundation migration. Verify member registration creates a confirmed internal-email identity server-side, sends no email, and requires no Phone Auth provider or OTP.
- [ ] Verify login exchanges WhatsApp + password for a valid session, duplicate phone registration is rejected, and no password is stored in application tables or logs.
- [ ] Before public launch, implement and test persistent server-side rate limiting for registration and login. Decide a secure password recovery flow; do not invent an email/OTP reset path.
- [ ] Confirm member price editing remains protected by the existing admin authorization policy.

## 1. Registration and bonus
- [ ] Register a new staging-only WhatsApp number and password through the backend endpoint.
- [ ] Confirm duplicate/invalid phone registration is handled clearly and passwords are never written to custom tables or logs.
- [ ] Create registration QRIS for exactly Rp99.000; inspect gateway response shape, reference, QR rendering, and expiry.
- [ ] Reload the page and sign in again before paying; the same pending QRIS/reference should be restored, not duplicated.
- [ ] Check payment before paying: membership must remain pending and wallet bonus must remain Rp0.
- [ ] Pay using a staging/sandbox payment. Confirm the gateway reports PAID/SUCCESS and the exact amount Rp99.000.
- [ ] Press Periksa Pembayaran multiple times and reload/login again. Membership must become active and bonus must remain exactly Rp15.000, with only one registration_bonus ledger row.
- [ ] Try a test response with missing/wrong amount or non-paid status; no membership activation or bonus credit may occur.

## 2. Deposit
- [ ] Test the minimum Rp1.000 and a normal deposit amount; reject Rp999, decimals, negative values, and values above Rp10.000.000.
- [ ] Create a deposit QRIS, reload/login, and confirm the same pending reference is restored.
- [ ] Try submitting another deposit while one is pending; it should reuse the pending request instead of creating a second QRIS. Confirm the displayed amount is the pending request's amount.
- [ ] Verify an unpaid deposit does not change balance.
- [ ] Verify a successful exact-amount deposit increases balance once only, even after repeated checks and concurrent retries.
- [ ] Verify a wrong-amount payment never credits the wallet.
- [ ] Test expiry from the gateway. Expired requests should not be shown as payable; a new request should be possible.

## 3. Member prices and checkout
- [ ] As admin, set a positive member price for one product; confirm member UI shows it.
- [ ] Clear the member price; confirm the agreed promo price is used.
- [ ] Attempt zero, negative, decimal, and malformed prices; they must be rejected.
- [ ] With enough staging balance, place one test order for each supported category: followers, account, video_views, video_likes, video_comments, and product_likes (only where matching staging products exist).
- [ ] Verify category-specific required fields, followers photo upload, account recipient name/contact, and exact custom-comment line count.
- [ ] Attempt checkout with insufficient balance; order must not be created and balance must not change.
- [ ] Verify each successful wallet order creates one order, one negative purchase ledger entry, and one matching wallet debit; invoice is unique; order status is queued and payment status is paid.
- [ ] Confirm the order appears in Admin Panel with correct product, category, quantity, account name/contact, comment text, WhatsApp, Shopee link, amount, and payment method.
- [ ] Confirm email and Telegram notifications arrive for each relevant test order; verify notification failure is visible in logs and does not duplicate the order.

## 4. Isolation, abuse and regression
- [ ] User A cannot read or affect User B's profile, wallet, payment requests, ledger, or orders through direct API calls.
- [ ] Anonymous users cannot call payment-credit, wallet debit, or checkout RPCs directly.
- [ ] Service-role key is only used server-side and is absent from browser assets/source maps.
- [ ] Test duplicate clicks, parallel payment checks, stale references, reused references, and gateway timeout/retry scenarios.
- [ ] Run a normal non-member checkout and a normal QRIS checkout in staging. Confirm existing behavior and order records are unchanged.
- [ ] Verify no production environment variable, production database, or real customer record was touched.

## Acceptance criteria
Do not merge or deploy until all applicable checks pass, any failures are fixed, and a human reviews the staging evidence. Record only redacted invoice/reference suffixes and never store phone numbers, passwords, API keys, QR payloads, or payment secrets in this checklist.

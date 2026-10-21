# DigitalEVO Member feature — implementation status

Development remains isolated on `feature/member-login-deposit-wallet`; nothing here is merged into production.

## Current files
- `/MEMBER_STAGING_CHECKLIST.md`: staging-only verification cases for registration, one-time bonus, deposits, member pricing, wallet checkout, permissions, and regression checks.
- `/member.html`, `/member.css`, `/member.js`: member login/registration UI, wallet status, deposit form, scannable QRIS display, and payment-check controls.
- `/admin.js`, `/admin.css`: per-product member-price field in the existing admin product editor.
- `/api/member-payment.js`: authenticated server endpoint for creating registration/deposit QRIS requests and verifying payments with the existing gateway.
- `/supabase/member-wallet-foundation.sql`: additive member profile, wallet, payment request, ledger, optional per-product member price, RLS, and idempotent server-only credit functions.

## Agreed rules
- Registration fee: Rp99.000, paid once.
- Registration bonus: Rp15.000, credited once only after server-side payment verification.
- Login credentials: WhatsApp number and password through Supabase Auth (never store raw passwords in a custom table).
- Deposit wallet is intended for all product categories.
- Member prices are assigned manually per product by the shop admin; a special member price must be a positive whole rupiah amount, or left blank to use the promo price.
- Existing regular checkout, QRIS, orders, and admin panel must remain intact.

## Important deployment blockers
Do not run the SQL migration in production or merge/deploy this branch yet. The portal and payment API are a development stage, not a finished member-commerce system.

1. Configure and test Supabase Phone Auth. If phone confirmation is enabled, users may be required to verify an OTP; the UI reports that condition. Do not promise password-only registration until the project's Auth settings and recovery flow are confirmed.
2. Run and review the additive SQL migration in a staging project before the admin price field can save; verify only admins can update product prices under the existing `is_admin()` RLS policy.
3. Atomic wallet checkout backend is drafted in `member_checkout_with_wallet` and `/api/member-checkout.js`: it validates active membership and the current product/member price, creates the existing `orders` row, debits the wallet, and writes the ledger in one database transaction. The member page has a product picker, per-category required fields, custom-comment count validation, screenshot upload for followers, and calls `/api/member-checkout`. The migration now ensures `orders.account_name` and `orders.comment_text` exist, saves the account recipient name, and stamps paid wallet orders with `paid_at`. The custom-comment SQL splitter was corrected to split on actual newline characters. The admin order table shows the saved account recipient name. This is implementation progress only; schema and end-to-end tests are still required. The standalone debit function remains unavailable to browser users and must not be used by itself.
4. Test the actual QRIS gateway response fields and expiry/status behavior against a non-production payment before using member payments.
5. Add abuse protection/rate limiting for account and QRIS creation; test duplicate requests, retries, wrong amounts, insufficient balance, and isolation between users. Wallet-paid purchases now attempt to call the existing internal email/Telegram notification endpoint after the database transaction commits, using the deployment host from Vercel environment rather than a user-supplied host. Notification failures are logged and do not undo a successful order. This wiring still needs an end-to-end staging test.
6. Test the migration against a copy of the live Supabase schema and confirm all existing checkout/QRIS paths remain unchanged.
7. Code review found and fixed the email subject label for `video_comments` orders in `/api/notify-order.js`. This is only a code-level fix; email/Telegram delivery still requires staging verification.
9. The live schema check found `products.id` is `bigint` while `orders.product_id` is `uuid`. The member checkout migration was adjusted to write `NULL` to the optional `orders.product_id` for member orders and preserve the package quantity in `orders.quantity`; this avoids an invalid bigint-to-uuid assignment. Confirm Admin Panel and any downstream workflows do not require `product_id` for these wallet orders during staging tests.
8. Member QRIS recovery has now been added on the feature branch: registration/deposit QR display fields are stored in the member payment tables, signed-in members can resume the latest pending QRIS after reopening the page, registration retries reuse a pending QRIS, and deposit retries reuse the latest pending QRIS instead of creating duplicates. Requests whose gateway-provided `expires_at` has passed are marked expired. This needs migration + staging verification; older rows without saved QR display data can only be checked by reference and may require admin help.

The registration/deposit API verifies the signed-in user with Supabase Auth and only credits through server-only SQL functions after the gateway confirms the exact amount. Do not expose the Supabase service-role key in browser code.

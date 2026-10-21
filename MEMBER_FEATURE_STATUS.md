# DigitalEVO Member feature — implementation status

Development remains isolated on `feature/member-login-deposit-wallet`; nothing here is merged into production.

## Current files
- `/member.html`, `/member.css`, `/member.js`: member login/registration UI, wallet status, deposit form, scannable QRIS display, and payment-check controls.
- `/admin.js`, `/admin.css`: per-product member-price field in the existing admin product editor.
- `/api/member-payment.js`: authenticated server endpoint for creating registration/deposit QRIS requests and verifying payments with the existing gateway.
- `/supabase/member-wallet-foundation.sql`: additive member profile, wallet, payment request, ledger, optional per-product member price, RLS, and idempotent server-only credit functions.

## Agreed rules
- Registration fee: Rp99.000, paid once.
- Registration bonus: Rp15.000, credited once only after server-side payment verification.
- Login credentials: WhatsApp number and password through Supabase Auth (never store raw passwords in a custom table).
- Deposit wallet is intended for all product categories.
- Member prices are assigned manually per product by the shop admin.
- Existing regular checkout, QRIS, orders, and admin panel must remain intact.

## Important deployment blockers
Do not run the SQL migration in production or merge/deploy this branch yet. The portal and payment API are a development stage, not a finished member-commerce system.

1. Configure and test Supabase Phone Auth. If phone confirmation is enabled, users may be required to verify an OTP; the UI reports that condition. Do not promise password-only registration until the project's Auth settings and recovery flow are confirmed.
2. Run and review the additive SQL migration in a staging project before the admin price field can save; verify only admins can update product prices under the existing `is_admin()` RLS policy.
3. Implement atomic wallet checkout: in one database transaction validate the active member, read the product's current member price, create the matching existing `orders` row with the exact required fields, debit the wallet, and write a ledger row. The current debit function is intentionally not callable by browser users and must not be used by itself.
4. Test the actual QRIS gateway response fields and expiry/status behavior against a non-production payment before using member payments.
5. Add abuse protection/rate limiting for account and QRIS creation; test duplicate requests, retries, wrong amounts, insufficient balance, and isolation between users.
6. Test the migration against a copy of the live Supabase schema and confirm all existing checkout/QRIS paths remain unchanged.

The registration/deposit API verifies the signed-in user with Supabase Auth and only credits through server-only SQL functions after the gateway confirms the exact amount. Do not expose the Supabase service-role key in browser code.

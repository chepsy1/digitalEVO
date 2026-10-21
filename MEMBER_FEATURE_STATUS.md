# DigitalEVO Member feature — implementation status

This branch contains the first visual member portal and an additive Supabase schema foundation.

## Current files
- `/member.html`: initial registration/login screen (UI only; forms intentionally do not authenticate yet).
- `/member.css`: responsive styling.
- `/member.js`: tab switching and basic form validation only.
- `/supabase/member-wallet-foundation.sql`: member profile, wallet, payment request, ledger, manual member-price column, RLS, and wallet RPC foundation.

## Agreed rules
- Registration fee: Rp99,000, one-time.
- Registration bonus: Rp15,000, credited once only after the server verifies the registration payment.
- Login credentials: WhatsApp number and password.
- Deposit wallet is intended for all product categories.
- Member prices are assigned manually per product by the shop admin.
- Existing regular checkout, QRIS, orders, and admin panel must remain intact.

## Not ready for production
Do not run the migration or enable the UI in production until the remaining server integration has been reviewed and tested. The following are still required:
1. A secure phone/password authentication flow and account recovery. Supabase phone/password authentication normally depends on phone verification/configuration; do not store raw passwords in a custom table.
2. Server endpoints to create registration/deposit payment requests and verify payment with the existing gateway.
3. A verified, idempotent deposit-credit function and admin-only price-management controls.
4. Atomic wallet checkout that creates the corresponding existing `orders` record and deducts balance in one database transaction, using server-calculated member prices.
5. Tests for repeated payment callbacks, duplicate checkout attempts, insufficient balance, and isolation between members.
6. Review the exact current orders schema and checkout flow before integrating.

The activation RPC expects a matching registration-payment row already marked `paid` by trusted server-side payment verification. It must never be called directly from browser code. The debit RPC is a wallet primitive only; it does not yet create an order and must not be used as the checkout implementation until the atomic order integration is built.

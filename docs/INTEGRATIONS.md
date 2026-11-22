# Integrations (Phase 8)

Restaurants set these up in **Settings → Integrations**. Secrets (passwords,
salts, keys, tokens) are written once and stored in the database's `private`
schema; the browser can never read them back, and only the server functions
in `api/` (running with the Supabase service key) use them.

## How a guest pays online

1. The bill link (`/r/<token>`) shows what is left to pay, including the
   digital-payment tax rate (`Branch → tax on wallet`). The cashier shares it
   from the POS with **Send pay link** (QR code, WhatsApp or copy), or the
   guest opens it from the receipt.
2. **Pay with JazzCash / Easypaisa** asks `POST /api/pay/start`, which creates
   a pending `online_payments` row and signs the gateway request with the
   restaurant's secrets. The browser is handed straight to the gateway's page.
3. The gateway sends the guest back to `/api/pay/return/<provider>`. The server
   verifies the signature (JazzCash) or asks the gateway's status API
   (Easypaisa), then records the payment in the database. The bill is settled
   only by this server-side step; a forged or replayed callback records nothing.
4. If a guest pays after the bill was already settled at the till, the payment
   is still recorded (money was taken) and flagged on the bill for a refund.

## JazzCash and Easypaisa — verify before going live

Both adapters (`api/_lib/gateways/`) follow the merchant integration guides
as commonly documented, but EdgeX has **not yet tested them against the real
sandboxes** (they need merchant accounts). Before switching a restaurant to
**Live**:

1. Get sandbox credentials from the provider (JazzCash: Merchant ID, Password,
   Integrity Salt; Easypaisa: Store ID, Hash Key, API username/password,
   merchant account number) and register the return URL
   `https://<your-domain>/api/pay/return/jazzcash` (or `/easypaisa`).
2. Enter them with **Environment = Sandbox**, then pay a test bill end to end.
3. Check against the provider's current guide: request field names, the hash
   (JazzCash: HMAC-SHA256 over the sorted non-empty `pp…` values, salt first;
   Easypaisa: AES-128-ECB of the sorted request string), the success code
   (JazzCash `000`; Easypaisa inquiry `transactionStatus = PAID`), and the
   endpoint URLs at the top of each adapter file.
4. Fix any difference in the adapter (unit tests in
   `api/_lib/gateways/gateways.test.ts`), then switch to **Live**.

## Raast / bank transfer

Raast payments from a merchant QR need an acquiring bank. Until a bank
integration is added, the bill link shows the restaurant's **Raast ID / IBAN**;
the guest transfers the amount in their banking app and the cashier records
it in the POS as **Bank / Raast** with the transaction ID as reference.

## Thermal printers

Printers are set up **per device** (the POS tablet, the kitchen screen) with
the printer button in the POS and kitchen display headers. Printing goes
straight to the printer as ESC/POS commands, so there is no print dialog:

- **Connect USB** (WebUSB) for USB printers that expose a printer interface.
  On Windows the installed printer driver usually holds the device; use the
  serial option (with the printer's USB-serial/virtual COM driver) instead.
- **Connect serial / Bluetooth** (Web Serial) for serial, USB-serial and
  Bluetooth (SPP) printers; pick the speed the printer uses (often 9600).
- Paper width 80 mm (48 columns) or 58 mm (32 columns).
- POS: receipts print automatically when a bill is paid, and **Open the cash
  drawer after cash payments** pulses a drawer connected to the printer.
  Receipts carry a QR code of the bill link (pay online / digital receipt).
- Kitchen display: **Print new kitchen tickets automatically** prints every
  new ticket for the station shown on that screen.

Works in Chrome and Edge (desktop and Android). Safari and Firefox don't
support these APIs; there, receipts fall back to the browser print dialog.
Text is printed in the printer's built-in character set, so tickets use the
English item names (Urdu names are not sent to the printer).

## Local development and tests

`npm run dev` and `npm run preview` serve the `api/` functions too. Add to
`.env.local` (local Supabase only):

```
SUPABASE_SERVICE_ROLE_KEY=<service_role key from `npx supabase status -o env`>
ENABLE_TEST_GATEWAY=1   # server: enables the fake gateway
VITE_TEST_GATEWAY=1     # browser: shows "Pay with Test gateway"
```

The test gateway shows Approve / Decline buttons and signs its callback, so the
whole flow runs in the end-to-end tests without real money.

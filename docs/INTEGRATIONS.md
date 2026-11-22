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

## WhatsApp (Meta Cloud API)

When a bill with a customer phone number is paid, or a takeaway / delivery
order is marked ready, the database queues a message (`message_outbox`, once
per event). The POS and kitchen screens then nudge `POST /api/notify/flush`,
which sends the queue with the restaurant's WhatsApp Business number. Failed
sends are retried up to 5 times; permanent errors (bad token, template not
approved, invalid number) stop immediately and are shown in the message log.

Setup per restaurant:

1. In Meta Business Manager, create a WhatsApp Business account and phone
   number (business verification is needed for higher sending limits; start
   early). Note the **Phone number ID** and create a **permanent access token**
   for a system user with `whatsapp_business_messaging` permission.
2. In WhatsApp Manager → Message templates, create and get approved (category
   **Utility**, language English, or set another language code in EdgeX):

   | Template name       | Body                                                                          |
   | ------------------- | ----------------------------------------------------------------------------- |
   | `edgex_receipt`     | `Thank you for visiting {{1}}! Bill #{{2}}, total {{3}}. Your receipt: {{4}}` |
   | `edgex_order_ready` | `{{1}}: your order #{{2}} is ready.`                                          |

   Other names can be used; enter them in Settings. The placeholders must stay
   in this order.

3. In EdgeX → Settings → Integrations → WhatsApp, enter the phone number ID
   and token, choose what to send, and turn it on.

Optional: call `GET /api/notify/flush` from a scheduler (e.g. a Vercel cron
on a paid plan) to send anything queued while no screen was open.

## Tax authority invoices (FBR / PRA)

With **Settings → Integrations → Tax authority** on, every bill is reported
when it is paid (queued in `message_outbox`, sent by `/api/notify/flush` in
the IMS `PostData` JSON format with the POS ID and access token). The fiscal
invoice number returned is stored on the bill and printed on the receipt
(web and thermal) with a QR code. The POS waits up to 4 seconds for it
before printing; if the authority rejects the invoice, the bill shows the
error and **Send again**.

How the invoice is built (`api/_lib/fiscal.ts`): one line per item plus the
service charge; the bill discount and the tax are spread over the lines to
the paisa, so the lines add up exactly to the totals; payment mode 1 = cash,
2 = card / wallet / bank, 5 = mixed. `USIN` is `<branch>-<date>-<bill no.>`.

Before going live: register the POS with FBR (IRIS) or PRA, get the POS ID
and token, enter the PCT code from your registration, test in **Sandbox**,
and check the endpoints and fields against the authority's current guide
(the defaults are at the top of `fiscal.ts`; a different URL can be entered
in Settings). Not covered yet: credit notes for refunds (InvoiceType 3),
SRB / KPRA.

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
# Stand-ins served by the app itself (ENABLE_TEST_GATEWAY only):
WHATSAPP_API_BASE=http://localhost:4173/api/test/whatsapp
FISCAL_API_BASE=http://localhost:4173/api/test/fiscal
```

The test gateway shows Approve / Decline buttons and signs its callback, so the
whole flow runs in the end-to-end tests without real money.

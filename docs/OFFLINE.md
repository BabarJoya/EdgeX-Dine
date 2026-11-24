# Offline POS

Internet and power cuts are common, so the POS keeps taking **takeaway and
delivery** sales without a connection.

## What works offline

| Works                                                          | Waits for the connection          |
| -------------------------------------------------------------- | --------------------------------- |
| Opening the POS (even after a reload / restart of the tablet)  | Unlocking the till with a PIN (*) |
| New takeaway / delivery sale from the menu saved on the device | Table bills, guests' QR orders    |
| Cash or card payment, change, printed receipt, cash drawer     | Refunds, discounts, shift close   |
| A list of sales waiting to sync (header button)                | Reports, back office              |

(*) Unlock the till while online at the start of the day; it stays unlocked
on that device through an outage.

## How it works

1. The app shell is cached by the service worker (PWA), and the data a
   station needs to start — your account, restaurant, branches, permissions,
   menu and open shift — is kept in IndexedDB (`src/lib/query-persist.ts`).
   When online, that copy is only a head start: everything is refreshed from
   the server as soon as the app opens.
2. A sale made offline is priced from the saved menu and stored in an
   IndexedDB queue with a unique reference (`src/features/offline/`).
   If a receipt printer is connected, an "OFFLINE SALE" slip prints at once.
3. When the connection returns (and every 30 s while online) the queue is
   sent oldest-first to `sync_offline_sale`, which:
   - is **idempotent** — a sale is never billed twice, even if the tablet
     retries or two tabs sync at once;
   - creates the order and bill through the normal POS functions (prices
     from the database, stock deduction, tax invoice, WhatsApp receipt);
   - takes the payment with the method used at the till, marks the order
     completed (so it does not appear as new on the kitchen display) and
     dates it to when the sale happened;
   - flags the bill if menu prices changed since the device saved the menu.
4. Problems (for example no open shift) are shown next to each queued sale;
   nothing is dropped.

Sign-out clears the device copy.

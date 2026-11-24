# EdgeX API (v1) and webhooks

Available on the **Enterprise** plan. Create keys and webhook endpoints in
**Settings → API & webhooks**.

## Authentication

```
Authorization: Bearer edgx_…
```

Keys are shown once and stored only as a hash; revoke them in Settings.
Each key may make **120 requests per minute** (`X-RateLimit-Remaining`;
`429` when exceeded). All endpoints are read-only and return JSON. Money is
in minor units (paisa): `95000` = Rs 950.

## Endpoints

| Method & path             | Query                                                                                                                                           | Returns                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/v1/branches`    | —                                                                                                                                               | `[{ id, name, address, phone, is_active }]`                             |
| `GET /api/v1/menu`        | —                                                                                                                                               | `{ restaurant, categories, products, groups }`                          |
| `GET /api/v1/orders`      | `from`, `to` (YYYY-MM-DD, ≤ 31 days, default today), `branch_id`, `status`, `limit` (1–200, default 50), `before` (ISO time, for the next page) | `{ data: [order], next_before }` newest first                           |
| `GET /api/v1/orders/{id}` | —                                                                                                                                               | `order`                                                                 |
| `GET /api/v1/sales`       | `from`, `to` (≤ 366 days), `branch_id`                                                                                                          | `[{ date, net_minor, tax_minor, total_minor, bills }]` per business day |

An **order**:

```json
{
  "id": "…",
  "branch_id": "…",
  "number": 42,
  "business_date": "2026-11-24",
  "type": "dine_in",
  "source": "qr",
  "status": "completed",
  "table": "T4",
  "total_minor": 190000,
  "currency": "PKR",
  "created_at": "…",
  "items": [
    {
      "name": "Chicken Tikka",
      "variant": null,
      "quantity": 2,
      "line_total_minor": 190000,
      "status": "completed"
    }
  ]
}
```

Example:

```bash
curl -H "Authorization: Bearer $EDGEX_KEY" \
  "https://<your-domain>/api/v1/orders?from=2026-11-01&to=2026-11-24&limit=100"
```

Errors: `401` missing / invalid / revoked key · `403` plan without the API or
account suspended · `400` bad parameters · `404` not found · `429` rate limit.

## Webhooks

EdgeX sends `POST` requests with a JSON body to your HTTPS endpoint:

| Event                  | When                                           | `data`                                                               |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `order.created`        | A new order (QR, waiter, POS, online)          | `{ order_id, order }`                                                |
| `order.status_changed` | Accepted, preparing, ready, served, cancelled… | `{ order_id, from, to, order }`                                      |
| `bill.paid`            | A bill is fully paid                           | `{ bill_id, number, net_minor, tax_minor, total_minor, paid_at, … }` |
| `reservation.created`  | A booking is made (online or by staff)         | `{ reservation_id, name, party_size, starts_at, status, source }`    |
| `ping`                 | "Send test" in Settings                        | `{ message }`                                                        |

```json
{ "id": "<delivery id>", "event": "order.created", "created_at": "…", "data": { … } }
```

Headers: `EdgeX-Event`, `EdgeX-Delivery` (unique; use it to ignore
duplicates), `EdgeX-Signature: t=<unix>,v1=<hex>`.

**Verify the signature** (Node):

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

function verify(rawBody, header, secret) {
  const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header) ?? []
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false // 5-minute window
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}
```

Respond with any `2xx` within 10 seconds. Failed deliveries are retried up to
5 times; `4xx` responses (except 408 / 429) are not retried. Recent deliveries
and their results are listed in Settings.

**Delivery timing:** events are delivered when any EdgeX screen of the
restaurant is active (POS, kitchen display, guest ordering). For deliveries
within a minute at all times, call `GET https://<your-domain>/api/notify/flush`
every minute from a scheduler or uptime monitor (or a Vercel cron on a Pro
plan).

Webhook addresses must be public HTTPS URLs (no localhost or private networks).

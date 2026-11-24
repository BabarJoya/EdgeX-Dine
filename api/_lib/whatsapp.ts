import { createHmac } from 'node:crypto'
import { rpc } from './db.js'
import { imsInvoice, postInvoice, type FiscalPayload } from './fiscal.js'
import { env } from './env.js'
import { json } from './http.js'

/**
 * WhatsApp Cloud API (Meta). Business-initiated messages must use templates
 * approved in WhatsApp Manager; see docs/INTEGRATIONS.md for the two
 * templates EdgeX uses and their placeholders.
 */
export type Message = {
  id: string
  channel: 'whatsapp' | 'fiscal' | 'webhook'
  mode: 'sandbox' | 'live'
  kind: 'receipt' | 'order_ready' | 'fiscal' | 'reservation' | 'webhook'
  to: string
  params: Record<string, string | number>
  settings: Record<string, string>
  secrets: Record<string, string>
  enabled: boolean
}

const apiBase = () =>
  (process.env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0').replace(/\/$/, '')

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'PKR' ? 0 : 2,
  })
    .format(minor / 100)
    .replace(/ /g, ' ')

const text = (v: string | number) => ({ type: 'text', text: String(v).slice(0, 200) })

/** The Cloud API request body for one queued message. */
export function templateBody(m: Message, appUrl: string) {
  const p = m.params
  const templates = {
    receipt: [
      m.settings.receipt_template || 'edgex_receipt',
      [
        text(p.restaurant),
        text(p.bill_number),
        text(money(Number(p.total_minor), String(p.currency || 'PKR'))),
        text(`${appUrl}/r/${p.receipt_token}`),
      ],
    ],
    order_ready: [
      m.settings.ready_template || 'edgex_order_ready',
      [text(p.restaurant), text(p.order_number)],
    ],
    reservation: [
      m.settings.reservation_template || 'edgex_reservation',
      [text(p.restaurant), text(p.when), text(p.party_size), text(`${appUrl}/res/${p.token}`)],
    ],
  } as Record<string, [string, ReturnType<typeof text>[]]>
  const [name, parameters] = templates[m.kind]
  return {
    messaging_product: 'whatsapp',
    to: m.to,
    type: 'template',
    template: {
      name,
      language: { code: m.settings.language || 'en' },
      components: [{ type: 'body', parameters }],
    },
  }
}

async function sendFiscal(m: Message) {
  const token = m.secrets.token
  if (!m.enabled || !token)
    return { ok: false, final: true, error: 'Tax authority integration is not set up' }
  const invoice = imsInvoice(m.params as unknown as FiscalPayload, m.settings)
  return postInvoice(m.settings.authority || 'fbr', m.mode, token, invoice, m.settings.endpoint)
}

/** Stripe-style signature: t=<unix>,v1=HMAC-SHA256(secret, `${t}.${body}`). */
export function signWebhook(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
}

async function sendWebhook(m: Message, appUrl: string) {
  const p = m.params as unknown as {
    endpoint_id: string
    event: string
    created_at: string
    data: Record<string, unknown>
  }
  const orderId = typeof p.data?.order_id === 'string' ? p.data.order_id : null
  const target = await rpc<{ url: string; active: boolean; secret: string; order: unknown } | null>(
    'server_webhook_target',
    {
      p_endpoint_id: p.endpoint_id,
      p_order_id: orderId,
    },
  )
  if (!target || !target.active)
    return { ok: false, final: true, error: 'Endpoint removed or disabled' }
  const body = JSON.stringify({
    id: m.id,
    event: p.event,
    created_at: p.created_at,
    data: orderId ? { ...p.data, order: target.order } : p.data,
  })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  // Automated tests: a reserved host is delivered to the local receiver.
  const url =
    env.testGateway() && new URL(target.url).hostname === 'webhook.test'
      ? `${appUrl}/api/test/webhook-sink`
      : target.url
  try {
    const r = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'EdgeX-Webhooks/1',
        'EdgeX-Event': p.event,
        'EdgeX-Delivery': m.id,
        'EdgeX-Signature': signWebhook(target.secret, body),
      },
      body,
    })
    if (r.ok) return { ok: true, id: `HTTP ${r.status}` }
    // 4xx (except timeouts / rate limits) won't succeed on retry.
    return {
      ok: false,
      final: r.status >= 400 && r.status < 500 && ![408, 429].includes(r.status),
      error: `HTTP ${r.status}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function send(m: Message, appUrl: string) {
  if (m.channel === 'webhook') return sendWebhook(m, appUrl)
  if (m.channel === 'fiscal') return sendFiscal(m)
  const phoneId = m.settings.phone_number_id
  const token = m.secrets.access_token
  if (!m.enabled || !phoneId || !token)
    return { ok: false, final: true, error: 'WhatsApp is not set up' }
  const r = await fetch(`${apiBase()}/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(templateBody(m, appUrl)),
  })
  const body = (await r.json().catch(() => ({}))) as {
    messages?: { id: string }[]
    error?: { message?: string; code?: number }
  }
  if (r.ok && body.messages?.[0]?.id) return { ok: true, id: body.messages[0].id }
  // 4xx (bad number, template not approved, bad token) will not fix itself.
  return {
    ok: false,
    final: r.status >= 400 && r.status < 500 && r.status !== 429,
    error: body.error?.message ?? `WhatsApp API error ${r.status}`,
  }
}

/** POST|GET /api/notify/flush — send whatever the database has queued
 * (WhatsApp messages and tax-authority invoices). */
export async function flushMessages(req: Request) {
  const appUrl = env.appUrl(req)
  const batch = await rpc<Message[]>('server_claim_messages', { p_limit: 20 })
  let sent = 0
  let failed = 0
  for (const m of batch) {
    const res = await send(m, appUrl).catch((e: Error) => ({
      ok: false,
      final: false,
      error: e.message,
    }))
    await rpc('server_message_result', {
      p_id: m.id,
      p_ok: res.ok,
      p_provider_id: 'id' in res ? res.id : null,
      p_error: 'error' in res ? res.error : null,
      p_final: 'final' in res ? res.final : false,
    })
    if (res.ok) sent++
    else failed++
  }
  return json({ sent, failed })
}

// --- Test doubles (ENABLE_TEST_GATEWAY only) ---------------------------------------
const hooks: unknown[] = []
export async function testWebhookSink(req: Request) {
  if (!env.testGateway()) return json({ error: 'Not found' }, 404)
  if (req.method === 'GET') return json(hooks)
  hooks.push({
    event: req.headers.get('edgex-event'),
    signature: req.headers.get('edgex-signature'),
    body: await req.text(),
  })
  return json({ received: true })
}

let invoices = 0
export async function testFiscal(req: Request) {
  if (!env.testGateway()) return json({ error: 'Not found' }, 404)
  const body = (await req.json()) as { USIN?: string; Items?: unknown[] }
  if (req.headers.get('authorization') !== 'Bearer test-fiscal') {
    return json({ Code: '401', Response: 'Unauthorized' }, 401)
  }
  if (!body.Items?.length)
    return json({ Code: '101', Response: 'Items are required', Errors: ['Items'] })
  invoices++
  return json({
    InvoiceNumber: `TEST${String(invoices).padStart(6, '0')}${body.USIN?.replace(/\W/g, '').slice(-6)}`,
    Code: '100',
    Response: 'Fiscal Invoice Number generated successfully.',
    Errors: null,
  })
}

const outbox: unknown[] = []
export async function testWhatsApp(req: Request) {
  if (!env.testGateway()) return json({ error: 'Not found' }, 404)
  if (req.method === 'GET') return json(outbox)
  const body = await req.json()
  const auth = req.headers.get('authorization')
  if (auth !== 'Bearer test-token')
    return json({ error: { message: 'Invalid OAuth access token' } }, 401)
  outbox.push({ path: new URL(req.url).pathname, body })
  return json({ messages: [{ id: `wamid.TEST${outbox.length}` }] })
}

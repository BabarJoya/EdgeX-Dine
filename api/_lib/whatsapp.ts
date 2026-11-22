import { rpc } from './db.js'
import { env } from './env.js'
import { json } from './http.js'

/**
 * WhatsApp Cloud API (Meta). Business-initiated messages must use templates
 * approved in WhatsApp Manager; see docs/INTEGRATIONS.md for the two
 * templates EdgeX uses and their placeholders.
 */
export type Message = {
  id: string
  kind: 'receipt' | 'order_ready'
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
  const isReceipt = m.kind === 'receipt'
  const name = isReceipt
    ? m.settings.receipt_template || 'edgex_receipt'
    : m.settings.ready_template || 'edgex_order_ready'
  const parameters = isReceipt
    ? [
        text(p.restaurant),
        text(p.bill_number),
        text(money(Number(p.total_minor), String(p.currency || 'PKR'))),
        text(`${appUrl}/r/${p.receipt_token}`),
      ]
    : [text(p.restaurant), text(p.order_number)]
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

async function send(m: Message, appUrl: string) {
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

/** POST|GET /api/notify/flush — send whatever the database has queued. */
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

// --- Test double of the Cloud API (ENABLE_TEST_GATEWAY only) ---------------------
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

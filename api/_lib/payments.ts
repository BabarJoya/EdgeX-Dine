import { rpc, DbError } from './db.js'
import { env } from './env.js'
import { gateways } from './gateways/index.js'
import { sign } from './gateways/test-gateway.js'
import { SignatureError, type Attempt } from './gateways/types.js'
import { autoPost, escapeHtml, html, json, readParams, redirect } from './http.js'

type StartRow = {
  txn_ref: string
  amount_minor: number
  currency: string
  created_at: string
  expires_at: string
  bill_number: number
  restaurant: string
  customer_phone: string | null
  receipt_token: string
  mode: 'sandbox' | 'live' | null
  settings: Record<string, string>
  secrets: Record<string, string>
}

type AttemptRow = {
  txn_ref: string
  provider: string
  status: string
  amount_minor: number
  receipt_token: string
  mode: 'sandbox' | 'live' | null
  settings: Record<string, string>
  secrets: Record<string, string>
}

const available = (provider: string) =>
  provider in gateways && (provider !== 'test_gateway' || env.testGateway())

const returnUrl = (req: Request, provider: string) =>
  `${env.appUrl(req)}/api/pay/return/${provider}`

/** POST /api/pay/start {receipt_token, provider} → {action, fields} to submit. */
export async function startPayment(req: Request) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const p = await readParams(req)
  const token = p.receipt_token ?? ''
  const provider = p.provider ?? ''
  if (!/^[0-9a-f]{32}$/.test(token) || !available(provider)) {
    return json({ error: 'This payment method is not available' }, 400)
  }
  try {
    const row = await rpc<StartRow>('server_start_online_payment', {
      p_receipt_token: token,
      p_provider: provider,
    })
    const request = gateways[provider].start({
      txnRef: row.txn_ref,
      amountMinor: row.amount_minor,
      currency: row.currency,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      billNumber: row.bill_number,
      restaurant: row.restaurant,
      customerPhone: row.customer_phone,
      mode: row.mode ?? 'sandbox',
      settings: row.settings,
      secrets: row.secrets,
      returnUrl: returnUrl(req, provider),
    })
    return json(request)
  } catch (e) {
    if (e instanceof DbError && ['P0001', 'P0002', '22023'].includes(e.code ?? '')) {
      return json({ error: e.message }, 400)
    }
    console.error('pay/start', e)
    return json({ error: 'Could not start the payment. Please try again.' }, 500)
  }
}

/** GET|POST /api/pay/return/:provider — the gateway sends the guest back here. */
export async function paymentReturn(req: Request, provider: string) {
  const app = env.appUrl(req)
  if (!available(provider)) return html('Not found', '<p>Not found</p>', 404)
  const gateway = gateways[provider]
  const params = await readParams(req)
  const ref = gateway.reference(params)
  if (!ref) return html('Payment', '<p>Missing payment reference.</p>', 400)

  const row = await rpc<AttemptRow | null>('server_online_payment', { p_txn_ref: ref }).catch(
    () => null,
  )
  if (!row || row.provider !== provider) return html('Payment', '<p>Unknown payment.</p>', 400)
  const receipt = `${app}/r/${row.receipt_token}`
  if (row.status === 'paid' || row.status === 'failed')
    return redirect(`${receipt}?payment=${row.status}`)

  const attempt: Attempt = {
    txnRef: row.txn_ref,
    amountMinor: row.amount_minor,
    mode: row.mode ?? 'sandbox',
    settings: row.settings,
    secrets: row.secrets,
    returnUrl: returnUrl(req, provider),
  }
  try {
    const outcome = await gateway.handleReturn(params, attempt)
    if (outcome.type === 'form') return autoPost(outcome.request.action, outcome.request.fields)
    const r = outcome.result
    const done = await rpc<{ status: string }>('server_finish_online_payment', {
      p_txn_ref: row.txn_ref,
      p_success: r.success,
      p_amount_minor: r.amountMinor,
      p_provider_ref: r.providerRef ?? null,
      p_code: r.code ?? null,
      p_message: r.message ?? null,
    })
    return redirect(`${receipt}?payment=${done.status}`)
  } catch (e) {
    // A forged or garbled callback records nothing.
    console.error('pay/return', provider, e instanceof SignatureError ? e.message : e)
    return redirect(`${receipt}?payment=error`)
  }
}

/** The built-in test gateway's checkout page. */
export async function testGatewayPage(req: Request) {
  if (!env.testGateway()) return html('Not found', '<p>Not found</p>', 404)
  const p = await readParams(req)
  const { ref = '', amount = '', return_url = '' } = p
  if (p.sig !== sign(ref, amount, return_url))
    return html('Test gateway', '<p>Invalid request.</p>', 400)
  const form = (result: 'approved' | 'declined', label: string, cls = '') =>
    `<form method="post" action="${escapeHtml(return_url)}">` +
    `<input type="hidden" name="ref" value="${escapeHtml(ref)}">` +
    `<input type="hidden" name="amount" value="${escapeHtml(amount)}">` +
    `<input type="hidden" name="result" value="${result}">` +
    `<input type="hidden" name="sig" value="${sign(ref, amount, result)}">` +
    `<button class="${cls}">${label}</button></form>`
  const rupees = (Number(amount) / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })
  return html(
    'EdgeX test gateway',
    `<p style="margin:0;color:#62666f;font-size:13px">EdgeX test gateway · no real money</p>` +
      `<h1 style="font-size:22px;margin:4px 0 16px">Pay Rs ${escapeHtml(rupees)}</h1>` +
      `<p style="font-size:13px;color:#62666f">Reference ${escapeHtml(ref)}</p>` +
      form('approved', 'Approve payment', 'primary') +
      form('declined', 'Decline'),
  )
}

/** Routes for local dev/preview; on Vercel each file in /api is a function. */
export async function route(req: Request): Promise<Response | null> {
  const path = new URL(req.url).pathname
  if (path === '/api/pay/start') return startPayment(req)
  if (path === '/api/pay/test-gateway') return testGatewayPage(req)
  const m = path.match(/^\/api\/pay\/return\/([a-z_]+)$/)
  if (m) return paymentReturn(req, m[1])
  return null
}

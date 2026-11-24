import { createHash } from 'node:crypto'
import { DbError, rpc } from './db.js'
import { json } from './http.js'

/**
 * EdgeX public API v1 (read-only). Authenticate with
 *   Authorization: Bearer edgx_…
 * Keys are created in Settings → API & webhooks (Enterprise plan).
 * See docs/API.md.
 */
type Auth = { ok: boolean; status?: number; error?: string; tenant_id: string; remaining: number }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i

async function authenticate(req: Request): Promise<Auth | Response> {
  const header = req.headers.get('authorization') ?? ''
  const key = header.replace(/^Bearer\s+/i, '').trim()
  if (!key.startsWith('edgx_'))
    return json({ error: 'Missing API key (Authorization: Bearer edgx_…)' }, 401)
  const hash = createHash('sha256').update(key).digest('hex')
  const auth = await rpc<Auth>('server_api_auth', { p_key_hash: hash })
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401)
  return auth
}

const today = () => new Date().toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000

function range(u: URL, maxDays: number): { from: string; to: string } | Response {
  const to = u.searchParams.get('to') ?? today()
  const from = u.searchParams.get('from') ?? to
  if (!DATE.test(from) || !DATE.test(to))
    return json({ error: 'from / to must be YYYY-MM-DD' }, 400)
  const span = daysBetween(from, to)
  if (span < 0 || span > maxDays)
    return json({ error: `Choose a range of up to ${maxDays} days` }, 400)
  return { from, to }
}

function optionalUuid(u: URL, name: string): string | null | Response {
  const v = u.searchParams.get(name)
  if (v === null) return null
  return UUID.test(v) ? v : json({ error: `${name} must be a UUID` }, 400)
}

/** Route /api/v1/<resource>[/<id>] */
export async function publicApi(req: Request, resource: string, id?: string) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  try {
    const auth = await authenticate(req)
    if (auth instanceof Response) return auth
    const u = new URL(req.url)
    const t = auth.tenant_id
    let data: unknown
    switch (resource) {
      case 'branches':
        data = await rpc('server_api_branches', { p_tenant_id: t })
        break
      case 'menu':
        data = await rpc('server_api_menu', { p_tenant_id: t })
        break
      case 'orders': {
        if (id) {
          if (!UUID.test(id)) return json({ error: 'Not found' }, 404)
          data = await rpc('server_api_order', { p_tenant_id: t, p_order_id: id })
          if (!data) return json({ error: 'Not found' }, 404)
          break
        }
        const r = range(u, 31)
        if (r instanceof Response) return r
        const branch = optionalUuid(u, 'branch_id')
        if (branch instanceof Response) return branch
        const before = u.searchParams.get('before')
        if (before && Number.isNaN(Date.parse(before)))
          return json({ error: 'before must be an ISO timestamp' }, 400)
        const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit') ?? 50) || 50))
        const rows = await rpc<{ created_at: string }[]>('server_api_orders', {
          p_tenant_id: t,
          p_from: r.from,
          p_to: r.to,
          p_branch_id: branch,
          p_status: u.searchParams.get('status'),
          p_limit: limit,
          p_after: before,
        })
        data = {
          data: rows,
          next_before: rows.length === limit ? rows[rows.length - 1].created_at : null,
        }
        break
      }
      case 'sales': {
        const r = range(u, 366)
        if (r instanceof Response) return r
        const branch = optionalUuid(u, 'branch_id')
        if (branch instanceof Response) return branch
        data = await rpc('server_api_sales', {
          p_tenant_id: t,
          p_from: r.from,
          p_to: r.to,
          p_branch_id: branch,
        })
        break
      }
      default:
        return json({ error: 'Not found' }, 404)
    }
    const res = json(data)
    res.headers.set('X-RateLimit-Limit', '120')
    res.headers.set('X-RateLimit-Remaining', String(auth.remaining))
    return res
  } catch (e) {
    if (e instanceof DbError && e.status < 500) return json({ error: e.message }, 400)
    console.error('api/v1', e)
    return json({ error: 'Server error' }, 500)
  }
}

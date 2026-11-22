import { env } from './env.js'

export class DbError extends Error {
  readonly code: string | undefined
  readonly status: number
  constructor(message: string, code: string | undefined, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Call a database function as the server (service role). */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = env.supabaseUrl()
  const key = env.serviceKey()
  if (!url || !key)
    throw new DbError('Server is not configured (Supabase URL / service key)', undefined, 500)
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  const json = text ? JSON.parse(text) : null
  if (!r.ok) throw new DbError(json?.message ?? `Database error ${r.status}`, json?.code, r.status)
  return json as T
}

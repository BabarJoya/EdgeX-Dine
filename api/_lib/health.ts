import { rpc } from './db.js'
import { json } from './http.js'

type Health = {
  db_time: string
  outbox_pending: number
  outbox_oldest_seconds: number | null
  outbox_failed_24h: number
}

/**
 * GET /api/health — for uptime monitors. 200 when the database answers and
 * the message queue is moving; 503 otherwise. Reveals no tenant data.
 */
export async function health() {
  const t0 = Date.now()
  try {
    const h = await rpc<Health>('server_health', {})
    const dbMs = Date.now() - t0
    // Messages (WhatsApp, tax invoices) stuck for more than 15 minutes.
    const queueStuck = (h.outbox_oldest_seconds ?? 0) > 15 * 60
    return json(
      {
        ok: !queueStuck,
        db_ms: dbMs,
        queue: {
          pending: h.outbox_pending,
          oldest_seconds: h.outbox_oldest_seconds,
          failed_24h: h.outbox_failed_24h,
        },
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      },
      queueStuck ? 503 : 200,
    )
  } catch {
    return json({ ok: false, error: 'database unreachable', db_ms: Date.now() - t0 }, 503)
  }
}

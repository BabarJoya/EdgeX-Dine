let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Nudge the server to send queued WhatsApp messages (the database queues them
 * when a bill is paid or an order is ready). Debounced; failures are ignored
 * because the queue keeps the message for the next nudge.
 */
export function pokeOutbox() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    void fetch('/api/notify/flush', { method: 'POST', keepalive: true }).catch(() => undefined)
  }, 800)
}

/** Send the queue now and wait (briefly) — e.g. to get the fiscal number before printing. */
export async function flushOutboxNow(timeoutMs = 4000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    await fetch('/api/notify/flush', { method: 'POST', signal: ctrl.signal })
  } catch {
    /* printing goes ahead without it */
  } finally {
    clearTimeout(t)
  }
}

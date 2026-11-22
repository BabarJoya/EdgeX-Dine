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

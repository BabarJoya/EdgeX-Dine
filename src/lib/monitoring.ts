/**
 * Error reporting. Sentry is loaded only when VITE_SENTRY_DSN is set, so it
 * costs nothing otherwise. Guest pages and staff screens report the same way.
 */
type Sentry = typeof import('@sentry/react')
let sentry: Promise<Sentry | null> | null = null

function load() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return Promise.resolve(null)
  sentry ??= import('@sentry/react').then((S) => {
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION as string | undefined,
      tracesSampleRate: 0.05,
      beforeSend(event) {
        if (event.request) delete event.request.cookies
        return event
      },
    })
    return S
  })
  return sentry
}

export function initMonitoring() {
  void load()
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) console.error(error, context)
  void load().then((S) => S?.captureException(error, context ? { extra: context } : undefined))
}

/** Who is signed in and where (ids only, no names or emails). */
export function setMonitoringUser(userId: string | null, tenantId?: string | null) {
  void load().then((S) => {
    S?.setUser(userId ? { id: userId } : null)
    S?.setTag('tenant_id', tenantId ?? 'none')
  })
}

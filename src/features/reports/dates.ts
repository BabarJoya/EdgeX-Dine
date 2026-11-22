/** Local calendar date as YYYY-MM-DD (business dates are local, not UTC). */
export function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month'

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
]

/**
 * Today's calendar date in the restaurant's time zone (the database files
 * sales under that business date), as a local midnight Date for arithmetic.
 */
export function todayIn(timeZone: string | undefined, now = new Date()) {
  if (!timeZone) return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return new Date(get('year'), get('month') - 1, get('day'))
}

export function presetRange(
  key: PresetKey,
  now = new Date(),
  timeZone?: string,
): { from: string; to: string } {
  const today = todayIn(timeZone, now)
  switch (key) {
    case 'today':
      return { from: ymd(today), to: ymd(today) }
    case 'yesterday':
      return { from: ymd(addDays(today, -1)), to: ymd(addDays(today, -1)) }
    case '7d':
      return { from: ymd(addDays(today, -6)), to: ymd(today) }
    case '30d':
      return { from: ymd(addDays(today, -29)), to: ymd(today) }
    case 'month':
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) }
    case 'last_month':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      }
  }
}

/** "Mon 3" style short label for a YYYY-MM-DD date. */
export function shortDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

/** Percent change vs previous period, or null when there is nothing to compare. */
export function change(current: number, previous: number) {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

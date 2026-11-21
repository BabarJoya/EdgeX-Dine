/**
 * Bill-splitting maths (integer minor units only). The database re-checks
 * every amount; these give the cashier the right numbers before paying.
 */

/** Tax for a pre-tax amount at a rate in basis points (1600 = 16%), rounded half up like the database. */
export function taxFor(baseMinor: number, bps: number) {
  return Math.round((baseMinor * bps) / 10000)
}

/** What the guest pays for a pre-tax amount with a given method's rate. */
export function withTax(baseMinor: number, bps: number) {
  return baseMinor + taxFor(baseMinor, bps)
}

/**
 * Equal shares of the remaining pre-tax amount for `people` guests.
 * The first shares absorb the leftover paisa so the parts always add up.
 */
export function equalShares(remainingMinor: number, people: number) {
  const n = Math.max(1, Math.floor(people))
  const base = Math.floor(remainingMinor / n)
  const extra = remainingMinor - base * n
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0))
}

/**
 * Pre-tax amount for a subset of items: their share of the bill after the
 * discount and service charge are spread proportionally.
 */
export function itemsShare(
  selectedSubtotalMinor: number,
  bill: { subtotal_minor: number; base_minor: number },
  remainingMinor: number,
) {
  if (bill.subtotal_minor <= 0 || selectedSubtotalMinor <= 0) return 0
  const share = Math.round((selectedSubtotalMinor / bill.subtotal_minor) * bill.base_minor)
  return Math.min(share, remainingMinor)
}

/** Quick cash buttons: exact, then the next round notes above the amount. */
export function cashSuggestions(dueMinor: number) {
  const notes = [10000, 50000, 100000, 500000] // Rs 100, 500, 1,000, 5,000
  const out = new Set<number>([dueMinor])
  for (const note of notes) {
    const up = Math.ceil(dueMinor / note) * note
    if (up > dueMinor) out.add(up)
  }
  return [...out].sort((a, b) => a - b).slice(0, 4)
}

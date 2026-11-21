/**
 * Money is stored as integer minor units. These helpers convert what people
 * type ("1,250" or "12.50") to minor units and back, without float drift.
 */
export function zeroDecimal(currency: string) {
  return currency === 'PKR'
}

/** "1,250.5" → 125050. Returns null for empty / invalid input. */
export function toMinor(input: string): number | null {
  const clean = input.replace(/[,\s]/g, '').replace(/^(rs\.?|pkr|\$|£|€|aed|sar)/i, '')
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null
  const [whole, frac = ''] = clean.split('.')
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2))
}

/** 125050 → "1250.50"; 125000 → "1250" (for editing in an input). */
export function toMajorInput(minor: number | null | undefined): string {
  if (minor == null) return ''
  const whole = Math.trunc(minor / 100)
  const frac = Math.abs(minor % 100)
  return frac ? `${whole}.${String(frac).padStart(2, '0')}` : String(whole)
}

/** Public receipt link (also used for WhatsApp). */
export function receiptUrl(token: string) {
  return `${window.location.origin}/r/${token}`
}

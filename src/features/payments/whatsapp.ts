/** Pakistani numbers to international format for wa.me: 0300… → 92300… */
export function waNumber(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return `92${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('3')) return `92${digits}`
  return digits
}

/** Click-to-chat link (opens WhatsApp with the message ready to send). */
export const whatsappLink = (phone: string | null | undefined, text: string) =>
  `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`

/** Shape returned by the get_receipt RPC. */
export type ReceiptData = {
  restaurant: string
  branch: string
  address: string | null
  phone: string | null
  tax_label: string
  tax_registration: string | null
  footer: string | null
  bill_number: number
  date: string
  paid_at: string | null
  type: 'dine_in' | 'takeaway' | 'delivery'
  status: 'open' | 'paid' | 'refunded' | 'void'
  table: string | null
  currency: string
  customer_name: string | null
  subtotal_minor: number
  discount_minor: number
  discount_note: string
  service_bps: number
  service_minor: number
  base_minor: number
  tax_minor: number
  paid_total_minor: number
  items: {
    name: string
    variant: string | null
    quantity: number
    line_total_minor: number
    modifiers: string[]
  }[]
  payments: {
    method: string
    provider: string | null
    amount_minor: number
    tax_minor: number
    tax_bps: number
    tendered_minor: number | null
    change_minor: number
    status: string
  }[]
}

export const paymentMethodName: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  wallet: 'Wallet',
  bank_transfer: 'Bank / Raast',
}

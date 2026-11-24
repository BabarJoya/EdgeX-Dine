import type { Ticket } from '@/features/kitchen/api'
import { providerName } from '@/features/payments/providers'
import { authorityName, paymentMethodName, type ReceiptData } from '@/features/pos/receipt-types'
import { formatMoney } from '@/lib/utils'
import { EscPos } from './escpos'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })

/** Customer receipt, same content as the /r/:token page. */
export function receiptBytes(
  r: ReceiptData,
  opts: { columns: 32 | 48; link?: string; drawer?: boolean },
) {
  const p = new EscPos(opts.columns)
  const money = (m: number) => formatMoney(m, r.currency)
  p.align('center').bold().size(2).line(r.restaurant).size(1).bold(false)
  p.line(r.branch)
  if (r.address) p.line(r.address)
  if (r.phone) p.line(r.phone)
  if (r.tax_registration) p.line(r.tax_registration)
  p.align('left').rule()
  p.row(`Bill #${r.bill_number}`, when(r.paid_at ?? r.date))
  const kind =
    r.type === 'dine_in'
      ? `Dine-in${r.table ? ` - Table ${r.table}` : ''}`
      : r.type === 'takeaway'
        ? 'Takeaway'
        : 'Delivery'
  p.line(kind + (r.customer_name ? ` - ${r.customer_name}` : ''))
  if (r.delivery_address) p.line(`Deliver to: ${r.delivery_address}`)
  p.rule()
  for (const i of r.items) {
    p.row(
      `${i.quantity} x ${i.name}${i.variant ? ` (${i.variant})` : ''}`,
      money(i.line_total_minor),
    )
    if (i.modifiers.length) p.line(`  + ${i.modifiers.join(', ')}`)
  }
  p.rule()
  p.row('Subtotal', money(r.subtotal_minor))
  if (r.discount_minor > 0)
    p.row(
      `Discount${r.discount_note ? ` (${r.discount_note})` : ''}`,
      `-${money(r.discount_minor)}`,
    )
  if (r.service_minor > 0) p.row(`Service ${r.service_bps / 100}%`, money(r.service_minor))
  if (r.delivery_fee_minor > 0) p.row('Delivery', money(r.delivery_fee_minor))
  const live = r.payments.filter((x) => x.status === 'completed')
  const byRate = new Map<number, number>()
  for (const x of live) byRate.set(x.tax_bps, (byRate.get(x.tax_bps) ?? 0) + x.tax_minor)
  for (const [bps, tax] of byRate) if (tax > 0) p.row(`${r.tax_label} ${bps / 100}%`, money(tax))
  p.bold()
    .row('TOTAL', money(r.paid_total_minor || r.base_minor))
    .bold(false)
  if (live.length) {
    p.rule()
    for (const x of live) {
      p.row(
        `Paid - ${(x.provider && providerName[x.provider]) || paymentMethodName[x.method] || x.method}`,
        money(x.amount_minor),
      )
    }
    const tendered = live.reduce((n, x) => n + (x.tendered_minor ?? 0), 0)
    const change = live.reduce((n, x) => n + x.change_minor, 0)
    if (tendered) p.row('Cash received', money(tendered))
    if (change) p.row('Change', money(change))
  }
  if (r.fiscal_invoice_number) {
    const who = authorityName[r.fiscal_authority ?? 'fbr']
    p.align('center')
      .rule()
      .line(`${who} Invoice No.`)
      .bold()
      .line(r.fiscal_invoice_number)
      .bold(false)
    p.qr(r.fiscal_invoice_number, opts.columns === 32 ? 4 : 5).line(
      `Verify this invoice with ${who}.`,
    )
  }
  if (r.status === 'open') p.align('center').bold().line('NOT PAID').bold(false)
  if (r.status === 'refunded') p.align('center').bold().line('REFUNDED').bold(false)
  p.align('center').rule()
  p.line(r.footer || 'Thank you for dining with us!')
  if (opts.link) {
    p.line(r.status === 'open' ? 'Scan to pay' : 'Your receipt online').qr(
      opts.link,
      opts.columns === 32 ? 5 : 6,
    )
  }
  p.line('Powered by EdgeX')
  p.cut()
  if (opts.drawer) p.drawer()
  return p.encode()
}

/** Kitchen ticket: big order number, items with modifiers and notes. */
export function kitchenTicketBytes(t: Ticket, opts: { columns: 32 | 48; station?: string }) {
  const p = new EscPos(opts.columns)
  const o = t.orders
  p.align('center').bold().size(2).line(`#${o.order_number}`).size(1)
  p.line(o.type === 'dine_in' ? `TABLE ${o.tables?.label ?? '-'}` : o.type.toUpperCase()).bold(
    false,
  )
  if (opts.station) p.line(opts.station)
  p.line(when(o.created_at)).align('left').rule()
  const items = o.order_items.filter(
    (i) => i.status !== 'cancelled' && (!t.station_id || i.kitchen_station_id === t.station_id),
  )
  for (const i of items) {
    p.bold()
      .size(2)
      .line(`${i.quantity} x`)
      .size(1)
      .line(`${i.name}${i.variant_name ? ` (${i.variant_name})` : ''}`)
      .bold(false)
    for (const m of i.order_item_modifiers) p.line(`  + ${m.name}`)
    if (i.notes) p.line(`  NOTE: ${i.notes}`)
  }
  if (o.notes) p.rule().bold().line(`ORDER NOTE: ${o.notes}`).bold(false)
  p.cut()
  return p.encode()
}

export function drawerBytes() {
  return new EscPos().drawer().encode()
}

export function testPageBytes(columns: 32 | 48) {
  const p = new EscPos(columns)
  p.align('center').bold().size(2).line('EdgeX').size(1).bold(false).line('Printer test').rule()
  p.align('left')
    .row('Paper width', columns === 32 ? '58 mm' : '80 mm')
    .row('Rs 1,234.00', 'OK')
  return p.cut().encode()
}

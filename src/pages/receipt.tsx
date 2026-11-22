import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { PayPanel, PaymentResult } from '@/features/payments/pay-panel'
import { providerName } from '@/features/payments/providers'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/utils'
import {
  paymentMethodName as methodName,
  type ReceiptData as Receipt,
} from '@/features/pos/receipt-types'

/**
 * Receipt for thermal printers (80 mm) and for sharing as a link. Public by
 * unguessable token; ?print=1 opens the print dialog straight away.
 */
export function ReceiptPage() {
  const { token = '' } = useParams()
  const [params] = useSearchParams()
  const receipt = useQuery({
    queryKey: ['receipt', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_receipt', { p_receipt_token: token })
      if (error) throw error
      return data as unknown as Receipt | null
    },
  })
  const r = receipt.data

  useEffect(() => {
    if (r && params.get('print') === '1') {
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [r, params])

  if (receipt.isPending) return <p className="p-6 text-center text-sm">Loading receipt…</p>
  if (!r) return <p className="p-6 text-center text-sm">Receipt not found.</p>

  const money = (m: number) => formatMoney(m, r.currency)
  const live = r.payments.filter((p) => p.status === 'completed')
  const taxLines = Object.values(
    live.reduce<Record<number, { bps: number; tax: number; methods: Set<string> }>>((acc, p) => {
      acc[p.tax_bps] ??= { bps: p.tax_bps, tax: 0, methods: new Set() }
      acc[p.tax_bps].tax += p.tax_minor
      acc[p.tax_bps].methods.add(methodName[p.method] ?? p.method)
      return acc
    }, {}),
  )
  const change = live.reduce((n, p) => n + p.change_minor, 0)

  return (
    <div className="min-h-dvh bg-muted py-6 print:bg-white print:py-0">
      <style>{`@page { size: 80mm auto; margin: 3mm; } @media print { .no-print { display: none !important; } }`}</style>
      <PaymentResult result={params.get('payment')} />
      {r.status === 'open' && <PayPanel token={token} />}
      <div className="no-print mx-auto mb-4 flex max-w-[80mm] justify-end">
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>
      <article
        className="mx-auto w-[80mm] max-w-full bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black shadow-sm print:w-full print:px-0 print:shadow-none"
        aria-label="Receipt"
      >
        <header className="text-center">
          <div className="font-sans text-[16px] font-semibold">{r.restaurant}</div>
          <div>{r.branch}</div>
          {r.address && <div>{r.address}</div>}
          {r.phone && <div>{r.phone}</div>}
          {r.tax_registration && <div>{r.tax_registration}</div>}
        </header>
        <hr className="my-2 border-dashed border-black" />
        <div className="flex justify-between">
          <span>Bill #{r.bill_number}</span>
          <span>
            {new Date(r.paid_at ?? r.date).toLocaleString([], {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
        </div>
        <div>
          {r.type === 'dine_in'
            ? `Dine-in${r.table ? ` · Table ${r.table}` : ''}`
            : r.type === 'takeaway'
              ? 'Takeaway'
              : 'Delivery'}
          {r.customer_name && ` · ${r.customer_name}`}
        </div>
        <hr className="my-2 border-dashed border-black" />
        <ul className="grid gap-1">
          {r.items.map((i, idx) => (
            <li key={idx}>
              <div className="flex justify-between gap-2">
                <span>
                  {i.quantity} × {i.name}
                  {i.variant && ` (${i.variant})`}
                </span>
                <span className="whitespace-nowrap">{money(i.line_total_minor)}</span>
              </div>
              {i.modifiers.length > 0 && (
                <div className="pl-3 text-[11px]">+ {i.modifiers.join(', ')}</div>
              )}
            </li>
          ))}
        </ul>
        <hr className="my-2 border-dashed border-black" />
        <dl className="grid gap-0.5">
          <Row label="Subtotal" value={money(r.subtotal_minor)} />
          {r.discount_minor > 0 && (
            <Row
              label={`Discount${r.discount_note ? ` (${r.discount_note})` : ''}`}
              value={`−${money(r.discount_minor)}`}
            />
          )}
          {r.service_minor > 0 && (
            <Row label={`Service ${r.service_bps / 100}%`} value={money(r.service_minor)} />
          )}
          {taxLines.map((t) => (
            <Row
              key={t.bps}
              label={`${r.tax_label} ${t.bps / 100}% (${[...t.methods].join(', ')})`}
              value={money(t.tax)}
            />
          ))}
          <div className="mt-1 flex justify-between font-sans text-[15px] font-semibold">
            <dt>Total</dt>
            <dd>{money(r.paid_total_minor || r.base_minor)}</dd>
          </div>
        </dl>
        {live.length > 0 && (
          <>
            <hr className="my-2 border-dashed border-black" />
            <dl className="grid gap-0.5">
              {live.map((p, idx) => (
                <Row
                  key={idx}
                  label={`Paid · ${(p.provider && providerName[p.provider]) || methodName[p.method] || p.method}`}
                  value={money(p.amount_minor)}
                />
              ))}
              {live.some((p) => p.tendered_minor) && (
                <Row
                  label="Cash received"
                  value={money(live.reduce((n, p) => n + (p.tendered_minor ?? 0), 0))}
                />
              )}
              {change > 0 && <Row label="Change" value={money(change)} />}
            </dl>
          </>
        )}
        {r.status === 'refunded' && <p className="mt-2 text-center font-semibold">REFUNDED</p>}
        {r.status === 'open' && <p className="mt-2 text-center font-semibold">NOT PAID</p>}
        <hr className="my-2 border-dashed border-black" />
        <footer className="text-center">
          <div>{r.footer || 'Thank you for dining with us!'}</div>
          <div className="mt-1 text-[10px]">Powered by EdgeX</div>
        </footer>
      </article>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  )
}

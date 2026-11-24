import { CheckCircle2, Copy, MessageCircle, Printer, ReceiptText, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCloseSession } from '@/features/floor/api'
import { FiscalStatus } from '@/features/payments/fiscal-status'
import { PayLinkButton } from '@/features/payments/pay-link-dialog'
import { providerName } from '@/features/payments/providers'
import { usePrintReceipt, usePrinterSettings } from '@/features/printing/use-printer'
import { whatsappLink } from '@/features/payments/whatsapp'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { toMajorInput, toMinor } from '@/lib/money'
import type { Enums } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'
import {
  methodLabel,
  taxBps,
  useBill,
  useDiscount,
  useRefund,
  useTakePayment,
  type Bill,
  type Operator,
} from './api'
import { receiptUrl } from './receipt-url'
import { cashSuggestions, equalShares, itemsShare, withTax } from './split'

type SplitMode = 'full' | 'equal' | 'items' | 'amount'
const METHODS: Enums<'payment_method'>[] = ['cash', 'card', 'wallet', 'bank_transfer']

export function BillPanel({ billId, op }: { billId: string | null; op: Operator }) {
  const bill = useBill(billId)
  if (!billId) {
    return (
      <div className="grid h-full place-items-center p-6">
        <EmptyState
          icon={ReceiptText}
          title="No bill selected"
          description="Choose a table, start a takeaway, or open a bill from today's list."
        />
      </div>
    )
  }
  if (bill.isPending) return <Skeleton className="m-4 h-96" />
  if (bill.error || !bill.data)
    return (
      <Alert variant="destructive" className="m-4">
        {errorMessage(bill.error)}
      </Alert>
    )
  return <BillView key={bill.data.id} bill={bill.data} op={op} />
}

function BillView({ bill, op }: { bill: Bill; op: Operator }) {
  const { branch, branches, can, branchId, membership } = useTenant()
  const br = branch ?? branches.find((b) => b.id === bill.branch_id) ?? null
  const currency = bill.currency
  const money = (m: number) => formatMoney(m, currency)
  const remaining = Math.max(0, bill.base_minor - bill.paid_base_minor)
  const take = useTakePayment(op)
  const printReceipt = usePrintReceipt()
  const printer = usePrinterSettings()
  const refund = useRefund(op)
  const closeTable = useCloseSession(branchId)
  const [mode, setMode] = useState<SplitMode>('full')
  const [method, setMethod] = useState<Enums<'payment_method'>>('cash')
  const [people, setPeople] = useState('2')
  const [selected, setSelected] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')
  const [discountOpen, setDiscountOpen] = useState(false)
  const [refunding, setRefunding] = useState<string | null>(null)
  const [lastChange, setLastChange] = useState<number | null>(null)

  const items = bill.orders
    .filter((o) => o.status !== 'cancelled')
    .flatMap((o) => o.order_items.filter((i) => i.status !== 'cancelled'))
  const bps = taxBps(br, method)

  // Pre-tax amount for this payment.
  const base = useMemo(() => {
    if (mode === 'full') return remaining
    if (mode === 'equal') return equalShares(remaining, Number(people) || 1)[0] ?? 0
    if (mode === 'items') {
      const sub = items
        .filter((i) => selected.includes(i.id))
        .reduce((n, i) => n + i.line_total_minor, 0)
      return itemsShare(sub, bill, remaining)
    }
    // Custom amount is what the guest pays, tax included → pre-tax part.
    const total = toMinor(custom)
    if (!total) return 0
    return Math.min(remaining, Math.round((total * 10000) / (10000 + bps)))
  }, [mode, remaining, people, selected, custom, bps, items, bill])

  const due = withTax(base, bps)
  const tenderedMinor = tendered.trim() ? toMinor(tendered) : null
  const change = method === 'cash' && tenderedMinor !== null ? tenderedMinor - due : 0
  const cashShort = method === 'cash' && tenderedMinor !== null && tenderedMinor < due
  const canPay =
    can('payments.take') && base > 0 && !cashShort && (tenderedMinor !== null || !tendered.trim())

  const pay = () =>
    take.mutate(
      {
        billId: bill.id,
        method,
        base,
        tendered: method === 'cash' ? tenderedMinor : null,
        reference: method === 'cash' ? '' : reference,
        note:
          mode === 'items'
            ? `Items: ${items
                .filter((i) => selected.includes(i.id))
                .map((i) => `${i.quantity}× ${i.name}`)
                .join(', ')}`
            : mode === 'equal'
              ? `Split ${people} ways`
              : '',
      },
      {
        onSuccess: (r) => {
          setLastChange(r.change_minor)
          setTendered('')
          setReference('')
          setSelected([])
          setCustom('')
          toast.success(
            r.bill_status === 'paid' ? 'Bill paid' : `${money(r.amount_minor)} received`,
          )
          if (r.bill_status === 'paid') setMode('full')
          if (r.bill_status === 'paid' && printer.transport) {
            void printReceipt(bill.receipt_token, {
              drawer: method === 'cash' && printer.drawerOnCash,
            })
          }
        },
      },
    )

  const label = bill.table_sessions?.tables
    ? `Table ${bill.table_sessions.tables.label}`
    : bill.type === 'takeaway'
      ? 'Takeaway'
      : 'Delivery'
  const statusBadge = {
    open: 'warning',
    paid: 'success',
    refunded: 'destructive',
    void: 'neutral',
  } as const

  return (
    <div
      className="grid h-full min-h-0 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_380px]"
      data-testid="bill-panel"
    >
      {/* Items & totals */}
      <section className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            Bill #{bill.bill_number} · {label}
          </h2>
          <Badge variant={statusBadge[bill.status]}>{bill.status}</Badge>
          {bill.customer_name && (
            <span className="text-sm text-muted-foreground">· {bill.customer_name}</span>
          )}
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-3 px-3 py-2 text-sm">
              {mode === 'items' && remaining > 0 && (
                <Checkbox
                  aria-label={`Pay for ${i.name}`}
                  className="mt-0.5"
                  checked={selected.includes(i.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id),
                    )
                  }
                />
              )}
              <div className="min-w-0 flex-1">
                <span className="tabular-nums">{i.quantity}×</span> {i.name}
                {i.variant_name && (
                  <span className="text-muted-foreground"> ({i.variant_name})</span>
                )}
                {i.order_item_modifiers.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    + {i.order_item_modifiers.map((m) => m.name).join(', ')}
                  </div>
                )}
              </div>
              <span className="tabular-nums">{money(i.line_total_minor)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid gap-1 text-sm">
          <Row label="Subtotal" value={money(bill.subtotal_minor)} />
          {bill.discount_minor > 0 && (
            <Row
              label={`Discount · ${bill.discount_note}`}
              value={`−${money(bill.discount_minor)}`}
            />
          )}
          {bill.service_minor > 0 && (
            <Row
              label={`Service charge ${bill.service_bps / 100}%`}
              value={money(bill.service_minor)}
            />
          )}
          {bill.delivery_fee_minor > 0 && (
            <Row
              label={`Delivery${bill.delivery_zone ? ` · ${bill.delivery_zone}` : ''}`}
              value={money(bill.delivery_fee_minor)}
            />
          )}
          <Row label="Before tax" value={money(bill.base_minor)} strong />
          {bill.payments.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center justify-between gap-2',
                p.status === 'refunded' && 'text-muted-foreground line-through',
              )}
            >
              <dt>
                Paid · {(p.provider && providerName[p.provider]) || methodLabel[p.method]} (incl.{' '}
                {p.tax_bps / 100}% tax)
                {p.provider && p.note.includes('refund') && (
                  <Badge variant="destructive" className="ml-1.5">
                    Paid after settling · refund
                  </Badge>
                )}
              </dt>
              <dd className="flex items-center gap-1 tabular-nums">
                {money(p.amount_minor)}
                {p.status === 'completed' && can('orders.refund') && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Refund this payment"
                    onClick={() => setRefunding(p.id)}
                  >
                    <Undo2 className="size-3.5" />
                  </Button>
                )}
              </dd>
            </div>
          ))}
          {remaining > 0 && (
            <Row label="Left to pay (before tax)" value={money(remaining)} strong tone="warn" />
          )}
        </dl>
        {bill.status === 'open' && bill.paid_base_minor === 0 && can('orders.discount') && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setDiscountOpen(true)}
          >
            {bill.discount_minor ? 'Change discount' : 'Add discount'}
          </Button>
        )}
        <FiscalStatus bill={bill} />
        {bill.status === 'open' && remaining > 0 && (
          <PayLinkButton
            token={bill.receipt_token}
            phone={bill.customer_phone}
            restaurant={membership?.tenants.name ?? ''}
            amount={money(withTax(remaining, br?.tax_wallet_bps ?? 0))}
          />
        )}
      </section>

      {/* Payment */}
      <section className="h-fit rounded-lg border bg-card p-4">
        {(take.error || refund.error || closeTable.error) && (
          <Alert variant="destructive" className="mb-3">
            {errorMessage(take.error ?? refund.error ?? closeTable.error)}
          </Alert>
        )}
        {remaining > 0 && bill.status !== 'refunded' ? (
          <div className="grid gap-4">
            <div>
              <div className="mb-1.5 text-[13px] font-medium">Split</div>
              <div className="grid grid-cols-4 gap-1 rounded-md border p-0.5 text-[13px]">
                {(['full', 'equal', 'items', 'amount'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'rounded-sm py-1.5 font-medium',
                      mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {m === 'full'
                      ? 'Whole'
                      : m === 'equal'
                        ? 'Equally'
                        : m === 'items'
                          ? 'By item'
                          : 'Amount'}
                  </button>
                ))}
              </div>
              <div className="mt-3 empty:hidden">
                {mode === 'equal' && (
                  <Field
                    id="people"
                    label="People left to pay"
                    hint="Each person pays one share; repeat for the next guest."
                  >
                    <Input
                      id="people"
                      inputMode="numeric"
                      value={people}
                      onChange={(e) => setPeople(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    />
                  </Field>
                )}
                {mode === 'items' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Tick the items this guest is paying for. Discount and service are shared
                    proportionally.
                  </p>
                )}
                {mode === 'amount' && (
                  <Field id="custom" label="Amount the guest pays (incl. tax)">
                    <MoneyInput
                      id="custom"
                      currency={currency}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                    />
                  </Field>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium">Payment method</div>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={method === m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left text-sm',
                      method === m ? 'border-primary ring-1 ring-primary' : 'hover:bg-accent',
                    )}
                  >
                    <div className="font-medium">{methodLabel[m]}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {money(withTax(base, taxBps(br, m)))} · tax {taxBps(br, m) / 100}%
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {method === 'cash' ? (
              <div className="grid gap-2">
                <Field id="tendered" label="Cash received">
                  <MoneyInput
                    id="tendered"
                    currency={currency}
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder={toMajorInput(due)}
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {cashSuggestions(due).map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setTendered(toMajorInput(v))}
                    >
                      {money(v)}
                    </Button>
                  ))}
                </div>
                {tenderedMinor !== null && (
                  <div
                    className={cn(
                      'rounded-md px-3 py-2 text-sm font-medium',
                      cashShort
                        ? 'bg-destructive-soft text-destructive'
                        : 'bg-success-soft text-success',
                    )}
                  >
                    {cashShort
                      ? `Short by ${money(due - tenderedMinor)}`
                      : `Change: ${money(change)}`}
                  </div>
                )}
              </div>
            ) : (
              <Field
                id="reference"
                label={
                  method === 'card'
                    ? 'Card last 4 digits / slip no. (optional)'
                    : 'Transaction ID (optional)'
                }
              >
                <Input
                  id="reference"
                  value={reference}
                  maxLength={80}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
            )}

            <Button size="touch" disabled={!canPay || take.isPending} onClick={pay}>
              {take.isPending ? 'Processing…' : `Charge ${money(due)}`}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 text-center">
            <CheckCircle2
              className={cn(
                'mx-auto size-8',
                bill.status === 'refunded' ? 'text-destructive' : 'text-success',
              )}
              strokeWidth={1.75}
            />
            <div className="text-lg font-semibold">
              {bill.status === 'refunded' ? 'Refunded' : `Paid ${money(bill.paid_total_minor)}`}
            </div>
            {lastChange !== null && lastChange > 0 && (
              <div className="rounded-md bg-success-soft px-3 py-2 text-lg font-semibold text-success">
                Give change: {money(lastChange)}
              </div>
            )}
            <Button variant="secondary" onClick={() => printReceipt(bill.receipt_token)}>
              <Printer /> {printer.transport ? 'Reprint receipt' : 'Print receipt'}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => (
                  await navigator.clipboard.writeText(receiptUrl(bill.receipt_token)),
                  toast.success('Receipt link copied')
                )}
              >
                <Copy /> Copy link
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a
                  href={whatsappLink(
                    bill.customer_phone,
                    `Thank you for visiting! Your receipt: ${receiptUrl(bill.receipt_token)}`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            </div>
            {bill.session_id && bill.status === 'paid' && (
              <Button
                onClick={() =>
                  closeTable.mutate(bill.session_id!, {
                    onSuccess: () => toast.success(`${label} closed`),
                  })
                }
                disabled={closeTable.isPending}
              >
                Close {label}
              </Button>
            )}
          </div>
        )}
      </section>

      {discountOpen && (
        <DiscountDialog bill={bill} op={op} onClose={() => setDiscountOpen(false)} />
      )}
      {refunding && (
        <RefundDialog paymentId={refunding} op={op} onClose={() => setRefunding(null)} />
      )}
    </div>
  )
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'warn'
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        strong && 'font-semibold',
        tone === 'warn' && 'text-warning',
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function DiscountDialog({ bill, op, onClose }: { bill: Bill; op: Operator; onClose: () => void }) {
  const discount = useDiscount(op)
  const [kind, setKind] = useState<'percent' | 'amount'>('percent')
  const [value, setValue] = useState('')
  const [note, setNote] = useState(bill.discount_note)
  const amount =
    kind === 'percent'
      ? Math.round((bill.subtotal_minor * Math.min(100, Number(value) || 0)) / 100)
      : Math.min(bill.subtotal_minor, toMinor(value) ?? 0)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            discount.mutate(
              { billId: bill.id, amount, note },
              { onSuccess: () => (toast.success('Discount applied'), onClose()) },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Discount</DialogTitle>
            <DialogDescription>
              Applied before service charge and tax. Recorded with your name and the reason.
            </DialogDescription>
          </DialogHeader>
          {discount.error && <Alert variant="destructive">{errorMessage(discount.error)}</Alert>}
          <div className="flex gap-1 rounded-md border p-0.5 text-sm">
            {(['percent', 'amount'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'flex-1 rounded-sm py-1.5',
                  kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {k === 'percent' ? 'Percent' : 'Amount'}
              </button>
            ))}
          </div>
          <Field
            id="disc-value"
            label={kind === 'percent' ? 'Percent off' : 'Amount off'}
            hint={`= ${formatMoney(amount, bill.currency)} off ${formatMoney(bill.subtotal_minor, bill.currency)}`}
          >
            <Input
              id="disc-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Field id="disc-note" label="Reason">
            <Input
              id="disc-note"
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Regular guest, staff meal"
            />
          </Field>
          <DialogFooter>
            {bill.discount_minor > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  discount.mutate({ billId: bill.id, amount: 0, note: '' }, { onSuccess: onClose })
                }
              >
                Remove discount
              </Button>
            )}
            <Button type="submit" disabled={amount <= 0 || !note.trim() || discount.isPending}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RefundDialog({
  paymentId,
  op,
  onClose,
}: {
  paymentId: string
  op: Operator
  onClose: () => void
}) {
  const refund = useRefund(op)
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            refund.mutate(
              { paymentId, reason },
              { onSuccess: () => (toast.success('Payment refunded'), onClose()) },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Refund this payment?</DialogTitle>
            <DialogDescription>
              The full payment is refunded from your shift. This is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          {refund.error && <Alert variant="destructive">{errorMessage(refund.error)}</Alert>}
          <Field id="refund-reason" label="Reason">
            <Input
              id="refund-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!reason.trim() || refund.isPending}
            >
              Refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { Printer, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { toMinor } from '@/lib/money'
import type { Tables } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'
import {
  methodLabel,
  useCashMovement,
  useCloseShift,
  useOpenShift,
  useShiftReport,
  type Operator,
  type ShiftReport,
} from './api'

export function OpenShiftCard({ branchId, op }: { branchId: string; op: Operator }) {
  const { membership } = useTenant()
  const open = useOpenShift(op)
  const [float, setFloat] = useState('')
  const amount = float.trim() ? toMinor(float) : 0
  return (
    <div className="grid flex-1 place-items-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">Start your shift</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Count the cash in the drawer before you begin, {op.name}.
        </p>
        <form
          className="mt-5 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (amount !== null)
              open.mutate(
                { branchId, float: amount },
                { onSuccess: () => toast.success('Shift started') },
              )
          }}
        >
          {open.error && <Alert variant="destructive">{errorMessage(open.error)}</Alert>}
          <Field
            id="float"
            label="Opening cash (float)"
            error={amount === null ? 'Enter a valid amount' : undefined}
          >
            <MoneyInput
              id="float"
              currency={membership?.tenants.currency ?? 'PKR'}
              value={float}
              onChange={(e) => setFloat(e.target.value)}
              placeholder="5000"
            />
          </Field>
          <Button type="submit" size="lg" disabled={amount === null || open.isPending}>
            Open shift
          </Button>
        </form>
      </Card>
    </div>
  )
}

export function ReportView({ report, currency }: { report: ShiftReport; currency: string }) {
  const m = (v: number) => formatMoney(v, currency)
  const methods = Object.entries(report.by_method) as [
    keyof typeof methodLabel,
    NonNullable<ShiftReport['by_method']['cash']>,
  ][]
  const total = methods.reduce((n, [, v]) => n + v.amount_minor, 0)
  const tax = methods.reduce((n, [, v]) => n + v.tax_minor, 0)
  return (
    <div className="print-area grid gap-3 font-mono text-[13px]">
      <div className="text-center font-sans">
        <div className="font-semibold">
          {report.status === 'closed' ? 'Z-report (shift closed)' : 'X-report (shift so far)'}
        </div>
        <div className="text-xs text-muted-foreground print:text-black">
          {report.cashier} · {new Date(report.opened_at).toLocaleString()}
          {report.closed_at && ` → ${new Date(report.closed_at).toLocaleTimeString()}`}
        </div>
      </div>
      <dl className="grid gap-1">
        {methods.map(([k, v]) => (
          <Line key={k} label={`${methodLabel[k]} (${v.count})`} value={m(v.amount_minor)} />
        ))}
        <Line label="Total takings" value={m(total)} strong />
        <Line label="of which tax" value={m(tax)} />
        <Line label="Discounts given" value={m(report.discounts_minor)} />
        <Line label="Refunds" value={m(report.refunds_minor)} />
        <Line label="Bills" value={String(report.bills)} />
      </dl>
      <dl className="grid gap-1 border-t pt-2">
        <Line label="Opening float" value={m(report.opening_float_minor)} />
        <Line label="Cash in" value={m(report.cash_in_minor)} />
        <Line label="Cash out" value={m(report.cash_out_minor)} />
        <Line label="Expected in drawer" value={m(report.expected_cash_minor)} strong />
        {report.counted_cash_minor !== null && (
          <Line label="Counted" value={m(report.counted_cash_minor)} />
        )}
        {report.variance_minor !== null && (
          <Line
            label={
              report.variance_minor < 0 ? 'Short' : report.variance_minor > 0 ? 'Over' : 'Balanced'
            }
            value={m(Math.abs(report.variance_minor))}
            tone={report.variance_minor < 0 ? 'bad' : report.variance_minor > 0 ? 'warn' : 'good'}
            strong
          />
        )}
      </dl>
    </div>
  )
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'bad' | 'warn' | 'good'
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        strong && 'font-semibold',
        tone === 'bad' && 'text-destructive',
        tone === 'warn' && 'text-warning',
        tone === 'good' && 'text-success',
      )}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function ShiftSheet({
  shift,
  op,
  onClose,
  onClosed,
}: {
  shift: Tables<'cash_shifts'>
  op: Operator
  onClose: () => void
  onClosed: () => void
}) {
  const { membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const report = useShiftReport(shift.id)
  const move = useCashMovement(op)
  const close = useCloseShift(op)
  const [moveType, setMoveType] = useState<'in' | 'out'>('out')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [counted, setCounted] = useState('')
  const [closed, setClosed] = useState<ShiftReport | null>(null)
  const amountMinor = toMinor(amount)
  const countedMinor = toMinor(counted)

  return (
    <Sheet open onOpenChange={(o) => !o && (closed ? onClosed() : onClose())}>
      <SheetContent side="right" className="w-full max-w-md bg-background sm:max-w-md">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <SheetTitle className="text-base font-semibold">
            {closed ? 'Shift closed' : 'Cash shift'}
          </SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={() => (closed ? onClosed() : onClose())}
          >
            <X />
          </Button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {(move.error || close.error) && (
            <Alert variant="destructive">{errorMessage(move.error ?? close.error)}</Alert>
          )}
          {(closed ?? report.data) && (
            <ReportView report={(closed ?? report.data)!} currency={currency} />
          )}
          {closed ? (
            <div className="grid gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer /> Print Z-report
              </Button>
              <Button onClick={onClosed}>Done</Button>
            </div>
          ) : (
            <>
              <section className="border-t pt-4">
                <h3 className="mb-2 text-[13px] font-semibold">Cash in / out</h3>
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!amountMinor) return
                    move.mutate(
                      { shiftId: shift.id, type: moveType, amount: amountMinor, reason },
                      {
                        onSuccess: () => (setAmount(''), setReason(''), toast.success('Recorded')),
                      },
                    )
                  }}
                >
                  <div className="flex gap-1 rounded-md border p-0.5 text-sm">
                    {(['out', 'in'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={moveType === t}
                        onClick={() => setMoveType(t)}
                        className={cn(
                          'flex-1 rounded-sm py-1.5',
                          moveType === t
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {t === 'out' ? 'Cash out (paid out)' : 'Cash in (added)'}
                      </button>
                    ))}
                  </div>
                  <MoneyInput
                    aria-label="Amount"
                    currency={currency}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Input
                    aria-label="Reason"
                    placeholder="e.g. Bought ice, bank drop"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={!amountMinor || !reason.trim() || move.isPending}
                  >
                    Record
                  </Button>
                </form>
              </section>
              <section className="border-t pt-4">
                <h3 className="mb-2 text-[13px] font-semibold">Close shift</h3>
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (countedMinor === null) return
                    close.mutate(
                      { shiftId: shift.id, counted: countedMinor, notes: '' },
                      { onSuccess: (r) => setClosed(r) },
                    )
                  }}
                >
                  <Field id="counted" label="Cash counted in the drawer">
                    <MoneyInput
                      id="counted"
                      currency={currency}
                      value={counted}
                      onChange={(e) => setCounted(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" disabled={countedMinor === null || close.isPending}>
                    Close shift &amp; print Z-report
                  </Button>
                </form>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

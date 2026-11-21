import { Lock, Plus, ShoppingBag, Truck, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { StationLayout } from '@/components/layout/station-layout'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useMenu } from '@/features/menu/api'
import {
  posLock,
  useCounterOrder,
  useLiveBills,
  useMyShift,
  useOpenSittings,
  useOpenTableBill,
  useOperator,
  useTodayBills,
  type Operator,
} from '@/features/pos/api'
import { BillPanel } from '@/features/pos/bill-panel'
import { CashierGate } from '@/features/pos/cashier-gate'
import { OpenShiftCard, ShiftSheet } from '@/features/pos/shift-panel'
import { useTenant } from '@/features/tenant/tenant-provider'
import { ItemComposer } from '@/features/waiter/compose'
import { toGuestMenu } from '@/features/waiter/to-guest-menu'
import { ChooseBranch } from '@/pages/app/tables'
import { errorMessage } from '@/lib/errors'
import { ageLabel, useNow } from '@/lib/time'
import { cn, formatMoney } from '@/lib/utils'

export function PosPage() {
  return (
    <RequirePerm any={['pos.use']}>
      <Pos />
    </RequirePerm>
  )
}

function Pos() {
  const { tenantId, branchId, branch } = useTenant()
  const { operator, setOperator } = useOperator()
  const shift = useMyShift(branchId, operator?.userId)
  // Keep the shift being viewed: closing it removes it from the open-shift query.
  const [shiftView, setShiftView] = useState<NonNullable<typeof shift.data> | null>(null)
  useLiveBills(tenantId)

  const lock = async () => {
    await posLock(operator?.token ?? null)
    setOperator(null)
  }

  return (
    <StationLayout
      title="POS"
      subtitle={branch?.name}
      actions={
        operator && (
          <>
            {shift.data && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShiftView(shift.data ?? null)}
              >
                <Wallet /> <span className="hidden sm:inline">Shift</span>
              </Button>
            )}
            <span className="hidden text-[13px] text-muted-foreground md:inline">
              {operator.name}
            </span>
            <Button variant="ghost" size="sm" onClick={lock} aria-label="Lock till">
              <Lock /> <span className="hidden sm:inline">Lock</span>
            </Button>
          </>
        )
      }
    >
      {!branchId ? (
        <main className="p-6">
          <ChooseBranch what="Tills" />
        </main>
      ) : !operator ? (
        <CashierGate branchId={branchId} onReady={setOperator} />
      ) : shift.isPending ? (
        <Skeleton className="m-6 h-64" />
      ) : !shift.data ? (
        <OpenShiftCard branchId={branchId} op={operator} />
      ) : (
        <Register branchId={branchId} op={operator} />
      )}
      {shiftView && operator && (
        <ShiftSheet
          shift={shiftView}
          op={operator}
          onClose={() => setShiftView(null)}
          onClosed={() => {
            setShiftView(null)
            setOperator(null)
          }}
        />
      )}
    </StationLayout>
  )
}

type Tab = 'tables' | 'counter' | 'bills'

function Register({ branchId, op }: { branchId: string; op: Operator }) {
  const { tenantId, membership } = useTenant()
  const now = useNow(30_000)
  const [tab, setTab] = useState<Tab>('tables')
  const [billId, setBillId] = useState<string | null>(null)
  const [composing, setComposing] = useState<'takeaway' | 'delivery' | null>(null)
  const sittings = useOpenSittings(branchId)
  const bills = useTodayBills(branchId)
  const openBill = useOpenTableBill(op)
  const menu = useMenu(tenantId)
  const currency = membership?.tenants.currency ?? 'PKR'
  const guestMenu = useMemo(
    () =>
      menu.data && membership
        ? toGuestMenu(menu.data, branchId, {
            name: membership.tenants.name,
            slug: membership.tenants.slug,
            currency,
            logo_url: null,
            brand_color: null,
          })
        : null,
    [menu.data, membership, branchId, currency],
  )
  const billFor = (sessionId: string) => bills.data?.find((b) => b.session_id === sessionId)

  return (
    <main className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
      <aside className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
        <div className="grid grid-cols-3 gap-1 border-b p-2 text-[13px]">
          {(
            [
              ['tables', 'Tables'],
              ['counter', 'Takeaway'],
              ['bills', 'Bills today'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'rounded-md py-2 font-medium',
                tab === k
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {openBill.error && (
          <Alert variant="destructive" className="m-2">
            {errorMessage(openBill.error)}
          </Alert>
        )}
        <div className="flex-1 overflow-y-auto p-2">
          {tab === 'tables' &&
            ((sittings.data ?? []).length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No tables with guests.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {sittings.data!.map((s) => {
                  const b = billFor(s.id)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-label={`Table ${s.tables?.label}`}
                        disabled={openBill.isPending}
                        onClick={() => openBill.mutate(s.id, { onSuccess: (id) => setBillId(id) })}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-accent',
                          b && b.id === billId && 'border-primary bg-accent',
                        )}
                      >
                        <span className="text-lg font-semibold">{s.tables?.label}</span>
                        <span className="flex-1 text-xs text-muted-foreground">
                          {ageLabel(s.opened_at, now)}
                        </span>
                        <span className="text-right text-sm tabular-nums">
                          {formatMoney(s.total, currency)}
                          {b?.status === 'paid' && (
                            <Badge variant="success" className="ml-1">
                              Paid
                            </Badge>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ))}
          {tab === 'counter' && (
            <div className="grid gap-2 p-2">
              <Button size="touch" disabled={!guestMenu} onClick={() => setComposing('takeaway')}>
                <ShoppingBag /> New takeaway
              </Button>
              <Button
                size="touch"
                variant="secondary"
                disabled={!guestMenu}
                onClick={() => setComposing('delivery')}
              >
                <Truck /> New delivery
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Dine-in orders are billed from the Tables tab.
              </p>
            </div>
          )}
          {tab === 'bills' && (
            <ul className="grid gap-1.5">
              {(bills.data ?? []).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setBillId(b.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent',
                      b.id === billId && 'border-primary bg-accent',
                    )}
                  >
                    <span className="font-mono font-semibold">#{b.bill_number}</span>
                    <span className="flex-1 truncate">
                      {b.table_sessions?.tables
                        ? `Table ${b.table_sessions.tables.label}`
                        : b.type === 'takeaway'
                          ? 'Takeaway'
                          : 'Delivery'}
                      {b.customer_name && ` · ${b.customer_name}`}
                    </span>
                    <Badge
                      variant={
                        b.status === 'paid'
                          ? 'success'
                          : b.status === 'open'
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {b.status}
                    </Badge>
                    <span className="tabular-nums">
                      {formatMoney(b.paid_total_minor || b.base_minor, currency)}
                    </span>
                  </button>
                </li>
              ))}
              {(bills.data ?? []).length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">No bills yet today.</p>
              )}
            </ul>
          )}
        </div>
        <div className="hidden border-t p-2 md:block">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => (setTab('counter'), setComposing('takeaway'))}
            disabled={!guestMenu}
          >
            <Plus /> Quick takeaway
          </Button>
        </div>
      </aside>

      <section className="min-h-0">
        <BillPanel billId={billId} op={op} />
      </section>

      {composing && guestMenu && (
        <CounterComposer
          type={composing}
          branchId={branchId}
          op={op}
          menu={guestMenu}
          onDone={(id) => {
            setComposing(null)
            setBillId(id)
            setTab('bills')
          }}
          onClose={() => setComposing(null)}
        />
      )}
    </main>
  )
}

function CounterComposer({
  type,
  branchId,
  op,
  menu,
  onDone,
  onClose,
}: {
  type: 'takeaway' | 'delivery'
  branchId: string
  op: Operator
  menu: NonNullable<ReturnType<typeof toGuestMenu>>
  onDone: (billId: string) => void
  onClose: () => void
}) {
  const create = useCounterOrder(op)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  return (
    <ItemComposer
      menu={menu}
      title={type === 'takeaway' ? 'Takeaway' : 'Delivery'}
      submitLabel="Send & bill"
      extra={
        <div className="grid grid-cols-2 gap-3">
          <Field id="cust-name" label="Customer name">
            <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="cust-phone" label="Phone (for WhatsApp receipt)">
            <Input
              id="cust-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0300 1234567"
            />
          </Field>
        </div>
      }
      onClose={onClose}
      onSubmit={async (items, notes) => {
        const r = await create.mutateAsync({
          branchId,
          type,
          items,
          notes,
          customerName: name,
          customerPhone: phone,
        })
        toast.success(`Order #${r.order_number} sent to the kitchen`)
        onDone(r.bill_id)
      }}
    />
  )
}

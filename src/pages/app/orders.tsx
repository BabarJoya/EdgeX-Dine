import { Bell, Check, QrCode, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  nextStep,
  requestLabel,
  statusMeta,
  useActiveOrders,
  useClosedOrders,
  useGuestRequests,
  useLiveOrders,
  useRespondRequest,
  useUpdateOrderStatus,
  type Order,
} from '@/features/orders/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { ageLabel, minutesSince, useNow } from '@/lib/time'
import { cn, formatMoney } from '@/lib/utils'

export function OrdersPage() {
  return (
    <RequirePerm any={['orders.view']}>
      <OrdersContent />
    </RequirePerm>
  )
}

type Filter = 'active' | 'new' | 'kitchen' | 'ready' | 'closed'

function OrdersContent() {
  const { tenantId, branchId, branch, branches } = useTenant()
  useLiveOrders(tenantId)
  const now = useNow(30_000)
  const [filter, setFilter] = useState<Filter>('active')
  const active = useActiveOrders(tenantId, branchId)
  const closed = useClosedOrders(tenantId, branchId, filter === 'closed')
  const requests = useGuestRequests(tenantId, branchId)
  const respond = useRespondRequest()
  const [cancelling, setCancelling] = useState<Order | null>(null)

  const all = active.data ?? []
  const counts = {
    active: all.length,
    new: all.filter((o) => o.status === 'new').length,
    kitchen: all.filter((o) => o.status === 'accepted' || o.status === 'preparing').length,
    ready: all.filter((o) => o.status === 'ready' || o.status === 'served').length,
  }
  const list =
    filter === 'closed'
      ? (closed.data ?? [])
      : all.filter((o) =>
          filter === 'new'
            ? o.status === 'new'
            : filter === 'kitchen'
              ? o.status === 'accepted' || o.status === 'preparing'
              : filter === 'ready'
                ? o.status === 'ready' || o.status === 'served'
                : true,
        )
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name
  const loading = filter === 'closed' ? closed.isPending : active.isPending

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${branch?.name ?? 'All branches'} · updates live as orders come in.`}
      />
      {(active.error || requests.error) && (
        <Alert variant="destructive" className="mb-4">
          {errorMessage(active.error ?? requests.error)}
        </Alert>
      )}

      {(requests.data?.length ?? 0) > 0 && (
        <section aria-label="Guest requests" className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <Bell className="size-4 text-warning" /> Guest requests
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {requests.data!.map((r) => (
              <Card
                key={r.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  r.status === 'open' && 'border-warning/60 bg-warning-soft/40',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    Table {r.tables?.label} · {requestLabel[r.type]}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ageLabel(r.created_at, now)}
                    {r.status === 'acknowledged' && ' · on the way'}
                  </div>
                </div>
                {r.status === 'open' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: r.id, status: 'acknowledged' })}
                  >
                    On my way
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: r.id, status: 'resolved' })}
                  >
                    <Check /> Done
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="active">All open · {counts.active}</TabsTrigger>
          <TabsTrigger value="new">New · {counts.new}</TabsTrigger>
          <TabsTrigger value="kitchen">In kitchen · {counts.kitchen}</TabsTrigger>
          <TabsTrigger value="ready">Ready / served · {counts.ready}</TabsTrigger>
          <TabsTrigger value="closed">Closed today</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={filter === 'closed' ? 'No closed orders today' : 'No open orders'}
          description="Orders from QR menus appear here instantly. Waiter and POS ordering arrive in Phases 4 and 5."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              now={now}
              branchName={branchId ? undefined : branchName(o.branch_id)}
              onCancel={() => setCancelling(o)}
            />
          ))}
        </div>
      )}

      {cancelling && <CancelDialog order={cancelling} onClose={() => setCancelling(null)} />}
    </>
  )
}

function OrderCard({
  order: o,
  now,
  branchName,
  onCancel,
}: {
  order: Order
  now: number
  branchName?: string
  onCancel: () => void
}) {
  const { can, membership } = useTenant()
  const currency = membership?.tenants.currency ?? o.currency
  const update = useUpdateOrderStatus()
  const step = nextStep[o.status]
  const late =
    ['new', 'accepted', 'preparing'].includes(o.status) && minutesSince(o.created_at, now) >= 20
  const canStep =
    step &&
    (step.to === 'served' ? can('orders.edit') : can('orders.edit') || can('kitchen.update'))
  const meta = statusMeta[o.status]

  return (
    <Card
      className={cn('flex flex-col', o.status === 'new' && 'border-warning/60')}
      data-testid={`order-${o.order_number}`}
    >
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] font-semibold">#{o.order_number}</span>
            <span className="font-medium">
              {o.tables
                ? `Table ${o.tables.label}`
                : o.type === 'takeaway'
                  ? 'Takeaway'
                  : 'Delivery'}
            </span>
            {o.source === 'qr' && (
              <span
                title="Ordered by the guest from the QR menu"
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
              >
                <QrCode className="size-3" /> QR
              </span>
            )}
          </div>
          <div
            className={cn(
              'text-xs',
              late ? 'font-medium text-destructive' : 'text-muted-foreground',
            )}
          >
            {ageLabel(o.created_at, now)}
            {branchName && ` · ${branchName}`}
          </div>
        </div>
        <Badge variant={meta.badge}>{meta.label}</Badge>
      </header>
      <ul className="grid flex-1 gap-1.5 px-4 py-3 text-sm">
        {o.order_items.map((i) => (
          <li key={i.id}>
            <div className="flex justify-between gap-3">
              <span>
                <span className="font-medium tabular-nums">{i.quantity}×</span> {i.name}
                {i.variant_name && (
                  <span className="text-muted-foreground"> · {i.variant_name}</span>
                )}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatMoney(i.line_total_minor, currency)}
              </span>
            </div>
            {i.order_item_modifiers.length > 0 && (
              <div className="pl-5 text-xs text-muted-foreground">
                {i.order_item_modifiers.map((m) => m.name).join(', ')}
              </div>
            )}
            {i.notes && <div className="pl-5 text-xs text-warning">“{i.notes}”</div>}
          </li>
        ))}
        {o.notes && (
          <li className="mt-1 rounded-sm bg-warning-soft px-2 py-1 text-xs text-warning">
            Note: {o.notes}
          </li>
        )}
        {o.cancel_reason && (
          <li className="text-xs text-destructive">Cancelled: {o.cancel_reason}</li>
        )}
      </ul>
      <footer className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
        <span className="font-semibold tabular-nums">{formatMoney(o.total_minor, currency)}</span>
        <div className="flex gap-1.5">
          {can('orders.cancel') && ['new', 'accepted', 'preparing', 'ready'].includes(o.status) && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {step && canStep && (
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: o.id, status: step.to },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              {step.label}
            </Button>
          )}
        </div>
      </footer>
    </Card>
  )
}

function CancelDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const update = useUpdateOrderStatus()
  const [reason, setReason] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate(
              { id: order.id, status: 'cancelled', reason },
              {
                onSuccess: () => (
                  toast.success(`Order #${order.order_number} cancelled`),
                  onClose()
                ),
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Cancel order #{order.order_number}?</DialogTitle>
            <DialogDescription>
              The guest sees the order as cancelled. The reason is saved in the audit log.
            </DialogDescription>
          </DialogHeader>
          {update.error && <Alert variant="destructive">{errorMessage(update.error)}</Alert>}
          <Field id="cancel-reason" label="Reason">
            <Input
              id="cancel-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Guest left, item out of stock"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Keep order
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!reason.trim() || update.isPending}
            >
              Cancel order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

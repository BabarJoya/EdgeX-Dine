import {
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  ChefHat,
  Hand,
  LayoutGrid,
  Merge,
  MoveRight,
  Plus,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { StationLayout } from '@/components/layout/station-layout'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import {
  useAssignWaiter,
  useCloseSession,
  useFloor,
  useSetTableStatus,
  type Table,
} from '@/features/floor/api'
import { MoveTableDialog } from '@/features/floor/move-dialog'
import { tableStatusMeta } from '@/features/floor/status'
import { useMenu } from '@/features/menu/api'
import {
  requestLabel,
  statusMeta,
  useActiveOrders,
  useGuestRequests,
  useLiveOrders,
  useRespondRequest,
  useUpdateOrderStatus,
  type Order,
} from '@/features/orders/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { OrderComposer } from '@/features/waiter/compose'
import { toGuestMenu } from '@/features/waiter/to-guest-menu'
import { ChooseBranch } from '@/pages/app/tables'
import { errorMessage } from '@/lib/errors'
import { useNewArrivals, useSound } from '@/lib/sound'
import { ageLabel, useNow } from '@/lib/time'
import { cn, formatMoney } from '@/lib/utils'

export function WaiterPage() {
  return (
    <RequirePerm any={['tables.view']}>
      <WaiterApp />
    </RequirePerm>
  )
}

type Tab = 'tables' | 'requests' | 'ready'

function WaiterApp() {
  const { tenantId, branchId, branch } = useTenant()
  const { user } = useAuth()
  const floor = useFloor(branchId)
  const orders = useActiveOrders(tenantId, branchId)
  const requests = useGuestRequests(tenantId, branchId)
  useLiveOrders(tenantId)
  const sound = useSound('waiter')
  const now = useNow(30_000)
  const [tab, setTab] = useState<Tab>('tables')
  const [mine, setMine] = useState(false)
  const [tableId, setTableId] = useState<string | null>(null)

  const ready = (orders.data ?? []).filter((o) => o.status === 'ready')
  const openRequests = (requests.data ?? []).filter((r) => r.status !== 'resolved')
  useNewArrivals(
    requests.data?.filter((r) => r.status === 'open'),
    () => sound.play('attention'),
  )
  useNewArrivals(ready, () => sound.play('attention'))

  const table = floor.data?.tables.find((t) => t.id === tableId) ?? null

  return (
    <StationLayout
      title="Waiter"
      subtitle={branch?.name}
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label={sound.enabled ? 'Turn sound off' : 'Turn sound on'}
          aria-pressed={sound.enabled}
          onClick={() => sound.enable(!sound.enabled)}
        >
          {sound.enabled ? <Volume2 /> : <VolumeX />}
        </Button>
      }
    >
      {!branchId ? (
        <main className="p-4">
          <ChooseBranch what="Tables" />
        </main>
      ) : table && floor.data ? (
        <TableView
          table={table}
          floor={floor.data}
          orders={(orders.data ?? []).filter((o) => o.table_id === table.id)}
          requests={openRequests.filter((r) => r.table_id === table.id)}
          now={now}
          onBack={() => setTableId(null)}
          onOpenTable={setTableId}
        />
      ) : (
        <>
          <main className="flex-1 pb-20">
            {sound.needsTap && (
              <p className="bg-warning-soft px-4 py-2 text-center text-[13px] text-warning">
                Tap anywhere to turn on alerts.
              </p>
            )}
            {tab === 'tables' && (
              <section className="p-3">
                <div className="mb-3 flex gap-1 rounded-md border p-0.5 text-sm">
                  {[
                    { v: false, l: 'All tables' },
                    { v: true, l: 'My tables' },
                  ].map((o) => (
                    <button
                      key={o.l}
                      type="button"
                      aria-pressed={mine === o.v}
                      onClick={() => setMine(o.v)}
                      className={cn(
                        'flex-1 rounded-sm py-1.5 font-medium',
                        mine === o.v
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
                {floor.isPending ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-24" />
                    ))}
                  </div>
                ) : (
                  <TableGrid
                    tables={(floor.data?.tables ?? []).filter(
                      (t) => t.is_active && (!mine || t.waiter_id === user?.id),
                    )}
                    orders={orders.data ?? []}
                    requestsFor={(id) => openRequests.filter((r) => r.table_id === id).length}
                    myId={user?.id}
                    onOpen={setTableId}
                  />
                )}
              </section>
            )}
            {tab === 'requests' && <RequestsList now={now} />}
            {tab === 'ready' && <ReadyList orders={ready} now={now} />}
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-background pb-[env(safe-area-inset-bottom)]"
            aria-label="Waiter"
          >
            {(
              [
                { id: 'tables', label: 'Tables', icon: LayoutGrid, count: 0 },
                {
                  id: 'requests',
                  label: 'Requests',
                  icon: Bell,
                  count: openRequests.filter((r) => r.status === 'open').length,
                },
                { id: 'ready', label: 'Ready', icon: ChefHat, count: ready.length },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  tab === t.id ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <t.icon className="size-5" />
                {t.label}
                {t.count > 0 && (
                  <span className="absolute top-2 left-1/2 ml-2 min-w-5 rounded-full bg-destructive px-1 text-[11px] leading-5 text-destructive-foreground tabular-nums">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </>
      )}
    </StationLayout>
  )
}

function TableGrid({
  tables,
  orders,
  requestsFor,
  myId,
  onOpen,
}: {
  tables: Table[]
  orders: Order[]
  requestsFor: (id: string) => number
  myId?: string
  onOpen: (id: string) => void
}) {
  if (tables.length === 0)
    return (
      <EmptyState
        icon={LayoutGrid}
        title="No tables here"
        description="Claim a table or switch to All tables."
      />
    )
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {tables.map((t) => {
        const meta = tableStatusMeta[t.status]
        const open = orders.filter((o) => o.table_id === t.id)
        const readyCount = open.filter((o) => o.status === 'ready').length
        const req = requestsFor(t.id)
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t.id)}
            aria-label={`Table ${t.label}, ${meta.label}`}
            className={cn(
              'relative flex h-24 flex-col items-center justify-center rounded-lg border-2',
              meta.tile,
            )}
          >
            <span className="text-lg font-semibold">{t.label}</span>
            <span className="text-[11px] opacity-80">{meta.label}</span>
            {t.waiter_id === myId && (
              <span className="absolute top-1 left-1.5 text-[10px] font-semibold">MINE</span>
            )}
            <span className="absolute top-1 right-1 flex gap-1">
              {req > 0 && (
                <span
                  className="grid size-5 place-items-center rounded-full bg-warning text-[11px] font-semibold text-background"
                  title="Guest request"
                >
                  <BellRing className="size-3" />
                </span>
              )}
              {readyCount > 0 && (
                <span
                  className="grid size-5 place-items-center rounded-full bg-success text-[11px] font-semibold text-success-foreground"
                  title="Food ready"
                >
                  {readyCount}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TableView({
  table,
  floor,
  orders,
  requests,
  now,
  onBack,
  onOpenTable,
}: {
  table: Table
  floor: NonNullable<ReturnType<typeof useFloor>['data']>
  orders: Order[]
  requests: NonNullable<ReturnType<typeof useGuestRequests>['data']>
  now: number
  onBack: () => void
  onOpenTable: (tableId: string) => void
}) {
  const { tenantId, branchId, membership, can } = useTenant()
  const { user } = useAuth()
  const menu = useMenu(tenantId)
  const session = floor.sessions.find((s) => s.table_id === table.id) ?? null
  const update = useUpdateOrderStatus()
  const respond = useRespondRequest()
  const assign = useAssignWaiter()
  const setStatus = useSetTableStatus(branchId)
  const close = useCloseSession(branchId)
  const [composing, setComposing] = useState(false)
  // Remember the sitting being moved: it leaves this table when the move succeeds.
  const [moving, setMoving] = useState<{
    mode: 'transfer' | 'merge'
    session: NonNullable<typeof session>
  } | null>(null)
  const currency = membership?.tenants.currency ?? 'PKR'
  const total = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((n, o) => n + o.total_minor, 0)
  const guestMenu = useMemo(
    () =>
      menu.data && branchId && membership
        ? toGuestMenu(menu.data, branchId, {
            name: membership.tenants.name,
            slug: membership.tenants.slug,
            currency,
            logo_url: null,
            brand_color: null,
          })
        : null,
    [menu.data, branchId, membership, currency],
  )
  const error = update.error ?? respond.error ?? assign.error ?? setStatus.error ?? close.error
  const isMine = table.waiter_id === user?.id

  return (
    <main className="flex-1 pb-24">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" aria-label="Back to tables" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <h1 className="text-lg font-semibold">Table {table.label}</h1>
        <Badge variant={tableStatusMeta[table.status].badge} dot>
          {tableStatusMeta[table.status].label}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">{table.seats} seats</span>
      </div>

      <div className="grid gap-4 p-3">
        {error && <Alert variant="destructive">{errorMessage(error)}</Alert>}

        {requests.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-lg border border-warning/60 bg-warning-soft/50 px-3 py-2"
          >
            <BellRing className="size-5 text-warning" />
            <div className="flex-1">
              <div className="font-medium">{requestLabel[r.type]}</div>
              <div className="text-xs text-muted-foreground">{ageLabel(r.created_at, now)}</div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                respond.mutate({
                  id: r.id,
                  status: r.status === 'open' ? 'acknowledged' : 'resolved',
                })
              }
            >
              {r.status === 'open' ? 'On my way' : 'Done'}
            </Button>
          </div>
        ))}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Orders</h2>
            {orders.length > 0 && (
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(total, currency)}
              </span>
            )}
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open orders.</p>
          ) : (
            <ul className="grid gap-2">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="rounded-lg border bg-card"
                  data-testid={`waiter-order-${o.order_number}`}
                >
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="font-mono font-semibold">#{o.order_number}</span>
                    <Badge variant={statusMeta[o.status].badge}>{statusMeta[o.status].label}</Badge>
                  </div>
                  <ul className="grid gap-1 px-3 py-2 text-sm">
                    {o.order_items.map((i) => (
                      <li key={i.id}>
                        {i.quantity}× {i.name}
                        {i.variant_name && (
                          <span className="text-muted-foreground"> ({i.variant_name})</span>
                        )}
                        {i.order_item_modifiers.length > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            + {i.order_item_modifiers.map((m) => m.name).join(', ')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {o.status === 'ready' && can('orders.edit') && (
                    <div className="border-t p-2">
                      <Button
                        size="sm"
                        className="w-full bg-success text-success-foreground hover:bg-success/90"
                        onClick={() =>
                          update.mutate(
                            { id: o.id, status: 'served' },
                            { onSuccess: () => toast.success(`#${o.order_number} served`) },
                          )
                        }
                      >
                        <Check /> Mark served
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2">
          {can('orders.create') && (
            <Button
              size="lg"
              className="col-span-2"
              disabled={!guestMenu}
              onClick={() => setComposing(true)}
            >
              <Plus /> Add order
            </Button>
          )}
          {session && (can('orders.edit') || can('tables.manage')) && (
            <>
              <Button
                variant="secondary"
                onClick={() => session && setMoving({ mode: 'transfer', session })}
              >
                <MoveRight /> Move
              </Button>
              <Button
                variant="secondary"
                onClick={() => session && setMoving({ mode: 'merge', session })}
              >
                <Merge /> Merge
              </Button>
            </>
          )}
          {can('orders.edit') && !table.waiter_id && (
            <Button
              variant="secondary"
              onClick={() =>
                assign.mutate(
                  { tableId: table.id, userId: user!.id },
                  { onSuccess: () => toast.success(`Table ${table.label} is yours`) },
                )
              }
            >
              <Hand /> Claim table
            </Button>
          )}
          {isMine && (
            <Button
              variant="ghost"
              onClick={() => assign.mutate({ tableId: table.id, userId: null })}
            >
              Release table
            </Button>
          )}
          {!session && table.status !== 'available' && (
            <Button
              variant="secondary"
              onClick={() => setStatus.mutate({ id: table.id, status: 'available' })}
            >
              Mark available
            </Button>
          )}
          {session && (can('tables.manage') || can('payments.take')) && (
            <Button
              variant="secondary"
              onClick={() =>
                close.mutate(session.id, {
                  onSuccess: () => (toast.success(`Table ${table.label} closed`), onBack()),
                })
              }
            >
              Close table
            </Button>
          )}
        </section>
      </div>

      {composing && guestMenu && (
        <OrderComposer menu={guestMenu} table={table} onClose={() => setComposing(false)} />
      )}
      {moving && (
        <MoveTableDialog
          mode={moving.mode}
          table={table}
          session={moving.session}
          tables={floor.tables}
          sessions={floor.sessions}
          onClose={() => setMoving(null)}
          onDone={onOpenTable}
        />
      )}
    </main>
  )
}

function RequestsList({ now }: { now: number }) {
  const { tenantId, branchId } = useTenant()
  const requests = useGuestRequests(tenantId, branchId)
  const respond = useRespondRequest()
  const list = requests.data ?? []
  if (list.length === 0)
    return (
      <div className="p-4">
        <EmptyState
          icon={Bell}
          title="No requests"
          description="Guest calls for help, water or the bill show up here."
        />
      </div>
    )
  return (
    <ul className="grid gap-2 p-3">
      {list.map((r) => (
        <li
          key={r.id}
          className={cn(
            'flex items-center gap-3 rounded-lg border px-3 py-3',
            r.status === 'open' && 'border-warning/60 bg-warning-soft/50',
          )}
        >
          <div className="text-lg font-semibold">{r.tables?.label}</div>
          <div className="flex-1">
            <div className="font-medium">{requestLabel[r.type]}</div>
            <div className="text-xs text-muted-foreground">
              {ageLabel(r.created_at, now)}
              {r.status === 'acknowledged' && ' · on the way'}
            </div>
          </div>
          <Button
            size="sm"
            variant={r.status === 'open' ? 'default' : 'secondary'}
            disabled={respond.isPending}
            onClick={() =>
              respond.mutate({
                id: r.id,
                status: r.status === 'open' ? 'acknowledged' : 'resolved',
              })
            }
          >
            {r.status === 'open' ? 'On my way' : 'Done'}
          </Button>
        </li>
      ))}
    </ul>
  )
}

function ReadyList({ orders, now }: { orders: Order[]; now: number }) {
  const update = useUpdateOrderStatus()
  const { can } = useTenant()
  if (orders.length === 0)
    return (
      <div className="p-4">
        <EmptyState
          icon={ChefHat}
          title="Nothing waiting at the pass"
          description="Orders appear here when the kitchen marks them ready."
        />
      </div>
    )
  return (
    <ul className="grid gap-2 p-3">
      {orders.map((o) => (
        <li key={o.id} className="rounded-lg border border-success/50 bg-success-soft/40">
          <div className="flex items-center justify-between px-3 pt-3">
            <span className="text-lg font-semibold">
              {o.tables ? `Table ${o.tables.label}` : `#${o.order_number}`}
            </span>
            <span className="text-xs text-muted-foreground">
              #{o.order_number} · ready {o.ready_at ? ageLabel(o.ready_at, now) : ''}
            </span>
          </div>
          <ul className="px-3 py-2 text-sm">
            {o.order_items.map((i) => (
              <li key={i.id}>
                {i.quantity}× {i.name}
                {i.variant_name && ` (${i.variant_name})`}
              </li>
            ))}
          </ul>
          {can('orders.edit') && (
            <div className="border-t p-2">
              <Button
                className="w-full bg-success text-success-foreground hover:bg-success/90"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: o.id, status: 'served' },
                    { onSuccess: () => toast.success(`#${o.order_number} served`) },
                  )
                }
              >
                <Check /> Mark served
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

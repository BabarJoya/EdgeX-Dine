import {
  Armchair,
  Copy,
  LayoutGrid,
  List,
  Plus,
  Printer,
  RefreshCw,
  Store,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/ui/page-header'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table as T,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  tableUrl,
  useAddTables,
  useCloseSession,
  useDeleteArea,
  useDeleteTable,
  useFloor,
  useMoveTable,
  useRegenerateQr,
  useSaveArea,
  useSaveTable,
  useSetTableStatus,
  type Area,
  type Session,
  type Table,
} from '@/features/floor/api'
import { MoveTableDialog } from '@/features/floor/move-dialog'
import { QrSvg } from '@/features/floor/qr'
import { tableStatusMeta } from '@/features/floor/status'
import { useActiveOrders, useLiveOrders } from '@/features/orders/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import type { Enums } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'

export function TablesPage() {
  return (
    <RequirePerm any={['tables.view', 'tables.manage']}>
      <TablesContent />
    </RequirePerm>
  )
}

/** Branch-level screens need one branch; offer a choice when "All branches" is selected. */
export function ChooseBranch({ what }: { what: string }) {
  const { branches, setBranchId } = useTenant()
  return (
    <EmptyState
      icon={Store}
      title="Choose a branch"
      description={`${what} are managed per branch.`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {branches.map((b) => (
            <Button key={b.id} variant="secondary" onClick={() => setBranchId(b.id)}>
              {b.name}
            </Button>
          ))}
        </div>
      }
    />
  )
}

function TablesContent() {
  const { tenantId, branchId, branch, can } = useTenant()
  const floor = useFloor(branchId)
  const orders = useActiveOrders(tenantId, branchId)
  useLiveOrders(tenantId)
  const canManage = can('tables.manage')
  const [view, setView] = useState<'floor' | 'list'>('floor')
  const [areaId, setAreaId] = useState<string | 'all'>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [areasOpen, setAreasOpen] = useState(false)

  if (!branchId) {
    return (
      <>
        <PageHeader title="Tables" description="Floor plan, table status and QR codes." />
        <ChooseBranch what="Tables" />
      </>
    )
  }

  const data = floor.data
  const tables = (data?.tables ?? []).filter((t) => areaId === 'all' || t.area_id === areaId)
  const sessionFor = (tableId: string) => data?.sessions.find((s) => s.table_id === tableId)
  const ordersFor = (tableId: string) => (orders.data ?? []).filter((o) => o.table_id === tableId)
  const counts = (data?.tables ?? []).reduce(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  )
  const selectedTable = data?.tables.find((t) => t.id === selected) ?? null

  return (
    <>
      <PageHeader
        title="Tables"
        description={`${branch?.name} · floor plan, status and QR codes.`}
        actions={
          data &&
          data.tables.length > 0 && (
            <>
              <Button variant="secondary" asChild>
                <Link to={`/print/qr?branch=${branchId}`} target="_blank">
                  <Printer /> Print QR codes
                </Link>
              </Button>
              {canManage && (
                <Button onClick={() => setAdding(true)}>
                  <Plus /> Add tables
                </Button>
              )}
            </>
          )
        }
      />
      {floor.error && (
        <Alert variant="destructive" className="mb-4">
          {errorMessage(floor.error)}
        </Alert>
      )}

      {floor.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : data && data.tables.length === 0 ? (
        <EmptyState
          icon={Armchair}
          title="No tables yet"
          description="Add your tables, then print a QR code card for each one so guests can order from their phone."
          action={
            canManage && (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add tables
              </Button>
            )
          }
        />
      ) : data ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex gap-1 overflow-x-auto">
              {[{ id: 'all', name: 'All areas' }, ...data.areas].map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAreaId(a.id)}
                  className={cn(
                    'shrink-0 rounded-md px-3 py-1.5 text-[13px]',
                    areaId === a.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  {a.name}
                </button>
              ))}
              {canManage && (
                <button
                  type="button"
                  className="shrink-0 px-2 text-[13px] text-link"
                  onClick={() => setAreasOpen(true)}
                >
                  Edit areas
                </button>
              )}
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden gap-2 text-xs sm:flex">
                {(Object.keys(tableStatusMeta) as Enums<'table_status'>[]).map((s) => (
                  <Badge key={s} variant={tableStatusMeta[s].badge} dot>
                    {tableStatusMeta[s].label} {counts[s] ?? 0}
                  </Badge>
                ))}
              </div>
              <div className="flex rounded-md border p-0.5">
                <button
                  type="button"
                  aria-label="Floor plan"
                  aria-pressed={view === 'floor'}
                  onClick={() => setView('floor')}
                  className={cn('rounded-sm p-1.5', view === 'floor' && 'bg-accent')}
                >
                  <LayoutGrid className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="List"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                  className={cn('rounded-sm p-1.5', view === 'list' && 'bg-accent')}
                >
                  <List className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {view === 'floor' ? (
            <FloorPlan
              tables={tables}
              canMove={canManage}
              branchId={branchId}
              ordersFor={ordersFor}
              onSelect={setSelected}
            />
          ) : (
            <Card>
              <T>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Open orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(t.id)}
                    >
                      <TableCell className="font-medium">{t.label}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {data.areas.find((a) => a.id === t.area_id)?.name ?? '—'}
                      </TableCell>
                      <TableCell className="tabular-nums">{t.seats}</TableCell>
                      <TableCell>
                        <Badge variant={tableStatusMeta[t.status].badge} dot>
                          {tableStatusMeta[t.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ordersFor(t.id).length || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </T>
            </Card>
          )}
        </>
      ) : null}

      {adding && data && (
        <AddTablesDialog
          areas={data.areas}
          existing={data.tables}
          onClose={() => setAdding(false)}
        />
      )}
      {areasOpen && data && <AreasDialog areas={data.areas} onClose={() => setAreasOpen(false)} />}
      {selectedTable && data && (
        <TableSheet
          table={selectedTable}
          areas={data.areas}
          tables={data.tables}
          sessions={data.sessions}
          session={sessionFor(selectedTable.id) ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Floor plan: tables positioned on a 0–1000 grid; drag to arrange.
// ---------------------------------------------------------------------------
function FloorPlan({
  tables,
  canMove,
  branchId,
  ordersFor,
  onSelect,
}: {
  tables: Table[]
  canMove: boolean
  branchId: string
  ordersFor: (id: string) => unknown[]
  onSelect: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const move = useMoveTable(branchId)
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null)
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number } | null>(null)
  const TILE = 120 // grid units

  const toGrid = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: ((clientX - r.left) / r.width) * 1000, y: ((clientY - r.top) / r.height) * 1000 }
  }
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(1000 - TILE, v)) / 10) * 10

  return (
    <div
      ref={ref}
      className="relative w-full touch-none overflow-hidden rounded-lg border bg-card [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:20px_20px]"
      style={{ aspectRatio: '16 / 10' }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const g = toGrid(e.clientX, e.clientY)
        drag.current.moved = true
        setGhost({
          id: drag.current.id,
          x: clamp(g.x - drag.current.dx),
          y: clamp(g.y - drag.current.dy),
        })
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (d && ghost && d.moved) move.mutate({ id: d.id, pos_x: ghost.x, pos_y: ghost.y })
        else if (d) onSelect(d.id)
        setGhost(null)
      }}
      onPointerLeave={() => {
        drag.current = null
        setGhost(null)
      }}
    >
      {tables.map((t) => {
        const pos = ghost?.id === t.id ? ghost : { x: t.pos_x, y: t.pos_y }
        const meta = tableStatusMeta[t.status]
        const open = ordersFor(t.id).length
        return (
          <button
            key={t.id}
            type="button"
            aria-label={`Table ${t.label}, ${meta.label}`}
            onPointerDown={(e) => {
              if (!canMove) return
              e.preventDefault()
              const g = toGrid(e.clientX, e.clientY)
              drag.current = { id: t.id, dx: g.x - t.pos_x, dy: g.y - t.pos_y, moved: false }
            }}
            onClick={() => !canMove && onSelect(t.id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(t.id)}
            className={cn(
              'absolute grid place-items-center border-2 text-center transition-shadow select-none',
              t.shape === 'round' ? 'rounded-full' : 'rounded-lg',
              meta.tile,
              canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
              ghost?.id === t.id && 'z-10 shadow-lg',
              !t.is_active && 'opacity-40',
            )}
            style={{
              left: `${pos.x / 10}%`,
              top: `${pos.y / 10}%`,
              width: `${(t.shape === 'rect' ? TILE * 1.5 : TILE) / 10}%`,
              height: `${(TILE * 1.6) / 10}%`,
            }}
          >
            <span>
              <span className="block text-sm font-semibold sm:text-base">{t.label}</span>
              <span className="hidden items-center justify-center gap-1 text-[11px] opacity-80 sm:flex">
                <Users className="size-3" /> {t.seats}
              </span>
              {open > 0 && <span className="block text-[11px] font-medium">{open} open</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
function AddTablesDialog({
  areas,
  existing,
  onClose,
}: {
  areas: Area[]
  existing: Table[]
  onClose: () => void
}) {
  const { tenantId, branchId } = useTenant()
  const add = useAddTables(tenantId, branchId)
  const nextNumber =
    existing.reduce((max, t) => {
      const m = /^T(\d+)$/i.exec(t.label)
      return m ? Math.max(max, Number(m[1])) : max
    }, 0) + 1
  const [prefix, setPrefix] = useState('T')
  const [from, setFrom] = useState(String(nextNumber))
  const [count, setCount] = useState('10')
  const [seats, setSeats] = useState('4')
  const [areaId, setAreaId] = useState('')
  const n = Math.max(1, Math.min(50, Number(count) || 0))
  const start = Number(from) || 1

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(
              {
                prefix: prefix.trim(),
                from: start,
                count: n,
                seats: Number(seats) || 4,
                area_id: areaId || null,
                existing: existing.length,
              },
              {
                onSuccess: () => (toast.success(`${n} table${n > 1 ? 's' : ''} added`), onClose()),
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Add tables</DialogTitle>
          </DialogHeader>
          {add.error && <Alert variant="destructive">{errorMessage(add.error)}</Alert>}
          <div className="grid grid-cols-3 gap-3">
            <Field id="t-prefix" label="Prefix">
              <Input
                id="t-prefix"
                value={prefix}
                maxLength={8}
                onChange={(e) => setPrefix(e.target.value)}
              />
            </Field>
            <Field id="t-from" label="Start at">
              <Input
                id="t-from"
                inputMode="numeric"
                value={from}
                onChange={(e) => setFrom(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field id="t-count" label="How many">
              <Input
                id="t-count"
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="t-seats" label="Seats each">
              <Input
                id="t-seats"
                inputMode="numeric"
                value={seats}
                onChange={(e) => setSeats(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field id="t-area" label="Area">
              <NativeSelect id="t-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">No area</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Creates {prefix}
            {start}
            {n > 1 && ` to ${prefix}${start + n - 1}`}. You can rename tables and drag them into
            place afterwards.
          </p>
          <DialogFooter>
            <Button type="submit" disabled={add.isPending || !prefix.trim()}>
              {add.isPending ? 'Adding…' : `Add ${n} table${n > 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AreasDialog({ areas, onClose }: { areas: Area[]; onClose: () => void }) {
  const { tenantId, branchId } = useTenant()
  const save = useSaveArea(tenantId, branchId)
  const del = useDeleteArea(branchId)
  const [name, setName] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Areas</DialogTitle>
        </DialogHeader>
        {(save.error || del.error) && (
          <Alert variant="destructive">{errorMessage(save.error ?? del.error)}</Alert>
        )}
        <ul className="divide-y rounded-md border">
          {areas.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No areas yet, e.g. Indoor, Rooftop, Family hall.
            </li>
          )}
          {areas.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
              {a.name}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${a.name}`}
                onClick={() => del.mutate(a.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim())
              save.mutate({ name, sort_order: areas.length + 1 }, { onSuccess: () => setName('') })
          }}
        >
          <Input
            aria-label="New area name"
            placeholder="Rooftop"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Table detail
// ---------------------------------------------------------------------------
function TableSheet({
  table,
  areas,
  tables,
  sessions,
  session,
  onClose,
}: {
  table: Table
  areas: Area[]
  tables: Table[]
  sessions: Session[]
  session: Session | null
  onClose: () => void
}) {
  const { tenantId, branchId, membership, can } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const slug = membership?.tenants.slug ?? ''
  const orders = useActiveOrders(tenantId, branchId)
  const tableOrders = (orders.data ?? []).filter(
    (o) => o.session_id === session?.id || (o.table_id === table.id && !session),
  )
  const setStatus = useSetTableStatus(branchId)
  const closeSession = useCloseSession(branchId)
  const regen = useRegenerateQr(branchId)
  const save = useSaveTable(tenantId, branchId)
  const del = useDeleteTable(branchId)
  const [edit, setEdit] = useState({
    label: table.label,
    seats: String(table.seats),
    area_id: table.area_id ?? '',
    shape: table.shape,
  })
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [moving, setMoving] = useState<{ mode: 'transfer' | 'merge'; session: Session } | null>(
    null,
  )
  const url = tableUrl(slug, table.qr_token)
  const canManage = can('tables.manage')
  const error = setStatus.error ?? closeSession.error ?? regen.error ?? save.error ?? del.error
  const open = tableOrders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled')
  const sessionTotal = open.reduce((n, o) => n + o.total_minor, 0)

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-md bg-background sm:max-w-md">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base font-semibold">Table {table.label}</SheetTitle>
            <Badge variant={tableStatusMeta[table.status].badge} dot>
              {tableStatusMeta[table.status].label}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {error && <Alert variant="destructive">{errorMessage(error)}</Alert>}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Status</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(tableStatusMeta) as Enums<'table_status'>[]).map((s) => (
                <Button
                  key={s}
                  variant={table.status === s ? 'default' : 'secondary'}
                  size="sm"
                  disabled={setStatus.isPending || table.status === s}
                  onClick={() => setStatus.mutate({ id: table.id, status: s })}
                >
                  {tableStatusMeta[s].label}
                </Button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold">Current sitting</h3>
            {session ? (
              <div className="rounded-md border">
                <ul className="divide-y text-sm">
                  {tableOrders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between px-3 py-2">
                      <span>
                        #{o.order_number} · {o.order_items.reduce((n, i) => n + i.quantity, 0)}{' '}
                        items
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge>{o.status}</Badge>
                        <span className="tabular-nums">{formatMoney(o.total_minor, currency)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t px-3 py-2 text-sm font-medium">
                  <span>
                    Open since{' '}
                    {new Date(session.opened_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="tabular-nums">{formatMoney(sessionTotal, currency)}</span>
                </div>
                {(can('tables.manage') || can('payments.take')) && (
                  <div className="border-t p-3">
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={closeSession.isPending}
                      onClick={() =>
                        closeSession.mutate(session.id, {
                          onSuccess: () => toast.success(`Table ${table.label} closed`),
                        })
                      }
                    >
                      Close table
                    </Button>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Billing and payment arrive in Phase 5. Closing marks the table for cleaning.
                    </p>
                  </div>
                )}
                {(can('orders.edit') || can('tables.manage')) && (
                  <div className="grid grid-cols-2 gap-2 border-t p-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => session && setMoving({ mode: 'transfer', session })}
                    >
                      Move guests
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => session && setMoving({ mode: 'merge', session })}
                    >
                      Merge with table
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No guests at this table right now.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold">QR code</h3>
            <div className="flex gap-4">
              <QrSvg
                value={url}
                label={`QR code for table ${table.label}`}
                className="size-32 shrink-0 rounded-md border bg-white p-1 [&>svg]:size-full"
              />
              <div className="grid content-start gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url)
                    toast.success('Menu link copied')
                  }}
                >
                  <Copy /> Copy link
                </Button>
                <Button variant="secondary" size="sm" asChild>
                  <Link to={`/print/qr?branch=${branchId}&table=${table.id}`} target="_blank">
                    <Printer /> Print card
                  </Link>
                </Button>
                {canManage &&
                  (confirmRegen ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        regen.mutate(table.id, {
                          onSuccess: () => (
                            setConfirmRegen(false),
                            toast.success('New QR code created')
                          ),
                        })
                      }
                    >
                      Confirm: old card stops working
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRegen(true)}>
                      <RefreshCw /> New QR code
                    </Button>
                  ))}
              </div>
            </div>
          </section>

          {canManage && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold">Table details</h3>
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  save.mutate(
                    {
                      id: table.id,
                      label: edit.label,
                      seats: Number(edit.seats) || 1,
                      area_id: edit.area_id || null,
                      shape: edit.shape,
                      is_active: table.is_active,
                    },
                    { onSuccess: () => toast.success('Table saved') },
                  )
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field id="td-label" label="Name">
                    <Input
                      id="td-label"
                      maxLength={20}
                      value={edit.label}
                      onChange={(e) => setEdit({ ...edit, label: e.target.value })}
                    />
                  </Field>
                  <Field id="td-seats" label="Seats">
                    <Input
                      id="td-seats"
                      inputMode="numeric"
                      value={edit.seats}
                      onChange={(e) =>
                        setEdit({ ...edit, seats: e.target.value.replace(/\D/g, '') })
                      }
                    />
                  </Field>
                  <Field id="td-area" label="Area">
                    <NativeSelect
                      id="td-area"
                      value={edit.area_id}
                      onChange={(e) => setEdit({ ...edit, area_id: e.target.value })}
                    >
                      <option value="">No area</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field id="td-shape" label="Shape">
                    <NativeSelect
                      id="td-shape"
                      value={edit.shape}
                      onChange={(e) =>
                        setEdit({ ...edit, shape: e.target.value as Enums<'table_shape'> })
                      }
                    >
                      <option value="square">Square</option>
                      <option value="round">Round</option>
                      <option value="rect">Long</option>
                    </NativeSelect>
                  </Field>
                </div>
                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={!!session || del.isPending}
                    title={session ? 'Close the table first' : undefined}
                    onClick={() =>
                      del.mutate(table.id, {
                        onSuccess: () => (toast.success(`Table ${table.label} deleted`), onClose()),
                      })
                    }
                  >
                    Delete table
                  </Button>
                  <Button type="submit" disabled={save.isPending}>
                    Save
                  </Button>
                </div>
              </form>
            </section>
          )}
        </div>
        {moving && (
          <MoveTableDialog
            mode={moving.mode}
            table={table}
            session={moving.session}
            tables={tables}
            sessions={sessions}
            onClose={() => setMoving(null)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

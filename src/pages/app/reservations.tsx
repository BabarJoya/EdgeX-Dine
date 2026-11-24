import { CalendarDays, ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RequirePerm } from '@/components/require-perm'
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
import { useFloor } from '@/features/floor/api'
import {
  rpc,
  statusMeta,
  time12,
  useReservationAction,
  useReservations,
  type Reservation,
} from '@/features/reservations/api'
import { addDays, todayIn, ymd } from '@/features/reports/dates'
import { useTenant } from '@/features/tenant/tenant-provider'
import { ChooseBranch } from '@/pages/app/tables'

export function ReservationsPage() {
  return (
    <RequirePerm any={['tables.view', 'reservations.manage']}>
      <Reservations />
    </RequirePerm>
  )
}

/** Local date and time of an instant in the restaurant's time zone. */
function localParts(iso: string, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  )
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

function Reservations() {
  const { branchId, branch, membership, can, tenantId } = useTenant()
  const tz = membership?.tenants.timezone ?? 'Asia/Karachi'
  const today = ymd(todayIn(tz))
  const [day, setDay] = useState(today)
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null)
  const d = new Date(`${day}T00:00:00Z`)
  // Fetch a day either side, then keep the restaurant-local day.
  const res = useReservations(branchId, addDays(d, -1).toISOString(), addDays(d, 2).toISOString())
  const list = (res.data ?? []).filter((r) => localParts(r.starts_at, tz).date === day)
  const active = list.filter((r) => !['cancelled', 'no_show'].includes(r.status))
  const covers = active.reduce((n, r) => n + r.party_size, 0)
  const manage = can('reservations.manage')
  const setStatus = useReservationAction(
    (v: { id: string; status: string }) =>
      rpc('set_reservation_status', { p_id: v.id, p_status: v.status }),
    'Booking updated',
  )
  const shift = (n: number) => setDay(ymd(addDays(new Date(`${day}T12:00:00`), n)))
  const bookingLink = membership ? `${window.location.origin}/book/${membership.tenants.slug}` : ''

  if (!branchId) {
    return (
      <>
        <PageHeader title="Reservations" />
        <ChooseBranch what="Reservations" />
      </>
    )
  }
  return (
    <>
      <PageHeader
        title="Reservations"
        description={`${branch?.name} · ${branch?.reservations_enabled ? 'taking online bookings' : 'online booking is off (Settings → Reservations)'}`}
        actions={
          <>
            {branch?.reservations_enabled && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(bookingLink).catch(() => undefined)
                  toast.success('Booking link copied')
                }}
              >
                <Copy /> Booking link
              </Button>
            )}
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus /> New booking
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <Input
          type="date"
          aria-label="Day"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="w-44"
        />
        <Button variant="secondary" size="icon" aria-label="Next day" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        {day !== today && (
          <Button variant="ghost" size="sm" onClick={() => setDay(today)}>
            Today
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground" data-testid="day-summary">
          {active.length} bookings · {covers} guests
        </span>
      </div>

      {res.data && list.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No bookings this day"
          description="Online bookings and bookings you take by phone appear here."
        />
      ) : (
        <Card className="divide-y">
          {list.map((r) => (
            <BookingRow
              key={r.id}
              r={r}
              time={localParts(r.starts_at, tz).time}
              manage={manage}
              onEdit={() => setEditing(r)}
              onStatus={(status) => setStatus.mutate({ id: r.id, status })}
            />
          ))}
        </Card>
      )}
      {editing && tenantId && (
        <BookingDialog
          booking={editing === 'new' ? null : editing}
          day={day}
          time={editing === 'new' ? '20:00' : localParts(editing.starts_at, tz).time}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function BookingRow({
  r,
  time,
  manage,
  onEdit,
  onStatus,
}: {
  r: Reservation
  time: string
  manage: boolean
  onEdit: () => void
  onStatus: (s: string) => void
}) {
  const meta = statusMeta[r.status]
  const actions: [string, string, 'default' | 'secondary' | 'ghost'][] =
    r.status === 'requested'
      ? [
          ['confirmed', 'Confirm', 'default'],
          ['cancelled', 'Decline', 'ghost'],
        ]
      : r.status === 'confirmed'
        ? [
            ['seated', 'Seat', 'default'],
            ['no_show', 'No-show', 'ghost'],
            ['cancelled', 'Cancel', 'ghost'],
          ]
        : r.status === 'seated'
          ? [['completed', 'Done', 'secondary']]
          : []
  return (
    <div
      className="grid grid-cols-[4.5rem_1fr] items-start gap-3 px-4 py-3 sm:grid-cols-[5rem_1fr_auto]"
      data-testid={`booking-${r.name}`}
    >
      <div className="font-semibold tabular-nums">{time12(time)}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {manage ? (
            <button
              type="button"
              className="font-medium hover:text-link hover:underline"
              onClick={onEdit}
            >
              {r.name}
            </button>
          ) : (
            <span className="font-medium">{r.name}</span>
          )}
          <span className="text-sm text-muted-foreground">· {r.party_size} guests</span>
          <Badge variant={meta.badge}>{meta.label}</Badge>
          {r.tables && <Badge variant="neutral">Table {r.tables.label}</Badge>}
          {r.source === 'online' && <span className="text-xs text-muted-foreground">online</span>}
        </div>
        <div className="mt-0.5 text-[13px] text-muted-foreground">
          {r.phone && (
            <a className="text-link hover:underline" href={`tel:${r.phone}`}>
              {r.phone}
            </a>
          )}
          {r.notes && <span> · {r.notes}</span>}
          {r.cancel_reason && <span> · {r.cancel_reason}</span>}
        </div>
      </div>
      {manage && actions.length > 0 && (
        <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:justify-end">
          {actions.map(([s, label, variant]) => (
            <Button key={s} size="sm" variant={variant} onClick={() => onStatus(s)}>
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function BookingDialog({
  booking,
  day,
  time,
  onClose,
}: {
  booking: Reservation | null
  day: string
  time: string
  onClose: () => void
}) {
  const { branchId } = useTenant()
  const tables = (useFloor(branchId).data?.tables ?? []).filter((t) => t.is_active)
  const [f, setF] = useState({
    date: day,
    time,
    party_size: String(booking?.party_size ?? 2),
    name: booking?.name ?? '',
    phone: booking?.phone ?? '',
    table_id: booking?.table_id ?? '',
    notes: booking?.notes ?? '',
  })
  const save = useReservationAction(
    () =>
      rpc('save_reservation', {
        p: { ...f, id: booking?.id, branch_id: branchId, party_size: Number(f.party_size) },
      }),
    booking ? 'Booking saved' : 'Booking added',
  )
  const ok = f.name.trim() && Number(f.party_size) >= 1 && f.date && /^\d{2}:\d{2}$/.test(f.time)
  const input = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}) => (
    <Field id={`bk-${k}`} label={label}>
      <Input
        id={`bk-${k}`}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        {...props}
      />
    </Field>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{booking ? 'Edit booking' : 'New booking'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {input('date', 'Date', { type: 'date' })}
          {input('time', 'Time', { type: 'time', step: 900 })}
          {input('name', 'Guest name')}
          {input('phone', 'Phone', { inputMode: 'tel' })}
          {input('party_size', 'Guests', { inputMode: 'numeric' })}
          <Field id="bk-table" label="Table">
            <NativeSelect
              id="bk-table"
              value={f.table_id}
              onChange={(e) => setF({ ...f, table_id: e.target.value })}
            >
              <option value="">Not assigned</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.seats} seats)
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="sm:col-span-2">{input('notes', 'Notes')}</div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ok || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            {booking ? 'Save booking' : 'Add booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

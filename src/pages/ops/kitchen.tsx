import { ChefHat, Flag, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { StationLayout } from '@/components/layout/station-layout'
import { kitchenTicketBytes } from '@/features/printing/documents'
import { print } from '@/features/printing/printer'
import { PrinterSetupButton } from '@/features/printing/printer-setup'
import { usePrinterSettings } from '@/features/printing/use-printer'
import { RequirePerm } from '@/components/require-perm'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ticketNext,
  useLiveTickets,
  useTicketPriority,
  useTickets,
  useUpdateTicket,
  type Ticket,
} from '@/features/kitchen/api'
import { useMenu } from '@/features/menu/api'
import { hasFeature } from '@/features/platform/features'
import { useTenantAccess } from '@/features/platform/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { ChooseBranch } from '@/pages/app/tables'
import { errorMessage } from '@/lib/errors'
import { useNewArrivals, useSound } from '@/lib/sound'
import { minutesSince, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'

const NONE = 'none'

export function KitchenPage() {
  const { branch, tenantId } = useTenant()
  const access = useTenantAccess(tenantId)
  if (access.data && !hasFeature(access.data.features, 'kds')) {
    return (
      <StationLayout title="Kitchen display">
        <main className="grid flex-1 place-items-center p-6">
          <EmptyState
            icon={ChefHat}
            title="The kitchen display isn't in your plan"
            description="Upgrade to Professional to send orders to kitchen screens by station, with timers and sound alerts."
            action={
              <Button asChild>
                <Link to="/app/settings?tab=plan">See plans</Link>
              </Button>
            }
          />
        </main>
      </StationLayout>
    )
  }
  return (
    <RequirePerm any={['kitchen.view']}>
      <KitchenScreen key={branch?.id ?? 'all'} />
    </RequirePerm>
  )
}

function readStation() {
  try {
    return localStorage.getItem('edgex-kds-station') ?? 'all'
  } catch {
    return 'all'
  }
}

function KitchenScreen() {
  const { tenantId, branchId, branch, can } = useTenant()
  const tickets = useTickets(tenantId, branchId)
  const menu = useMenu(tenantId)
  useLiveTickets(tenantId)
  const now = useNow(15_000)
  const sound = useSound('kds')
  const printer = usePrinterSettings()
  const [station, setStation] = useState<string>(readStation)
  const [showDone, setShowDone] = useState(false)

  const pickStation = (s: string) => {
    setStation(s)
    try {
      localStorage.setItem('edgex-kds-station', s)
    } catch {
      /* ignore */
    }
  }

  const matches = (t: Ticket) =>
    station === 'all' || (station === NONE ? !t.station_id : t.station_id === station)
  const all = tickets.data ?? []
  const active = useMemo(
    () =>
      all
        .filter((t) => t.status !== 'ready' && matches(t))
        .sort(
          (a, b) =>
            Number(b.priority) - Number(a.priority) || a.created_at.localeCompare(b.created_at),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, station],
  )
  const done = all
    .filter((t) => t.status === 'ready' && matches(t))
    .sort((a, b) => (b.ready_at ?? '').localeCompare(a.ready_at ?? ''))

  useNewArrivals(
    all.filter((t) => t.status === 'new'),
    (fresh) => {
      if (fresh.some(matches)) sound.play('newTicket')
      if (printer.transport && printer.autoKitchen) {
        void (async () => {
          for (const t of fresh.filter(matches)) {
            await print(
              kitchenTicketBytes(t, {
                columns: printer.columns,
                station: t.station_id ? stationName(t.station_id) : undefined,
              }),
              printer,
            ).catch(() => toast.error(`Could not print ticket #${t.orders.order_number}`))
          }
        })()
      }
    },
  )

  const stations = menu.data?.stations ?? []
  const hasUnassigned = all.some((t) => !t.station_id)
  const stationName = (id: string | null) =>
    id ? (stations.find((s) => s.id === id)?.name ?? 'Station') : 'Unassigned'

  return (
    <StationLayout
      title="Kitchen display"
      subtitle={branch?.name}
      fullscreen
      actions={
        <>
          <PrinterSetupButton kitchen />
          <Button
            variant={sound.enabled ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => sound.enable(!sound.enabled)}
            aria-pressed={sound.enabled}
          >
            {sound.enabled ? <Volume2 /> : <VolumeX />}
            <span className="hidden sm:inline">{sound.enabled ? 'Sound on' : 'Sound off'}</span>
          </Button>
        </>
      }
    >
      {!branchId ? (
        <main className="p-6">
          <ChooseBranch what="Kitchen screens" />
        </main>
      ) : (
        <main className="flex flex-1 flex-col">
          {sound.needsTap && (
            <p className="bg-warning-soft px-4 py-2 text-center text-[13px] font-medium text-warning">
              Tap anywhere to turn on sound alerts.
            </p>
          )}
          <nav
            className="flex gap-2 overflow-x-auto border-b px-3 py-2 sm:px-4"
            aria-label="Stations"
          >
            {[
              { id: 'all', name: 'All stations' },
              ...stations.map((s) => ({ id: s.id, name: s.name })),
              ...(hasUnassigned ? [{ id: NONE, name: 'Unassigned' }] : []),
            ].map((s) => {
              const count = all.filter(
                (t) =>
                  t.status !== 'ready' &&
                  (s.id === 'all' || (s.id === NONE ? !t.station_id : t.station_id === s.id)),
              ).length
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={station === s.id}
                  onClick={() => pickStation(s.id)}
                  className={cn(
                    'flex h-10 shrink-0 items-center gap-2 rounded-md border px-3.5 text-sm font-medium',
                    station === s.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-card',
                  )}
                >
                  {s.name}
                  <span
                    className={cn(
                      'rounded-sm px-1.5 text-xs tabular-nums',
                      station === s.id ? 'bg-primary-foreground/20' : 'bg-muted',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </nav>

          {tickets.isPending ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : active.length === 0 ? (
            <div className="grid flex-1 place-items-center p-6">
              <EmptyState
                icon={ChefHat}
                title="No tickets right now"
                description="New orders appear here the moment they are placed."
              />
            </div>
          ) : (
            <div className="grid flex-1 content-start gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
              {active.map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  now={now}
                  stationName={station === 'all' ? stationName(t.station_id) : undefined}
                  canUpdate={can('kitchen.update')}
                />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <section className="border-t bg-card">
              <button
                type="button"
                onClick={() => setShowDone(!showDone)}
                className="w-full px-4 py-2 text-left text-[13px] font-medium text-muted-foreground"
              >
                Ready in the last 30 min · {done.length} {showDone ? '▾' : '▸'}
              </button>
              {showDone && <DoneStrip tickets={done} canUpdate={can('kitchen.update')} />}
            </section>
          )}
        </main>
      )}
    </StationLayout>
  )
}

function TicketCard({
  ticket: t,
  now,
  stationName,
  canUpdate,
}: {
  ticket: Ticket
  now: number
  stationName?: string
  canUpdate: boolean
}) {
  const update = useUpdateTicket()
  const priority = useTicketPriority()
  const mins = minutesSince(t.created_at, now)
  const urgency = mins >= 15 ? 'late' : mins >= 8 ? 'warn' : 'ok'
  const items = t.orders.order_items.filter(
    (i) => (i.kitchen_station_id ?? null) === (t.station_id ?? null) && i.status !== 'cancelled',
  )
  const next = ticketNext[t.status]

  return (
    <article
      data-testid={`ticket-${t.orders.order_number}`}
      className={cn(
        'flex flex-col rounded-lg border-2 bg-card',
        t.priority
          ? 'border-destructive'
          : urgency === 'late'
            ? 'border-destructive/60'
            : urgency === 'warn'
              ? 'border-warning/70'
              : 'border-border',
      )}
    >
      <header
        className={cn(
          'flex items-start justify-between gap-2 rounded-t-md px-3 py-2',
          t.status === 'new'
            ? 'bg-warning-soft'
            : t.status === 'preparing'
              ? 'bg-info-soft'
              : 'bg-muted',
        )}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-semibold">#{t.orders.order_number}</span>
            <span className="font-semibold">
              {t.orders.tables
                ? t.orders.tables.label
                : t.orders.type === 'takeaway'
                  ? 'Takeaway'
                  : 'Delivery'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {stationName && `${stationName} · `}
            {t.status === 'new' ? 'New' : t.status === 'accepted' ? 'Accepted' : 'Preparing'}
          </div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              'font-mono text-lg font-semibold tabular-nums',
              urgency === 'late' ? 'text-destructive' : urgency === 'warn' ? 'text-warning' : '',
            )}
            aria-label={`${mins} minutes waiting`}
          >
            {mins}′
          </div>
          {t.priority && (
            <span className="rounded-sm bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground uppercase">
              Rush
            </span>
          )}
        </div>
      </header>

      <ul className="grid flex-1 content-start gap-2 px-3 py-3">
        {items.map((i) => (
          <li key={i.id} className="text-[15px] leading-snug">
            <span className="font-semibold tabular-nums">{i.quantity}×</span>{' '}
            <span className="font-medium">{i.name}</span>
            {i.variant_name && <span className="font-medium"> ({i.variant_name})</span>}
            {i.order_item_modifiers.length > 0 && (
              <div className="pl-6 text-[13px] text-muted-foreground">
                + {i.order_item_modifiers.map((m) => m.name).join(', ')}
              </div>
            )}
            {i.notes && (
              <div className="pl-6 text-[13px] font-medium text-warning">⚠ {i.notes}</div>
            )}
          </li>
        ))}
        {t.orders.notes && (
          <li className="rounded-sm bg-warning-soft px-2 py-1 text-[13px] font-medium text-warning">
            Order note: {t.orders.notes}
          </li>
        )}
      </ul>

      {canUpdate && (
        <footer className="flex gap-2 border-t p-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-12', t.priority && 'text-destructive')}
            aria-label={t.priority ? 'Remove rush' : 'Mark as rush'}
            aria-pressed={t.priority}
            onClick={() => priority.mutate({ id: t.id, priority: !t.priority })}
          >
            <Flag />
          </Button>
          {next && (
            <Button
              size="touch"
              className={cn(
                'flex-1',
                next.to === 'ready' && 'bg-success text-success-foreground hover:bg-success/90',
              )}
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: t.id, status: next.to },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              {next.label}
            </Button>
          )}
          {t.status !== 'preparing' && (
            <Button
              size="touch"
              variant="secondary"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: t.id, status: 'ready' },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              Ready
            </Button>
          )}
        </footer>
      )}
    </article>
  )
}

function DoneStrip({ tickets, canUpdate }: { tickets: Ticket[]; canUpdate: boolean }) {
  const update = useUpdateTicket()
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pb-3 sm:px-4">
      {tickets.map((t) => (
        <div
          key={t.id}
          className="flex shrink-0 items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success"
        >
          <span className="font-mono font-semibold">#{t.orders.order_number}</span>
          {t.orders.tables && <span>{t.orders.tables.label}</span>}
          {canUpdate && t.orders.status !== 'served' && (
            <button
              type="button"
              className="ml-1 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:text-foreground hover:underline"
              onClick={() =>
                update.mutate(
                  { id: t.id, status: 'preparing' },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              <RotateCcw className="size-3" /> Recall
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

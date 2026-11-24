import { ArrowDownRight, ArrowUpRight, ChartColumn, FileSpreadsheet, FileText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTenantAccess } from '@/features/platform/api'
import { ProfitLossCard } from '@/features/inventory/profit-loss'
import { hasFeature } from '@/features/platform/features'
import { useSalesReport, type SalesReport } from '@/features/reports/api'
import { ChartCard, ColumnChart, RankChart } from '@/features/reports/charts'
import { change, PRESETS, presetRange, shortDay, type PresetKey } from '@/features/reports/dates'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { cn, formatMoney } from '@/lib/utils'

export function ReportsPage() {
  const { tenantId } = useTenant()
  const access = useTenantAccess(tenantId)
  if (access.data && !hasFeature(access.data.features, 'reports')) {
    return (
      <>
        <PageHeader title="Reports" />
        <EmptyState
          icon={ChartColumn}
          title="Reports aren't in your plan"
          description="Upgrade to see sales by day and hour, best sellers, staff and kitchen performance, and export to Excel or PDF."
          action={
            <Button asChild>
              <Link to="/app/settings?tab=plan">See plans</Link>
            </Button>
          }
        />
      </>
    )
  }
  return (
    <RequirePerm any={['reports.view']}>
      <Reports />
    </RequirePerm>
  )
}

const methodName: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  wallet: 'Wallet',
  bank_transfer: 'Bank / Raast',
}
const sourceName: Record<string, string> = {
  qr: 'QR menu',
  waiter: 'Waiter',
  pos: 'POS',
  online: 'Online',
}

function Reports() {
  const { tenantId, branchId, branch, membership, can } = useTenant()
  const access = useTenantAccess(tenantId)
  const [preset, setPreset] = useState<PresetKey | 'custom'>('7d')
  const tz = membership?.tenants.timezone
  const [range, setRange] = useState(() => presetRange('7d', new Date(), tz))
  const report = useSalesReport(tenantId, branchId, range.from, range.to)
  const r = report.data
  const currency = r?.currency ?? membership?.tenants.currency ?? 'PKR'
  const money = (m: number) => formatMoney(m, currency)
  const compact = (m: number) =>
    new Intl.NumberFormat('en-PK', { notation: 'compact', maximumFractionDigits: 1 }).format(
      m / 100,
    )
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const meta = {
    restaurant: membership?.tenants.name ?? 'Restaurant',
    branch: branch?.name ?? 'All branches',
    ...range,
  }

  const doExport = async (kind: 'xlsx' | 'pdf') => {
    if (!r) return
    setExporting(kind)
    try {
      const mod = await import('@/features/reports/export')
      await (kind === 'xlsx' ? mod.exportExcel(r, meta) : mod.exportPdf(r, meta))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${branch?.name ?? 'All branches'} · business days, net of discounts and refunds.`}
        actions={
          can('reports.export') &&
          r && (
            <>
              <Button variant="secondary" disabled={!!exporting} onClick={() => doExport('xlsx')}>
                <FileSpreadsheet /> {exporting === 'xlsx' ? 'Preparing…' : 'Excel'}
              </Button>
              <Button variant="secondary" disabled={!!exporting} onClick={() => doExport('pdf')}>
                <FileText /> {exporting === 'pdf' ? 'Preparing…' : 'PDF'}
              </Button>
            </>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={preset === p.key}
            onClick={() => (setPreset(p.key), setRange(presetRange(p.key, new Date(), tz)))}
            className={cn(
              'h-8 rounded-md border px-3 text-[13px]',
              preset === p.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-accent',
            )}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 text-[13px]">
          <Input
            type="date"
            aria-label="From"
            className="h-8 w-[9.5rem]"
            value={range.from}
            max={range.to}
            onChange={(e) =>
              e.target.value && (setPreset('custom'), setRange({ ...range, from: e.target.value }))
            }
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            className="h-8 w-[9.5rem]"
            value={range.to}
            min={range.from}
            onChange={(e) =>
              e.target.value && (setPreset('custom'), setRange({ ...range, to: e.target.value }))
            }
          />
        </div>
      </div>

      {report.error && (
        <Alert variant="destructive" className="mb-4">
          {errorMessage(report.error)}
        </Alert>
      )}

      {!r ? (
        report.isPending && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-72" />
          </div>
        )
      ) : (
        <>
          <ReportBody r={r} money={money} compact={compact} />
          {hasFeature(access.data?.features, 'inventory') && (
            <div className="mt-4">
              <ProfitLossCard
                tenantId={tenantId}
                branchId={branchId}
                from={range.from}
                to={range.to}
                currency={currency}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}

function Kpi({
  label,
  value,
  current,
  previous,
  hint,
}: {
  label: string
  value: string
  current?: number
  previous?: number
  hint?: string
}) {
  const pct = current !== undefined && previous !== undefined ? change(current, previous) : null
  return (
    <Card className="px-4 py-3.5" data-testid={`kpi-${label}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        {pct !== null ? (
          <>
            <span
              className={cn(
                'inline-flex items-center font-medium',
                pct >= 0 ? 'text-success' : 'text-destructive',
              )}
            >
              {pct >= 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(pct)}%
            </span>
            vs previous period
          </>
        ) : (
          (hint ?? 'No earlier data to compare')
        )}
      </div>
    </Card>
  )
}

function ReportBody({
  r,
  money,
  compact,
}: {
  r: SalesReport
  money: (m: number) => string
  compact: (m: number) => string
}) {
  const t = r.totals
  // Show the span from the first to the last hour with orders (quiet hours in between stay visible).
  const busy = r.hourly.filter((h) => h.orders > 0).map((h) => h.hour)
  const hourly = busy.length
    ? r.hourly.filter((h) => h.hour >= Math.min(...busy) && h.hour <= Math.max(...busy))
    : []
  const mins = (s: number | null) =>
    s === null ? '—' : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Net sales"
          value={money(t.net_sales_minor)}
          current={t.net_sales_minor}
          previous={t.prev_net_sales_minor}
        />
        <Kpi
          label="Orders"
          value={t.orders.toLocaleString()}
          current={t.orders}
          previous={t.prev_orders}
        />
        <Kpi
          label="Average bill"
          value={money(t.avg_bill_minor)}
          current={t.avg_bill_minor}
          previous={t.prev_avg_bill_minor}
        />
        <Kpi
          label="Tax collected"
          value={money(t.tax_minor)}
          hint={`${money(t.collected_minor)} collected in total`}
        />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        <span>Discounts {money(t.discounts_minor)}</span>
        <span>Refunds {money(t.refunds_minor)}</span>
        <span>Cancelled orders {t.cancelled_orders}</span>
        <span>
          Guest requests {r.requests.count} · avg response {mins(r.requests.avg_response_seconds)}
        </span>
      </div>

      <ChartCard
        title="Net sales by day"
        rows={r.daily}
        columns={[
          { key: 'd', label: 'Date', render: (d) => d.date },
          { key: 's', label: 'Net sales', align: 'right', render: (d) => money(d.net_sales_minor) },
          { key: 'o', label: 'Orders', align: 'right', render: (d) => d.orders },
        ]}
      >
        <ColumnChart
          data={r.daily}
          y="net_sales_minor"
          xLabel={(d) => (r.daily.length > 1 ? shortDay(d.date) : d.date)}
          yLabel="Net sales"
          formatY={money}
          formatYAxis={compact}
          tooltipTitle={(d) =>
            `${new Date(d.date + 'T00:00').toLocaleDateString(undefined, { dateStyle: 'full' })} · ${d.orders} orders`
          }
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Busiest hours"
          description="Orders placed, by hour of day"
          rows={r.hourly.filter((h) => h.orders > 0)}
          columns={[
            { key: 'h', label: 'Hour', render: (h) => `${String(h.hour).padStart(2, '0')}:00` },
            { key: 'o', label: 'Orders', align: 'right', render: (h) => h.orders },
          ]}
        >
          <ColumnChart
            data={hourly}

            y="orders"
            xLabel={(h) => `${h.hour}`}
            yLabel="Orders"
            formatY={(v) => v.toLocaleString()}
            tooltipTitle={(h) =>
              `${String(h.hour).padStart(2, '0')}:00 – ${String(h.hour + 1).padStart(2, '0')}:00`
            }
          />
        </ChartCard>
        <ChartCard
          title="Best sellers"
          description="By revenue"
          rows={r.top_items}
          columns={[
            { key: 'n', label: 'Item', render: (i) => i.name },
            { key: 'q', label: 'Sold', align: 'right', render: (i) => i.quantity },
            { key: 'r', label: 'Revenue', align: 'right', render: (i) => money(i.revenue_minor) },
          ]}
        >
          <RankChart
            data={r.top_items}
            label={(i) => `${i.name} ×${i.quantity}`}
            value={(i) => i.revenue_minor}
            formatValue={money}
            valueLabel="Revenue"
          />
        </ChartCard>
        <ChartCard
          title="Sales by category"
          rows={r.categories}
          columns={[
            { key: 'n', label: 'Category', render: (c) => c.name },
            { key: 'q', label: 'Items', align: 'right', render: (c) => c.quantity },
            { key: 'r', label: 'Revenue', align: 'right', render: (c) => money(c.revenue_minor) },
          ]}
        >
          <RankChart
            data={r.categories}
            label={(c) => c.name}
            value={(c) => c.revenue_minor}
            formatValue={money}
            valueLabel="Revenue"
          />
        </ChartCard>
        <ChartCard
          title="Payment methods"
          description="Amount collected incl. tax"
          rows={r.payment_methods}
          columns={[
            { key: 'm', label: 'Method', render: (p) => methodName[p.method] },
            { key: 'n', label: 'Payments', align: 'right', render: (p) => p.payments },
            { key: 'a', label: 'Amount', align: 'right', render: (p) => money(p.amount_minor) },
            { key: 't', label: 'Tax', align: 'right', render: (p) => money(p.tax_minor) },
          ]}
        >
          <RankChart
            data={r.payment_methods}
            label={(p) => `${methodName[p.method]} (${p.payments})`}
            value={(p) => p.amount_minor}
            formatValue={money}
            valueLabel="Amount"
          />
        </ChartCard>
        <ChartCard
          title="Where orders come from"
          rows={r.sources}
          columns={[
            { key: 's', label: 'Source', render: (s) => sourceName[s.source] },
            { key: 't', label: 'Type', render: (s) => s.type.replace('_', '-') },
            { key: 'o', label: 'Orders', align: 'right', render: (s) => s.orders },
            { key: 'v', label: 'Value', align: 'right', render: (s) => money(s.value_minor) },
          ]}
        >
          <RankChart
            data={r.sources}
            label={(s) => `${sourceName[s.source]} · ${s.type.replace('_', '-')}`}
            value={(s) => s.orders}
            formatValue={(v) => `${v} orders`}
            valueLabel="Orders"
          />
        </ChartCard>
        {r.branches.length > 1 && (
          <ChartCard
            title="Branches"
            rows={r.branches}
            columns={[
              { key: 'n', label: 'Branch', render: (b) => b.name },
              {
                key: 's',
                label: 'Net sales',
                align: 'right',
                render: (b) => money(b.net_sales_minor),
              },
              { key: 'o', label: 'Orders', align: 'right', render: (b) => b.orders },
            ]}
          >
            <RankChart
              data={r.branches}
              label={(b) => b.name}
              value={(b) => b.net_sales_minor}
              formatValue={money}
              valueLabel="Net sales"
            />
          </ChartCard>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <h3 className="px-5 pt-4 pb-2 text-[15px] font-semibold">Staff</h3>
          {r.staff.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              No staff activity in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Sales taken</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Avg response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.staff.map((s) => (
                  <TableRow key={s.email}>
                    <TableCell>{s.name || s.email}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(s.net_sales_minor)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.orders_taken}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.requests_handled}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {mins(s.avg_response_seconds)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card className="min-w-0">
          <h3 className="px-5 pt-4 pb-2 text-[15px] font-semibold">Kitchen speed</h3>
          {r.kitchen.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              No kitchen tickets completed in this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Station</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead className="text-right">Cooking</TableHead>
                  <TableHead className="text-right">Order → ready</TableHead>
                  <TableHead className="text-right">Over 20 min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.kitchen.map((k) => (
                  <TableRow key={k.station}>
                    <TableCell>{k.station}</TableCell>
                    <TableCell className="text-right tabular-nums">{k.tickets}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.avg_cook_minutes ?? '—'} min
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {k.avg_total_minutes ?? '—'} min
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        k.over_20_minutes > 0 && 'font-medium text-warning',
                      )}
                    >
                      {k.over_20_minutes}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  )
}

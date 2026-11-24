import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, Check, Circle } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { fmtQty, useLowStock } from '@/features/inventory/api'
import { useTenantAccess } from '@/features/platform/api'
import { hasFeature } from '@/features/platform/features'
import { useDashboardToday } from '@/features/reports/api'
import { change } from '@/features/reports/dates'
import { useMembers } from '@/features/staff/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { supabase } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'

/** Which setup steps have real data behind them (head-only counts). */
function useSetupProgress(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['setup-progress', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const count = async (table: 'products' | 'tables' | 'kitchen_stations' | 'payments') => {
        const { count: n } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!)
        return (n ?? 0) > 0
      }
      const [menu, tables, stations, payments] = await Promise.all([
        count('products'),
        count('tables'),
        count('kitchen_stations'),
        count('payments'),
      ])
      return { menu, tables, stations, payments }
    },
  })
}

export function OverviewPage() {
  const { membership, tenantId, branches, branchId, can } = useTenant()
  const today = useDashboardToday(tenantId, branchId, can('dashboard.view'))
  const currency = membership?.tenants.currency ?? 'PKR'
  const d = today.data
  const salesChange = d ? change(d.net_sales_minor, d.yesterday_net_sales_minor) : null
  const kpis = [
    {
      label: 'Net sales today',
      value: d ? formatMoney(d.net_sales_minor, currency) : '—',
      hint:
        salesChange === null
          ? 'Before tax'
          : `${salesChange >= 0 ? '+' : ''}${salesChange}% vs yesterday`,
    },
    {
      label: 'Orders today',
      value: d ? d.orders.toLocaleString() : '—',
      hint: 'Not counting cancelled',
    },
    {
      label: 'Open tables',
      value: d ? String(d.open_tables) : '—',
      hint: 'Tables with guests now',
    },
    {
      label: 'Avg. ticket time',
      value: d?.avg_ticket_minutes != null ? `${d.avg_ticket_minutes} min` : '—',
      hint: 'Order to ready, today',
    },
  ]
  const members = useMembers(can('staff.view') ? tenantId : undefined)
  const progress = useSetupProgress(tenantId).data
  const access = useTenantAccess(tenantId)
  const low = useLowStock(
    tenantId,
    branchId,
    can('inventory.view') && hasFeature(access.data?.features, 'inventory'),
  ).data
  const setupSteps = [
    {
      label: 'Create your restaurant and first branch',
      done: branches.length > 0,
      phase: 'Phase 1',
      to: '/app/settings',
    },
    {
      label: 'Invite your team',
      done: (members.data?.length ?? 0) > 1,
      phase: 'Phase 1',
      to: '/app/staff',
    },
    { label: 'Add your menu', done: !!progress?.menu, phase: 'Menu', to: '/app/menu' },
    {
      label: 'Add tables and print QR codes',
      done: !!progress?.tables,
      phase: 'Tables',
      to: '/app/tables',
    },
    {
      label: 'Set up kitchen stations',
      done: !!progress?.stations,
      phase: 'Menu',
      to: '/app/menu',
    },
    { label: 'Take your first payment', done: !!progress?.payments, phase: 'POS' },
  ]
  const doneCount = setupSteps.filter((s) => s.done).length

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${membership?.tenants.name} · today across your branches.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can('dashboard.view') &&
          kpis.map((k) => (
            <Card key={k.label} className="px-4 py-3.5" data-testid={`today-${k.label}`}>
              <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
            </Card>
          ))}
      </div>

      {low && low.length > 0 && (
        <Card className="mt-6 border-warning/40" data-testid="low-stock">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" /> Low on stock
              </CardTitle>
              <CardDescription>
                {low.length} {low.length === 1 ? 'item is' : 'items are'} at or below the reorder
                level.
              </CardDescription>
            </div>
            <Link to="/app/inventory" className="text-sm text-link hover:underline">
              Open inventory
            </Link>
          </CardHeader>
          <CardContent className="pb-4">
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {low.slice(0, 8).map((i) => (
                <li key={`${i.branch_id}-${i.item_id}`} className="flex justify-between gap-3">
                  <span>
                    {i.name}
                    {!branchId && <span className="text-muted-foreground"> · {i.branch}</span>}
                  </span>
                  <span className="text-warning tabular-nums">
                    {fmtQty(i.quantity, i.unit)}
                    <span className="text-muted-foreground"> / {fmtQty(i.reorder_level)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Get your restaurant running</CardTitle>
            <CardDescription>
              {doneCount} of {setupSteps.length} steps complete
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          <ol className="divide-y">
            {setupSteps.map((step) => (
              <li key={step.label} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border',
                    step.done && 'border-success bg-success text-white',
                  )}
                >
                  {step.done ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : (
                    <Circle className="size-2 fill-current text-border" />
                  )}
                </span>
                <span className={cn('flex-1', step.done && 'text-muted-foreground line-through')}>
                  {step.to && !step.done ? (
                    <Link
                      to={step.to}
                      className="inline-flex items-center gap-1 hover:text-link hover:underline"
                    >
                      {step.label} <ArrowUpRight className="size-3.5" />
                    </Link>
                  ) : (
                    step.label
                  )}
                </span>
                <Badge variant={step.done ? 'success' : 'neutral'}>
                  {step.done ? 'Done' : step.phase}
                </Badge>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  )
}

import { Check } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSubscription } from '@/features/tenant/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { cn, daysUntil, formatMoney } from '@/lib/utils'
import {
  FEATURES,
  useInvoices,
  usePlans,
  useRequestPlanChange,
  useTenantAccess,
  type Limits,
} from './api'

export function PlanTab() {
  const { tenantId, can } = useTenant()
  const sub = useSubscription(tenantId)
  const access = useTenantAccess(tenantId)
  const plans = usePlans()
  const invoices = useInvoices(can('billing.manage') ? tenantId : undefined)
  const request = useRequestPlanChange(tenantId)
  const navigate = useNavigate()
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')
  const current = sub.data
  const ends = access.data?.ends_at
  const left = ends ? daysUntil(ends) : null
  const activePlans = (plans.data ?? []).filter((p) => p.is_active)

  return (
    <div className="grid gap-6">
      {current && (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
          <div>
            <div className="text-xs text-muted-foreground">Current plan</div>
            <div className="text-lg font-semibold">{current.subscription_plans.name}</div>
          </div>
          <Badge
            variant={
              access.data?.access === 'read_only'
                ? 'destructive'
                : current.status === 'trialing'
                  ? 'warning'
                  : 'success'
            }
          >
            {access.data?.access === 'read_only'
              ? 'Ended'
              : current.status === 'trialing'
                ? 'Free trial'
                : 'Active'}
          </Badge>
          {ends && (
            <div className="text-[13px] text-muted-foreground">
              {access.data?.access === 'read_only'
                ? 'Ended'
                : current.status === 'trialing'
                  ? 'Trial ends'
                  : 'Paid until'}{' '}
              {new Date(ends).toLocaleDateString()}
              {left !== null &&
                access.data?.access !== 'read_only' &&
                ` · ${left} day${left === 1 ? '' : 's'} left`}
            </div>
          )}
        </Card>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-semibold">Plans</h3>
          <div className="flex rounded-md border p-0.5 text-[13px]">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  'rounded-sm px-3 py-1',
                  cycle === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {c === 'monthly' ? 'Monthly' : 'Yearly · 2 months free'}
              </button>
            ))}
          </div>
        </div>
        {request.error && (
          <Alert variant="destructive" className="mb-3">
            {errorMessage(request.error)}
          </Alert>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {activePlans.map((p) => {
            const isCurrent = current?.plan_id === p.id
            const limits = p.limits as Limits
            const price = cycle === 'monthly' ? p.price_monthly_minor : p.price_yearly_minor
            return (
              <Card
                key={p.id}
                className={cn('flex flex-col p-5', isCurrent && 'border-2 border-primary')}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{p.name}</h4>
                  {isCurrent && <Badge variant="info">Current</Badge>}
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">{p.description}</p>
                <div className="mt-4 text-2xl font-semibold tabular-nums">
                  {formatMoney(price, p.currency)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}
                    / {cycle === 'monthly' ? 'month' : 'year'}
                  </span>
                </div>
                <ul className="mt-4 grid flex-1 content-start gap-1.5 text-[13px]">
                  <li>
                    {limits.branches ?? 'Unlimited'} branch{limits.branches === 1 ? '' : 'es'}
                  </li>
                  <li>
                    {limits.tables ?? 'Unlimited'} tables · {limits.staff ?? 'unlimited'} staff
                  </li>
                  {FEATURES.filter((f) => p.features.includes(f.key)).map((f) => (
                    <li key={f.key} className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success" /> {f.label}
                    </li>
                  ))}
                </ul>
                {can('billing.manage') && (
                  <Button
                    className="mt-5"
                    variant={isCurrent ? 'secondary' : 'default'}
                    disabled={request.isPending}
                    onClick={() =>
                      request.mutate(
                        { planId: p.id, cycle },
                        {
                          onSuccess: () => {
                            toast.success("Request sent. We'll confirm payment details with you.")
                            navigate('/app/support')
                          },
                        },
                      )
                    }
                  >
                    {isCurrent ? 'Renew this plan' : `Switch to ${p.name}`}
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Payment by bank transfer or Raast for now; the EdgeX team confirms and activates your
          plan. Card and wallet payments are coming.
        </p>
      </section>

      {can('billing.manage') && (invoices.data?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 text-[15px] font-semibold">Payment history</h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Covers until</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.data!.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {i.subscription_plans?.name} · {i.billing_cycle}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.method}
                      {i.reference && ` · ${i.reference}`}
                    </TableCell>
                    <TableCell>{new Date(i.period_end).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(i.amount_minor, i.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}
    </div>
  )
}

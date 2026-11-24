import {
  Building2,
  Inbox,
  LayoutGrid,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { toast } from 'sonner'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { MoneyInput } from '@/components/ui/money-input'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/ui/page-header'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { FullPageLoader } from '@/features/auth/guards'
import {
  FEATURES,
  useAdminOverview,
  useAdminTenantDetail,
  useAdminTenants,
  useIsPlatformAdmin,
  usePlans,
  usePlatformSettings,
  useRecordPayment,
  useSavePlan,
  useSetSubscription,
  useDeleteTenant,
  useSetTenantStatus,
  useTickets,
  useUpdatePlatformSettings,
  type AdminTenant,
  type Limits,
  type Plan,
} from '@/features/platform/api'
import { SupportThread } from '@/features/platform/support-thread'
import { stateBadge } from '@/features/platform/ticket-state'
import { errorMessage } from '@/lib/errors'
import { toMajorInput, toMinor } from '@/lib/money'
import { cn, formatMoney } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Layout & guard
// ---------------------------------------------------------------------------
export function AdminLayout() {
  const admin = useIsPlatformAdmin()
  if (admin.isPending) return <FullPageLoader />
  if (!admin.data) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <EmptyState
          icon={ShieldCheck}
          title="Platform admins only"
          description="This area is for the EdgeX team."
          action={
            <Button asChild variant="secondary">
              <Link to="/app">Back to my restaurant</Link>
            </Button>
          }
        />
      </div>
    )
  }
  const nav = [
    { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/admin/restaurants', label: 'Restaurants', icon: Building2 },
    { to: '/admin/plans', label: 'Plans', icon: Package },
    { to: '/admin/support', label: 'Support', icon: Inbox },
    { to: '/admin/settings', label: 'Settings', icon: Settings2 },
  ]
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2 text-white">
            <Logo inverted />
            <span className="rounded-sm bg-sidebar-highlight px-1.5 py-0.5 text-[11px] font-semibold text-sidebar uppercase">
              Platform
            </span>
          </Link>
          <nav className="flex gap-1 overflow-x-auto" aria-label="Platform">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap',
                    isActive ? 'bg-sidebar-accent text-white' : 'hover:text-white',
                  )
                }
              >
                <n.icon className="size-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 [&_button]:text-sidebar-foreground">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export function AdminOverviewPage() {
  const o = useAdminOverview()
  const d = o.data
  const stat = (label: string, value: string | number, hint?: string) => (
    <Card className="px-4 py-3.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  )
  return (
    <>
      <PageHeader title="Platform overview" description="All restaurants on EdgeX." />
      {o.error && <Alert variant="destructive">{errorMessage(o.error)}</Alert>}
      {!d ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat('Monthly recurring revenue', formatMoney(d.mrr_minor, 'PKR'), 'Active paid plans')}
          {stat(
            'Active restaurants',
            d.tenants?.active ?? 0,
            `${d.tenants?.pending ?? 0} awaiting approval · ${d.tenants?.suspended ?? 0} suspended`,
          )}
          {stat(
            'On trial',
            d.subscriptions?.trialing ?? 0,
            `${d.trials_ending_7d} ending in 7 days`,
          )}
          {stat('Paying', d.subscriptions?.active ?? 0)}
          {stat('New sign-ups', d.signups_30d, 'Last 30 days')}
          {stat('Orders processed', d.orders_30d.toLocaleString(), 'Last 30 days, all restaurants')}
          {stat('Open support requests', d.open_tickets)}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------
const accessBadge = {
  active: { label: 'Active', variant: 'success' },
  read_only: { label: 'Expired', variant: 'warning' },
  blocked: { label: 'Blocked', variant: 'destructive' },
} as const

export function AdminRestaurantsPage() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const tenants = useAdminTenants(q)
  const [open, setOpen] = useState<AdminTenant | null>(null)
  return (
    <>
      <PageHeader
        title="Restaurants"
        description="Approve, suspend, change plans and record payments."
      />
      <form
        className="mb-3 flex max-w-md gap-2"
        onSubmit={(e) => (e.preventDefault(), setQ(search.trim()))}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search restaurants"
            className="pl-8"
            placeholder="Name, web address or owner email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {tenants.error && <Alert variant="destructive">{errorMessage(tenants.error)}</Alert>}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Restaurant</TableHead>
              <TableHead className="hidden md:table-cell">Owner</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="hidden sm:table-cell">Ends</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Orders 30d</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tenants.data ?? []).map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpen(t)}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    /{t.slug} · {t.branches} branch{t.branches === 1 ? '' : 'es'} · {t.staff} staff
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {t.owner_email}
                </TableCell>
                <TableCell>
                  {t.plan_name ?? '—'}
                  {t.subscription_status === 'trialing' && (
                    <span className="text-xs text-muted-foreground"> · trial</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {t.ends_at ? new Date(t.ends_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell>
                  {t.status === 'pending' ? (
                    <Badge variant="warning">Awaiting approval</Badge>
                  ) : t.status === 'suspended' ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : (
                    <Badge variant={accessBadge[t.access].variant}>
                      {accessBadge[t.access].label}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {t.orders_30d}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {tenants.data?.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No restaurants found.</p>
        )}
      </Card>
      {open && <TenantSheet tenant={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function TenantSheet({ tenant, onClose }: { tenant: AdminTenant; onClose: () => void }) {
  const detail = useAdminTenantDetail(tenant.id)
  const plans = usePlans()
  const setStatus = useSetTenantStatus()
  const del = useDeleteTenant()
  const [deleting, setDeleting] = useState(false)
  const [confirmSlug, setConfirmSlug] = useState('')
  const setSub = useSetSubscription()
  const pay = useRecordPayment()
  const [statusDialog, setStatusDialog] = useState<'active' | 'suspended' | null>(null)
  const [reason, setReason] = useState('')
  const [planId, setPlanId] = useState('')
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Bank transfer')
  const [ref, setRef] = useState('')
  const [trialDays, setTrialDays] = useState('7')
  const d = detail.data
  const plan = plans.data?.find((p) => p.id === planId)
  const error = setStatus.error ?? setSub.error ?? pay.error

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full max-w-xl bg-background sm:max-w-xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <SheetTitle className="text-base font-semibold">{tenant.name}</SheetTitle>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-sm">
          {error && <Alert variant="destructive">{errorMessage(error)}</Alert>}
          <section className="grid grid-cols-2 gap-3">
            <Info
              label="Owner"
              value={`${tenant.owner_name ?? ''} · ${tenant.owner_email ?? ''}`}
            />
            <Info label="Signed up" value={new Date(tenant.created_at).toLocaleDateString()} />
            <Info
              label="Plan"
              value={`${tenant.plan_name ?? '—'} (${tenant.subscription_status ?? '—'})`}
            />
            <Info
              label="Ends"
              value={tenant.ends_at ? new Date(tenant.ends_at).toLocaleDateString() : '—'}
            />
            {d && (
              <>
                <Info
                  label="Menu items · tables"
                  value={`${d.usage.products} · ${d.usage.tables}`}
                />
                <Info
                  label="Last 30 days"
                  value={`${d.usage.orders_30d} orders · ${formatMoney(d.usage.sales_30d_minor, tenant.currency)}`}
                />
              </>
            )}
          </section>

          <section className="flex flex-wrap gap-2">
            {tenant.status !== 'active' && (
              <Button onClick={() => setStatusDialog('active')}>
                {tenant.status === 'pending' ? 'Approve' : 'Reactivate'}
              </Button>
            )}
            {tenant.status !== 'suspended' && (
              <Button
                variant="secondary"
                className="text-destructive"
                onClick={() => setStatusDialog('suspended')}
              >
                Suspend
              </Button>
            )}
            {tenant.status === 'suspended' && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setDeleting(true)}
              >
                Delete restaurant…
              </Button>
            )}
          </section>

          <section className="rounded-lg border p-4">
            <h3 className="mb-3 font-semibold">Record a payment</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="pay-plan" label="Plan">
                <NativeSelect
                  id="pay-plan"
                  value={planId}
                  onChange={(e) => {
                    setPlanId(e.target.value)
                    const p = plans.data?.find((x) => x.id === e.target.value)
                    if (p)
                      setAmount(
                        toMajorInput(
                          cycle === 'monthly' ? p.price_monthly_minor : p.price_yearly_minor,
                        ),
                      )
                  }}
                >
                  <option value="">Choose…</option>
                  {(plans.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="pay-cycle" label="Period">
                <NativeSelect
                  id="pay-cycle"
                  value={cycle}
                  onChange={(e) => {
                    const c = e.target.value as 'monthly' | 'yearly'
                    setCycle(c)
                    if (plan)
                      setAmount(
                        toMajorInput(
                          c === 'monthly' ? plan.price_monthly_minor : plan.price_yearly_minor,
                        ),
                      )
                  }}
                >
                  <option value="monthly">1 month</option>
                  <option value="yearly">1 year</option>
                </NativeSelect>
              </Field>
              <Field id="pay-amount" label="Amount received">
                <MoneyInput
                  id="pay-amount"
                  currency={plan?.currency ?? 'PKR'}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field id="pay-method" label="Method">
                <NativeSelect
                  id="pay-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  {['Bank transfer', 'Raast', 'JazzCash', 'Easypaisa', 'Cash', 'Complimentary'].map(
                    (m) => (
                      <option key={m}>{m}</option>
                    ),
                  )}
                </NativeSelect>
              </Field>
              <Field id="pay-ref" label="Reference">
                <Input
                  id="pay-ref"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Transaction ID"
                />
              </Field>
            </div>
            <Button
              className="mt-3"
              disabled={!planId || toMinor(amount) === null || pay.isPending}
              onClick={() =>
                pay.mutate(
                  {
                    tenantId: tenant.id,
                    planId,
                    cycle,
                    amount: toMinor(amount)!,
                    method,
                    reference: ref,
                  },
                  { onSuccess: () => (toast.success('Payment recorded, plan active'), onClose()) },
                )
              }
            >
              Record payment &amp; activate
            </Button>
          </section>

          <section className="flex flex-wrap items-end gap-2 rounded-lg border p-4">
            <Field id="trial-days" label="Extend free trial (days from today)">
              <Input
                id="trial-days"
                inputMode="numeric"
                className="w-24"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={!trialDays || setSub.isPending || !plans.data}
              onClick={() => {
                const current =
                  plans.data!.find((p) => p.name === tenant.plan_name) ??
                  plans.data!.find((p) => p.is_default_trial)!
                setSub.mutate(
                  {
                    tenantId: tenant.id,
                    planId: current.id,
                    status: 'trialing',
                    cycle: 'monthly',
                    endsAt: new Date(Date.now() + Number(trialDays) * 86_400_000).toISOString(),
                  },
                  { onSuccess: () => (toast.success('Trial extended'), onClose()) },
                )
              }}
            >
              Extend trial
            </Button>
          </section>

          {d && (
            <>
              <section>
                <h3 className="mb-2 font-semibold">Team</h3>
                <ul className="divide-y rounded-md border">
                  {d.members.map((m) => (
                    <li key={m.email} className="flex justify-between px-3 py-2">
                      <span>{m.name || m.email}</span>
                      <span className="text-muted-foreground">{m.role}</span>
                    </li>
                  ))}
                </ul>
              </section>
              {d.invoices.length > 0 && (
                <section>
                  <h3 className="mb-2 font-semibold">Payments</h3>
                  <ul className="divide-y rounded-md border">
                    {d.invoices.map((i, idx) => (
                      <li key={idx} className="flex justify-between px-3 py-2">
                        <span>
                          {new Date(i.created_at).toLocaleDateString()} · {i.method}
                          {i.reference && ` · ${i.reference}`}
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(i.amount_minor, i.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {d.history.length > 0 && (
                <section>
                  <h3 className="mb-2 font-semibold">Status history</h3>
                  <ul className="grid gap-1 text-muted-foreground">
                    {d.history.map((h, idx) => (
                      <li key={idx}>
                        {new Date(h.created_at).toLocaleString()} · {h.data.status} —{' '}
                        {h.data.reason}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {deleting && (
          <Dialog open onOpenChange={(o) => !o && setDeleting(false)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {tenant.name} permanently?</DialogTitle>
                <DialogDescription>
                  Every order, bill, payment, menu item, staff membership and setting is removed.
                  This cannot be undone. Export anything the restaurant needs first.
                </DialogDescription>
              </DialogHeader>
              {del.error && <Alert variant="destructive">{errorMessage(del.error)}</Alert>}
              <Field id="confirm-slug" label={`Type ${tenant.slug} to confirm`}>
                <Input
                  id="confirm-slug"
                  autoComplete="off"
                  value={confirmSlug}
                  onChange={(e) => setConfirmSlug(e.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button
                  variant="destructive"
                  disabled={confirmSlug.trim().toLowerCase() !== tenant.slug || del.isPending}
                  onClick={() =>
                    del.mutate(
                      { tenantId: tenant.id, slug: confirmSlug.trim() },
                      {
                        onSuccess: () => (
                          toast.success(`${tenant.name} deleted`),
                          setDeleting(false),
                          onClose()
                        ),
                      },
                    )
                  }
                >
                  Delete permanently
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {statusDialog && (
          <Dialog open onOpenChange={(o) => !o && setStatusDialog(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {statusDialog === 'suspended'
                    ? `Suspend ${tenant.name}?`
                    : `Activate ${tenant.name}?`}
                </DialogTitle>
                <DialogDescription>
                  {statusDialog === 'suspended'
                    ? 'Staff lose access immediately and guests cannot order. Data is kept.'
                    : 'The restaurant can use EdgeX right away.'}
                </DialogDescription>
              </DialogHeader>
              <Field id="status-reason" label="Reason (kept in the history)">
                <Input
                  id="status-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button
                  variant={statusDialog === 'suspended' ? 'destructive' : 'default'}
                  disabled={!reason.trim() || setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate(
                      { tenantId: tenant.id, status: statusDialog, reason },
                      {
                        onSuccess: () => (
                          toast.success(statusDialog === 'suspended' ? 'Suspended' : 'Activated'),
                          setStatusDialog(null),
                          onClose()
                        ),
                      },
                    )
                  }
                >
                  {statusDialog === 'suspended' ? 'Suspend' : 'Activate'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export function AdminPlansPage() {
  const plans = usePlans()
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)
  return (
    <>
      <PageHeader
        title="Plans"
        description="Prices, limits and features. Changes apply to everyone on the plan."
        actions={<Button onClick={() => setEditing('new')}>New plan</Button>}
      />
      <div className="grid gap-3 md:grid-cols-3">
        {(plans.data ?? []).map((p) => {
          const l = p.limits as Limits
          return (
            <Card key={p.id} className={cn('p-5', !p.is_active && 'opacity-60')}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <div className="flex gap-1">
                  {p.is_default_trial && <Badge variant="info">Trial plan</Badge>}
                  {!p.is_active && <Badge>Hidden</Badge>}
                </div>
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums">
                {formatMoney(p.price_monthly_minor, p.currency)}
                <span className="text-sm font-normal text-muted-foreground"> / month</span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(p.price_yearly_minor, p.currency)} / year · {p.trial_days}-day trial
              </div>
              <div className="mt-3 text-[13px] text-muted-foreground">
                {l.branches ?? '∞'} branches · {l.tables ?? '∞'} tables · {l.staff ?? '∞'} staff
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.features.map((f) => (
                  <Badge key={f} variant="outline">
                    {FEATURES.find((x) => x.key === f)?.label ?? f}
                  </Badge>
                ))}
              </div>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => setEditing(p)}>
                Edit
              </Button>
            </Card>
          )
        })}
      </div>
      {editing && (
        <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const save = useSavePlan()
  const l = (plan?.limits ?? {}) as Limits
  const [f, setF] = useState({
    code: plan?.code ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    monthly: toMajorInput(plan?.price_monthly_minor ?? 0),
    yearly: toMajorInput(plan?.price_yearly_minor ?? 0),
    trial: String(plan?.trial_days ?? 14),
    branches: l.branches?.toString() ?? '',
    tables: l.tables?.toString() ?? '',
    staff: l.staff?.toString() ?? '',
    features: plan?.features ?? ['qr_menu', 'pos'],
    active: plan?.is_active ?? true,
    trialPlan: plan?.is_default_trial ?? false,
  })
  const num = (v: string) => (v.trim() ? Number(v) : undefined)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <form
          className="grid max-h-[80dvh] gap-4 overflow-y-auto pr-1"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(
              {
                id: plan?.id,
                code: f.code.trim().toLowerCase(),
                name: f.name.trim(),
                description: f.description.trim(),
                currency: plan?.currency ?? 'PKR',
                price_monthly_minor: toMinor(f.monthly) ?? 0,
                price_yearly_minor: toMinor(f.yearly) ?? 0,
                trial_days: Number(f.trial) || 0,
                limits: Object.fromEntries(
                  Object.entries({
                    branches: num(f.branches),
                    tables: num(f.tables),
                    staff: num(f.staff),
                  }).filter(([, v]) => v !== undefined),
                ),
                features: f.features,
                is_active: f.active,
                is_default_trial: f.trialPlan,
                sort_order: plan?.sort_order ?? 99,
              },
              { onSuccess: () => (toast.success('Plan saved'), onClose()) },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{plan ? `Edit ${plan.name}` : 'New plan'}</DialogTitle>
          </DialogHeader>
          {save.error && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pl-name" label="Name">
              <Input
                id="pl-name"
                required
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </Field>
            <Field id="pl-code" label="Code" hint="Lowercase, cannot change later">
              <Input
                id="pl-code"
                required
                disabled={!!plan}
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value.replace(/[^a-z0-9_]/g, '') })}
              />
            </Field>
          </div>
          <Field id="pl-desc" label="Description">
            <Textarea
              id="pl-desc"
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field id="pl-m" label="Monthly">
              <MoneyInput
                id="pl-m"
                currency="PKR"
                value={f.monthly}
                onChange={(e) => setF({ ...f, monthly: e.target.value })}
              />
            </Field>
            <Field id="pl-y" label="Yearly">
              <MoneyInput
                id="pl-y"
                currency="PKR"
                value={f.yearly}
                onChange={(e) => setF({ ...f, yearly: e.target.value })}
              />
            </Field>
            <Field id="pl-t" label="Trial days">
              <Input
                id="pl-t"
                inputMode="numeric"
                value={f.trial}
                onChange={(e) => setF({ ...f, trial: e.target.value.replace(/\D/g, '') })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['branches', 'tables', 'staff'] as const).map((k) => (
              <Field key={k} id={`pl-${k}`} label={`Max ${k}`} hint="Empty = unlimited">
                <Input
                  id={`pl-${k}`}
                  inputMode="numeric"
                  value={f[k]}
                  onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') })}
                />
              </Field>
            ))}
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1.5 text-[13px] font-medium">Features</legend>
            {FEATURES.map((ft) => (
              <label key={ft.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={f.features.includes(ft.key)}
                  onChange={(e) =>
                    setF({
                      ...f,
                      features: e.target.checked
                        ? [...f.features, ft.key]
                        : f.features.filter((x) => x !== ft.key),
                    })
                  }
                />
                {ft.label}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center justify-between text-sm">
            Offer to new restaurants
            <Switch
              checked={f.active}
              onCheckedChange={(v) => setF({ ...f, active: v })}
              aria-label="Plan is active"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            Use for new free trials
            <Switch
              checked={f.trialPlan}
              onCheckedChange={(v) => setF({ ...f, trialPlan: v })}
              aria-label="Default trial plan"
            />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending || !f.name.trim() || !f.code}>
              Save plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Support inbox
// ---------------------------------------------------------------------------
export function AdminSupportPage() {
  const tickets = useTickets()
  const { ticketId } = useParams()
  const [selected, setSelected] = useState<string | null>(ticketId ?? null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const list = (tickets.data ?? []).filter((t) => filter === 'all' || t.state === 'open')
  const current = list.find((t) => t.id === selected) ?? list[0]
  return (
    <>
      <PageHeader title="Support inbox" description="Requests from all restaurants." />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit p-1.5">
          <div className="flex gap-1 p-1 text-[13px]">
            {(['open', 'all'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
                className={cn(
                  'flex-1 rounded-md py-1',
                  filter === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {k === 'open' ? 'Needs reply' : 'All'}
              </button>
            ))}
          </div>
          <ul className="grid gap-0.5">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    'w-full rounded-md px-3 py-2 text-left hover:bg-accent',
                    current?.id === t.id && 'bg-accent',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{t.subject}</span>
                    <Badge variant={stateBadge[t.state].variant}>{stateBadge[t.state].label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.tenants?.name} · {new Date(t.updated_at).toLocaleDateString()}
                  </div>
                </button>
              </li>
            ))}
            {list.length === 0 && (
              <li className="p-4 text-center text-sm text-muted-foreground">Nothing waiting.</li>
            )}
          </ul>
        </Card>
        {current && (
          <Card className="flex h-[min(70dvh,640px)] flex-col overflow-hidden">
            <SupportThread key={current.id} ticket={current} asPlatform />
          </Card>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export function AdminSettingsPage() {
  const settings = usePlatformSettings()
  if (!settings.data) return <Skeleton className="h-40" />
  return <SettingsForm initial={settings.data} />
}

function SettingsForm({
  initial,
}: {
  initial: NonNullable<ReturnType<typeof usePlatformSettings>['data']>
}) {
  const update = useUpdatePlatformSettings()
  const [approval, setApproval] = useState(initial.require_approval)
  const [grace, setGrace] = useState(String(initial.grace_days))
  const [email, setEmail] = useState(initial.support_email ?? '')
  return (
    <>
      <PageHeader title="Platform settings" />
      <Card className="grid max-w-xl gap-4 p-5">
        {update.error && <Alert variant="destructive">{errorMessage(update.error)}</Alert>}
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            Approve new restaurants before they can start
            <span className="block text-xs text-muted-foreground">
              New sign-ups wait in Restaurants → Awaiting approval.
            </span>
          </span>
          <Switch checked={approval} onCheckedChange={setApproval} aria-label="Require approval" />
        </label>
        <Field
          id="grace"
          label="Grace period after a plan ends (days)"
          hint="Restaurants keep working this long before going read-only."
        >
          <Input
            id="grace"
            inputMode="numeric"
            className="w-24"
            value={grace}
            onChange={(e) => setGrace(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field id="support-email" label="Support email">
          <Input
            id="support-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button
          className="w-fit"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { requireApproval: approval, graceDays: Number(grace) || 0, supportEmail: email },
              { onSuccess: () => toast.success('Settings saved') },
            )
          }
        >
          Save settings
        </Button>
      </Card>
    </>
  )
}

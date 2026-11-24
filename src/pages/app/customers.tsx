import { MessageSquareText, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { RequirePerm } from '@/components/require-perm'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/ui/page-header'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  localPhone,
  useCustomerDetail,
  useCustomers,
  useInsights,
  type Customer,
} from '@/features/customers/api'
import { Stars } from '@/features/customers/review-panel'
import { addDays, todayIn, ymd } from '@/features/reports/dates'
import { useTenant } from '@/features/tenant/tenant-provider'
import { formatMoney } from '@/lib/utils'

export function CustomersPage() {
  return (
    <RequirePerm any={['customers.view']}>
      <Customers />
    </RequirePerm>
  )
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function Customers() {
  const { tenantId, branchId, branch, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const [days, setDays] = useState('30')
  const today = todayIn(membership?.tenants.timezone)
  const from = ymd(addDays(today, -(Number(days) - 1)))
  const to = ymd(today)
  const insights = useInsights(tenantId, branchId, from, to)
  const i = insights.data
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const customers = useCustomers(tenantId, branchId, query)
  const [open, setOpen] = useState<Customer | null>(null)
  const money = (m: number) => formatMoney(m, currency)

  const kpis = [
    ['Customers', i?.customers, 'with a phone number on the bill'],
    ['New', i?.new_customers, 'first visit in this period'],
    ['Returning', i?.returning_customers, 'came before this period'],
    [
      'Avg. rating',
      i?.avg_rating != null ? `${i.avg_rating} ★` : '—',
      `${i?.reviews ?? 0} reviews`,
    ],
  ] as const

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${branch?.name ?? 'All branches'} · guests who left a phone number, and what they thought.`}
        actions={
          <NativeSelect
            aria-label="Period"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-40"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </NativeSelect>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([label, value, hint]) => (
          <Card key={label} className="px-4 py-3.5" data-testid={`kpi-${label}`}>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value ?? '—'}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>
        <TabsContent value="customers">
          <form
            className="mb-3 flex max-w-sm gap-2"
            onSubmit={(e) => (e.preventDefault(), setQuery(search.trim()))}
          >
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search customers"
                placeholder="Name or phone"
                className="pl-8"
                value={search}
                onChange={(e) => (setSearch(e.target.value), !e.target.value && setQuery(''))}
              />
            </div>
          </form>
          {customers.data && customers.data.length === 0 ? (
            <EmptyState
              icon={Users}
              title={query ? 'No customers match' : 'No customers yet'}
              description="Customers appear when a bill has a phone number: takeaway and delivery at the POS, online orders and reservations."
            />
          ) : (
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead>Last visit</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(customers.data ?? []).map((c) => (
                    <TableRow key={c.phone} className="cursor-pointer" onClick={() => setOpen(c)}>
                      <TableCell>
                        <div className="font-medium">{c.name ?? 'Guest'}</div>
                        <div className="text-xs text-muted-foreground">{localPhone(c.phone)}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.visits}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(c.spent_minor)}
                      </TableCell>
                      <TableCell>{when(c.last_visit)}</TableCell>
                      <TableCell>
                        {c.avg_rating ? <Stars value={Math.round(c.avg_rating)} size="sm" /> : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="feedback">
          {!i ? (
            <Skeleton className="h-60" />
          ) : i.reviews === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="No reviews in this period"
              description="Guests can rate their meal from the receipt link (printed as a QR code or sent on WhatsApp)."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
              <Card className="h-fit px-5 py-4">
                <div className="text-3xl font-semibold tabular-nums">{i.avg_rating}</div>
                <Stars value={Math.round(i.avg_rating ?? 0)} size="sm" />
                <div className="mt-1 text-xs text-muted-foreground">{i.reviews} reviews</div>
                <ul className="mt-4 grid gap-1.5" aria-label="Rating distribution">
                  {i.distribution.map((d) => (
                    <li
                      key={d.stars}
                      className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2 text-[13px]"
                    >
                      <span>{d.stars} ★</span>
                      <span className="h-2 overflow-hidden rounded-sm bg-muted">
                        <span
                          className="block h-full rounded-r-[4px] bg-chart-1"
                          style={{ width: `${(d.count / i.reviews) * 100}%` }}
                        />
                      </span>
                      <span className="text-right text-muted-foreground tabular-nums">
                        {d.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card className="divide-y" aria-label="Recent reviews">
                {i.recent.map((r, idx) => (
                  <div key={idx} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Stars value={r.rating} size="sm" />
                      <span className="text-xs text-muted-foreground">
                        {when(r.created_at)} · Bill #{r.bill_number}
                        {!branchId && ` · ${r.branch}`}
                      </span>
                    </div>
                    {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                    {r.customer_name && (
                      <p className="mt-0.5 text-xs text-muted-foreground">— {r.customer_name}</p>
                    )}
                  </div>
                ))}
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-[26rem] overflow-y-auto p-5">
          {open && <CustomerDetail customer={open} money={money} />}
        </SheetContent>
      </Sheet>
    </>
  )
}

function CustomerDetail({ customer, money }: { customer: Customer; money: (m: number) => string }) {
  const { tenantId } = useTenant()
  const visits = useCustomerDetail(tenantId, customer.phone)
  return (
    <div className="grid gap-4">
      <div>
        <SheetTitle className="text-lg font-semibold">{customer.name ?? 'Guest'}</SheetTitle>
        <a className="text-sm text-link hover:underline" href={`tel:+${customer.phone}`}>
          {localPhone(customer.phone)}
        </a>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Visits', String(customer.visits)],
          ['Spent', money(customer.spent_minor)],
          [
            'Since',
            new Date(customer.first_visit).toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric',
            }),
          ],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-muted px-2 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="grid gap-3" aria-label="Visit history">
        {(visits.data ?? []).map((v) => (
          <li key={v.receipt_token} className="rounded-md border p-3 text-sm">
            <div className="flex justify-between gap-2">
              <Link
                to={`/r/${v.receipt_token}`}
                target="_blank"
                className="font-medium hover:text-link hover:underline"
              >
                Bill #{v.bill_number}
              </Link>
              <span className="tabular-nums">{money(v.total_minor)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {when(v.paid_at)} · {v.branch} · {v.type.replace('_', '-')}
            </div>
            {v.items && <div className="mt-1 text-[13px]">{v.items}</div>}
            {v.rating && (
              <div className="mt-1.5 flex items-center gap-2">
                <Stars value={v.rating} size="sm" />
                {v.comment && (
                  <span className="text-[13px] text-muted-foreground">“{v.comment}”</span>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

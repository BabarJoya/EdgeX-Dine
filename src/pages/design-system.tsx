import { Inbox, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { formatMoney } from '@/lib/utils'

const swatches: { token: string; role: string }[] = [
  { token: 'primary', role: 'Deep navy · brand, primary actions' },
  { token: 'link', role: 'Digital blue · links, focus, selection' },
  { token: 'warning', role: 'Golden amber · needs attention' },
  { token: 'success', role: 'Done, paid, available' },
  { token: 'destructive', role: 'Errors, void, refund' },
  { token: 'foreground', role: 'Charcoal · body text' },
  { token: 'muted-foreground', role: 'Secondary text' },
  { token: 'background', role: 'Warm paper canvas' },
  { token: 'card', role: 'Surfaces' },
  { token: 'border', role: 'Hairlines' },
]

const tableStatuses = [
  { label: 'Available', variant: 'success' },
  { label: 'Occupied', variant: 'info' },
  { label: 'Reserved', variant: 'warning' },
  { label: 'Cleaning', variant: 'neutral' },
] as const

const orderStatuses = [
  { label: 'New', variant: 'warning' },
  { label: 'Accepted', variant: 'info' },
  { label: 'Preparing', variant: 'info' },
  { label: 'Ready', variant: 'success' },
  { label: 'Served', variant: 'neutral' },
  { label: 'Rejected', variant: 'destructive' },
] as const

// Example rows for the style guide only — not application data.
const sampleRows = [
  { no: '#041', table: 'T-04', type: 'Dine-in', status: 'Preparing', total: 286000 },
  { no: '#042', table: '—', type: 'Takeaway', status: 'Ready', total: 94000 },
  { no: '#043', table: 'T-11', type: 'Dine-in', status: 'New', total: 412500 },
] as const

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function DesignSystemPage() {
  return (
    <>
      <PageHeader
        title="Design system"
        description="Tokens and components used across EdgeX. Switch the theme to check dark mode."
      />

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map((s) => (
            <div key={s.token} className="overflow-hidden rounded-lg border bg-card">
              <div className="h-14 border-b" style={{ background: `var(--${s.token})` }} />
              <div className="px-3 py-2">
                <div className="font-mono text-xs">{s.token}</div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.role}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <Card className="space-y-2 p-5">
          <div className="text-2xl font-semibold tracking-[-0.01em]">Rs 1,24,500 today</div>
          <div className="text-xl font-semibold">Page title · 20/600</div>
          <div className="text-[15px] font-semibold">Card title · 15/600</div>
          <div>Body text · 14/400. IBM Plex Sans, chosen for clear numerals on receipts.</div>
          <div className="text-[13px] text-muted-foreground">Secondary text · 13/400</div>
          <div className="font-mono text-[13px]">ORD-2026-000143 · IBM Plex Mono</div>
        </Card>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>
            <Plus /> New order
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Void order</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
          <Button size="touch">Charge Rs 2,860</Button>
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs text-muted-foreground">Tables</span>
            {tableStatuses.map((s) => (
              <Badge key={s.label} variant={s.variant} dot>
                {s.label}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs text-muted-foreground">Orders</span>
            {orderStatuses.map((s) => (
              <Badge key={s.label} variant={s.variant}>
                {s.label}
              </Badge>
            ))}
          </div>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Form">
          <Card>
            <CardHeader>
              <CardTitle>Branch details</CardTitle>
              <CardDescription>Shown on receipts and the QR menu.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ds-name">Branch name</Label>
                <Input id="ds-name" placeholder="Gulberg, Lahore" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ds-tax">Sales tax (%)</Label>
                <Input id="ds-tax" inputMode="decimal" placeholder="16" aria-invalid />
                <p className="text-xs text-destructive">Enter a rate between 0 and 100.</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => toast.success('Branch saved')}>Save</Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Open dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Void order #043?</DialogTitle>
                      <DialogDescription>
                        The kitchen will be notified and the order total removed from today's sales.
                        This is recorded in the audit log.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button variant="destructive">Void order</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Loading & empty">
          <div className="grid gap-3">
            <Card className="space-y-2.5 p-5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </Card>
            <EmptyState
              icon={Inbox}
              title="No orders yet"
              description="New orders from the POS and QR menu appear here."
            />
          </div>
        </Section>
      </div>

      <Section title="Data table">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleRows.map((r) => (
                <TableRow key={r.no}>
                  <TableCell className="font-mono text-[13px]">{r.no}</TableCell>
                  <TableCell>{r.table}</TableCell>
                  <TableCell className="text-muted-foreground">{r.type}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === 'Ready' ? 'success' : r.status === 'New' ? 'warning' : 'info'
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">Example rows for this style guide.</p>
      </Section>
    </>
  )
}

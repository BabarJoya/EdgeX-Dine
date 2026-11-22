import { MapPin, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  useSaveBranch,
  useTenantRecord,
  useUpdateTenant,
  type BranchInput,
} from '@/features/settings/api'
import { IntegrationsSettings } from '@/features/payments/integrations-settings'
import { PlanTab } from '@/features/platform/plan-tab'
import { BillingSettings } from '@/features/pos/billing-settings'
import { useBranches } from '@/features/tenant/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { SLUG_PATTERN } from '@/lib/slug'
import type { Tables } from '@/lib/supabase'

export function SettingsPage() {
  const { can } = useTenant()
  const [params] = useSearchParams()
  const tabs = [
    can('settings.manage') && { value: 'restaurant', label: 'Restaurant' },
    can('branches.manage') && { value: 'branches', label: 'Branches' },
    can('branches.manage') && { value: 'billing', label: 'Billing & tax' },
    can('settings.manage') && { value: 'integrations', label: 'Integrations' },
    { value: 'plan', label: 'Plan' },
  ].filter(Boolean) as { value: string; label: string }[]

  return (
    <RequirePerm any={['settings.manage', 'branches.manage', 'billing.manage']}>
      <PageHeader
        title="Settings"
        description="Restaurant profile, branches, payments and subscription."
      />
      <Tabs defaultValue={tabs.find((t) => t.value === params.get('tab'))?.value ?? tabs[0].value}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {can('settings.manage') && (
          <TabsContent value="restaurant">
            <RestaurantTab />
          </TabsContent>
        )}
        {can('branches.manage') && (
          <TabsContent value="branches">
            <BranchesTab />
          </TabsContent>
        )}
        {can('branches.manage') && (
          <TabsContent value="billing">
            <BillingSettings />
          </TabsContent>
        )}
        {can('settings.manage') && (
          <TabsContent value="integrations">
            <IntegrationsSettings />
          </TabsContent>
        )}
        <TabsContent value="plan">
          <PlanTab />
        </TabsContent>
      </Tabs>
    </RequirePerm>
  )
}

function RestaurantTab() {
  const { tenantId } = useTenant()
  const tenant = useTenantRecord(tenantId)
  if (!tenant.data) return <Skeleton className="h-64 w-full max-w-2xl" />
  return <RestaurantForm key={tenant.data.updated_at} tenant={tenant.data} />
}

function RestaurantForm({ tenant }: { tenant: Tables<'tenants'> }) {
  const update = useUpdateTenant(tenant.id)
  const [form, setForm] = useState({
    name: tenant.name,
    slug: tenant.slug,
    currency: tenant.currency,
    timezone: tenant.timezone,
    brand_color: tenant.brand_color ?? '',
  })

  const slugValid = SLUG_PATTERN.test(form.slug)
  const colorValid = !form.brand_color || /^#[0-9a-fA-F]{6}$/.test(form.brand_color)

  return (
    <Card className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate(
            { ...form, brand_color: form.brand_color || null },
            { onSuccess: () => toast.success('Restaurant details saved') },
          )
        }}
      >
        <CardHeader>
          <CardTitle>Restaurant profile</CardTitle>
          <CardDescription>Shown on receipts, the QR menu and your ordering page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {update.error && <Alert variant="destructive">{errorMessage(update.error)}</Alert>}
          <Field id="r-name" label="Restaurant name">
            <Input
              id="r-name"
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field
            id="r-slug"
            label="Menu web address"
            error={slugValid ? undefined : '3–48 lowercase letters, numbers or hyphens'}
            hint="Changing this breaks QR codes you've already printed."
          >
            <Input
              id="r-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="r-currency" label="Currency">
              <NativeSelect
                id="r-currency"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {['PKR', 'AED', 'SAR', 'USD', 'GBP', 'EUR'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="r-tz" label="Time zone">
              <Input
                id="r-tz"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </Field>
          </div>
          <Field
            id="r-color"
            label="Brand colour"
            hint="Used on your guest menu. Leave empty for the default."
            error={colorValid ? undefined : 'Use a hex colour like #13233F'}
          >
            <div className="flex gap-2">
              <Input
                id="r-color"
                placeholder="#13233F"
                value={form.brand_color}
                onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
              />
              <input
                type="color"
                aria-label="Pick brand colour"
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                value={colorValid && form.brand_color ? form.brand_color : '#13233f'}
                onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
              />
            </div>
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={update.isPending || !slugValid || !colorValid}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

const emptyBranch: BranchInput = { name: '', city: '', address: '', phone: '', is_active: true }

function BranchesTab() {
  const { tenantId } = useTenant()
  // Unfiltered list (includes inactive branches) for management.
  const branches = useBranches(tenantId)
  const [editing, setEditing] = useState<(BranchInput & { id?: string }) | null>(null)

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing({ ...emptyBranch })}>
          <Plus /> Add branch
        </Button>
      </div>
      {branches.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : branches.data?.length ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.data.map((b: Tables<'branches'>) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[b.address, b.city].filter(Boolean).join(', ') || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {b.phone || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={b.is_active ? 'success' : 'neutral'} dot>
                      {b.is_active ? 'Open' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditing({
                          id: b.id,
                          name: b.name,
                          city: b.city ?? '',
                          address: b.address ?? '',
                          phone: b.phone ?? '',
                          is_active: b.is_active,
                        })
                      }
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState icon={MapPin} title="No branches" />
      )}
      {editing && <BranchDialog initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function BranchDialog({
  initial,
  onClose,
}: {
  initial: BranchInput & { id?: string }
  onClose: () => void
}) {
  const { tenantId } = useTenant()
  const [v, setV] = useState(initial)
  const save = useSaveBranch(tenantId)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(v, {
              onSuccess: () => {
                toast.success(initial.id ? 'Branch updated' : 'Branch added')
                onClose()
              },
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial.id ? 'Edit branch' : 'Add branch'}</DialogTitle>
          </DialogHeader>
          {save.error && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
          <Field id="b-name" label="Branch name">
            <Input
              id="b-name"
              required
              minLength={2}
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder="DHA Phase 6"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="b-city" label="City">
              <Input
                id="b-city"
                value={v.city ?? ''}
                onChange={(e) => setV({ ...v, city: e.target.value })}
              />
            </Field>
            <Field id="b-phone" label="Phone">
              <Input
                id="b-phone"
                type="tel"
                value={v.phone ?? ''}
                onChange={(e) => setV({ ...v, phone: e.target.value })}
                placeholder="+92 300 1234567"
              />
            </Field>
          </div>
          <Field id="b-address" label="Address">
            <Input
              id="b-address"
              value={v.address ?? ''}
              onChange={(e) => setV({ ...v, address: e.target.value })}
            />
          </Field>
          {initial.id && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={v.is_active}
                onChange={(e) => setV({ ...v, is_active: e.target.checked })}
              />
              Branch is open
            </label>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { useBranches } from '@/features/tenant/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { toMajorInput, toMinor } from '@/lib/money'
import { supabase, type Tables } from '@/lib/supabase'

/** Settings → Online ordering (per branch). */
export function OnlineSettings() {
  const { tenantId, branchId, membership } = useTenant()
  const branches = useBranches(tenantId)
  const [selected, setSelected] = useState<string | null>(branchId)
  const list = branches.data ?? []
  const branch = list.find((b) => b.id === (selected ?? list[0]?.id))
  if (!branch) return null
  const link = `${window.location.origin}/o/${membership?.tenants.slug}`
  return (
    <div className="grid max-w-2xl gap-4">
      {list.length > 1 && (
        <NativeSelect
          aria-label="Branch"
          value={branch.id}
          onChange={(e) => setSelected(e.target.value)}
          className="max-w-xs"
        >
          {list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      )}
      <OnlineForm key={branch.id + branch.updated_at} branch={branch} />
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">Ordering website</div>
          <div
            className="truncate font-mono text-[13px] text-muted-foreground"
            data-testid="order-link"
          >
            {link}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => undefined)
            toast.success('Link copied')
          }}
        >
          <Copy /> Copy
        </Button>
      </Card>
    </div>
  )
}

type Zone = { name: string; fee: string; min: string; eta: string }

function OnlineForm({ branch }: { branch: Tables<'branches'> }) {
  const qc = useQueryClient()
  const { membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const zonesQ = useQuery({
    queryKey: ['delivery-zones', branch.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('branch_id', branch.id)
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
  const [f, setF] = useState({
    enabled: branch.online_enabled,
    pickup: branch.online_pickup,
    delivery: branch.online_delivery,
    min: toMajorInput(branch.online_min_order_minor || null),
    prep: String(branch.online_prep_minutes),
  })
  const [zones, setZones] = useState<Zone[] | null>(null)
  const shown: Zone[] =
    zones ??
    (zonesQ.data ?? []).map((z) => ({
      name: z.name,
      fee: toMajorInput(z.fee_minor),
      min: toMajorInput(z.min_order_minor || null),
      eta: String(z.eta_minutes),
    }))
  const setZone = (i: number, patch: Partial<Zone>) =>
    setZones(shown.map((z, j) => (j === i ? { ...z, ...patch } : z)))

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('branches')
        .update({
          online_enabled: f.enabled,
          online_pickup: f.pickup,
          online_delivery: f.delivery,
          online_min_order_minor: toMinor(f.min || '0') ?? 0,
          online_prep_minutes: Number(f.prep) || 25,
        })
        .eq('id', branch.id)
      if (error) throw error
      if (zones) {
        const { error: e2 } = await supabase.rpc('save_delivery_zones', {
          p_branch_id: branch.id,
          p_zones: zones
            .filter((z) => z.name.trim())
            .map((z) => ({
              name: z.name,
              fee_minor: toMinor(z.fee || '0') ?? 0,
              min_order_minor: toMinor(z.min || '0') ?? 0,
              eta_minutes: Number(z.eta) || 45,
            })),
        })
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      toast.success('Online ordering saved')
      setZones(null)
      void qc.invalidateQueries({ queryKey: ['delivery-zones', branch.id] })
      return qc.invalidateQueries({ queryKey: ['branches'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const toggle = (k: 'pickup' | 'delivery', label: string) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <Switch checked={f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} aria-label={label} />
    </label>
  )
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Online orders · {branch.name}</CardTitle>
          <CardDescription>
            Guests order pickup or delivery from your website; orders arrive in Orders and the
            kitchen display.
          </CardDescription>
        </div>
        <Switch
          checked={f.enabled}
          onCheckedChange={(v) => setF({ ...f, enabled: v })}
          aria-label="Take online orders"
        />
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {toggle('pickup', 'Pickup')}
          {toggle('delivery', 'Delivery')}
          <Field id="on-min" label="Minimum order">
            <MoneyInput
              id="on-min"
              currency={currency}
              value={f.min}
              onChange={(e) => setF({ ...f, min: e.target.value })}
            />
          </Field>
          <Field id="on-prep" label="Pickup ready in (minutes)">
            <Input
              id="on-prep"
              inputMode="numeric"
              value={f.prep}
              onChange={(e) => setF({ ...f, prep: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
        {f.delivery && (
          <div className="grid gap-2">
            <div className="text-sm font-medium">Delivery areas</div>
            {shown.map((z, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_7rem_5rem_auto] items-end gap-2">
                <Field id={`zn-${i}`} label={i === 0 ? 'Area' : ''}>
                  <Input
                    id={`zn-${i}`}
                    aria-label={`Area ${i + 1}`}
                    value={z.name}
                    onChange={(e) => setZone(i, { name: e.target.value })}
                  />
                </Field>
                <Field id={`zf-${i}`} label={i === 0 ? 'Fee' : ''}>
                  <MoneyInput
                    id={`zf-${i}`}
                    aria-label={`Fee ${i + 1}`}
                    currency={currency}
                    value={z.fee}
                    onChange={(e) => setZone(i, { fee: e.target.value })}
                  />
                </Field>
                <Field id={`zm-${i}`} label={i === 0 ? 'Min. order' : ''}>
                  <MoneyInput
                    id={`zm-${i}`}
                    aria-label={`Minimum ${i + 1}`}
                    currency={currency}
                    value={z.min}
                    onChange={(e) => setZone(i, { min: e.target.value })}
                  />
                </Field>
                <Field id={`ze-${i}`} label={i === 0 ? 'Minutes' : ''}>
                  <Input
                    id={`ze-${i}`}
                    aria-label={`Minutes ${i + 1}`}
                    inputMode="numeric"
                    value={z.eta}
                    onChange={(e) => setZone(i, { eta: e.target.value.replace(/\D/g, '') })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove area"
                  onClick={() => setZones(shown.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setZones([...shown, { name: '', fee: '', min: '', eta: '45' }])}
            >
              <Plus /> Add area
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save online ordering
        </Button>
      </CardFooter>
    </Card>
  )
}

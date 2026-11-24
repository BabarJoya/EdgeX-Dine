import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
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
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { useBranches } from '@/features/tenant/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { supabase, type Tables } from '@/lib/supabase'

/** Settings → Reservations (per branch). */
export function ReservationSettings() {
  const { tenantId, branchId, membership } = useTenant()
  const branches = useBranches(tenantId)
  const [selected, setSelected] = useState<string | null>(branchId)
  const list = branches.data ?? []
  const branch = list.find((b) => b.id === (selected ?? list[0]?.id))
  if (!branch) return null
  const link = `${window.location.origin}/book/${membership?.tenants.slug}`
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
      <ReservationForm key={branch.id + branch.updated_at} branch={branch} />
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">Booking link</div>
          <div
            className="truncate font-mono text-[13px] text-muted-foreground"
            data-testid="booking-link"
          >
            {link}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(link).catch(() => undefined)
            toast.success('Booking link copied')
          }}
        >
          <Copy /> Copy
        </Button>
      </Card>
    </div>
  )
}

const hhmm = (t: string) => t.slice(0, 5)

function ReservationForm({ branch }: { branch: Tables<'branches'> }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    enabled: branch.reservations_enabled,
    open: hhmm(branch.res_open),
    close: hhmm(branch.res_close),
    slot: String(branch.res_slot_minutes),
    duration: String(branch.res_duration_minutes),
    maxParty: String(branch.res_max_party),
    covers: String(branch.res_covers_per_slot),
    daysAhead: String(branch.res_days_ahead),
    auto: branch.res_auto_confirm,
  })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('branches')
        .update({
          reservations_enabled: f.enabled,
          res_open: f.open,
          res_close: f.close,
          res_slot_minutes: Number(f.slot),
          res_duration_minutes: Number(f.duration),
          res_max_party: Number(f.maxParty),
          res_covers_per_slot: Number(f.covers),
          res_days_ahead: Number(f.daysAhead),
          res_auto_confirm: f.auto,
        })
        .eq('id', branch.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Reservation settings saved')
      return qc.invalidateQueries({ queryKey: ['branches'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const num = (
    k: 'duration' | 'maxParty' | 'covers' | 'daysAhead',
    label: string,
    hint?: string,
  ) => (
    <Field id={`res-${k}`} label={label} hint={hint}>
      <Input
        id={`res-${k}`}
        inputMode="numeric"
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') })}
      />
    </Field>
  )
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Online bookings · {branch.name}</CardTitle>
          <CardDescription>
            Guests pick a time from these rules; you confirm in Reservations.
          </CardDescription>
        </div>
        <Switch
          checked={f.enabled}
          onCheckedChange={(v) => setF({ ...f, enabled: v })}
          aria-label="Take online bookings"
        />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field id="res-open" label="First booking">
          <Input
            id="res-open"
            type="time"
            value={f.open}
            onChange={(e) => setF({ ...f, open: e.target.value })}
          />
        </Field>
        <Field id="res-close" label="Closing time" hint="Last booking is one slot before closing.">
          <Input
            id="res-close"
            type="time"
            value={f.close}
            onChange={(e) => setF({ ...f, close: e.target.value })}
          />
        </Field>
        <Field id="res-slot" label="Time slots every">
          <NativeSelect
            id="res-slot"
            value={f.slot}
            onChange={(e) => setF({ ...f, slot: e.target.value })}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
          </NativeSelect>
        </Field>
        {num('duration', 'Table time (minutes)', 'How long a booking holds its covers.')}
        {num('maxParty', 'Largest party online', 'Bigger groups call you.')}
        {num('covers', 'Guests per time slot', 'Online bookings stop when a slot is full.')}
        {num('daysAhead', 'Book up to (days ahead)')}
        <label className="flex items-center justify-between gap-3 self-end text-sm">
          Confirm online bookings automatically
          <Switch
            checked={f.auto}
            onCheckedChange={(v) => setF({ ...f, auto: v })}
            aria-label="Confirm online bookings automatically"
          />
        </label>
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={save.isPending || !f.open || !f.close} onClick={() => save.mutate()}>
          Save reservation settings
        </Button>
      </CardFooter>
    </Card>
  )
}

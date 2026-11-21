import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { toMajorInput, toMinor } from '@/lib/money'
import { useDeleteGroup, useSaveGroup, type ModifierGroup, type Translations } from './api'

type Row = {
  key: string
  id?: string
  name: string
  nameUr: string
  price: string
  available: boolean
}
let seq = 0

export function GroupDialog({
  group,
  onClose,
}: {
  group: ModifierGroup | null
  onClose: () => void
}) {
  const { tenantId, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const tr = (group?.translations ?? {}) as Translations
  const [name, setName] = useState(group?.name ?? '')
  const [nameUr, setNameUr] = useState(tr.ur?.name ?? '')
  const [min, setMin] = useState(String(group?.min_select ?? 0))
  const [max, setMax] = useState(String(group?.max_select ?? 1))
  const [rows, setRows] = useState<Row[]>(() =>
    group?.modifiers.length
      ? group.modifiers.map((m) => ({
          key: `m${++seq}`,
          id: m.id,
          name: m.name,
          nameUr: ((m.translations ?? {}) as Translations).ur?.name ?? '',
          price: toMajorInput(m.price_minor),
          available: m.is_available,
        }))
      : [{ key: `m${++seq}`, name: '', nameUr: '', price: '0', available: true }],
  )
  const [error, setError] = useState<string | null>(null)
  const save = useSaveGroup(tenantId)
  const del = useDeleteGroup(tenantId)
  const update = (key: string, patch: Partial<Row>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const minN = Number(min)
    const maxN = Number(max)
    if (!Number.isInteger(minN) || !Number.isInteger(maxN) || maxN < 1 || minN > maxN)
      return setError('Check the number of choices: minimum must not be more than maximum.')
    const modifiers = []
    for (const r of rows) {
      const p = toMinor(r.price || '0')
      if (!r.name.trim() || p === null)
        return setError('Each option needs a name and a valid price (0 for free).')
      modifiers.push({
        id: r.id,
        name: r.name.trim(),
        price_minor: p,
        is_available: r.available,
        translations: r.nameUr.trim() ? { ur: { name: r.nameUr.trim() } } : {},
      })
    }
    save.mutate(
      {
        group: {
          id: group?.id,
          name: name.trim(),
          min_select: minN,
          max_select: maxN,
          translations: nameUr.trim() ? { ur: { name: nameUr.trim() } } : {},
        },
        modifiers,
      },
      {
        onSuccess: () => {
          toast.success('Add-on group saved')
          onClose()
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{group ? 'Edit add-on group' : 'New add-on group'}</DialogTitle>
          </DialogHeader>
          {(error || del.error) && (
            <Alert variant="destructive">{error ?? errorMessage(del.error)}</Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="g-name" label="Group name">
              <Input
                id="g-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Choose your sauce"
              />
            </Field>
            <Field id="g-name-ur" label="In Urdu">
              <Input
                id="g-name-ur"
                lang="ur"
                dir="rtl"
                value={nameUr}
                onChange={(e) => setNameUr(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field id="g-min" label="Minimum choices" hint="0 = optional">
              <Input
                id="g-min"
                inputMode="numeric"
                value={min}
                onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field id="g-max" label="Maximum choices">
              <Input
                id="g-max"
                inputMode="numeric"
                value={max}
                onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-[13px] font-medium">Options</legend>
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1fr_110px_auto_32px] items-center gap-2">
                <Input
                  aria-label={`Option ${i + 1} name`}
                  value={r.name}
                  placeholder="Garlic mayo"
                  onChange={(e) => update(r.key, { name: e.target.value })}
                />
                <MoneyInput
                  aria-label={`Option ${i + 1} price`}
                  currency={currency}
                  value={r.price}
                  onChange={(e) => update(r.key, { price: e.target.value })}
                />
                <Switch
                  checked={r.available}
                  onCheckedChange={(v) => update(r.key, { available: v })}
                  aria-label={`Option ${i + 1} available`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove option ${i + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-fit"
              onClick={() =>
                setRows([
                  ...rows,
                  { key: `m${++seq}`, name: '', nameUr: '', price: '0', available: true },
                ])
              }
            >
              <Plus /> Add option
            </Button>
          </fieldset>
          <DialogFooter className="sm:justify-between">
            {group ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={del.isPending}
                onClick={() =>
                  del.mutate(group.id, {
                    onSuccess: () => (toast.success('Add-on group deleted'), onClose()),
                  })
                }
              >
                Delete group
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

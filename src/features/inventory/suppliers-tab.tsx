import { Plus, Store } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useTenant } from '@/features/tenant/tenant-provider'
import { call, useInventoryAction, useSuppliers, type Supplier } from './api'

export function SuppliersTab() {
  const { tenantId, can } = useTenant()
  const suppliers = useSuppliers(tenantId)
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const manage = can('inventory.manage')
  const list = suppliers.data ?? []
  return (
    <div className="grid gap-4">
      {manage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add supplier
          </Button>
        </div>
      )}
      {suppliers.data && list.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No suppliers yet"
          description="Keep your vendors' contacts here and pick them when you record a purchase."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>NTN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((s) => (
                <TableRow key={s.id} className={s.is_active ? undefined : 'opacity-60'}>
                  <TableCell>
                    {manage ? (
                      <button
                        type="button"
                        className="font-medium hover:text-link hover:underline"
                        onClick={() => setEditing(s)}
                      >
                        {s.name}
                      </button>
                    ) : (
                      s.name
                    )}
                    {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
                  </TableCell>
                  <TableCell>{s.contact_name ?? '—'}</TableCell>
                  <TableCell>
                    {s.phone ? (
                      <a className="text-link hover:underline" href={`tel:${s.phone}`}>
                        {s.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{s.ntn ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && (
        <SupplierDialog
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const { tenantId } = useTenant()
  const [f, setF] = useState({
    name: supplier?.name ?? '',
    contact_name: supplier?.contact_name ?? '',
    phone: supplier?.phone ?? '',
    ntn: supplier?.ntn ?? '',
    notes: supplier?.notes ?? '',
  })
  const save = useInventoryAction(
    () => call('save_supplier', { p: { ...f, id: supplier?.id, tenant_id: tenantId } }),
    'Supplier saved',
  )
  const input = (k: keyof typeof f, label: string) => (
    <Field id={`sup-${k}`} label={label}>
      <Input id={`sup-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{input('name', 'Name')}</div>
          {input('contact_name', 'Contact person')}
          {input('phone', 'Phone')}
          {input('ntn', 'NTN')}
          <div className="sm:col-span-2">
            <Field id="sup-notes" label="Notes">
              <Textarea
                id="sup-notes"
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!f.name.trim() || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Plus, Truck, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTenant } from '@/features/tenant/tenant-provider'
import { toMinor } from '@/lib/money'
import { formatMoney } from '@/lib/utils'
import {
  call,
  fmtQty,
  unitLabel,
  useInventoryAction,
  useItems,
  usePurchases,
  useSuppliers,
} from './api'

const statusBadge = { draft: 'warning', received: 'success', cancelled: 'neutral' } as const
const statusLabel = { draft: 'Ordered', received: 'Received', cancelled: 'Cancelled' } as const

export function PurchasesTab() {
  const { branchId, can, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const purchases = usePurchases(branchId)
  const [creating, setCreating] = useState(false)
  const receive = useInventoryAction(
    (id: string) => call('receive_purchase', { p_purchase_id: id }),
    'Goods received, stock updated',
  )
  const cancel = useInventoryAction(
    (id: string) => call('cancel_purchase', { p_purchase_id: id }),
    'Purchase order cancelled',
  )
  const manage = can('inventory.manage')
  const list = purchases.data ?? []

  return (
    <div className="grid gap-4">
      {manage && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New purchase
          </Button>
        </div>
      )}
      {purchases.data && list.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No purchases yet"
          description="Record what you buy from suppliers. Receiving a purchase adds the stock and updates the cost of each item."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                {manage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(p.received_at ?? p.created_at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {p.reference && (
                      <div className="text-xs text-muted-foreground">{p.reference}</div>
                    )}
                  </TableCell>
                  <TableCell>{p.suppliers?.name ?? '—'}</TableCell>
                  <TableCell className="max-w-72 text-[13px] text-muted-foreground">
                    {p.purchase_items
                      .map(
                        (i) =>
                          `${i.inventory_items?.name} ${fmtQty(i.quantity, i.inventory_items?.unit)}`,
                      )
                      .join(', ')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(p.total_minor, currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge[p.status as keyof typeof statusBadge]}>
                      {statusLabel[p.status as keyof typeof statusLabel]}
                    </Badge>
                  </TableCell>
                  {manage && (
                    <TableCell className="text-right whitespace-nowrap">
                      {p.status === 'draft' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => receive.mutate(p.id)}
                            disabled={receive.isPending}
                          >
                            Receive
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Cancel purchase order"
                            onClick={() => cancel.mutate(p.id)}
                          >
                            <X />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {creating && <PurchaseDialog onClose={() => setCreating(false)} currency={currency} />}
    </div>
  )
}

type Line = { item_id: string; quantity: string; total: string }

function PurchaseDialog({ onClose, currency }: { onClose: () => void; currency: string }) {
  const { tenantId, branchId } = useTenant()
  const items = (useItems(tenantId).data ?? []).filter((i) => i.is_active)
  const suppliers = (useSuppliers(tenantId).data ?? []).filter((s) => s.is_active)
  const [supplier, setSupplier] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', quantity: '', total: '' }])
  const payload = () => ({
    p: {
      tenant_id: tenantId,
      branch_id: branchId,
      supplier_id: supplier || null,
      reference,
      items: lines.map((l) => ({
        item_id: l.item_id,
        quantity: Number(l.quantity),
        total_minor: toMinor(l.total),
      })),
    },
  })
  const save = useInventoryAction(async (receiveNow: boolean) => {
    const id = (await call('save_purchase', payload())) as string
    if (receiveNow) await call('receive_purchase', { p_purchase_id: id })
  }, 'Purchase saved')
  const ok =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.item_id &&
        /^\d+(\.\d{1,3})?$/.test(l.quantity) &&
        Number(l.quantity) > 0 &&
        toMinor(l.total) !== null,
    )
  const total = lines.reduce((n, l) => n + (toMinor(l.total) ?? 0), 0)
  const set = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase</DialogTitle>
          <DialogDescription>
            Receive it now if the goods are here, or save it as a purchase order and receive it on
            delivery.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="po-supplier" label="Supplier">
            <NativeSelect
              id="po-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="po-ref" label="Invoice / reference">
            <Input id="po-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-2">
          {lines.map((l, i) => {
            const unit = items.find((x) => x.id === l.item_id)?.unit
            return (
              <div key={i} className="grid grid-cols-[1fr_7rem_9rem_auto] items-end gap-2">
                <Field id={`po-item-${i}`} label={i === 0 ? 'Item' : ''}>
                  <NativeSelect
                    id={`po-item-${i}`}
                    aria-label={`Item ${i + 1}`}
                    value={l.item_id}
                    onChange={(e) => set(i, { item_id: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id={`po-qty-${i}`} label={i === 0 ? 'Quantity' : ''}>
                  <div className="relative">
                    <Input
                      id={`po-qty-${i}`}
                      aria-label={`Quantity ${i + 1}`}
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) => set(i, { quantity: e.target.value })}
                      className="pr-9"
                    />
                    <span className="absolute top-2 right-2.5 text-xs text-muted-foreground">
                      {unit ? unitLabel[unit] : ''}
                    </span>
                  </div>
                </Field>
                <Field id={`po-total-${i}`} label={i === 0 ? 'Line total' : ''}>
                  <MoneyInput
                    id={`po-total-${i}`}
                    aria-label={`Line total ${i + 1}`}
                    currency={currency}
                    value={l.total}
                    onChange={(e) => set(i, { total: e.target.value })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove line"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
            )
          })}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLines([...lines, { item_id: '', quantity: '', total: '' }])}
            >
              <Plus /> Add line
            </Button>
            <span className="text-sm">
              Total{' '}
              <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            disabled={!ok || save.isPending}
            onClick={() => save.mutate(false, { onSuccess: onClose })}
          >
            Save as order
          </Button>
          <Button
            disabled={!ok || save.isPending}
            onClick={() => save.mutate(true, { onSuccess: onClose })}
          >
            Receive now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

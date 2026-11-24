import { ClipboardList, PackagePlus, Trash2 } from 'lucide-react'
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
import { toMajorInput, toMinor } from '@/lib/money'
import { formatMoney } from '@/lib/utils'
import {
  call,
  fmtQty,
  qty,
  UNITS,
  unitLabel,
  useInventoryAction,
  useItems,
  useStock,
  type Item,
} from './api'

const validQty = (s: string) => /^\d+(\.\d{1,3})?$/.test(s.trim())

export function StockTab() {
  const { tenantId, branchId, can, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const items = useItems(tenantId)
  const stock = useStock(branchId)
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [wasting, setWasting] = useState<Item | null>(null)
  const [counting, setCounting] = useState(false)
  const manage = can('inventory.manage')
  const list = (items.data ?? []).filter((i) => i.is_active)
  const onHand = (id: string) => stock.data?.get(id) ?? 0
  const value = list.reduce((n, i) => n + onHand(i.id) * qty(i.avg_cost_minor), 0)
  const low = list.filter((i) => qty(i.reorder_level) > 0 && onHand(i.id) <= qty(i.reorder_level))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
          <span>
            {list.length} items · stock value{' '}
            <span className="font-medium text-foreground tabular-nums" data-testid="stock-value">
              {formatMoney(Math.round(value), currency)}
            </span>
          </span>
          {low.length > 0 && <span className="text-warning">{low.length} low on stock</span>}
        </div>
        {manage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCounting(true)} disabled={!list.length}>
              <ClipboardList /> Count stock
            </Button>
            <Button onClick={() => setEditing('new')}>
              <PackagePlus /> Add item
            </Button>
          </div>
        )}
      </div>

      {items.data && list.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="No stock items yet"
          description="Add the ingredients you buy — chicken, oil, rice, packaging — then link them to dishes in Recipes."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reorder at</TableHead>
                <TableHead className="text-right">Avg. cost</TableHead>
                <TableHead className="text-right">Value</TableHead>
                {manage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((i) => {
                const q = onHand(i.id)
                const isLow = qty(i.reorder_level) > 0 && q <= qty(i.reorder_level)
                return (
                  <TableRow key={i.id} data-testid={`stock-${i.name}`}>
                    <TableCell>
                      {manage ? (
                        <button
                          type="button"
                          className="text-left font-medium hover:text-link hover:underline"
                          onClick={() => setEditing(i)}
                        >
                          {i.name}
                        </button>
                      ) : (
                        <span className="font-medium">{i.name}</span>
                      )}
                      {i.category && (
                        <div className="text-xs text-muted-foreground">{i.category}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={q < 0 ? 'text-destructive' : undefined}>
                        {fmtQty(q, i.unit)}
                      </span>
                      {isLow && (
                        <Badge variant="warning" className="ml-2">
                          Low
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {qty(i.reorder_level) ? fmtQty(i.reorder_level, i.unit) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(Math.round(qty(i.avg_cost_minor)), currency)}
                      <span className="text-muted-foreground">/{unitLabel[i.unit]}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(Math.round(Math.max(0, q) * qty(i.avg_cost_minor)), currency)}
                    </TableCell>
                    {manage && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setWasting(i)}
                          aria-label={`Record wastage of ${i.name}`}
                        >
                          <Trash2 /> Waste
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {editing && (
        <ItemDialog item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {wasting && <WasteDialog item={wasting} onClose={() => setWasting(null)} />}
      {counting && <CountDialog items={list} onHand={onHand} onClose={() => setCounting(false)} />}
    </div>
  )
}

function ItemDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { tenantId, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const [name, setName] = useState(item?.name ?? '')
  const [unit, setUnit] = useState(item?.unit ?? 'kg')
  const [category, setCategory] = useState(item?.category ?? '')
  const [reorder, setReorder] = useState(item ? String(qty(item.reorder_level)) : '0')
  const [cost, setCost] = useState(item ? toMajorInput(Math.round(qty(item.avg_cost_minor))) : '')
  const save = useInventoryAction(
    () =>
      call('save_inventory_item', {
        p: {
          id: item?.id,
          tenant_id: tenantId,
          name,
          unit,
          category,
          reorder_level: Number(reorder || 0),
          ...(cost.trim() ? { avg_cost_minor: toMinor(cost) } : {}),
        },
      }),
    item ? 'Item saved' : 'Item added',
  )
  const ok = name.trim() && validQty(reorder || '0') && (!cost.trim() || toMinor(cost) !== null)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add stock item'}</DialogTitle>
          <DialogDescription>Quantities everywhere use the unit you choose here.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="item-name" label="Name">
              <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field id="item-unit" label="Unit">
            <NativeSelect id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel[u]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="item-category" label="Category" hint="e.g. Meat, Dairy, Packaging">
            <Input
              id="item-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field id="item-reorder" label={`Reorder at (${unitLabel[unit]})`}>
            <Input
              id="item-reorder"
              inputMode="decimal"
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
            />
          </Field>
          <Field
            id="item-cost"
            label={`Cost per ${unitLabel[unit]}`}
            hint="Updated automatically by purchases."
          >
            <MoneyInput
              id="item-cost"
              currency={currency}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ok || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WasteDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { branchId } = useTenant()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const save = useInventoryAction(
    () =>
      call('record_wastage', {
        p_branch_id: branchId,
        p_item_id: item.id,
        p_quantity: Number(amount),
        p_reason: reason,
      }),
    'Wastage recorded',
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record wastage · {item.name}</DialogTitle>
          <DialogDescription>Spoiled, dropped or expired stock.</DialogDescription>
        </DialogHeader>
        <Field id="waste-qty" label={`Quantity (${unitLabel[item.unit]})`}>
          <Input
            id="waste-qty"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field id="waste-reason" label="Reason">
          <Input id="waste-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!validQty(amount) || !Number(amount) || !reason.trim() || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Record wastage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CountDialog({
  items,
  onHand,
  onClose,
}: {
  items: Item[]
  onHand: (id: string) => number
  onClose: () => void
}) {
  const { branchId } = useTenant()
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, String(Math.max(0, onHand(i.id)))])),
  )
  const save = useInventoryAction(
    () =>
      call('count_stock', {
        p_branch_id: branchId,
        p_counts: items.map((i) => ({ item_id: i.id, counted: Number(counts[i.id] || 0) })),
        p_note: 'Stock count',
      }),
    'Stock count saved',
  )
  const ok = items.every((i) => validQty(counts[i.id] || '0'))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Count stock</DialogTitle>
          <DialogDescription>
            Enter what is on the shelf. Differences are recorded as stock count adjustments.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">System</TableHead>
                <TableHead className="w-32 text-right">Counted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {fmtQty(onHand(i.id), i.unit)}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Counted ${i.name}`}
                      inputMode="decimal"
                      className="h-8 text-right"
                      value={counts[i.id]}
                      onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ok || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

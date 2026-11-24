import { useQuery } from '@tanstack/react-query'
import { ChefHat, Plus, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
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
import { supabase } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'
import { call, qty, unitLabel, useCosting, useInventoryAction, useItems, useRecipes } from './api'

type Target = {
  kind: 'product_id' | 'variant_id' | 'modifier_id'
  id: string
  name: string
  price: number | null
}

function useModifiers(tenantId?: string) {
  return useQuery({
    queryKey: ['inv-modifiers', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modifiers')
        .select('id, name, price_minor, modifier_groups(name)')
        .eq('tenant_id', tenantId!)
        .order('name')
      if (error) throw error
      return data as unknown as {
        id: string
        name: string
        price_minor: number
        modifier_groups: { name: string } | null
      }[]
    },
  })
}

/** Margin colour: healthy ≥ 60%, watch 40–60%, low < 40%. */
const marginTone = (m: number | null) =>
  m === null
    ? 'text-muted-foreground'
    : m >= 60
      ? 'text-success'
      : m >= 40
        ? 'text-warning'
        : 'text-destructive'

export function RecipesTab() {
  const { tenantId, can, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const costing = useCosting(tenantId)
  const recipes = useRecipes(tenantId)
  const modifiers = useModifiers(tenantId)
  const items = useItems(tenantId)
  const [target, setTarget] = useState<Target | null>(null)
  const manage = can('inventory.manage')
  const money = (m: number | null) => (m === null ? '—' : formatMoney(m, currency))
  const rows = costing.data ?? []
  const withRecipe = new Set((recipes.data ?? []).map((r) => r.modifier_id).filter(Boolean))
  const itemCost = new Map((items.data ?? []).map((i) => [i.id, qty(i.avg_cost_minor)]))
  const modCost = (id: string) =>
    Math.round(
      (recipes.data ?? [])
        .filter((r) => r.modifier_id === id)
        .reduce((n, r) => n + qty(r.quantity) * (itemCost.get(r.item_id) ?? 0), 0),
    )

  if (costing.data && rows.length === 0) {
    return (
      <EmptyState
        icon={ChefHat}
        title="No menu items yet"
        description="Add dishes in Menu, then give each one a recipe to see its food cost and margin."
      />
    )
  }

  const open = (t: Target) => manage && setTarget(t)
  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-muted-foreground">
        A recipe lists the stock one portion uses. Ordering deducts it automatically; a size&apos;s
        own recipe replaces the dish recipe. Cost uses each item&apos;s average purchase cost.
      </p>
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dish</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Food cost</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.variant_id ?? r.product_id} data-testid={`cost-${r.name}`}>
                <TableCell className={cn(r.variant_id && 'pl-6')}>
                  <button
                    type="button"
                    disabled={!manage}
                    className="text-left font-medium enabled:hover:text-link enabled:hover:underline"
                    onClick={() =>
                      open({
                        kind: r.variant_id ? 'variant_id' : 'product_id',
                        id: r.variant_id ?? r.product_id,
                        name: r.name,
                        price: r.price_minor,
                      })
                    }
                  >
                    {r.name}
                  </button>
                  {!r.variant_id && r.category && (
                    <span className="ml-2 text-xs text-muted-foreground">{r.category}</span>
                  )}
                  {!r.has_recipe && (
                    <Badge variant="neutral" className="ml-2">
                      No recipe
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(r.price_minor)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(r.cost_minor)}</TableCell>
                <TableCell
                  className={cn('text-right font-medium tabular-nums', marginTone(r.margin_pct))}
                >
                  {r.margin_pct === null ? '—' : `${r.margin_pct}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {(modifiers.data?.length ?? 0) > 0 && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Add-on</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Food cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modifiers.data!.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <button
                      type="button"
                      disabled={!manage}
                      className="text-left font-medium enabled:hover:text-link enabled:hover:underline"
                      onClick={() =>
                        open({ kind: 'modifier_id', id: m.id, name: m.name, price: m.price_minor })
                      }
                    >
                      {m.name}
                    </button>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.modifier_groups?.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(m.price_minor)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {withRecipe.has(m.id) ? money(modCost(m.id)) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {target && <RecipeDialog target={target} onClose={() => setTarget(null)} />}
    </div>
  )
}

type Line = { item_id: string; quantity: string }

function RecipeDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const { tenantId, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const items = (useItems(tenantId).data ?? []).filter((i) => i.is_active)
  const recipes = useRecipes(tenantId).data ?? []
  const [lines, setLines] = useState<Line[]>(() => {
    const existing = recipes
      .filter((r) => r[target.kind] === target.id)
      .map((r) => ({ item_id: r.item_id, quantity: String(qty(r.quantity)) }))
    return existing.length ? existing : [{ item_id: '', quantity: '' }]
  })
  const filled = lines.filter((l) => l.item_id)
  const save = useInventoryAction(
    () =>
      call('save_recipe', {
        p_tenant_id: tenantId,
        p_target: { [target.kind]: target.id },
        p_lines: filled.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) })),
      }),
    'Recipe saved',
  )
  const ok = filled.every((l) => /^\d+(\.\d{1,3})?$/.test(l.quantity) && Number(l.quantity) > 0)
  const cost = Math.round(
    filled.reduce((n, l) => {
      const it = items.find((i) => i.id === l.item_id)
      return n + Number(l.quantity || 0) * qty(it?.avg_cost_minor)
    }, 0),
  )
  const set = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recipe · {target.name}</DialogTitle>
          <DialogDescription>
            What one portion uses. Remove every line to clear the recipe.
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add stock items first (Stock tab).</p>
        ) : (
          <div className="grid gap-2">
            {lines.map((l, i) => {
              const unit = items.find((x) => x.id === l.item_id)?.unit
              return (
                <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
                  <NativeSelect
                    aria-label={`Ingredient ${i + 1}`}
                    value={l.item_id}
                    onChange={(e) => set(i, { item_id: e.target.value })}
                  >
                    <option value="">Choose ingredient…</option>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="relative">
                    <Input
                      aria-label={`Amount ${i + 1}`}
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) => set(i, { quantity: e.target.value })}
                      className="pr-10"
                    />
                    <span className="absolute top-2 right-2.5 text-xs text-muted-foreground">
                      {unit ? unitLabel[unit] : ''}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove ingredient"
                    onClick={() =>
                      setLines(
                        lines.length === 1
                          ? [{ item_id: '', quantity: '' }]
                          : lines.filter((_, j) => j !== i),
                      )
                    }
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
                onClick={() => setLines([...lines, { item_id: '', quantity: '' }])}
              >
                <Plus /> Add ingredient
              </Button>
              <span className="text-sm" data-testid="recipe-cost">
                Cost per portion{' '}
                <span className="font-semibold tabular-nums">{formatMoney(cost, currency)}</span>
                {target.price ? (
                  <span className="ml-1 text-muted-foreground">
                    ({Math.round(((target.price - cost) / target.price) * 1000) / 10}% margin)
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ok || save.isPending || items.length === 0}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

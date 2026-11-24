import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { supabase, type Tables } from '@/lib/supabase'

export type Item = Tables<'inventory_items'>
export type Supplier = Tables<'suppliers'>
export type Purchase = Tables<'purchases'> & {
  suppliers: { name: string } | null
  purchase_items: (Tables<'purchase_items'> & {
    inventory_items: { name: string; unit: string } | null
  })[]
}
export type Expense = Tables<'expenses'>
export type Costing = {
  product_id: string
  variant_id: string | null
  name: string
  category: string | null
  price_minor: number | null
  cost_minor: number | null
  has_recipe: boolean
  margin_pct: number | null
}
export type LowStock = {
  item_id: string
  name: string
  unit: string
  branch_id: string
  branch: string
  quantity: number
  reorder_level: number
}

export const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'dozen', 'pack'] as const
export const unitLabel: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
  pcs: 'pcs',
  dozen: 'dozen',
  pack: 'pack',
}
export const EXPENSE_CATEGORIES = [
  ['rent', 'Rent'],
  ['salaries', 'Salaries'],
  ['utilities', 'Electricity & water'],
  ['gas', 'Gas'],
  ['maintenance', 'Repairs & maintenance'],
  ['marketing', 'Marketing'],
  ['supplies', 'Packaging & supplies'],
  ['other', 'Other'],
] as const

/** Quantities come back from Postgres numeric as strings. */
export const qty = (v: number | string | null | undefined) => Number(v ?? 0)
export const fmtQty = (v: number | string | null | undefined, unit?: string) =>
  `${qty(v).toLocaleString('en-PK', { maximumFractionDigits: 3 })}${unit ? ` ${unitLabel[unit] ?? unit}` : ''}`

const keys = {
  items: (t?: string) => ['inv-items', t],
  stock: (b?: string | null) => ['inv-stock', b],
  suppliers: (t?: string) => ['inv-suppliers', t],
  purchases: (b?: string | null) => ['inv-purchases', b],
  recipes: (t?: string) => ['inv-recipes', t],
  costing: (t?: string) => ['inv-costing', t],
  expenses: (b?: string | null) => ['inv-expenses', b],
}

export function useItems(tenantId?: string) {
  return useQuery({
    queryKey: keys.items(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('category')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useStock(branchId: string | null) {
  return useQuery({
    queryKey: keys.stock(branchId),
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_stock')
        .select('item_id, quantity')
        .eq('branch_id', branchId!)
      if (error) throw error
      return new Map(data.map((s) => [s.item_id, qty(s.quantity)]))
    },
  })
}

export function useSuppliers(tenantId?: string) {
  return useQuery({
    queryKey: keys.suppliers(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function usePurchases(branchId: string | null) {
  return useQuery({
    queryKey: keys.purchases(branchId),
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, suppliers(name), purchase_items(*, inventory_items(name, unit))')
        .eq('branch_id', branchId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as unknown as Purchase[]
    },
  })
}

export function useRecipes(tenantId?: string) {
  return useQuery({
    queryKey: keys.recipes(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_items')
        .select('*')
        .eq('tenant_id', tenantId!)
      if (error) throw error
      return data
    },
  })
}

export function useCosting(tenantId?: string) {
  return useQuery({
    queryKey: keys.costing(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('menu_costing', { p_tenant_id: tenantId! })
      if (error) throw error
      return (data ?? []) as unknown as Costing[]
    },
  })
}

export function useExpenses(branchId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: [...keys.expenses(branchId), from, to],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('branch_id', branchId!)
        .gte('spent_on', from)
        .lte('spent_on', to)
        .order('spent_on', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useLowStock(tenantId: string | undefined, branchId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['inv-low', tenantId, branchId],
    enabled: !!tenantId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('low_stock', {
        p_tenant_id: tenantId!,
        p_branch_id: branchId ?? undefined,
      })
      if (error) throw error
      return (data ?? []) as unknown as LowStock[]
    },
  })
}

/** Run an inventory RPC, toast the result and refresh every inventory view. */
export function useInventoryAction<V>(fn: (v: V) => Promise<unknown>, success?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: V) => {
      await fn(v)
    },
    onSuccess: () => {
      if (success) toast.success(success)
      for (const k of [
        'inv-items',
        'inv-stock',
        'inv-suppliers',
        'inv-purchases',
        'inv-recipes',
        'inv-costing',
        'inv-expenses',
        'inv-low',
        'profit-loss',
      ]) {
        void qc.invalidateQueries({ queryKey: [k] })
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

/** supabase.rpc that throws on error. */
export async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw error
  return data
}

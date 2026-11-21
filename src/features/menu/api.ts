import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import { supabase, type Tables } from '@/lib/supabase'

export type Translations = Partial<Record<string, { name?: string; description?: string }>>
export type Category = Tables<'categories'>
export type Variant = Tables<'product_variants'>
export type Product = Tables<'products'> & {
  product_variants: Variant[]
  product_modifier_groups: { group_id: string; sort_order: number }[]
}
export type ModifierGroup = Tables<'modifier_groups'> & { modifiers: Tables<'modifiers'>[] }
export type Station = Tables<'kitchen_stations'>
export type Override = Tables<'product_branch_overrides'>

export type Menu = {
  categories: Category[]
  products: Product[]
  groups: ModifierGroup[]
  stations: Station[]
  overrides: Override[]
}

export const menuKey = (tenantId: string) => ['menu', tenantId] as const

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export function useMenu(tenantId: string | undefined) {
  return useQuery({
    queryKey: menuKey(tenantId ?? ''),
    enabled: !!tenantId,
    queryFn: async (): Promise<Menu> => {
      const t = tenantId!
      const [categories, products, groups, stations, overrides] = await Promise.all([
        q(
          supabase
            .from('categories')
            .select('*')
            .eq('tenant_id', t)
            .order('sort_order')
            .order('created_at'),
        ),
        q(
          supabase
            .from('products')
            .select('*, product_variants(*), product_modifier_groups(group_id, sort_order)')
            .eq('tenant_id', t)
            .order('sort_order')
            .order('created_at'),
        ),
        q(
          supabase
            .from('modifier_groups')
            .select('*, modifiers(*)')
            .eq('tenant_id', t)
            .order('sort_order')
            .order('created_at'),
        ),
        q(
          supabase
            .from('kitchen_stations')
            .select('*')
            .eq('tenant_id', t)
            .order('sort_order')
            .order('created_at'),
        ),
        q(supabase.from('product_branch_overrides').select('*').eq('tenant_id', t)),
      ])
      const sortBy = <T extends { sort_order: number }>(a: T[]) =>
        [...a].sort((x, y) => x.sort_order - y.sort_order)
      return {
        categories,
        products: (products as unknown as Product[]).map((p) => ({
          ...p,
          product_variants: sortBy(p.product_variants),
          product_modifier_groups: sortBy(p.product_modifier_groups),
        })),
        groups: (groups as unknown as ModifierGroup[]).map((g) => ({
          ...g,
          modifiers: sortBy(g.modifiers),
        })),
        stations,
        overrides,
      }
    },
  })
}

function useMenuMutation<V, R = void>(tenantId: string | undefined, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: menuKey(tenantId ?? '') }),
  })
}

// --- Products ---------------------------------------------------------------
export type ProductInput = {
  id?: string
  category_id: string
  name: string
  description: string
  image_path: string | null
  price_minor: number
  compare_at_price_minor: number | null
  sku: string
  kitchen_station_id: string | null
  tags: string[]
  prep_time_minutes: number | null
  translations: Translations
  is_available: boolean
  is_active: boolean
}
export type VariantInput = {
  id?: string
  name: string
  price_minor: number
  is_default: boolean
  translations: Translations
}

export function useSaveProduct(tenantId: string | undefined) {
  return useMenuMutation(
    tenantId,
    async (v: { product: ProductInput; variants: VariantInput[]; groupIds: string[] }) =>
      q(
        supabase.rpc('save_product', {
          p_product: { ...v.product, tenant_id: tenantId } as unknown as Json,
          p_variants: v.variants as unknown as Json,
          p_group_ids: v.groupIds,
        }),
      ),
  )
}

export function useSetAvailability(tenantId: string | undefined) {
  const qc = useQueryClient()
  const key = menuKey(tenantId ?? '')
  return useMutation({
    mutationFn: async (v: { id: string; is_available: boolean }) => {
      const { error } = await supabase
        .from('products')
        .update({ is_available: v.is_available })
        .eq('id', v.id)
      if (error) throw error
    },
    // Optimistic: the switch flips instantly during a busy service.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Menu>(key)
      if (prev)
        qc.setQueryData<Menu>(key, {
          ...prev,
          products: prev.products.map((p) =>
            p.id === v.id ? { ...p, is_available: v.is_available } : p,
          ),
        })
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteProduct(tenantId: string | undefined) {
  return useMenuMutation(tenantId, async (id: string) => {
    await q(supabase.from('products').delete().eq('id', id))
  })
}

export function useSaveOverrides(tenantId: string | undefined) {
  return useMenuMutation(
    tenantId,
    async (v: {
      productId: string
      rows: { branch_id: string; price_minor: number | null; is_available: boolean | null }[]
    }) => {
      const keep = v.rows.filter((r) => r.price_minor !== null || r.is_available !== null)
      const clear = v.rows
        .filter((r) => r.price_minor === null && r.is_available === null)
        .map((r) => r.branch_id)
      if (keep.length)
        await q(
          supabase.from('product_branch_overrides').upsert(
            keep.map((r) => ({ ...r, product_id: v.productId, tenant_id: tenantId! })),
            { onConflict: 'product_id,branch_id' },
          ),
        )
      if (clear.length)
        await q(
          supabase
            .from('product_branch_overrides')
            .delete()
            .eq('product_id', v.productId)
            .in('branch_id', clear),
        )
    },
  )
}

// --- Categories -------------------------------------------------------------
export type CategoryInput = {
  id?: string
  name: string
  description: string
  parent_id: string | null
  translations: Translations
  is_active: boolean
  /** For new rows: position at the end of the list. */
  sort_order?: number
}

export function useSaveCategory(tenantId: string | undefined) {
  return useMenuMutation(tenantId, async ({ id, ...v }: CategoryInput) => {
    const row = {
      ...v,
      name: v.name.trim(),
      translations: v.translations as { [key: string]: Json },
    }
    if (id) await q(supabase.from('categories').update(row).eq('id', id))
    else await q(supabase.from('categories').insert({ ...row, tenant_id: tenantId! }))
  })
}

export function useDeleteCategory(tenantId: string | undefined) {
  return useMenuMutation(tenantId, async (id: string) => {
    await q(supabase.from('categories').delete().eq('id', id))
  })
}

export function useReorder(tenantId: string | undefined) {
  return useMenuMutation(
    tenantId,
    async (v: {
      kind: 'categories' | 'products' | 'kitchen_stations' | 'modifier_groups'
      ids: string[]
    }) => {
      await q(supabase.rpc('reorder_menu', { p_kind: v.kind, p_ids: v.ids }))
    },
  )
}

// --- Add-on groups ----------------------------------------------------------
export type ModifierInput = {
  id?: string
  name: string
  price_minor: number
  is_available: boolean
  translations: Translations
}
export type GroupInput = {
  id?: string
  name: string
  min_select: number
  max_select: number
  translations: Translations
}

export function useSaveGroup(tenantId: string | undefined) {
  return useMenuMutation(tenantId, async (v: { group: GroupInput; modifiers: ModifierInput[] }) =>
    q(
      supabase.rpc('save_modifier_group', {
        p_group: { ...v.group, tenant_id: tenantId } as unknown as Json,
        p_modifiers: v.modifiers as unknown as Json,
      }),
    ),
  )
}

export function useDeleteGroup(tenantId: string | undefined) {
  return useMenuMutation(tenantId, async (id: string) => {
    await q(supabase.from('modifier_groups').delete().eq('id', id))
  })
}

// --- Stations ---------------------------------------------------------------
export function useSaveStation(tenantId: string | undefined) {
  return useMenuMutation(
    tenantId,
    async (v: { id?: string; name: string; sort_order?: number }) => {
      if (v.id)
        await q(supabase.from('kitchen_stations').update({ name: v.name.trim() }).eq('id', v.id))
      else
        await q(
          supabase
            .from('kitchen_stations')
            .insert({ tenant_id: tenantId!, name: v.name.trim(), sort_order: v.sort_order ?? 0 }),
        )
    },
  )
}

export function useDeleteStation(tenantId: string | undefined) {
  return useMenuMutation(tenantId, async (id: string) => {
    await q(supabase.from('kitchen_stations').delete().eq('id', id))
  })
}

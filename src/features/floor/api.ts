import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import { supabase, type Enums, type Tables } from '@/lib/supabase'

export type Table = Tables<'tables'>
export type Area = Tables<'floor_areas'>
export type Session = Tables<'table_sessions'>

export const floorKey = (branchId: string) => ['floor', branchId] as const

export function useFloor(branchId: string | null) {
  return useQuery({
    queryKey: floorKey(branchId ?? ''),
    enabled: !!branchId,
    queryFn: async () => {
      const [areas, tables, sessions] = await Promise.all([
        supabase
          .from('floor_areas')
          .select('*')
          .eq('branch_id', branchId!)
          .order('sort_order')
          .order('created_at'),
        supabase.from('tables').select('*').eq('branch_id', branchId!).order('label'),
        supabase.from('table_sessions').select('*').eq('branch_id', branchId!).eq('status', 'open'),
      ])
      for (const r of [areas, tables, sessions]) if (r.error) throw r.error
      // Natural sort: T2 before T10.
      const tablesSorted = [...tables.data!].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }),
      )
      return { areas: areas.data!, tables: tablesSorted, sessions: sessions.data! }
    },
  })
}

function useFloorMutation<V, R = void>(branchId: string | null, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: floorKey(branchId ?? '') }),
  })
}

async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await p
  if (error) throw error
  return data
}

export function useSaveArea(tenantId: string | undefined, branchId: string | null) {
  return useFloorMutation(
    branchId,
    async (v: { id?: string; name: string; sort_order?: number }) => {
      if (v.id)
        await ok(supabase.from('floor_areas').update({ name: v.name.trim() }).eq('id', v.id))
      else
        await ok(
          supabase.from('floor_areas').insert({
            tenant_id: tenantId!,
            branch_id: branchId!,
            name: v.name.trim(),
            sort_order: v.sort_order ?? 0,
          }),
        )
    },
  )
}

export function useDeleteArea(branchId: string | null) {
  return useFloorMutation(branchId, async (id: string) => {
    await ok(supabase.from('floor_areas').delete().eq('id', id))
  })
}

export type TableInput = {
  id?: string
  label: string
  seats: number
  area_id: string | null
  shape: Enums<'table_shape'>
  is_active: boolean
}

export function useSaveTable(tenantId: string | undefined, branchId: string | null) {
  return useFloorMutation(
    branchId,
    async ({ id, ...v }: TableInput & { pos_x?: number; pos_y?: number }) => {
      const row = { ...v, label: v.label.trim() }
      if (id) await ok(supabase.from('tables').update(row).eq('id', id))
      else
        await ok(
          supabase.from('tables').insert({ ...row, tenant_id: tenantId!, branch_id: branchId! }),
        )
    },
  )
}

/** Add T1…T10 style tables in one go, laid out on a grid. */
export function useAddTables(tenantId: string | undefined, branchId: string | null) {
  return useFloorMutation(
    branchId,
    async (v: {
      prefix: string
      from: number
      count: number
      seats: number
      area_id: string | null
      existing: number
    }) => {
      const rows = Array.from({ length: v.count }, (_, i) => {
        const slot = v.existing + i
        return {
          tenant_id: tenantId!,
          branch_id: branchId!,
          label: `${v.prefix}${v.from + i}`,
          seats: v.seats,
          area_id: v.area_id,
          pos_x: 40 + (slot % 6) * 160,
          pos_y: 40 + Math.floor(slot / 6) * 170,
        }
      }).map((r) => ({ ...r, pos_y: Math.min(r.pos_y, 1000) }))
      await ok(supabase.from('tables').insert(rows))
    },
  )
}

export function useMoveTable(branchId: string | null) {
  const qc = useQueryClient()
  const key = floorKey(branchId ?? '')
  return useMutation({
    mutationFn: async (v: { id: string; pos_x: number; pos_y: number }) => {
      await ok(supabase.from('tables').update({ pos_x: v.pos_x, pos_y: v.pos_y }).eq('id', v.id))
    },
    onMutate: (v) => {
      qc.setQueryData<ReturnType<typeof useFloor>['data']>(key, (prev) =>
        prev
          ? { ...prev, tables: prev.tables.map((t) => (t.id === v.id ? { ...t, ...v } : t)) }
          : prev,
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteTable(branchId: string | null) {
  return useFloorMutation(branchId, async (id: string) => {
    await ok(supabase.from('tables').delete().eq('id', id))
  })
}

export function useSetTableStatus(branchId: string | null) {
  return useFloorMutation(branchId, async (v: { id: string; status: Enums<'table_status'> }) => {
    await ok(supabase.rpc('set_table_status', { p_table_id: v.id, p_status: v.status }))
  })
}

export function useRegenerateQr(branchId: string | null) {
  return useFloorMutation(branchId, async (id: string) =>
    ok(supabase.rpc('regenerate_table_qr', { p_table_id: id })),
  )
}

export function useCloseSession(branchId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await ok(supabase.rpc('close_table_session', { p_session_id: sessionId }))
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: floorKey(branchId ?? '') }),
        qc.invalidateQueries({ queryKey: ['orders'] }),
      ]),
  })
}

export function tableUrl(slug: string, token: string) {
  return `${window.location.origin}/m/${slug}?t=${token}`
}

function useFloorAndOrders() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['floor'] }),
      qc.invalidateQueries({ queryKey: ['orders'] }),
      qc.invalidateQueries({ queryKey: ['tickets'] }),
    ])
}

export function useTransferSession() {
  const refresh = useFloorAndOrders()
  return useMutation({
    mutationFn: async (v: { sessionId: string; toTableId: string }) =>
      ok(
        supabase.rpc('transfer_table_session', {
          p_session_id: v.sessionId,
          p_to_table_id: v.toTableId,
        }),
      ),
    onSuccess: refresh,
  })
}

export function useMergeSessions() {
  const refresh = useFloorAndOrders()
  return useMutation({
    mutationFn: async (v: { fromSessionId: string; intoSessionId: string }) =>
      ok(
        supabase.rpc('merge_table_sessions', {
          p_from_session_id: v.fromSessionId,
          p_into_session_id: v.intoSessionId,
        }),
      ),
    onSuccess: refresh,
  })
}

export function useAssignWaiter() {
  const refresh = useFloorAndOrders()
  return useMutation({
    mutationFn: async (v: { tableId: string; userId: string | null }) =>
      ok(
        supabase.rpc('assign_table_waiter', {
          p_table_id: v.tableId,
          p_user_id: v.userId as string,
        }),
      ),
    onSuccess: refresh,
  })
}

export function usePlaceStaffOrder() {
  const refresh = useFloorAndOrders()
  return useMutation({
    mutationFn: async (v: {
      tableId: string
      items: {
        product_id: string
        variant_id: string | null
        quantity: number
        modifier_ids: string[]
        notes: string
      }[]
      notes: string
    }) => {
      const data = await ok(
        supabase.rpc('place_staff_order', {
          p_table_id: v.tableId,
          p_items: v.items as unknown as Json,
          p_notes: v.notes,
        }),
      )
      return data as unknown as { order_id: string; order_number: number; total_minor: number }
    },
    onSuccess: refresh,
  })
}

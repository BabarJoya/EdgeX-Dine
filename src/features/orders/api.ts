import { pokeOutbox } from '@/features/payments/notify'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase, type Enums, type Tables } from '@/lib/supabase'

export type OrderItem = Tables<'order_items'> & {
  order_item_modifiers: Tables<'order_item_modifiers'>[]
}
export type Order = Tables<'orders'> & {
  order_items: OrderItem[]
  tables: { label: string } | null
}
export type GuestRequest = Tables<'guest_requests'> & { tables: { label: string } | null }

const ORDER_SELECT = '*, order_items(*, order_item_modifiers(*)), tables(label)'
export const ACTIVE: Enums<'order_status'>[] = ['new', 'accepted', 'preparing', 'ready', 'served']

/** Open orders for a branch (or all accessible branches when branchId is null). */
export function useActiveOrders(tenantId: string | undefined, branchId: string | null) {
  return useQuery({
    queryKey: ['orders', tenantId, branchId, 'active'],
    enabled: !!tenantId,
    refetchInterval: 20_000, // safety net if the realtime connection drops
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('tenant_id', tenantId!)
        .in('status', ACTIVE)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q.order('created_at', { ascending: true }).limit(200)
      if (error) throw error
      return data as unknown as Order[]
    },
  })
}

/** Today's finished orders (completed / cancelled), newest first. */
export function useClosedOrders(
  tenantId: string | undefined,
  branchId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['orders', tenantId, branchId, 'closed'],
    enabled: !!tenantId && enabled,
    queryFn: async () => {
      const since = new Date()
      since.setHours(0, 0, 0, 0)
      let q = supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('tenant_id', tenantId!)
        .in('status', ['completed', 'cancelled'])
        .gte('created_at', since.toISOString())
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      return data as unknown as Order[]
    },
  })
}

export function useGuestRequests(tenantId: string | undefined, branchId: string | null) {
  return useQuery({
    queryKey: ['guest-requests', tenantId, branchId],
    enabled: !!tenantId,
    refetchInterval: 20_000,
    queryFn: async () => {
      let q = supabase
        .from('guest_requests')
        .select('*, tables(label)')
        .eq('tenant_id', tenantId!)
        .neq('status', 'resolved')
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q.order('created_at').limit(100)
      if (error) throw error
      return data as unknown as GuestRequest[]
    },
  })
}

/**
 * Live updates: Postgres changes on orders, guest requests and tables are
 * pushed to the browser (filtered by RLS) and refresh the affected queries.
 */
export function useLiveOrders(tenantId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!tenantId) return
    const filter = `tenant_id=eq.${tenantId}`
    const channel = supabase
      .channel(`live-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, () => {
        void qc.invalidateQueries({ queryKey: ['orders'] })
        void qc.invalidateQueries({ queryKey: ['floor'] })
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guest_requests', filter },
        () => {
          void qc.invalidateQueries({ queryKey: ['guest-requests'] })
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter }, () => {
        void qc.invalidateQueries({ queryKey: ['floor'] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tenantId, qc])
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: Enums<'order_status'>; reason?: string }) => {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: v.id,
        p_status: v.status,
        p_reason: v.reason,
      })
      if (error) throw error
      if (v.status === 'ready') pokeOutbox()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })
}

export function useRespondRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: Enums<'guest_request_status'> }) => {
      const { error } = await supabase.rpc('respond_guest_request', {
        p_request_id: v.id,
        p_status: v.status,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guest-requests'] }),
  })
}

export const statusMeta: Record<
  Enums<'order_status'>,
  { label: string; badge: 'warning' | 'info' | 'success' | 'neutral' | 'destructive' }
> = {
  new: { label: 'New', badge: 'warning' },
  accepted: { label: 'Accepted', badge: 'info' },
  preparing: { label: 'Preparing', badge: 'info' },
  ready: { label: 'Ready', badge: 'success' },
  served: { label: 'Served', badge: 'neutral' },
  completed: { label: 'Completed', badge: 'neutral' },
  cancelled: { label: 'Cancelled', badge: 'destructive' },
}

export const nextStep: Partial<
  Record<Enums<'order_status'>, { to: Enums<'order_status'>; label: string }>
> = {
  new: { to: 'accepted', label: 'Accept' },
  accepted: { to: 'preparing', label: 'Start preparing' },
  preparing: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'served', label: 'Mark served' },
}

export const requestLabel: Record<Enums<'guest_request_type'>, string> = {
  assistance: 'Needs assistance',
  water: 'Water',
  napkins: 'Napkins',
  bill: 'Wants the bill',
  other: 'Request',
}

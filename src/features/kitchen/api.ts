import { pokeOutbox } from '@/features/payments/notify'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase, type Enums, type Tables } from '@/lib/supabase'

export type TicketItem = Pick<
  Tables<'order_items'>,
  'id' | 'name' | 'variant_name' | 'quantity' | 'notes' | 'kitchen_station_id' | 'status'
> & { order_item_modifiers: { name: string }[] }

export type Ticket = Tables<'kitchen_tickets'> & {
  orders: Pick<
    Tables<'orders'>,
    'id' | 'order_number' | 'type' | 'source' | 'notes' | 'status' | 'created_at'
  > & {
    tables: { label: string } | null
    order_items: TicketItem[]
  }
}

const SELECT =
  '*, orders(id, order_number, type, source, notes, status, created_at, tables(label), order_items(id, name, variant_name, quantity, notes, kitchen_station_id, status, order_item_modifiers(name)))'

/** Open tickets plus those finished in the last 30 minutes (for recall). */
export function useTickets(tenantId: string | undefined, branchId: string | null) {
  return useQuery({
    queryKey: ['tickets', branchId],
    enabled: !!tenantId && !!branchId,
    refetchInterval: 15_000, // fallback if realtime drops
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 60_000).toISOString()
      const { data, error } = await supabase
        .from('kitchen_tickets')
        .select(SELECT)
        .eq('branch_id', branchId!)
        .or(`status.in.(new,accepted,preparing),and(status.eq.ready,ready_at.gte."${since}")`)
        .order('created_at')
        .limit(300)
      if (error) throw error
      return data as unknown as Ticket[]
    },
  })
}

export function useLiveTickets(tenantId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`kitchen-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kitchen_tickets',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          pokeOutbox() // deliver webhooks for orders placed by guests
          void qc.invalidateQueries({ queryKey: ['tickets'] })
          void qc.invalidateQueries({ queryKey: ['orders'] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tenantId, qc])
}

export function useUpdateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: Enums<'ticket_status'> }) => {
      const { error } = await supabase.rpc('update_ticket_status', {
        p_ticket_id: v.id,
        p_status: v.status,
      })
      if (error) throw error
      if (v.status === 'ready') pokeOutbox()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  })
}

export function useTicketPriority() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; priority: boolean }) => {
      const { error } = await supabase.rpc('set_ticket_priority', {
        p_ticket_id: v.id,
        p_priority: v.priority,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  })
}

export const ticketNext: Partial<
  Record<Enums<'ticket_status'>, { to: Enums<'ticket_status'>; label: string }>
> = {
  new: { to: 'accepted', label: 'Accept' },
  accepted: { to: 'preparing', label: 'Start' },
  preparing: { to: 'ready', label: 'Ready' },
}

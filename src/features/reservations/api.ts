import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { supabase, type Tables } from '@/lib/supabase'

export type Reservation = Tables<'reservations'> & { tables: { label: string } | null }
export type TableReservation = {
  table_id: string
  name: string
  party_size: number
  time: string
  status: string
}

export const statusMeta: Record<
  string,
  { label: string; badge: 'warning' | 'info' | 'success' | 'neutral' | 'destructive' }
> = {
  requested: { label: 'Requested', badge: 'warning' },
  confirmed: { label: 'Confirmed', badge: 'info' },
  seated: { label: 'Seated', badge: 'success' },
  completed: { label: 'Completed', badge: 'neutral' },
  cancelled: { label: 'Cancelled', badge: 'neutral' },
  no_show: { label: 'No-show', badge: 'destructive' },
}

/** Bookings for one local day [from, to) given as ISO instants. */
export function useReservations(branchId: string | null, fromIso: string, toIso: string) {
  return useQuery({
    queryKey: ['reservations', branchId, fromIso],
    enabled: !!branchId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*, tables(label)')
        .eq('branch_id', branchId!)
        .gte('starts_at', fromIso)
        .lt('starts_at', toIso)
        .order('starts_at')
      if (error) throw error
      return data as unknown as Reservation[]
    },
  })
}

export function useTableReservations(branchId: string | null) {
  return useQuery({
    queryKey: ['table-reservations', branchId],
    enabled: !!branchId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('table_reservations', { p_branch_id: branchId! })
      if (error) throw error
      return new Map(((data ?? []) as unknown as TableReservation[]).map((r) => [r.table_id, r]))
    },
  })
}

export function useReservationAction<V>(fn: (v: V) => Promise<unknown>, success?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: V) => {
      await fn(v)
    },
    onSuccess: () => {
      if (success) toast.success(success)
      void qc.invalidateQueries({ queryKey: ['reservations'] })
      void qc.invalidateQueries({ queryKey: ['table-reservations'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw error
  return data
}

/** 19:30 → 7:30 PM */
export const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

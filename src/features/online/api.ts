import { useQuery } from '@tanstack/react-query'
import type { GuestMenu } from '@/features/guest/api'
import { supabase } from '@/lib/supabase'

export type Zone = {
  id: string
  name: string
  fee_minor: number
  min_order_minor: number
  eta_minutes: number
}
export type OnlineBranch = {
  id: string
  name: string
  address: string | null
  phone: string | null
  pickup: boolean
  delivery: boolean
  min_order_minor: number
  prep_minutes: number
  zones: Zone[]
}
export type OnlineInfo = {
  restaurant: GuestMenu['restaurant']
  available: boolean
  branches: OnlineBranch[]
}
export type Tracking = {
  restaurant: string
  slug: string
  branch: string
  branch_phone: string | null
  currency: string
  type: 'takeaway' | 'delivery'
  bill_status: 'open' | 'paid' | 'refunded' | 'void'
  customer_name: string
  delivery_address: string | null
  delivery_zone: string | null
  subtotal_minor: number
  delivery_fee_minor: number
  base_minor: number
  paid_total_minor: number
  order_number: number
  status: 'new' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled'
  placed_at: string
  eta_minutes: number | null
  items: { name: string; variant: string | null; quantity: number; line_total_minor: number }[]
}

export function useOnlineInfo(slug: string) {
  return useQuery({
    queryKey: ['online-info', slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_online_info', { p_slug: slug })
      if (error) throw error
      return data as unknown as OnlineInfo | null
    },
  })
}

export function useBranchMenu(slug: string, branchId: string | undefined) {
  return useQuery({
    queryKey: ['online-menu', slug, branchId],
    enabled: !!branchId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_guest_menu', {
        p_slug: slug,
        p_branch_id: branchId!,
      })
      if (error) throw error
      return data as unknown as GuestMenu
    },
  })
}

export function useTracking(token: string) {
  return useQuery({
    queryKey: ['tracking', token],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('track_online_order', { p_token: token })
      if (error) throw error
      return data as unknown as Tracking | null
    },
  })
}

const RECENT = 'edgex-online-orders'
/** Orders placed from this device (token + label), newest first. */
export function recentOrders(slug: string): { token: string; label: string; at: string }[] {
  try {
    return (
      JSON.parse(localStorage.getItem(`${RECENT}:${slug}`) ?? '[]') as {
        token: string
        label: string
        at: string
      }[]
    ).slice(0, 5)
  } catch {
    return []
  }
}
export function rememberOrder(slug: string, token: string, label: string) {
  try {
    const list = [{ token, label, at: new Date().toISOString() }, ...recentOrders(slug)].slice(0, 5)
    localStorage.setItem(`${RECENT}:${slug}`, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

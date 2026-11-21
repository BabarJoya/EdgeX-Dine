import { useMutation, useQuery } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

type Tr = Partial<Record<string, { name?: string; description?: string }>>

export type GuestModifier = {
  id: string
  name: string
  translations: Tr
  price_minor: number
  is_available: boolean
}
export type GuestGroup = {
  id: string
  name: string
  translations: Tr
  min_select: number
  max_select: number
  modifiers: GuestModifier[]
}
export type GuestVariant = {
  id: string
  name: string
  translations: Tr
  price_minor: number
  is_default: boolean
}
export type GuestProduct = {
  id: string
  category_id: string
  name: string
  description: string
  translations: Tr
  image_path: string | null
  tags: string[]
  price_minor: number
  compare_at_price_minor: number | null
  is_available: boolean
  variants: GuestVariant[]
  group_ids: string[]
}
export type GuestCategory = { id: string; parent_id: string | null; name: string; translations: Tr }
export type GuestMenu = {
  restaurant: {
    name: string
    slug: string
    currency: string
    logo_url: string | null
    brand_color: string | null
  }
  branch: { name: string } | null
  table: { label: string } | null
  can_order: boolean
  categories: GuestCategory[]
  products: GuestProduct[]
  groups: GuestGroup[]
}

export type GuestOrderStatus =
  'new' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled'
export type GuestSession = {
  status: 'open' | 'closed'
  table: string
  currency: string
  orders: {
    id: string
    number: number
    status: GuestOrderStatus
    created_at: string
    total_minor: number
    notes: string
    items: {
      name: string
      variant_name: string | null
      quantity: number
      line_total_minor: number
      notes: string
      modifiers: string[]
    }[]
  }[]
  requests: {
    type: RequestType
    status: 'open' | 'acknowledged' | 'resolved'
    created_at: string
  }[]
}
export type RequestType = 'assistance' | 'water' | 'napkins' | 'bill' | 'other'

export function useGuestMenu(slug: string, tableToken: string | null) {
  return useQuery({
    queryKey: ['guest-menu', slug, tableToken],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_guest_menu', {
        p_slug: slug,
        p_table_token: tableToken ?? undefined,
      })
      if (error) throw error
      return data as unknown as GuestMenu
    },
  })
}

/** Polls every few seconds while the page is visible: reliable on weak mobile data. */
export function useGuestSession(guestToken: string | null) {
  return useQuery({
    queryKey: ['guest-session', guestToken],
    enabled: !!guestToken,
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_guest_session', {
        p_guest_token: guestToken!,
      })
      if (error) throw error
      return (data as unknown as GuestSession | null) ?? null
    },
  })
}

export type CartPayload = {
  product_id: string
  variant_id: string | null
  quantity: number
  modifier_ids: string[]
  notes: string
}[]

export function usePlaceOrder(tableToken: string | null) {
  return useMutation({
    mutationFn: async (v: { items: CartPayload; notes: string }) => {
      const { data, error } = await supabase.rpc('place_guest_order', {
        p_table_token: tableToken!,
        p_items: v.items as unknown as Json,
        p_notes: v.notes,
      })
      if (error) throw error
      return data as unknown as {
        order_id: string
        order_number: number
        total_minor: number
        guest_token: string
      }
    },
  })
}

export function useGuestRequest(tableToken: string | null) {
  return useMutation({
    mutationFn: async (type: RequestType) => {
      const { data, error } = await supabase.rpc('create_guest_request', {
        p_table_token: tableToken!,
        p_type: type,
      })
      if (error) throw error
      return data as unknown as { status: string; duplicate: boolean }
    },
  })
}

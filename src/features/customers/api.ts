import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type Customer = {
  phone: string
  name: string | null
  visits: number
  spent_minor: number
  first_visit: string
  last_visit: string
  avg_rating: number | null
}
export type Visit = {
  bill_number: number
  paid_at: string
  type: string
  branch: string
  total_minor: number
  receipt_token: string
  rating: number | null
  comment: string | null
  items: string | null
}
export type Insights = {
  customers: number
  new_customers: number
  returning_customers: number
  repeat_in_period: number
  reviews: number
  avg_rating: number | null
  distribution: { stars: number; count: number }[]
  recent: {
    rating: number
    comment: string
    customer_name: string | null
    created_at: string
    bill_number: number
    branch: string
  }[]
}

export function useCustomers(
  tenantId: string | undefined,
  branchId: string | null,
  search: string,
) {
  return useQuery({
    queryKey: ['customers', tenantId, branchId, search],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('customers_list', {
        p_tenant_id: tenantId!,
        p_branch_id: branchId ?? undefined,
        p_search: search || undefined,
      })
      if (error) throw error
      return data as unknown as Customer[]
    },
  })
}

export function useCustomerDetail(tenantId: string | undefined, phone: string | null) {
  return useQuery({
    queryKey: ['customer', tenantId, phone],
    enabled: !!tenantId && !!phone,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('customer_detail', {
        p_tenant_id: tenantId!,
        p_phone: phone!,
      })
      if (error) throw error
      return (data as unknown as { visits: Visit[] }).visits
    },
  })
}

export function useInsights(
  tenantId: string | undefined,
  branchId: string | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ['customer-insights', tenantId, branchId, from, to],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('customer_insights', {
        p_tenant_id: tenantId!,
        p_branch_id: branchId as string,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return data as unknown as Insights
    },
  })
}

/** 923001234567 → 0300 1234567 */
export const localPhone = (p: string) =>
  p.startsWith('92') && p.length === 12 ? `0${p.slice(2, 5)} ${p.slice(5)}` : `+${p}`

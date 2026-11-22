import { useQuery } from '@tanstack/react-query'
import type { Enums } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'

export type SalesReport = {
  range: { from: string; to: string; days: number; prev_from: string; prev_to: string }
  currency: string
  totals: {
    net_sales_minor: number
    tax_minor: number
    collected_minor: number
    bills: number
    orders: number
    cancelled_orders: number
    avg_bill_minor: number
    discounts_minor: number
    refunds_minor: number
    prev_net_sales_minor: number
    prev_bills: number
    prev_orders: number
    prev_avg_bill_minor: number
  }
  daily: { date: string; net_sales_minor: number; orders: number }[]
  hourly: { hour: number; orders: number }[]
  top_items: { name: string; quantity: number; revenue_minor: number }[]
  categories: { name: string; quantity: number; revenue_minor: number }[]
  payment_methods: {
    method: Enums<'payment_method'>
    payments: number
    amount_minor: number
    tax_minor: number
  }[]
  sources: {
    source: Enums<'order_source'>
    type: Enums<'order_type'>
    orders: number
    value_minor: number
  }[]
  branches: { name: string; net_sales_minor: number; orders: number }[]
  staff: {
    name: string
    email: string
    net_sales_minor: number
    payments: number
    orders_taken: number
    requests_handled: number
    avg_response_seconds: number | null
  }[]
  kitchen: {
    station: string
    tickets: number
    avg_cook_minutes: number | null
    avg_total_minutes: number | null
    over_20_minutes: number
  }[]
  requests: { count: number; avg_response_seconds: number | null }
}

export function useSalesReport(
  tenantId: string | undefined,
  branchId: string | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ['report', tenantId, branchId, from, to],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sales_report', {
        p_tenant_id: tenantId!,
        p_branch_id: branchId as string,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return data as unknown as SalesReport
    },
  })
}

export type Today = {
  net_sales_minor: number
  orders: number
  open_tables: number
  avg_ticket_minutes: number | null
  yesterday_net_sales_minor: number
}

export function useDashboardToday(
  tenantId: string | undefined,
  branchId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['dashboard-today', tenantId, branchId],
    enabled: !!tenantId && enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_today', {
        p_tenant_id: tenantId!,
        p_branch_id: branchId as string,
      })
      if (error) throw error
      return data as unknown as Today | null
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-provider'
import type { Json } from '@/lib/database.types'
import { supabase, type Enums, type Tables } from '@/lib/supabase'

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw error
  return data as T
}

// ---------------------------------------------------------------------------
// Account status (restaurant side)
// ---------------------------------------------------------------------------
export type TenantAccess = {
  access: 'active' | 'read_only' | 'blocked'
  tenant_status: 'pending' | 'active' | 'suspended'
  features: string[] | null
  ends_at: string | null
  grace_days: number
}

export function useTenantAccess(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenant-access', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: () => rpc<TenantAccess | null>('my_tenant_access', { p_tenant_id: tenantId }),
  })
}

export function useIsPlatformAdmin() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['is-platform-admin', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_platform_admin')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data.is_platform_admin
    },
  })
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export type Plan = Tables<'subscription_plans'>
export type Limits = { branches?: number; tables?: number; staff?: number }

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export type PlanInput = {
  id?: string
  code: string
  name: string
  description: string
  currency: string
  price_monthly_minor: number
  price_yearly_minor: number
  trial_days: number
  limits: Limits
  features: string[]
  is_active: boolean
  is_default_trial: boolean
  sort_order: number
}

export function useSavePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, code, ...v }: PlanInput) => {
      const row = { ...v, limits: v.limits as { [key: string]: Json } }
      const { error } = id
        ? await supabase.from('subscription_plans').update(row).eq('id', id)
        : await supabase.from('subscription_plans').insert({ ...row, code })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  })
}

export function useInvoices(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_invoices')
        .select('*, subscription_plans(name)')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as (Tables<'subscription_invoices'> & {
        subscription_plans: { name: string } | null
      })[]
    },
  })
}

export function useRequestPlanChange(tenantId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { planId: string; cycle: Enums<'billing_cycle'> }) =>
      rpc<string>('request_plan_change', {
        p_tenant_id: tenantId,
        p_plan_id: v.planId,
        p_cycle: v.cycle,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support'] }),
  })
}

// ---------------------------------------------------------------------------
// Support tickets (both sides; RLS decides what each person sees)
// ---------------------------------------------------------------------------
export type Ticket = Tables<'support_tickets'> & { tenants: { name: string } | null }
export type Message = Tables<'support_messages'>

export function useTickets(tenantId?: string) {
  return useQuery({
    queryKey: ['support', tenantId ?? 'all'],
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('support_tickets')
        .select('*, tenants(name)')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (tenantId) q = q.eq('tenant_id', tenantId)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as Ticket[]
    },
  })
}

export function useTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ['support-messages', ticketId],
    enabled: !!ticketId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useCreateTicket(tenantId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { subject: string; category: string; body: string }) =>
      rpc<string>('create_support_ticket', {
        p_tenant_id: tenantId,
        p_subject: v.subject,
        p_category: v.category,
        p_body: v.body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support'] }),
  })
}

export function useReplyTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { ticketId: string; body: string; state?: Enums<'ticket_state'> }) =>
      rpc<void>('reply_support_ticket', {
        p_ticket_id: v.ticketId,
        p_body: v.body,
        p_state: v.state ?? null,
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['support'] }),
        qc.invalidateQueries({ queryKey: ['support-messages'] }),
      ]),
  })
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------
export type Overview = {
  tenants: Record<string, number> | null
  subscriptions: Record<string, number> | null
  mrr_minor: number
  trials_ending_7d: number
  signups_30d: number
  orders_30d: number
  open_tickets: number
}
export type AdminTenant = {
  id: string
  name: string
  slug: string
  status: Enums<'tenant_status'>
  country: string
  currency: string
  created_at: string
  owner_email: string | null
  owner_name: string | null
  plan_name: string | null
  subscription_status: Enums<'subscription_status'> | null
  billing_cycle: Enums<'billing_cycle'> | null
  ends_at: string | null
  access: 'active' | 'read_only' | 'blocked'
  branches: number
  staff: number
  orders_30d: number
  last_order_at: string | null
}
export type TenantDetail = {
  branches: { name: string; city: string | null; is_active: boolean }[]
  members: { name: string; email: string; role: string; status: string }[]
  invoices: {
    amount_minor: number
    currency: string
    method: string
    reference: string | null
    period_end: string
    created_at: string
  }[]
  usage: { products: number; tables: number; orders_30d: number; sales_30d_minor: number }
  history: { action: string; data: { status?: string; reason?: string }; created_at: string }[]
}

export const useAdminOverview = () =>
  useQuery({ queryKey: ['admin', 'overview'], queryFn: () => rpc<Overview>('admin_overview') })

export const useAdminTenants = (search: string) =>
  useQuery({
    queryKey: ['admin', 'tenants', search],
    queryFn: () => rpc<AdminTenant[]>('admin_list_tenants', { p_search: search }),
  })

export const useAdminTenantDetail = (id: string | null) =>
  useQuery({
    queryKey: ['admin', 'tenant', id],
    enabled: !!id,
    queryFn: () => rpc<TenantDetail>('admin_tenant_detail', { p_tenant_id: id }),
  })

function useAdminMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export const useSetTenantStatus = () =>
  useAdminMutation((v: { tenantId: string; status: Enums<'tenant_status'>; reason: string }) =>
    rpc('admin_set_tenant_status', {
      p_tenant_id: v.tenantId,
      p_status: v.status,
      p_reason: v.reason,
    }),
  )

export const useSetSubscription = () =>
  useAdminMutation(
    (v: {
      tenantId: string
      planId: string
      status: Enums<'subscription_status'>
      cycle: Enums<'billing_cycle'>
      endsAt: string
    }) =>
      rpc('admin_set_subscription', {
        p_tenant_id: v.tenantId,
        p_plan_id: v.planId,
        p_status: v.status,
        p_cycle: v.cycle,
        p_ends_at: v.endsAt,
      }),
  )

export const useRecordPayment = () =>
  useAdminMutation(
    (v: {
      tenantId: string
      planId: string
      cycle: Enums<'billing_cycle'>
      amount: number
      method: string
      reference: string
    }) =>
      rpc('admin_record_payment', {
        p_tenant_id: v.tenantId,
        p_plan_id: v.planId,
        p_cycle: v.cycle,
        p_amount_minor: v.amount,
        p_method: v.method,
        p_reference: v.reference,
      }),
  )

export function usePlatformSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_settings').select('*').single()
      if (error) throw error
      return data
    },
  })
}

export const useUpdatePlatformSettings = () =>
  useAdminMutation((v: { requireApproval: boolean; graceDays: number; supportEmail: string }) =>
    rpc('admin_update_settings', {
      p_require_approval: v.requireApproval,
      p_grace_days: v.graceDays,
      p_support_email: v.supportEmail,
    }),
  )

export const FEATURES = [
  { key: 'qr_menu', label: 'QR menu & ordering' },
  { key: 'pos', label: 'POS & billing' },
  { key: 'kds', label: 'Kitchen display' },
  { key: 'online_ordering', label: 'Online ordering' },
  { key: 'reports', label: 'Reports' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'advanced_analytics', label: 'Advanced analytics' },
  { key: 'custom_branding', label: 'Custom branding' },
  { key: 'api', label: 'API access' },
] as const

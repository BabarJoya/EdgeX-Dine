import { useQuery } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'

export type Membership = Tables<'tenant_members'> & {
  tenants: Pick<Tables<'tenants'>, 'id' | 'name' | 'slug' | 'status' | 'currency' | 'timezone'>
  roles: Pick<Tables<'roles'>, 'id' | 'name' | 'is_owner'>
}

export const tenantKeys = {
  memberships: (uid: string) => ['memberships', uid] as const,
  permissions: (tenantId: string) => ['permissions', tenantId] as const,
  branches: (tenantId: string) => ['branches', tenantId] as const,
  subscription: (tenantId: string) => ['subscription', tenantId] as const,
  tenant: (tenantId: string) => ['tenant', tenantId] as const,
}

export function useMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.memberships(userId ?? 'anon'),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_members')
        .select('*, tenants(id, name, slug, status, currency, timezone), roles(id, name, is_owner)')
        .eq('user_id', userId!)
        .eq('status', 'active')
        .order('created_at')
      if (error) throw error
      return data as unknown as Membership[]
    },
  })
}

export function usePermissions(tenantId: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.permissions(tenantId ?? ''),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_permissions', { p_tenant_id: tenantId! })
      if (error) throw error
      // A plain array (cached on the device for offline use); the Set is
      // built when reading.
      return (data ?? []) as string[]
    },
    select: (list) => new Set<string>(list),
  })
}

export function useBranches(tenantId: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.branches(tenantId ?? ''),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useSubscription(tenantId: string | undefined) {
  return useQuery({
    queryKey: tenantKeys.subscription(tenantId ?? ''),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, subscription_plans(*)')
        .eq('tenant_id', tenantId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'

export function useTenantRecord(tenantId: string | undefined) {
  return useQuery({
    queryKey: ['tenant', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export type TenantUpdate = Pick<
  Tables<'tenants'>,
  'name' | 'slug' | 'currency' | 'timezone' | 'brand_color'
>

export function useUpdateTenant(tenantId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: TenantUpdate) => {
      const { error } = await supabase.from('tenants').update(v).eq('id', tenantId!)
      if (error) throw error
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['tenant', tenantId] }),
        qc.invalidateQueries({ queryKey: ['memberships'] }),
      ]),
  })
}

export type BranchInput = Pick<
  Tables<'branches'>,
  'name' | 'city' | 'address' | 'phone' | 'is_active'
>

export function useSaveBranch(tenantId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...v }: BranchInput & { id?: string }) => {
      const clean = {
        ...v,
        name: v.name.trim(),
        city: v.city?.trim() || null,
        address: v.address?.trim() || null,
        phone: v.phone?.trim() || null,
      }
      const { error } = id
        ? await supabase.from('branches').update(clean).eq('id', id)
        : await supabase.from('branches').insert({ ...clean, tenant_id: tenantId! })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches', tenantId] }),
  })
}

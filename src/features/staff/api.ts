import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Enums, type Tables } from '@/lib/supabase'

export type Member = Tables<'tenant_members'> & {
  roles: Pick<Tables<'roles'>, 'id' | 'name' | 'is_owner'>
  member_branches: { branch_id: string }[]
  profile: Pick<Tables<'profiles'>, 'id' | 'full_name' | 'email'> | null
}
export type Role = Tables<'roles'> & { role_permissions: { permission_key: string }[] }
export type Invite = Tables<'tenant_invites'> & { roles: { name: string } | null }

export const staffKeys = {
  members: (t: string) => ['members', t] as const,
  invites: (t: string) => ['invites', t] as const,
  roles: (t: string) => ['roles', t] as const,
  catalog: ['permission-catalog'] as const,
}

export function useMembers(tenantId: string | undefined) {
  return useQuery({
    queryKey: staffKeys.members(tenantId ?? ''),
    enabled: !!tenantId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('tenant_members')
        .select('*, roles(id, name, is_owner), member_branches(branch_id)')
        .eq('tenant_id', tenantId!)
        .order('created_at')
      if (error) throw error
      const ids = data.map((m) => m.user_id)
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids)
      if (pErr) throw pErr
      const byId = new Map(profiles.map((p) => [p.id, p]))
      return (data as unknown as Omit<Member, 'profile'>[]).map((m) => ({
        ...m,
        profile: byId.get(m.user_id) ?? null,
      }))
    },
  })
}

export function useInvites(tenantId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: staffKeys.invites(tenantId ?? ''),
    enabled: !!tenantId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_invites')
        .select('*, roles(name)')
        .eq('tenant_id', tenantId!)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Invite[]
    },
  })
}

export function useRoles(tenantId: string | undefined) {
  return useQuery({
    queryKey: staffKeys.roles(tenantId ?? ''),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*, role_permissions(permission_key)')
        .eq('tenant_id', tenantId!)
        .order('is_owner', { ascending: false })
        .order('is_system', { ascending: false })
        .order('created_at')
      if (error) throw error
      return data as unknown as Role[]
    },
  })
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: staffKeys.catalog,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('permissions').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })
}

function useInvalidate(tenantId: string | undefined) {
  const qc = useQueryClient()
  return (...keys: readonly unknown[][]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))).then(() => {
      if (tenantId) qc.invalidateQueries({ queryKey: ['permissions', tenantId] })
    })
}

export type Assignment = { roleId: string; allBranches: boolean; branchIds: string[] }

export function useInviteMember(tenantId: string | undefined) {
  const invalidate = useInvalidate(tenantId)
  return useMutation({
    mutationFn: async (v: Assignment & { email: string }) => {
      const { data, error } = await supabase.rpc('invite_member', {
        p_tenant_id: tenantId!,
        p_email: v.email,
        p_role_id: v.roleId,
        p_all_branches: v.allBranches,
        p_branch_ids: v.allBranches ? [] : v.branchIds,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => invalidate([...staffKeys.invites(tenantId!)]),
  })
}

export function useRevokeInvite(tenantId: string | undefined) {
  const invalidate = useInvalidate(tenantId)
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from('tenant_invites').delete().eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: () => invalidate([...staffKeys.invites(tenantId!)]),
  })
}

export function useUpdateMember(tenantId: string | undefined) {
  const invalidate = useInvalidate(tenantId)
  return useMutation({
    mutationFn: async (v: Assignment & { memberId: string; status: Enums<'member_status'> }) => {
      const { error } = await supabase.rpc('update_member', {
        p_member_id: v.memberId,
        p_role_id: v.roleId,
        p_all_branches: v.allBranches,
        p_branch_ids: v.allBranches ? [] : v.branchIds,
        p_status: v.status,
      })
      if (error) throw error
    },
    onSuccess: () => invalidate([...staffKeys.members(tenantId!)]),
  })
}

export function useRemoveMember(tenantId: string | undefined) {
  const invalidate = useInvalidate(tenantId)
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('remove_member', { p_member_id: memberId })
      if (error) throw error
    },
    onSuccess: () => invalidate([...staffKeys.members(tenantId!)]),
  })
}

export function useSetRolePermissions(tenantId: string | undefined) {
  const invalidate = useInvalidate(tenantId)
  return useMutation({
    mutationFn: async (v: { roleId: string; permissions: string[] }) => {
      const { error } = await supabase.rpc('set_role_permissions', {
        p_role_id: v.roleId,
        p_permissions: v.permissions,
      })
      if (error) throw error
    },
    onSuccess: () => invalidate([...staffKeys.roles(tenantId!)]),
  })
}

export function useCreateRole(tenantId: string | undefined) {
  const invalidate = useInvalidate(tenantId)
  return useMutation({
    mutationFn: async (v: { name: string; description: string }) => {
      const { data, error } = await supabase
        .from('roles')
        .insert({ tenant_id: tenantId!, name: v.name.trim(), description: v.description.trim() })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => invalidate([...staffKeys.roles(tenantId!)]),
  })
}

export function useDeleteRole(tenantId: string | undefined) {
  const invalidate = useInvalidate(tenantId)
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from('roles').delete().eq('id', roleId)
      if (error) throw error
    },
    onSuccess: () => invalidate([...staffKeys.roles(tenantId!)]),
  })
}

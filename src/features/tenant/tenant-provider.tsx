import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Tables } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-provider'
import { setMonitoringUser } from '@/lib/monitoring'
import { useBranches, useMemberships, usePermissions, type Membership } from './api'

const TENANT_KEY = 'edgex-tenant'
const branchKey = (tenantId: string) => `edgex-branch:${tenantId}`

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: selection lasts for this visit only */
  }
}

type TenantState = {
  memberships: Membership[]
  membership: Membership | null
  tenantId: string | undefined
  setTenantId: (id: string) => void
  branches: Tables<'branches'>[]
  /** null = "All branches" (only offered to members with access to all). */
  branchId: string | null
  branch: Tables<'branches'> | null
  setBranchId: (id: string | null) => void
  permissions: Set<string>
  can: (perm: string) => boolean
  loading: boolean
}

const TenantContext = createContext<TenantState | null>(null)

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const membershipsQ = useMemberships(user?.id)
  const memberships = useMemo(() => membershipsQ.data ?? [], [membershipsQ.data])

  const [preferredTenant, setPreferredTenant] = useState(() => read(TENANT_KEY))
  const membership =
    memberships.find((m) => m.tenant_id === preferredTenant) ?? memberships[0] ?? null
  const tenantId = membership?.tenant_id
  useEffect(() => setMonitoringUser(user?.id ?? null, tenantId), [user?.id, tenantId])

  const permissionsQ = usePermissions(tenantId)
  const branchesQ = useBranches(tenantId)
  const branches = useMemo(
    () => (branchesQ.data ?? []).filter((b) => b.is_active),
    [branchesQ.data],
  )

  // In-memory copy of the branch choice per tenant (storage may be unavailable).
  const [branchChoice, setBranchChoice] = useState<Record<string, string>>({})
  const stored = tenantId ? (branchChoice[tenantId] ?? read(branchKey(tenantId))) : null
  let branchId: string | null
  // A single-branch restaurant never needs "All branches".
  if (branches.length === 1) branchId = branches[0].id
  else if (stored && branches.some((b) => b.id === stored)) branchId = stored
  else if (stored === 'all' && membership?.all_branches) branchId = null
  else branchId = membership?.all_branches ? null : (branches[0]?.id ?? null)

  const setTenantId = useCallback((id: string) => {
    write(TENANT_KEY, id)
    setPreferredTenant(id)
  }, [])

  const setBranchId = useCallback(
    (id: string | null) => {
      if (!tenantId) return
      write(branchKey(tenantId), id ?? 'all')
      setBranchChoice((prev) => ({ ...prev, [tenantId]: id ?? 'all' }))
    },
    [tenantId],
  )

  const permissions = useMemo(() => permissionsQ.data ?? new Set<string>(), [permissionsQ.data])

  const value: TenantState = {
    memberships,
    membership,
    tenantId,
    setTenantId,
    branches,
    branchId,
    branch: branches.find((b) => b.id === branchId) ?? null,
    setBranchId,
    permissions,
    can: (perm) => permissions.has(perm),
    loading:
      membershipsQ.isPending || (!!tenantId && (permissionsQ.isPending || branchesQ.isPending)),
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>')
  return ctx
}

/** Render children only when the current member holds the permission. */
export function Can({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useTenant()
  return can(perm) ? <>{children}</> : null
}

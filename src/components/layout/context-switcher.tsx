import { Building2, Check, ChevronsUpDown, Plus, Store } from 'lucide-react'
import { useNavigate } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTenant } from '@/features/tenant/tenant-provider'

const triggerClass =
  'hover:bg-accent flex h-8 max-w-[11rem] min-w-0 items-center gap-2 rounded-md border px-2.5 text-[13px] sm:max-w-[16rem]'

/** Restaurant switcher (only when the user belongs to more than one). */
export function TenantSwitcher() {
  const { memberships, membership, setTenantId } = useTenant()
  const navigate = useNavigate()
  if (!membership) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass} aria-label="Switch restaurant">
        <Building2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="truncate font-medium">{membership.tenants.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Restaurants</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => setTenantId(m.tenant_id)}>
            <span className="flex-1 truncate">{m.tenants.name}</span>
            <span className="text-xs text-muted-foreground">{m.roles.name}</span>
            {m.id === membership.id && <Check className="!text-foreground" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/onboarding')}>
          <Plus /> New restaurant
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function BranchSwitcher() {
  const { branches, branch, branchId, setBranchId, membership } = useTenant()
  if (!membership) return null
  const canSeeAll = membership.all_branches

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={triggerClass}
        aria-label="Switch branch"
        disabled={branches.length === 0}
      >
        <Store className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="truncate">
          {branch?.name ?? (branchId === null && canSeeAll ? 'All branches' : 'No branch')}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Branch</DropdownMenuLabel>
        {canSeeAll && branches.length > 1 && (
          <DropdownMenuItem onSelect={() => setBranchId(null)}>
            <span className="flex-1">All branches</span>
            {branchId === null && <Check className="!text-foreground" />}
          </DropdownMenuItem>
        )}
        {branches.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => setBranchId(b.id)}>
            <span className="flex-1 truncate">{b.name}</span>
            {b.id === branchId && <Check className="!text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

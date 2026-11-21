import { KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-provider'
import { useIsPlatformAdmin } from '@/features/platform/api'
import { SetPinDialog } from '@/features/pos/cashier-gate'
import { useTenant } from '@/features/tenant/tenant-provider'

function initials(nameOrEmail: string) {
  const parts = nameOrEmail.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function UserMenu() {
  const { user, signOut } = useAuth()
  const { membership, can } = useTenant()
  const [pinOpen, setPinOpen] = useState(false)
  const isAdmin = useIsPlatformAdmin()
  const navigate = useNavigate()
  const name = (user?.user_metadata?.full_name as string | undefined) || user?.email || ''

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-label="Account menu"
        >
          {initials(name)}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-foreground">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate font-normal text-muted-foreground">{user?.email}</div>
            {membership && (
              <div className="mt-1 font-normal text-muted-foreground">{membership.roles.name}</div>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isAdmin.data && (
            <DropdownMenuItem onSelect={() => navigate('/admin')}>
              <ShieldCheck /> Platform admin
            </DropdownMenuItem>
          )}
          {can('pos.use') && (
            <DropdownMenuItem onSelect={() => setPinOpen(true)}>
              <KeyRound /> Set POS PIN
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {pinOpen && <SetPinDialog onClose={() => setPinOpen(false)} />}
    </>
  )
}

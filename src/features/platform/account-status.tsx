import { Clock, LifeBuoy, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-provider'
import { useTenant } from '@/features/tenant/tenant-provider'
import { daysUntil } from '@/lib/utils'
import { useTenantAccess } from './api'

/** Full-page notice for restaurants awaiting approval or suspended. */
export function AccountGate({ children }: { children: ReactNode }) {
  const { tenantId, membership, memberships, setTenantId } = useTenant()
  const { signOut } = useAuth()
  const access = useTenantAccess(tenantId)
  const location = useLocation()
  // Support stays reachable so blocked restaurants can get help.
  if (
    !access.data ||
    access.data.access !== 'blocked' ||
    location.pathname.startsWith('/app/support')
  )
    return <>{children}</>
  const pending = access.data.tenant_status === 'pending'
  const other = memberships.find((m) => m.tenant_id !== tenantId)
  return (
    <AuthLayout>
      {pending ? (
        <Clock className="size-8 text-muted-foreground" strokeWidth={1.5} />
      ) : (
        <ShieldAlert className="size-8 text-destructive" strokeWidth={1.5} />
      )}
      <h1 className="mt-4 text-xl font-semibold">
        {pending ? 'Your restaurant is being reviewed' : 'This account is suspended'}
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {pending
          ? `We're checking ${membership?.tenants.name}'s details. You'll be able to start as soon as it's approved, usually within one working day.`
          : `${membership?.tenants.name} has been suspended. Contact EdgeX support to restore access.`}
      </p>
      <div className="mt-8 grid gap-2">
        <Button variant="secondary" asChild>
          <Link to="/app/support">
            <LifeBuoy /> Contact support
          </Link>
        </Button>
        {other && (
          <Button variant="secondary" onClick={() => setTenantId(other.tenant_id)}>
            Switch to {other.tenants.name}
          </Button>
        )}
        <Button variant="ghost" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </AuthLayout>
  )
}

/** Thin banner at the top of the back office for read-only mode or a trial ending soon. */
export function AccountBanner() {
  const { tenantId, can } = useTenant()
  const access = useTenantAccess(tenantId)
  const a = access.data
  if (!a) return null
  if (a.access === 'read_only') {
    return (
      <div
        role="alert"
        className="border-b bg-warning-soft px-4 py-2 text-center text-[13px] font-medium text-warning sm:px-6"
      >
        Your plan has ended. You can still see everything, but ordering and payments are paused.{' '}
        {can('billing.manage') && (
          <Link to="/app/settings?tab=plan" className="underline underline-offset-2">
            Renew now
          </Link>
        )}
      </div>
    )
  }
  const left = a.ends_at ? daysUntil(a.ends_at) : null
  if (left !== null && left <= 5 && can('billing.manage')) {
    return (
      <div className="border-b bg-info-soft px-4 py-2 text-center text-[13px] text-info sm:px-6">
        {left === 0
          ? 'Your plan ends today.'
          : `Your plan ends in ${left} day${left === 1 ? '' : 's'}.`}{' '}
        <Link to="/app/settings?tab=plan" className="font-medium underline underline-offset-2">
          Choose a plan
        </Link>
      </div>
    )
  }
  return null
}

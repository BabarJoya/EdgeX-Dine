import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { useTenant } from '@/features/tenant/tenant-provider'
import { useAuth } from './auth-provider'

export function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
      <div className="w-48 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}

/** Signed-in users only; others go to /login and come back afterwards. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children ?? <Outlet />
}

/** Users who belong to at least one restaurant; others go to onboarding. */
export function RequireTenant({ children }: { children?: ReactNode }) {
  const { membership, loading } = useTenant()
  if (loading) return <FullPageLoader />
  if (!membership) return <Navigate to="/onboarding" replace />
  return children ?? <Outlet />
}

/** Auth pages: send signed-in users on to where they were going. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading, recovering } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (user && !recovering) {
    const params = new URLSearchParams(location.search)
    const invite = params.get('invite')
    const next = invite && /^[0-9a-f]+$/.test(invite) ? `/invite/${invite}` : params.get('next')
    // Only same-site paths: never redirect to another domain.
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'
    return <Navigate to={safe} replace />
  }
  return children
}

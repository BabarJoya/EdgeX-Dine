import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useInvite } from '@/features/auth/api'
import { useAuth } from '@/features/auth/auth-provider'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export function AcceptInvitePage() {
  const { token = '' } = useParams()
  const { user, signOut } = useAuth()
  const { setTenantId } = useTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const invite = useInvite(token)

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
      if (error) throw error
      return data
    },
    onSuccess: async (tenantId) => {
      await queryClient.invalidateQueries({ queryKey: ['memberships'] })
      setTenantId(tenantId)
      toast.success(`Welcome to ${invite.data?.tenant_name}`)
      navigate('/app', { replace: true })
    },
  })

  const inv = invite.data
  const emailMismatch = !!(user && inv && user.email?.toLowerCase() !== inv.email.toLowerCase())

  return (
    <AuthLayout>
      {invite.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : !inv || !inv.is_valid ? (
        <>
          <h1 className="text-xl font-semibold">Invitation not valid</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            This link has expired or was already used. Ask your manager to send a new invitation.
          </p>
          <Button className="mt-6" variant="secondary" asChild>
            <Link to="/login">Go to sign in</Link>
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Join {inv.tenant_name}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            You've been invited as{' '}
            <span className="font-medium text-foreground">{inv.role_name}</span> ({inv.email}).
          </p>
          <div className="mt-8 grid gap-3">
            {accept.error && <Alert variant="destructive">{errorMessage(accept.error)}</Alert>}
            {!user ? (
              <>
                <Button asChild>
                  <Link to={`/signup?invite=${token}`}>Create account</Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
                    I already have an account
                  </Link>
                </Button>
              </>
            ) : emailMismatch ? (
              <>
                <Alert variant="warning">
                  You're signed in as {user.email}. This invitation is for {inv.email}.
                </Alert>
                <Button variant="secondary" onClick={() => signOut()}>
                  Sign out and switch account
                </Button>
              </>
            ) : (
              <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
                {accept.isPending ? 'Joining…' : `Join ${inv.tenant_name}`}
              </Button>
            )}
          </div>
        </>
      )}
    </AuthLayout>
  )
}

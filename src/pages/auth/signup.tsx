import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useInvite } from '@/features/auth/api'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
})
type Values = z.infer<typeof schema>

export function SignupPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const inviteToken = params.get('invite')
  const invite = useInvite(inviteToken)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (invite.data?.email) form.setValue('email', invite.data.email)
  }, [invite.data?.email, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const after = inviteToken ? `/invite/${inviteToken}` : '/onboarding'
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName },
        emailRedirectTo: `${window.location.origin}${after}`,
      },
    })
    if (error) return setError(errorMessage(error))
    if (data.session) navigate(after, { replace: true })
    else setSentTo(values.email) // email confirmation is switched on
  })

  if (sentTo) {
    return (
      <AuthLayout>
        <MailCheck className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          We sent a confirmation link to{' '}
          <span className="font-medium text-foreground">{sentTo}</span>. Open it on this device to
          continue.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold">
        {invite.data ? `Join ${invite.data.tenant_name}` : 'Create your account'}
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {invite.data
          ? `You've been invited as ${invite.data.role_name}.`
          : 'Start a 14-day free trial. No card needed.'}
      </p>

      <form className="mt-8 grid gap-4" onSubmit={onSubmit} noValidate>
        {inviteToken && invite.isSuccess && !invite.data?.is_valid && (
          <Alert variant="warning">
            This invitation is invalid or has expired. Ask your manager for a new one.
          </Alert>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        <Field id="fullName" label="Your name" error={errors.fullName?.message}>
          <Input
            id="fullName"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
            {...form.register('fullName')}
          />
        </Field>
        <Field
          id="email"
          label="Email"
          error={errors.email?.message}
          hint={invite.data ? 'Invitations are tied to this email address.' : undefined}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            readOnly={!!invite.data}
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          hint="At least 8 characters."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" className="mt-2" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-center text-[13px] text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={
              inviteToken ? `/login?next=${encodeURIComponent(`/invite/${inviteToken}`)}` : '/login'
            }
            className="text-link hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

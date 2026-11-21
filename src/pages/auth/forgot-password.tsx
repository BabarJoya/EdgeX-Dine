import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') })

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<{ email: string }>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    // Same message whether or not the account exists.
    if (error && !/rate limit/i.test(error.message)) setError(errorMessage(error))
    else setSent(true)
  })

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        We'll email you a link to choose a new password.
      </p>
      <form className="mt-8 grid gap-4" onSubmit={onSubmit} noValidate>
        {sent && (
          <Alert variant="success">
            If an account exists for that email, a reset link is on its way.
          </Alert>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </Field>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
        <Link to="/login" className="text-center text-[13px] text-link hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  )
}

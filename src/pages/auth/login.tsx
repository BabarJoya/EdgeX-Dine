import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router'
import { z } from 'zod'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState
  const next = params.get('next')

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword(values)
    // On success the auth listener updates the session and RedirectIfAuthed
    // takes the user to `next` (or the dashboard).
    if (error)
      setError(
        error.message === 'Invalid login credentials'
          ? 'Wrong email or password.'
          : errorMessage(error),
      )
  })

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Welcome back. Sign in to your restaurant.
      </p>

      <form className="mt-8 grid gap-4" onSubmit={onSubmit} noValidate>
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
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          aside={
            <Link to="/forgot-password" className="text-xs text-link hover:underline">
              Forgot password?
            </Link>
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" className="mt-2" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-[13px] text-muted-foreground">
          New to EdgeX?{' '}
          <Link
            to={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
            className="text-link hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

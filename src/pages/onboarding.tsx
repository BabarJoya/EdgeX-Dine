import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Logo } from '@/components/layout/logo'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useAuth } from '@/features/auth/auth-provider'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { SLUG_PATTERN, slugify } from '@/lib/slug'
import { supabase } from '@/lib/supabase'

const currencies = [
  { code: 'PKR', label: 'Pakistani Rupee (PKR)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'SAR', label: 'Saudi Riyal (SAR)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'GBP', label: 'British Pound (GBP)' },
  { code: 'EUR', label: 'Euro (EUR)' },
]
const countryFor: Record<string, string> = {
  PKR: 'PK',
  AED: 'AE',
  SAR: 'SA',
  USD: 'US',
  GBP: 'GB',
  EUR: 'DE',
}
const commonZones = [
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Europe/London',
  'America/New_York',
]

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your restaurant name').max(120),
  slug: z.string().regex(SLUG_PATTERN, '3–48 lowercase letters, numbers or hyphens'),
  branchName: z.string().trim().min(2, 'Name your first branch').max(80),
  city: z.string().trim().max(80).optional(),
  currency: z.string(),
  timezone: z.string(),
})
type Values = z.infer<typeof schema>

function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function OnboardingPage() {
  const { user, signOut } = useAuth()
  const { memberships, setTenantId } = useTenant()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const zones = commonZones.includes(browserZone) ? commonZones : [browserZone, ...commonZones]

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      slug: '',
      branchName: 'Main branch',
      city: '',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
    },
  })
  const { errors } = form.formState
  const [slugEdited, setSlugEdited] = useState(false)
  const name = form.watch('name')
  const slug = form.watch('slug')
  const debouncedSlug = useDebounced(slug)

  useEffect(() => {
    if (!slugEdited) form.setValue('slug', slugify(name), { shouldValidate: name.length > 1 })
  }, [name, slugEdited, form])

  const availability = useQuery({
    queryKey: ['slug-available', debouncedSlug],
    enabled: SLUG_PATTERN.test(debouncedSlug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_slug_available', { p_slug: debouncedSlug })
      if (error) throw error
      return data
    },
  })

  const create = useMutation({
    mutationFn: async (v: Values) => {
      const { data, error } = await supabase.rpc('create_tenant', {
        p_name: v.name,
        p_slug: v.slug,
        p_branch_name: v.branchName,
        p_city: v.city || undefined,
        p_currency: v.currency,
        p_timezone: v.timezone,
        p_country: countryFor[v.currency] ?? 'PK',
      })
      if (error) throw error
      return data
    },
    onSuccess: async (tenantId, v) => {
      await queryClient.invalidateQueries({ queryKey: ['memberships'] })
      setTenantId(tenantId)
      toast.success(`${v.name} is ready`)
      navigate('/app', { replace: true })
    },
  })

  const slugTaken = availability.data === false && debouncedSlug === slug

  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-3 text-[13px]">
          <span className="hidden text-muted-foreground sm:inline">{user?.email}</span>
          {memberships.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => navigate('/app')}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <h1 className="text-xl font-semibold">Set up your restaurant</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          You can change all of this later in Settings. Your 14-day trial starts today.
        </p>

        <form className="mt-8" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
          <Card className="grid gap-5 p-5 sm:p-6">
            {create.error && <Alert variant="destructive">{errorMessage(create.error)}</Alert>}

            <Field id="name" label="Restaurant name" error={errors.name?.message}>
              <Input id="name" placeholder="Karachi Grill" autoFocus {...form.register('name')} />
            </Field>

            <Field
              id="slug"
              label="Menu web address"
              error={
                errors.slug?.message ??
                (slugTaken ? 'This address is taken. Try another.' : undefined)
              }
              hint="Guests see this when they scan your QR code."
            >
              <div className="flex h-9 items-center rounded-md border border-input bg-card text-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
                <span className="border-r px-3 whitespace-nowrap text-muted-foreground">menu/</span>
                <input
                  id="slug"
                  className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={!!errors.slug || slugTaken}
                  {...form.register('slug', { onChange: () => setSlugEdited(true) })}
                />
                <span className="pr-3" aria-live="polite">
                  {SLUG_PATTERN.test(slug) &&
                    (availability.isFetching || debouncedSlug !== slug ? (
                      <Loader2
                        className="size-4 animate-spin text-muted-foreground"
                        aria-label="Checking"
                      />
                    ) : availability.data ? (
                      <Check className="size-4 text-success" aria-label="Available" />
                    ) : availability.data === false ? (
                      <X className="size-4 text-destructive" aria-label="Taken" />
                    ) : null)}
                </span>
              </div>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="branchName" label="First branch" error={errors.branchName?.message}>
                <Input id="branchName" {...form.register('branchName')} />
              </Field>
              <Field id="city" label="City" error={errors.city?.message}>
                <Input id="city" placeholder="Karachi" {...form.register('city')} />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="currency" label="Currency">
                <NativeSelect id="currency" {...form.register('currency')}>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="timezone" label="Time zone">
                <NativeSelect id="timezone" {...form.register('timezone')}>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace('_', ' ')}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <Button type="submit" className="mt-1" disabled={create.isPending || slugTaken}>
              {create.isPending ? 'Creating…' : 'Create restaurant'}
            </Button>
          </Card>
        </form>
      </main>
    </div>
  )
}

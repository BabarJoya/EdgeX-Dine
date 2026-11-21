import { Link } from 'react-router'
import { Logo } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Sign-in screen. The form is wired to Supabase Auth in Phase 1. */
export function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_480px]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-white lg:flex">
        <Logo inverted />
        <div className="max-w-md">
          <p className="text-2xl leading-snug font-medium">
            Orders, tables, kitchen and payments for every branch, in one place.
          </p>
          <p className="mt-3 text-sm text-sidebar-foreground">
            Built for restaurants in Pakistan and beyond.
          </p>
        </div>
        <div className="text-xs text-sidebar-muted">© EdgeX Restaurant ERP</div>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Use the email your restaurant invited you with.
          </p>

          <form className="mt-8 grid gap-4" onSubmit={(e) => e.preventDefault()}>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@restaurant.pk" />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <span className="text-xs text-muted-foreground">Forgot password?</span>
              </div>
              <Input id="password" type="password" autoComplete="current-password" />
            </div>
            <Button type="submit" className="mt-2" disabled title="Sign-in is enabled in Phase 1">
              Sign in
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Sign-in becomes available in Phase 1.{' '}
              <Link to="/app" className="text-link hover:underline">
                Preview the dashboard
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

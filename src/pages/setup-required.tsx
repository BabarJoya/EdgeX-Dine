import { Database } from 'lucide-react'
import { AuthLayout } from '@/components/layout/auth-layout'

/** Shown when the app was deployed without Supabase environment variables. */
export function SetupRequiredPage() {
  return (
    <AuthLayout>
      <Database className="size-8 text-muted-foreground" strokeWidth={1.5} />
      <h1 className="mt-4 text-xl font-semibold">Database not connected</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
        <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> for this deployment, then
        redeploy. See the README for step-by-step setup.
      </p>
    </AuthLayout>
  )
}

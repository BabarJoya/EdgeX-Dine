import { ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { useTenant } from '@/features/tenant/tenant-provider'

/** Page-level guard. The database enforces the same rule; this keeps the UI honest. */
export function RequirePerm({ any, children }: { any: string[]; children: ReactNode }) {
  const { can } = useTenant()
  if (any.some(can)) return <>{children}</>
  return (
    <EmptyState
      icon={ShieldOff}
      title="You don't have access to this page"
      description="Ask your restaurant owner or manager if you need it."
    />
  )
}

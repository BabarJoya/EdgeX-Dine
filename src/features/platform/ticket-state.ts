import type { Enums } from '@/lib/supabase'

export const stateBadge: Record<
  Enums<'ticket_state'>,
  { label: string; variant: 'warning' | 'info' | 'neutral' }
> = {
  open: { label: 'Open', variant: 'warning' },
  waiting: { label: 'Answered', variant: 'info' },
  closed: { label: 'Closed', variant: 'neutral' },
}

import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'

/** Honest placeholder for a module that is scheduled in a later phase. */
export function UpcomingPage({
  title,
  description,
  icon,
  phase,
  summary,
}: {
  title: string
  description: string
  icon: LucideIcon
  phase: string
  summary: string
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`${title} isn't set up yet`}
        description={summary}
        action={<Badge variant="info">Scheduled for {phase}</Badge>}
      />
    </>
  )
}

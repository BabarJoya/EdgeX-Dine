import type { LucideIcon } from 'lucide-react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Full-screen layout for station devices (POS terminal, kitchen screen,
 * waiter phone). No sidebar: these run on shared tablets and TVs.
 */
export function StationPlaceholder({
  name,
  icon,
  phase,
  summary,
}: {
  name: string
  icon: LucideIcon
  phase: string
  summary: string
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to dashboard">
          <Link to="/app">
            <ArrowLeft />
          </Link>
        </Button>
        <Logo />
        <span className="text-sm text-muted-foreground">/ {name}</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main className="grid flex-1 place-items-center p-6">
        <EmptyState
          className="w-full max-w-xl"
          icon={icon}
          title={`${name} isn't available yet`}
          description={summary}
          action={<Badge variant="info">Scheduled for {phase}</Badge>}
        />
      </main>
    </div>
  )
}

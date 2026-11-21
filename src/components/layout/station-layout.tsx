import { ArrowLeft, Maximize } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { Button } from '@/components/ui/button'

/** Full-screen frame for station devices (kitchen screen, waiter phone). */
export function StationLayout({
  title,
  subtitle,
  actions,
  children,
  fullscreen = false,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  fullscreen?: boolean
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-sm sm:px-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to dashboard">
          <Link to="/app">
            <ArrowLeft />
          </Link>
        </Button>
        <Logo className="hidden sm:inline-flex" />
        <div className="min-w-0 sm:border-l sm:pl-3">
          <div className="truncate text-sm leading-tight font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {actions}
          {fullscreen && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Full screen"
              onClick={() =>
                document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen()
              }
            >
              <Maximize />
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  )
}

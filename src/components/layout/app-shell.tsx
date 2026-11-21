import { ChevronsUpDown, PanelLeft, Store } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { SidebarContent } from './sidebar'
import { ThemeToggle } from './theme-toggle'

/** Layout for the owner / manager back office (`/app/*`). */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 lg:block">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <PanelLeft />
          </Button>

          {/* Branch switcher: becomes functional in Phase 1 (tenant membership). */}
          <button
            type="button"
            disabled
            className="flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] hover:bg-accent disabled:cursor-not-allowed"
            title="Available after you create a restaurant"
          >
            <Store className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-muted-foreground">No branch selected</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </button>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

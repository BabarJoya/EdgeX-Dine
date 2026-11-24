import { AlertTriangle, RotateCw } from 'lucide-react'
import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/monitoring'

/** Shown instead of a blank screen when a page crashes; the error is reported. */
export function RouteErrorPage() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  useEffect(() => {
    if (!notFound) reportError(error, { path: window.location.pathname })
  }, [error, notFound])
  // A new deployment replaced the chunk this tab was trying to load.
  const stale =
    /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
      String((error as Error)?.message ?? ''),
    )
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <AlertTriangle className="size-8 text-warning" />
        <h1 className="text-lg font-semibold">
          {stale ? 'A new version is available' : 'Something went wrong on this page'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {stale
            ? 'Reload to get the latest EdgeX.'
            : 'We have been notified. Reloading usually fixes it; your data is safe.'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCw /> Reload
          </Button>
          <Button variant="secondary" onClick={() => (window.location.href = '/')}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  )
}

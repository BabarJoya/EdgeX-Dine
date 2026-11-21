import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <div className="font-mono text-sm text-muted-foreground">404</div>
        <h1 className="mt-2 text-xl font-semibold">This page doesn't exist</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Check the address, or go back to your dashboard.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/app">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}

import { ArrowUpRight, Check, Circle } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const kpis = ['Sales today', 'Orders today', 'Open tables', 'Avg. ticket time']

const setupSteps = [
  { label: 'Connect the database', done: isSupabaseConfigured, phase: 'Phase 0' },
  { label: 'Create your restaurant and first branch', done: false, phase: 'Phase 1' },
  { label: 'Add your menu', done: false, phase: 'Phase 2' },
  { label: 'Add tables and print QR codes', done: false, phase: 'Phase 3' },
  { label: 'Set up kitchen stations', done: false, phase: 'Phase 4' },
  { label: 'Take your first payment', done: false, phase: 'Phase 5' },
]

export function OverviewPage() {
  const doneCount = setupSteps.filter((s) => s.done).length

  return (
    <>
      <PageHeader title="Overview" description="Today across your branches." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((label) => (
          <Card key={label} className="px-4 py-3.5">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">—</div>
            <div className="mt-1 text-xs text-muted-foreground">No data yet</div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Get your restaurant running</CardTitle>
            <CardDescription>
              {doneCount} of {setupSteps.length} steps complete
            </CardDescription>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/design">
              Design system <ArrowUpRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="pb-2">
          <ol className="divide-y">
            {setupSteps.map((step) => (
              <li key={step.label} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border',
                    step.done && 'border-success bg-success text-white',
                  )}
                >
                  {step.done ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : (
                    <Circle className="size-2 fill-current text-border" />
                  )}
                </span>
                <span className={cn('flex-1', step.done && 'text-muted-foreground line-through')}>
                  {step.label}
                </span>
                <Badge variant={step.done ? 'success' : 'neutral'}>
                  {step.done ? 'Done' : step.phase}
                </Badge>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  )
}

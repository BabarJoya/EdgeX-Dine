import { BarChart3, Table2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentType } from 'recharts'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Chart conventions (see the data-viz method): one series per chart in the
 * brand blue, thin bars with 4px rounded data ends, recessive grid and axes,
 * hover tooltips, and a table view of the same numbers for every chart.
 */
export type Column<T> = {
  key: string
  label: string
  align?: 'right'
  render: (row: T) => ReactNode
}

export function ChartCard<T>({
  title,
  description,
  rows,
  columns,
  empty,
  children,
  className,
}: {
  title: string
  description?: string
  rows: T[]
  columns: Column<T>[]
  empty?: string
  children: ReactNode
  className?: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const isEmpty = rows.length === 0
  return (
    <Card role="region" aria-label={title} className={cn('flex min-w-0 flex-col', className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {!isEmpty && (
          <div className="flex rounded-md border p-0.5" role="group" aria-label={`${title} view`}>
            <button
              type="button"
              aria-pressed={view === 'chart'}
              aria-label="Chart"
              onClick={() => setView('chart')}
              className={cn('rounded-sm p-1', view === 'chart' && 'bg-accent')}
            >
              <BarChart3 className="size-4" />
            </button>
            <button
              type="button"
              aria-pressed={view === 'table'}
              aria-label="Table"
              onClick={() => setView('table')}
              className={cn('rounded-sm p-1', view === 'table' && 'bg-accent')}
            >
              <Table2 className="size-4" />
            </button>
          </div>
        )}
      </header>
      <div className="flex-1 px-3 pb-4">
        {isEmpty ? (
          <p className="grid h-40 place-items-center text-sm text-muted-foreground">
            {empty ?? 'No data for this period'}
          </p>
        ) : view === 'chart' ? (
          children
        ) : (
          <div className="max-h-80 overflow-y-auto px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead
                      key={c.key}
                      className={c.align === 'right' ? 'text-right' : undefined}
                    >
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn('h-9', c.align === 'right' && 'text-right tabular-nums')}
                      >
                        {c.render(r)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  )
}

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 }

function TooltipBox({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-semibold">{title}</div>
      {lines.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block size-2 rounded-xs bg-chart-1" aria-hidden /> {k}
          </span>
          <span className="font-medium tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  )
}

/** Vertical bars over a category axis (days, hours). */
export function ColumnChart<T extends Record<string, unknown>>({
  data,
  y,
  xLabel,
  yLabel,
  formatY,
  formatYAxis,
  tooltipTitle,
  height = 240,
}: {
  data: T[]
  y: keyof T & string
  xLabel: (row: T) => string
  yLabel: string
  formatY: (v: number) => string
  formatYAxis?: (v: number) => string
  tooltipTitle?: (row: T) => string
  height?: number
}) {
  const rows = data.map((d) => ({ ...d, __x: xLabel(d) }))
  const tooltipContent: TooltipContentType = (p) =>
    p.active && p.payload?.length ? (
      <TooltipBox
        title={tooltipTitle ? tooltipTitle(p.payload[0].payload as T) : String(p.label)}
        lines={[[yLabel, formatY(Number(p.payload[0].value))]]}
      />
    ) : null
  const many = rows.length > 16
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap={many ? 2 : '20%'}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="__x"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={formatYAxis ?? formatY}
            allowDecimals={false}
          />
          <Tooltip cursor={{ fill: 'var(--accent)' }} content={tooltipContent} />
          <Bar dataKey={y as string} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Horizontal bars for rankings (items, categories, branches, payment methods). */
export function RankChart<T extends Record<string, unknown>>({
  data,
  label,
  value,
  formatValue,
  valueLabel,
  max = 10,
}: {
  data: T[]
  label: (row: T) => string
  value: (row: T) => number
  formatValue: (v: number) => string
  valueLabel: string
  max?: number
}) {
  const rows = data.slice(0, max)
  const top = Math.max(1, ...rows.map(value))
  const total = data.reduce((n, r) => n + value(r), 0)
  return (
    <ul className="grid gap-2.5 px-2 pt-1" aria-label={`${valueLabel} ranking`}>
      {rows.map((r, i) => {
        const v = value(r)
        return (
          <li
            key={i}
            className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]"
            title={`${label(r)}: ${formatValue(v)}`}
          >
            <span className="truncate">{label(r)}</span>
            <span className="relative h-2.5 overflow-hidden rounded-sm bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-chart-1 group-hover:opacity-85"
                style={{ width: `${Math.max(2, (v / top) * 100)}%` }}
              />
            </span>
            <span className="text-right tabular-nums">
              {formatValue(v)}
              {total > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {Math.round((v / total) * 100)}%
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

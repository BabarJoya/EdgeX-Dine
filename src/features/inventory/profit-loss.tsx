import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from './api'

type PL = {
  net_sales_minor: number
  food_cost_minor: number
  wastage_minor: number
  stock_count_minor: number
  gross_profit_minor: number
  expenses: { category: string; amount_minor: number }[]
  expenses_minor: number
  net_profit_minor: number
  food_cost_pct: number | null
}

const categoryName = Object.fromEntries(EXPENSE_CATEGORIES) as Record<string, string>

export function useProfitLoss(
  tenantId: string | undefined,
  branchId: string | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ['profit-loss', tenantId, branchId, from, to],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('profit_loss', {
        p_tenant_id: tenantId!,
        p_branch_id: branchId as string, // null = all branches
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      return data as unknown as PL
    },
  })
}

function Line({
  money,
  label,
  value,
  minus,
  total,
  hint,
  indent,
}: {
  money: (m: number) => string
  label: string
  value: number
  minus?: boolean
  total?: boolean
  hint?: string
  indent?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5',
        total && 'border-t pt-2.5 font-semibold',
        indent && 'pl-4 text-[13px] text-muted-foreground',
      )}
    >
      <dt>
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}
      </dt>
      <dd
        className={cn(
          'tabular-nums',
          total && value < 0 && 'text-destructive',
          total && value > 0 && 'text-success',
        )}
      >
        {(minus && value) || value < 0 ? `−${money(Math.abs(value))}` : money(value)}
      </dd>
    </div>
  )
}

/** Profit & loss statement for the Reports page's date range. */
export function ProfitLossCard({
  tenantId,
  branchId,
  from,
  to,
  currency,
}: {
  tenantId: string | undefined
  branchId: string | null
  from: string
  to: string
  currency: string
}) {
  const pl = useProfitLoss(tenantId, branchId, from, to)
  const money = (m: number) => formatMoney(m, currency)
  const p = pl.data
  return (
    <Card className="px-5 py-4" role="region" aria-label="Profit & loss">
      <h3 className="text-[15px] font-semibold">Profit &amp; loss</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Net sales minus the cost of food sold (from recipes), wastage, stock count differences and
        expenses.
      </p>
      {!p ? (
        <Skeleton className="h-40" />
      ) : (
        <dl className="max-w-xl text-sm" data-testid="profit-loss">
          <Line money={money} label="Net sales" value={p.net_sales_minor} />
          <Line
            money={money}
            label="Food cost"
            value={p.food_cost_minor}
            minus
            hint={p.food_cost_pct !== null ? `${p.food_cost_pct}% of sales` : undefined}
          />
          <Line money={money} label="Wastage" value={p.wastage_minor} minus />
          {p.stock_count_minor !== 0 && (
            <Line
              money={money}
              label="Stock count differences"
              value={Math.abs(p.stock_count_minor)}
              minus={p.stock_count_minor > 0}
            />
          )}
          <Line money={money} label="Gross profit" value={p.gross_profit_minor} total />
          {p.expenses.map((e) => (
            <Line
              money={money}
              key={e.category}
              label={categoryName[e.category] ?? e.category}
              value={e.amount_minor}
              minus
              indent
            />
          ))}
          <Line money={money} label="Expenses" value={p.expenses_minor} minus />
          <Line money={money} label="Net profit" value={p.net_profit_minor} total />
        </dl>
      )}
    </Card>
  )
}

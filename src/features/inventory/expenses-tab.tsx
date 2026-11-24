import { Plus, Receipt, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { addDays, todayIn, ymd } from '@/features/reports/dates'
import { useTenant } from '@/features/tenant/tenant-provider'
import { toMinor } from '@/lib/money'
import { formatMoney } from '@/lib/utils'
import { call, EXPENSE_CATEGORIES, useExpenses, useInventoryAction } from './api'

const categoryName = Object.fromEntries(EXPENSE_CATEGORIES) as Record<string, string>

export function ExpensesTab() {
  const { branchId, can, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const today = todayIn(membership?.tenants.timezone)
  const [month, setMonth] = useState(() => ymd(today).slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const from = `${month}-01`
  const to = ymd(addDays(new Date(y, m, 1), -1))
  const expenses = useExpenses(branchId, from, to)
  const [adding, setAdding] = useState(false)
  const remove = useInventoryAction(
    (id: string) => call('delete_expense', { p_expense_id: id }),
    'Expense deleted',
  )
  const manage = can('inventory.manage')
  const list = expenses.data ?? []
  const total = list.reduce((n, e) => n + e.amount_minor, 0)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field id="exp-month" label="Month">
          <Input
            id="exp-month"
            type="month"
            value={month}
            max={ymd(today).slice(0, 7)}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-44"
          />
        </Field>
        {manage && (
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add expense
          </Button>
        )}
      </div>
      {expenses.data && list.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses this month"
          description="Rent, salaries, bills and other running costs. They are subtracted in the profit & loss report."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid to</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {manage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(`${e.spent_on}T00:00`).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </TableCell>
                  <TableCell>
                    {categoryName[e.category]}
                    {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                  </TableCell>
                  <TableCell>{e.paid_to ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(e.amount_minor, currency)}
                  </TableCell>
                  {manage && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete expense"
                        onClick={() => remove.mutate(e.id)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-medium">
                  Total
                </TableCell>
                <TableCell
                  className="text-right font-semibold tabular-nums"
                  data-testid="expenses-total"
                >
                  {formatMoney(total, currency)}
                </TableCell>
                {manage && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}
      {adding && (
        <ExpenseDialog currency={currency} today={ymd(today)} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}

function ExpenseDialog({
  currency,
  today,
  onClose,
}: {
  currency: string
  today: string
  onClose: () => void
}) {
  const { tenantId, branchId } = useTenant()
  const [f, setF] = useState({
    category: 'rent',
    amount: '',
    spent_on: today,
    paid_to: '',
    note: '',
  })
  const save = useInventoryAction(
    () =>
      call('save_expense', {
        p: {
          tenant_id: tenantId,
          branch_id: branchId,
          category: f.category,
          amount_minor: toMinor(f.amount),
          spent_on: f.spent_on,
          paid_to: f.paid_to,
          note: f.note,
        },
      }),
    'Expense added',
  )
  const ok = (toMinor(f.amount) ?? 0) > 0 && !!f.spent_on
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="exp-cat" label="Category">
            <NativeSelect
              id="exp-cat"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              {EXPENSE_CATEGORIES.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="exp-amount" label="Amount">
            <MoneyInput
              id="exp-amount"
              currency={currency}
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: e.target.value })}
            />
          </Field>
          <Field id="exp-date" label="Date">
            <Input
              id="exp-date"
              type="date"
              max={today}
              value={f.spent_on}
              onChange={(e) => setF({ ...f, spent_on: e.target.value })}
            />
          </Field>
          <Field id="exp-to" label="Paid to">
            <Input
              id="exp-to"
              value={f.paid_to}
              onChange={(e) => setF({ ...f, paid_to: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field id="exp-note" label="Note">
              <Input
                id="exp-note"
                value={f.note}
                onChange={(e) => setF({ ...f, note: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ok || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Add expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

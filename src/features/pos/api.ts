import { pokeOutbox } from '@/features/payments/notify'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { Json } from '@/lib/database.types'
import { supabase, type Enums, type Tables } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Cashier (operator) on this device. Kept for this browser tab only.
// ---------------------------------------------------------------------------
export type Operator = { token: string | null; userId: string; name: string; role: string }
const OP_KEY = 'edgex-pos-operator'

export function useOperator() {
  const [operator, setOperatorState] = useState<Operator | null>(() => {
    try {
      const raw = sessionStorage.getItem(OP_KEY)
      return raw ? (JSON.parse(raw) as Operator) : null
    } catch {
      return null
    }
  })
  const setOperator = useCallback((op: Operator | null) => {
    setOperatorState(op)
    try {
      if (op) sessionStorage.setItem(OP_KEY, JSON.stringify(op))
      else sessionStorage.removeItem(OP_KEY)
    } catch {
      /* ignore */
    }
  }, [])
  return { operator, setOperator }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never)
  if (error) throw error
  return data as T
}

export function usePosUnlock() {
  return useMutation({
    mutationFn: (v: { branchId: string; pin: string }) =>
      rpc<{
        token?: string
        user_id?: string
        name?: string
        role?: string
        error?: string
        message?: string
      }>('pos_unlock', {
        p_branch_id: v.branchId,
        p_pin: v.pin,
      }),
  })
}

export function useSetMyPin() {
  return useMutation({
    mutationFn: (v: { tenantId: string; pin: string }) =>
      rpc<void>('set_my_pin', { p_tenant_id: v.tenantId, p_pin: v.pin }),
  })
}

export async function posLock(token: string | null) {
  if (token) await supabase.rpc('pos_lock', { p_operator_token: token })
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export type Bill = Tables<'bills'> & {
  orders: (Tables<'orders'> & {
    order_items: (Tables<'order_items'> & { order_item_modifiers: { name: string }[] })[]
  })[]
  payments: Tables<'payments'>[]
  table_sessions: { tables: { label: string } | null } | null
}

const BILL_SELECT =
  '*, orders(*, order_items(*, order_item_modifiers(name))), payments(*), table_sessions(tables(label))'

export function useBill(billId: string | null) {
  return useQuery({
    queryKey: ['bill', billId],
    enabled: !!billId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select(BILL_SELECT)
        .eq('id', billId!)
        .single()
      if (error) throw error
      return data as unknown as Bill
    },
  })
}

export function useTodayBills(branchId: string | null) {
  return useQuery({
    queryKey: ['bills', branchId],
    enabled: !!branchId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const since = new Date()
      since.setHours(0, 0, 0, 0)
      const { data, error } = await supabase
        .from('bills')
        .select('*, table_sessions(tables(label))')
        .eq('branch_id', branchId!)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as unknown as (Tables<'bills'> & {
        table_sessions: { tables: { label: string } | null } | null
      })[]
    },
  })
}

/** Tables with guests right now, with their running totals. */
export function useOpenSittings(branchId: string | null) {
  return useQuery({
    queryKey: ['sittings', branchId],
    enabled: !!branchId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('table_sessions')
        .select('id, opened_at, tables(label), orders(total_minor, status)')
        .eq('branch_id', branchId!)
        .eq('status', 'open')
        .order('opened_at')
      if (error) throw error
      return (
        data as unknown as {
          id: string
          opened_at: string
          tables: { label: string } | null
          orders: { total_minor: number; status: string }[]
        }[]
      ).map((s) => ({
        ...s,
        total: s.orders
          .filter((o) => o.status !== 'cancelled')
          .reduce((n, o) => n + o.total_minor, 0),
      }))
    },
  })
}

export function useMyShift(branchId: string | null, userId: string | undefined) {
  return useQuery({
    queryKey: ['shift', branchId, userId],
    enabled: !!branchId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('branch_id', branchId!)
        .eq('user_id', userId!)
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export type ShiftReport = {
  shift_id: string
  status: Enums<'shift_status'>
  cashier: string
  opened_at: string
  closed_at: string | null
  opening_float_minor: number
  by_method: Partial<
    Record<
      Enums<'payment_method'>,
      { count: number; base_minor: number; tax_minor: number; amount_minor: number }
    >
  >
  refunds_minor: number
  cash_in_minor: number
  cash_out_minor: number
  expected_cash_minor: number
  counted_cash_minor: number | null
  variance_minor: number | null
  discounts_minor: number
  bills: number
}

export function useShiftReport(shiftId: string | null) {
  return useQuery({
    queryKey: ['shift-report', shiftId],
    enabled: !!shiftId,
    queryFn: () => rpc<ShiftReport>('shift_report', { p_shift_id: shiftId }),
  })
}

export function useLiveBills(tenantId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`bills-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bills', filter: `tenant_id=eq.${tenantId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['bill'] })
          void qc.invalidateQueries({ queryKey: ['bills'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['sittings'] })
          void qc.invalidateQueries({ queryKey: ['bill'] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [tenantId, qc])
}

// ---------------------------------------------------------------------------
// Actions (all pass the cashier's operator token when there is one)
// ---------------------------------------------------------------------------
function usePosMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all(
        [['bill'], ['bills'], ['sittings'], ['shift'], ['shift-report'], ['orders'], ['floor']].map(
          (k) => qc.invalidateQueries({ queryKey: k }),
        ),
      ),
  })
}

export function useOpenTableBill(op: Operator | null) {
  return usePosMutation((sessionId: string) =>
    rpc<string>('open_table_bill', { p_session_id: sessionId, p_operator_token: op?.token }),
  )
}

export function useCounterOrder(op: Operator | null) {
  return usePosMutation(
    (v: {
      branchId: string
      type: 'takeaway' | 'delivery'
      items: {
        product_id: string
        variant_id: string | null
        quantity: number
        modifier_ids: string[]
        notes: string
      }[]
      notes: string
      customerName: string
      customerPhone: string
    }) =>
      rpc<{ bill_id: string; order_id: string; order_number: number }>('create_counter_order', {
        p_branch_id: v.branchId,
        p_type: v.type,
        p_items: v.items as unknown as Json,
        p_notes: v.notes,
        p_customer_name: v.customerName,
        p_customer_phone: v.customerPhone,
        p_operator_token: op?.token,
      }),
  )
}

export function useDiscount(op: Operator | null) {
  return usePosMutation((v: { billId: string; amount: number; note: string }) =>
    rpc<void>('apply_bill_discount', {
      p_bill_id: v.billId,
      p_amount_minor: v.amount,
      p_note: v.note,
      p_operator_token: op?.token,
    }),
  )
}

export function useTakePayment(op: Operator | null) {
  return usePosMutation(
    (v: {
      billId: string
      method: Enums<'payment_method'>
      base: number
      tendered: number | null
      reference: string
      note: string
    }) =>
      rpc<{
        payment_id: string
        amount_minor: number
        tax_minor: number
        change_minor: number
        bill_status: Enums<'bill_status'>
        remaining_base_minor: number
      }>('take_payment', {
        p_bill_id: v.billId,
        p_method: v.method,
        p_base_minor: v.base,
        p_tendered_minor: v.tendered,
        p_reference: v.reference || null,
        p_note: v.note,
        p_operator_token: op?.token,
      }).then((r) => {
        if (r.bill_status === 'paid') pokeOutbox()
        return r
      }),
  )
}

export function useRefund(op: Operator | null) {
  return usePosMutation((v: { paymentId: string; reason: string }) =>
    rpc<void>('refund_payment', {
      p_payment_id: v.paymentId,
      p_reason: v.reason,
      p_operator_token: op?.token,
    }),
  )
}

export function useOpenShift(op: Operator | null) {
  return usePosMutation((v: { branchId: string; float: number }) =>
    rpc<string>('open_shift', {
      p_branch_id: v.branchId,
      p_opening_float_minor: v.float,
      p_operator_token: op?.token,
    }),
  )
}

export function useCashMovement(op: Operator | null) {
  return usePosMutation(
    (v: { shiftId: string; type: Enums<'cash_movement_type'>; amount: number; reason: string }) =>
      rpc<void>('record_cash_movement', {
        p_shift_id: v.shiftId,
        p_type: v.type,
        p_amount_minor: v.amount,
        p_reason: v.reason,
        p_operator_token: op?.token,
      }),
  )
}

export function useCloseShift(op: Operator | null) {
  return usePosMutation((v: { shiftId: string; counted: number; notes: string }) =>
    rpc<ShiftReport>('close_shift', {
      p_shift_id: v.shiftId,
      p_counted_cash_minor: v.counted,
      p_notes: v.notes,
      p_operator_token: op?.token,
    }),
  )
}

export const methodLabel: Record<Enums<'payment_method'>, string> = {
  cash: 'Cash',
  card: 'Card',
  wallet: 'Wallet',
  bank_transfer: 'Bank / Raast',
}

export function taxBps(branch: Tables<'branches'> | null, method: Enums<'payment_method'>) {
  if (!branch) return 0
  return method === 'cash'
    ? branch.tax_cash_bps
    : method === 'wallet'
      ? branch.tax_wallet_bps
      : branch.tax_card_bps
}

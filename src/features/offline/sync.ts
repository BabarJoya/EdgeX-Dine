import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import { markSale, onQueueChange, queuedSales, removeSale, type OfflineSale } from './queue'

/** Browser online state (plus an explicit "requests are failing" signal). */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** A failed fetch (no connection) as opposed to an error from the server. */
export function isNetworkError(e: unknown) {
  const m = String((e as { message?: string })?.message ?? e)
  return (
    !navigator.onLine ||
    e instanceof TypeError ||
    /Failed to fetch|NetworkError|Load failed|fetch failed|ERR_INTERNET_DISCONNECTED/i.test(m)
  )
}

async function send(s: OfflineSale) {
  const call = (token: string | null) =>
    supabase.rpc('sync_offline_sale', {
      p_branch_id: s.branch_id,
      p_client_ref: s.client_ref,
      p_type: s.type,
      p_items: s.items,
      p_notes: s.notes,
      p_customer_name: s.customer_name,
      p_customer_phone: s.customer_phone,
      p_method: s.method,
      p_offline_at: s.created_at,
      p_charged_minor: s.charged_minor,
      p_operator_token: token ?? undefined,
    })
  let { data, error } = await call(s.operator_token)
  // The cashier's PIN session may have expired while offline: fall back to
  // the signed-in device user (still checked for POS permissions).
  if (error && s.operator_token && /operator|PIN|session/i.test(error.message)) {
    ;({ data, error } = await call(null))
  }
  if (error) throw error
  return data as unknown as { bill_number: number; price_changed: boolean; duplicate: boolean }
}

let running = false

/** Queue length, sync state, and a sync loop that runs whenever we're online. */
export function useOfflineSync() {
  const online = useOnline()
  const [sales, setSales] = useState<OfflineSale[]>([])
  const [syncing, setSyncing] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  const refresh = useCallback(() => void queuedSales().then(setSales), [])
  useEffect(() => {
    refresh()
    return onQueueChange(refresh)
  }, [refresh])

  const sync = useCallback(async () => {
    if (running || !navigator.onLine) return
    running = true
    setSyncing(true)
    let done = 0
    try {
      for (const s of await queuedSales()) {
        try {
          const r = await send(s)
          await removeSale(s.client_ref)
          done++
          if (r.price_changed)
            toast.warning(`Bill #${r.bill_number}: menu prices changed since the offline sale`)
        } catch (e) {
          if (isNetworkError(e)) break
          await markSale(s.client_ref, (e as Error).message)
          // Without a shift nothing else can sync either.
          if (/shift/i.test((e as Error).message)) break
        }
      }
    } finally {
      running = false
      setSyncing(false)
      if (done) {
        toast.success(`${done} offline ${done === 1 ? 'sale' : 'sales'} synced`)
        void queryClient.invalidateQueries({ queryKey: ['bills'] })
        void queryClient.invalidateQueries({ queryKey: ['bill'] })
      }
    }
  }, [])

  useEffect(() => {
    if (online) void sync()
    clearInterval(timer.current)
    if (online) timer.current = setInterval(() => void sync(), 30_000)
    return () => clearInterval(timer.current)
  }, [online, sync])

  return { online, sales, syncing, sync }
}

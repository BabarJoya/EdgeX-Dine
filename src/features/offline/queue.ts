import { createStore, del, entries, set } from 'idb-keyval'
import type { ComposerItem } from '@/features/waiter/compose'
import type { Enums } from '@/lib/supabase'

/** A sale taken while offline, waiting to be sent to the server. */
export type OfflineSale = {
  client_ref: string
  branch_id: string
  type: 'takeaway' | 'delivery'
  items: ComposerItem[]
  /** For the on-screen list and the printed slip only. */
  lines: { name: string; quantity: number; total_minor: number }[]
  notes: string
  customer_name: string
  customer_phone: string
  method: Enums<'payment_method'>
  /** What the till charged, tax included (from the cached menu). */
  charged_minor: number
  tax_minor: number
  created_at: string
  operator_token: string | null
  error?: string
}

const store = createStore('edgex-offline', 'sales')
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

export function onQueueChange(l: () => void) {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export async function queueSale(sale: OfflineSale) {
  await set(sale.client_ref, sale, store)
  changed()
}

export async function queuedSales(): Promise<OfflineSale[]> {
  const all = await entries<string, OfflineSale>(store)
  return all.map(([, v]) => v).sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function removeSale(ref: string) {
  await del(ref, store)
  changed()
}

export async function markSale(ref: string, error: string | undefined) {
  const all = await queuedSales()
  const s = all.find((x) => x.client_ref === ref)
  if (s) await set(ref, { ...s, error }, store)
  changed()
}

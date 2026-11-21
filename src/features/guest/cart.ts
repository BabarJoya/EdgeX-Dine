import { useCallback, useEffect, useState } from 'react'

export type CartLine = {
  key: string
  product_id: string
  variant_id: string | null
  modifier_ids: string[]
  quantity: number
  notes: string
  /** Display only; the server prices the order. */
  unit_minor: number
}

function load(key: string): CartLine[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}

/** Cart kept per table on this device, so a refresh doesn't lose it. */
export function useCart(tableToken: string | null) {
  const key = `edgex-cart:${tableToken ?? 'none'}`
  const [lines, setLines] = useState<CartLine[]>(() => load(key))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(lines))
    } catch {
      /* storage unavailable: cart lasts for this page view */
    }
  }, [key, lines])

  const add = useCallback((line: Omit<CartLine, 'key'>) => {
    setLines((prev) => {
      // Same item with the same choices and notes → increase quantity.
      const same = prev.find(
        (l) =>
          l.product_id === line.product_id &&
          l.variant_id === line.variant_id &&
          l.notes === line.notes &&
          [...l.modifier_ids].sort().join() === [...line.modifier_ids].sort().join(),
      )
      if (same)
        return prev.map((l) =>
          l === same ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l,
        )
      return [...prev, { ...line, key: crypto.randomUUID() }]
    })
  }, [])

  const setQty = useCallback((lineKey: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.key !== lineKey)
        : prev.map((l) => (l.key === lineKey ? { ...l, quantity: Math.min(50, quantity) } : l)),
    )
  }, [])

  const clear = useCallback(() => setLines([]), [])
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const total = lines.reduce((n, l) => n + l.unit_minor * l.quantity, 0)
  return { lines, add, setQty, clear, count, total }
}

export function readGuestToken(tableToken: string | null) {
  if (!tableToken) return null
  try {
    return localStorage.getItem(`edgex-guest:${tableToken}`)
  } catch {
    return null
  }
}

export function saveGuestToken(tableToken: string, guestToken: string) {
  try {
    localStorage.setItem(`edgex-guest:${tableToken}`, guestToken)
  } catch {
    /* ignore */
  }
}

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { flushOutboxNow } from '@/features/payments/notify'
import { supabase } from '@/lib/supabase'
import type { ReceiptData } from '@/features/pos/receipt-types'
import { receiptUrl } from '@/features/pos/receipt-url'
import { receiptBytes } from './documents'
import { loadPrinterSettings, print, type PrinterSettings } from './printer'

export function usePrinterSettings(): PrinterSettings {
  const [s, setS] = useState(loadPrinterSettings)
  useEffect(() => {
    const on = () => setS(loadPrinterSettings())
    window.addEventListener('edgex-printer', on)
    return () => window.removeEventListener('edgex-printer', on)
  }, [])
  return s
}

/**
 * Print a bill's receipt on the connected thermal printer, or fall back to
 * the browser print dialog when no printer is set up on this device.
 */
export function usePrintReceipt() {
  const settings = usePrinterSettings()
  return useCallback(
    async (token: string, opts: { drawer?: boolean } = {}) => {
      if (!settings.transport) {
        window.open(`${receiptUrl(token)}?print=1`, '_blank', 'noopener')
        return
      }
      try {
        // Give the tax authority a moment, so the fiscal number is on the slip.
        await flushOutboxNow()
        const { data, error } = await supabase.rpc('get_receipt', { p_receipt_token: token })
        if (error || !data) throw error ?? new Error('Receipt not found')
        await print(
          receiptBytes(data as unknown as ReceiptData, {
            columns: settings.columns,
            link: receiptUrl(token),
            drawer: opts.drawer,
          }),
          settings,
        )
      } catch (e) {
        toast.error(`Printing failed: ${(e as Error).message}`)
      }
    },
    [settings],
  )
}

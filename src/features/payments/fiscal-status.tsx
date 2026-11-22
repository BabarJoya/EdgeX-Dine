import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { authorityName } from '@/features/pos/receipt-types'
import { errorMessage } from '@/lib/errors'
import { supabase, type Tables } from '@/lib/supabase'
import { pokeOutbox } from './notify'

/** Tax-authority invoice state on a POS bill, with "send again" on failure. */
export function FiscalStatus({ bill }: { bill: Tables<'bills'> }) {
  const qc = useQueryClient()
  const retry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('retry_fiscal_invoice', { p_bill_id: bill.id })
      if (error) throw error
      pokeOutbox()
    },
    onSuccess: () => {
      toast.success('Sending the invoice again')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['bill', bill.id] }), 2500)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (!bill.fiscal_status) return null
  const who = authorityName[bill.fiscal_authority ?? 'fbr']
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]" data-testid="fiscal-status">
      <span className="text-muted-foreground">{who} invoice</span>
      {bill.fiscal_status === 'done' && (
        <Badge variant="success" className="font-mono">
          {bill.fiscal_invoice_number}
        </Badge>
      )}
      {bill.fiscal_status === 'pending' && <Badge variant="warning">Sending…</Badge>}
      {bill.fiscal_status === 'failed' && (
        <>
          <Badge variant="destructive">Not accepted</Badge>
          <span className="text-xs text-destructive">{bill.fiscal_error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
          >
            <RotateCw /> Send again
          </Button>
        </>
      )}
    </div>
  )
}

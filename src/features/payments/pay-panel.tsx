import { useQuery } from '@tanstack/react-query'
import { Copy, Landmark, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/utils'
import { providerName, startOnlinePayment, testGatewayEnabled } from './providers'

type Options = {
  remaining_base_minor: number
  remaining_total_minor: number
  currency: string
  status: string
  providers: string[]
  raast: {
    raast_id: string | null
    iban: string | null
    title: string | null
    bank: string | null
  } | null
  last_attempt: { status: string; provider: string; message: string | null } | null
}

export function usePaymentOptions(token: string) {
  return useQuery({
    queryKey: ['payment-options', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_receipt_payment_options', {
        p_receipt_token: token,
      })
      if (error) throw error
      return data as unknown as Options | null
    },
  })
}

/** Guest-facing "pay this bill" options on the receipt link. */
export function PayPanel({ token }: { token: string }) {
  const options = usePaymentOptions(token)
  const [busy, setBusy] = useState<string | null>(null)
  const o = options.data
  if (!o || o.status !== 'open' || o.remaining_base_minor <= 0) return null
  const providers = [...o.providers, ...(testGatewayEnabled ? ['test_gateway'] : [])]
  if (providers.length === 0 && !o.raast) return null
  const money = (m: number) => formatMoney(m, o.currency)

  const pay = async (provider: string) => {
    setBusy(provider)
    try {
      await startOnlinePayment(token, provider)
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(null)
    }
  }
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined)
    toast.success('Copied')
  }

  return (
    <section
      className="no-print mx-auto mb-4 w-[80mm] max-w-full rounded-lg border bg-card p-4 font-sans shadow-sm"
      aria-label="Pay this bill"
    >
      <div className="text-xs text-muted-foreground">Left to pay</div>
      <div className="text-2xl font-semibold tabular-nums" data-testid="amount-due">
        {money(o.remaining_total_minor)}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Including tax for digital payments</p>
      {providers.length > 0 && (
        <div className="grid gap-2">
          {providers.map((p) => (
            <Button key={p} disabled={!!busy} onClick={() => pay(p)}>
              <Wallet /> {busy === p ? 'Opening…' : `Pay with ${providerName[p] ?? p}`}
            </Button>
          ))}
        </div>
      )}
      {o.raast && (o.raast.raast_id || o.raast.iban) && (
        <div className="mt-3 rounded-md border bg-muted/50 p-3 text-[13px]">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
            <Landmark className="size-4" /> Pay by Raast / bank transfer
          </div>
          {o.raast.title && (
            <div>
              {o.raast.title}
              {o.raast.bank && ` · ${o.raast.bank}`}
            </div>
          )}
          {[
            o.raast.raast_id && ['Raast ID', o.raast.raast_id],
            o.raast.iban && ['IBAN', o.raast.iban],
          ]
            .filter((x): x is [string, string] => !!x)
            .map(([k, v]) => (
              <div key={k} className="mt-1 flex items-center justify-between gap-2">
                <span>
                  <span className="text-muted-foreground">{k} </span>
                  <span className="font-mono">{v}</span>
                </span>
                <Button variant="ghost" size="sm" aria-label={`Copy ${k}`} onClick={() => copy(v)}>
                  <Copy />
                </Button>
              </div>
            ))}
          <p className="mt-2 text-xs text-muted-foreground">
            Send {money(o.remaining_total_minor)}, then show the confirmation to the cashier.
          </p>
        </div>
      )}
    </section>
  )
}

/** Banner after the gateway sends the guest back (?payment=paid|failed|error). */
export function PaymentResult({ result }: { result: string | null }) {
  if (result === 'paid')
    return (
      <Alert variant="success" className="no-print mx-auto mb-4 w-[80mm] max-w-full">
        Payment received. Thank you!
      </Alert>
    )
  if (result === 'failed')
    return (
      <Alert variant="destructive" className="no-print mx-auto mb-4 w-[80mm] max-w-full">
        The payment did not go through. You have not been charged; you can try again.
      </Alert>
    )
  if (result === 'error')
    return (
      <Alert variant="warning" className="no-print mx-auto mb-4 w-[80mm] max-w-full">
        We couldn't confirm the payment. If money left your account, show this page to the cashier.
      </Alert>
    )
  return null
}

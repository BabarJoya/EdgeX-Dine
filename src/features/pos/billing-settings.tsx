import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useBranches } from '@/features/tenant/api'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { supabase, type Tables } from '@/lib/supabase'
import { useMutation, useQueryClient } from '@tanstack/react-query'

const toPct = (bps: number) => String(bps / 100)
const toBps = (pct: string) => Math.round(Number(pct || 0) * 100)
const validPct = (pct: string, max: number) =>
  /^\d{0,2}(\.\d{1,2})?$/.test(pct) && Number(pct || 0) <= max

/** Tax and service charge per branch (Settings → Billing). */
export function BillingSettings() {
  const { tenantId, branchId } = useTenant()
  const branches = useBranches(tenantId)
  const [selected, setSelected] = useState<string | null>(branchId)
  const list = branches.data ?? []
  const branch = list.find((b) => b.id === (selected ?? list[0]?.id))
  if (!branch) return null
  return (
    <div className="grid max-w-2xl gap-4">
      {list.length > 1 && (
        <NativeSelect
          aria-label="Branch"
          value={branch.id}
          onChange={(e) => setSelected(e.target.value)}
          className="max-w-xs"
        >
          {list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      )}
      <BillingForm key={branch.id + branch.updated_at} branch={branch} />
    </div>
  )
}

function BillingForm({ branch }: { branch: Tables<'branches'> }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    tax_label: branch.tax_label,
    cash: toPct(branch.tax_cash_bps),
    card: toPct(branch.tax_card_bps),
    wallet: toPct(branch.tax_wallet_bps),
    service: toPct(branch.service_charge_bps),
    tax_registration: branch.tax_registration ?? '',
    receipt_footer: branch.receipt_footer ?? '',
    google_review_url: branch.google_review_url ?? '',
  })
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('branches')
        .update({
          tax_label: f.tax_label.trim() || 'Sales tax',
          tax_cash_bps: toBps(f.cash),
          tax_card_bps: toBps(f.card),
          tax_wallet_bps: toBps(f.wallet),
          service_charge_bps: toBps(f.service),
          tax_registration: f.tax_registration.trim() || null,
          receipt_footer: f.receipt_footer.trim() || null,
          google_review_url: f.google_review_url.trim() || null,
        })
        .eq('id', branch.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Billing settings saved')
      return qc.invalidateQueries({ queryKey: ['branches'] })
    },
  })
  const pctOk =
    validPct(f.cash, 50) &&
    validPct(f.card, 50) &&
    validPct(f.wallet, 50) &&
    validPct(f.service, 30)
  const pct = (id: keyof typeof f, label: string, hint?: string) => (
    <Field id={`bill-${id}`} label={label} hint={hint}>
      <div className="flex h-9 items-center rounded-md border border-input bg-card text-sm focus-within:border-ring">
        <input
          id={`bill-${id}`}
          inputMode="decimal"
          className="h-full w-full min-w-0 bg-transparent px-3 tabular-nums outline-none"
          value={f[id]}
          onChange={(e) => setF({ ...f, [id]: e.target.value })}
        />
        <span className="pr-3 text-muted-foreground">%</span>
      </div>
    </Field>
  )

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <CardHeader>
          <CardTitle>Tax &amp; service charge · {branch.name}</CardTitle>
          <CardDescription>
            Rates can differ by payment method. For example, Punjab's PRA has used a lower rate for
            card payments than for cash. Check the current rates with your tax adviser.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {save.error && <Alert variant="destructive">{errorMessage(save.error)}</Alert>}
          {!pctOk && (
            <Alert variant="warning">
              Enter percentages like 16 or 7.5 (tax up to 50%, service up to 30%).
            </Alert>
          )}
          <Field id="bill-label" label="Tax name on receipts">
            <Input
              id="bill-label"
              value={f.tax_label}
              onChange={(e) => setF({ ...f, tax_label: e.target.value })}
              placeholder="PRA Sales Tax"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            {pct('cash', 'Tax · cash')}
            {pct('card', 'Tax · card', 'Also used for bank / Raast')}
            {pct('wallet', 'Tax · wallet', 'JazzCash, Easypaisa')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {pct('service', 'Service charge', 'Dine-in only')}
            <Field id="bill-reg" label="Tax registration (NTN / STRN)">
              <Input
                id="bill-reg"
                value={f.tax_registration}
                onChange={(e) => setF({ ...f, tax_registration: e.target.value })}
              />
            </Field>
          </div>
          <Field id="bill-footer" label="Receipt footer">
            <Textarea
              id="bill-footer"
              maxLength={300}
              value={f.receipt_footer}
              onChange={(e) => setF({ ...f, receipt_footer: e.target.value })}
              placeholder="Thank you! Follow us @karachigrill"
            />
          </Field>
          <Field
            id="bill-google"
            label="Google review link"
            hint="Guests who rate their meal 4 or 5 stars on the receipt are invited to post it here."
            error={
              f.google_review_url && !f.google_review_url.startsWith('https://')
                ? 'Use the full https:// link from your Google Business profile'
                : undefined
            }
          >
            <Input
              id="bill-google"
              placeholder="https://g.page/r/…/review"
              value={f.google_review_url}
              onChange={(e) => setF({ ...f, google_review_url: e.target.value })}
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="submit"
            disabled={
              save.isPending ||
              !pctOk ||
              (!!f.google_review_url && !f.google_review_url.startsWith('https://'))
            }
          >
            {save.isPending ? 'Saving…' : 'Save billing settings'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

import { CloudOff, RefreshCw, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { GuestMenu } from '@/features/guest/api'
import { methodLabel, taxBps, type Operator } from '@/features/pos/api'
import type { ReceiptData } from '@/features/pos/receipt-types'
import { receiptBytes } from '@/features/printing/documents'
import { print } from '@/features/printing/printer'
import { usePrinterSettings } from '@/features/printing/use-printer'
import { useTenant } from '@/features/tenant/tenant-provider'
import type { ComposerItem } from '@/features/waiter/compose'
import { toMinor } from '@/lib/money'
import type { Enums } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'
import { queueSale, type OfflineSale } from './queue'
import { useOfflineSync } from './sync'

/** Price the items from the cached menu (the server re-prices on sync). */
export function priceItems(menu: GuestMenu, items: ComposerItem[]) {
  const mods = new Map(menu.groups.flatMap((g) => g.modifiers).map((m) => [m.id, m]))
  return items.map((it) => {
    const p = menu.products.find((x) => x.id === it.product_id)
    const v = p?.variants.find((x) => x.id === it.variant_id)
    const unit =
      (v?.price_minor ?? p?.price_minor ?? 0) +
      it.modifier_ids.reduce((n, id) => n + (mods.get(id)?.price_minor ?? 0), 0)
    return {
      name: `${p?.name ?? 'Item'}${v && (p?.variants.length ?? 0) > 1 ? ` (${v.name})` : ''}`,
      quantity: it.quantity,
      total_minor: unit * it.quantity,
    }
  })
}

export type PendingSale = {
  type: 'takeaway' | 'delivery'
  items: ComposerItem[]
  notes: string
  customer_name: string
  customer_phone: string
}

const METHODS: Enums<'payment_method'>[] = ['cash', 'card']

/** Take payment for a sale while offline; it is queued and synced later. */
export function OfflineCheckout({
  sale,
  menu,
  op,
  onDone,
}: {
  sale: PendingSale
  menu: GuestMenu
  op: Operator
  onDone: () => void
}) {
  const { branch, membership } = useTenant()
  const printer = usePrinterSettings()
  const currency = membership?.tenants.currency ?? 'PKR'
  const money = (m: number) => formatMoney(m, currency)
  const lines = priceItems(menu, sale.items)
  const subtotal = lines.reduce((n, l) => n + l.total_minor, 0)
  const [method, setMethod] = useState<Enums<'payment_method'>>('cash')
  const [tendered, setTendered] = useState('')
  const bps = taxBps(branch, method)
  const tax = Math.round((subtotal * bps) / 10000)
  const total = subtotal + tax
  const given = toMinor(tendered)
  const short = method === 'cash' && given !== null && given < total

  const complete = async () => {
    const s: OfflineSale = {
      client_ref: crypto.randomUUID(),
      branch_id: branch!.id,
      type: sale.type,
      items: sale.items,
      lines,
      notes: sale.notes,
      customer_name: sale.customer_name,
      customer_phone: sale.customer_phone,
      method,
      charged_minor: total,
      tax_minor: tax,
      created_at: new Date().toISOString(),
      operator_token: op.token,
    }
    await queueSale(s)
    if (printer.transport) {
      const slip: ReceiptData = {
        restaurant: membership?.tenants.name ?? '',
        branch: branch?.name ?? '',
        address: branch?.address ?? null,
        phone: branch?.phone ?? null,
        tax_label: branch?.tax_label ?? 'Sales tax',
        tax_registration: branch?.tax_registration ?? null,
        footer: `OFFLINE SALE ${s.client_ref.slice(0, 8).toUpperCase()} - your bill number follows when we are back online.`,
        bill_number: 0,
        fiscal_authority: null,
        fiscal_invoice_number: null,
        fiscal_status: null,
        date: s.created_at,
        paid_at: s.created_at,
        type: sale.type,
        status: 'paid',
        table: null,
        currency,
        customer_name: sale.customer_name || null,
        subtotal_minor: subtotal,
        discount_minor: 0,
        discount_note: '',
        service_bps: 0,
        service_minor: 0,
        delivery_fee_minor: 0,
        delivery_address: null,
        base_minor: subtotal,
        tax_minor: tax,
        paid_total_minor: total,
        items: lines.map((l) => ({
          name: l.name,
          variant: null,
          quantity: l.quantity,
          line_total_minor: l.total_minor,
          modifiers: [],
        })),
        payments: [
          {
            method,
            provider: null,
            amount_minor: total,
            tax_minor: tax,
            tax_bps: bps,
            tendered_minor: method === 'cash' ? given : null,
            change_minor: method === 'cash' && given ? Math.max(0, given - total) : 0,
            status: 'completed',
          },
        ],
      }
      await print(
        receiptBytes(slip, {
          columns: printer.columns,
          drawer: method === 'cash' && printer.drawerOnCash,
        }),
        printer,
      ).catch(() => toast.error('Saved, but the receipt did not print'))
    }
    toast.success('Sale saved on this device. It will sync when the internet is back.')
    onDone()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WifiOff className="size-4" /> Offline sale ·{' '}
            {sale.type === 'takeaway' ? 'Takeaway' : 'Delivery'}
          </DialogTitle>
          <DialogDescription>
            Charged from the menu saved on this device. The bill is created when the connection is
            back.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 text-sm">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>
                {l.quantity} × {l.name}
              </span>
              <span className="tabular-nums">{money(l.total_minor)}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                'h-10 rounded-md border text-sm font-medium',
                method === m ? 'border-primary ring-1 ring-primary' : 'hover:bg-accent',
              )}
            >
              {methodLabel[m]}
            </button>
          ))}
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{money(subtotal)}</dd>
          </div>
          {tax > 0 && (
            <div className="flex justify-between">
              <dt>
                {branch?.tax_label ?? 'Tax'} {bps / 100}%
              </dt>
              <dd className="tabular-nums">{money(tax)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums" data-testid="offline-total">
              {money(total)}
            </dd>
          </div>
        </dl>
        {method === 'cash' && (
          <Field id="off-tendered" label="Cash received">
            <MoneyInput
              id="off-tendered"
              currency={currency}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
            />
          </Field>
        )}
        {method === 'cash' && given !== null && !short && given > total && (
          <Alert variant="success">Give change: {money(given - total)}</Alert>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button disabled={short || !branch} onClick={complete}>
            Complete sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** POS header: connection state and offline sales waiting to sync. */
export function OfflineStatus() {
  const { online, sales, syncing, sync } = useOfflineSync()
  const [open, setOpen] = useState(false)
  const failed = sales.filter((s) => s.error)
  if (online && sales.length === 0) return null
  return (
    <>
      <Button
        variant={online ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(!online && 'text-warning')}
        data-testid="offline-status"
      >
        {online ? <RefreshCw className={cn(syncing && 'animate-spin')} /> : <CloudOff />}
        {online
          ? `${sales.length} to sync`
          : `Offline${sales.length ? ` · ${sales.length} saved` : ''}`}
        {failed.length > 0 && <Badge variant="destructive">{failed.length}</Badge>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[24rem] overflow-y-auto p-5">
          <SheetTitle className="text-lg font-semibold">Offline sales</SheetTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            {online
              ? 'Back online. Saved sales are being sent to the server.'
              : 'No internet. Takeaway and delivery sales are saved on this device and sync automatically.'}
          </p>
          <ul className="grid gap-2">
            {sales.map((s) => (
              <li key={s.client_ref} className="rounded-md border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {s.type === 'takeaway' ? 'Takeaway' : 'Delivery'}
                    {s.customer_name && ` · ${s.customer_name}`}
                  </span>
                  <span className="tabular-nums">{formatMoney(s.charged_minor, 'PKR')}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  · {methodLabel[s.method]} ·{' '}
                  {s.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}
                </div>
                {s.error && <div className="mt-1 text-xs text-destructive">{s.error}</div>}
              </li>
            ))}
          </ul>
          {online && sales.length > 0 && (
            <Button className="mt-4 w-full" disabled={syncing} onClick={() => void sync()}>
              <RefreshCw /> Sync now
            </Button>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

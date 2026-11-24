import { useMutation } from '@tanstack/react-query'
import { Bike, Check, Clock, MapPin, Minus, Phone, Plus, ShoppingBag, Store } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type { GuestProduct } from '@/features/guest/api'
import { useCart } from '@/features/guest/cart'
import { ItemSheet } from '@/features/guest/item-sheet'
import {
  recentOrders,
  rememberOrder,
  useBranchMenu,
  useOnlineInfo,
  useTracking,
} from '@/features/online/api'
import { pokeOutbox } from '@/features/payments/notify'
import { PayPanel, PaymentResult } from '@/features/payments/pay-panel'
import { errorMessage } from '@/lib/errors'
import { menuImageUrl } from '@/lib/images'
import { supabase } from '@/lib/supabase'
import { cn, formatMoney } from '@/lib/utils'

function useBrand(color: string | null | undefined) {
  useEffect(() => {
    if (color) document.documentElement.style.setProperty('--guest-accent', color)
  }, [color])
}

/** Public ordering site: /o/:slug */
export function OrderOnlinePage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const info = useOnlineInfo(slug)
  const i = info.data
  useBrand(i?.restaurant.brand_color)
  const [branchId, setBranchId] = useState<string>()
  const branch = i?.branches.find((b) => b.id === branchId) ?? i?.branches[0]
  const [mode, setMode] = useState<'takeaway' | 'delivery'>('takeaway')
  const effectiveMode =
    branch && !branch.pickup ? 'delivery' : branch && !branch.delivery ? 'takeaway' : mode
  const [zoneId, setZoneId] = useState('')
  const zone = branch?.zones.find((z) => z.id === zoneId)
  const menu = useBranchMenu(slug, branch?.id)
  const cart = useCart(`online:${slug}:${branch?.id ?? ''}`)
  const [open, setOpen] = useState<GuestProduct | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const currency = i?.restaurant.currency ?? 'PKR'
  const money = (m: number) => formatMoney(m, currency)
  const recent = useMemo(() => recentOrders(slug), [slug])

  if (info.isPending) return <Skeleton className="m-6 h-96" />
  if (!i) return <p className="p-6 text-center text-sm">Restaurant not found.</p>

  const m = menu.data
  const cats = (m?.categories ?? []).filter((c) => m?.products.some((p) => p.category_id === c.id))
  const catOrder = new Map(cats.map((c, n) => [c.id, n]))
  // "All" lists items category by category, in menu order.
  const products = (m?.products ?? [])
    .filter((p) => !category || p.category_id === category)
    .map((p, n) => ({ p, n }))
    .sort(
      (a, b) =>
        (catOrder.get(a.p.category_id) ?? 0) - (catOrder.get(b.p.category_id) ?? 0) || a.n - b.n,
    )
    .map(({ p }) => p)

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="bg-[var(--guest-accent)] px-4 py-5 text-[var(--guest-accent-fg)]">
        <div className="mx-auto max-w-2xl">
          <div className="text-sm opacity-80">Order online</div>
          <h1 className="text-2xl font-semibold">{i.restaurant.name}</h1>
        </div>
      </header>
      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-4">
        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">Your recent orders:</span>
            {recent.map((r) => (
              <Link
                key={r.token}
                to={`/o/${slug}/track/${r.token}`}
                className="text-link hover:underline"
              >
                {r.label}
              </Link>
            ))}
          </div>
        )}
        {!i.available || i.branches.length === 0 ? (
          <Alert variant="info">{i.restaurant.name} is not taking online orders right now.</Alert>
        ) : (
          <>
            <section
              className="grid gap-3 rounded-lg border bg-card p-4"
              aria-label="Order details"
            >
              {i.branches.length > 1 && (
                <Field id="on-branch" label="Branch">
                  <NativeSelect
                    id="on-branch"
                    value={branch?.id}
                    onChange={(e) => (setBranchId(e.target.value), setZoneId(''))}
                  >
                    {i.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {branch && branch.pickup && branch.delivery && (
                <div
                  className="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Pickup or delivery"
                >
                  {(
                    [
                      ['takeaway', 'Pickup', Store],
                      ['delivery', 'Delivery', Bike],
                    ] as const
                  ).map(([k, label, Icon]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={effectiveMode === k}
                      onClick={() => setMode(k)}
                      className={cn(
                        'flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium',
                        effectiveMode === k
                          ? 'border-[var(--guest-accent)] bg-[var(--guest-accent)] text-[var(--guest-accent-fg)]'
                          : 'bg-card',
                      )}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>
              )}
              {effectiveMode === 'delivery' ? (
                <Field id="on-zone" label="Deliver to">
                  <NativeSelect
                    id="on-zone"
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                  >
                    <option value="">Choose your area…</option>
                    {branch?.zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} · {z.fee_minor ? money(z.fee_minor) : 'free'} · ~{z.eta_minutes}{' '}
                        min
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : (
                branch && (
                  <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <MapPin className="size-3.5" /> Pick up from {branch.name}
                    {branch.address && `, ${branch.address}`} · ready in about {branch.prep_minutes}{' '}
                    min
                  </p>
                )
              )}
            </section>

            {cats.length > 1 && (
              <nav className="-mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Categories">
                {[{ id: null, name: 'All' }, ...cats].map((c) => (
                  <button
                    key={c.id ?? 'all'}
                    type="button"
                    aria-pressed={category === c.id}
                    onClick={() => setCategory(c.id)}
                    className={cn(
                      'h-8 shrink-0 rounded-full border px-3 text-[13px]',
                      category === c.id
                        ? 'border-foreground bg-foreground text-background'
                        : 'bg-card',
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </nav>
            )}

            {!m ? (
              <Skeleton className="h-64" />
            ) : (
              <ul className="divide-y rounded-lg border bg-card" aria-label="Menu">
                {products.map((p) => {
                  const img = menuImageUrl(p.image_path)
                  const from = p.variants.length
                    ? Math.min(...p.variants.map((v) => v.price_minor))
                    : p.price_minor
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={!p.is_available}
                        onClick={() => setOpen(p)}
                        className="flex w-full gap-3 p-3 text-start disabled:opacity-55"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{p.name}</div>
                          {p.description && (
                            <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                              {p.description}
                            </p>
                          )}
                          <div className="mt-1.5 text-sm font-medium tabular-nums">
                            {p.is_available ? (
                              <>
                                {p.variants.length > 1 && 'from '}
                                {money(from)}
                              </>
                            ) : (
                              <span className="text-xs text-warning">Sold out</span>
                            )}
                          </div>
                        </div>
                        {img && (
                          <img
                            src={img}
                            alt=""
                            loading="lazy"
                            className="size-20 shrink-0 rounded-md object-cover"
                          />
                        )}
                        {p.is_available && (
                          <span
                            className="grid size-8 shrink-0 place-items-center self-center rounded-full border"
                            aria-hidden
                          >
                            <Plus className="size-4" />
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </main>

      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-card/95 p-3 backdrop-blur">
          <Button
            size="lg"
            className="mx-auto flex w-full max-w-2xl justify-between bg-[var(--guest-accent)] text-[var(--guest-accent-fg)] hover:bg-[var(--guest-accent)]/90"
            onClick={() => setCheckout(true)}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag /> {cart.count} {cart.count === 1 ? 'item' : 'items'}
            </span>
            <span className="tabular-nums">Checkout · {money(cart.total)}</span>
          </Button>
        </div>
      )}

      {open && m && (
        <ItemSheet
          menu={m}
          product={open}
          lang="en"
          onAdd={(l) => (cart.add(l), setOpen(null))}
          onClose={() => setOpen(null)}
        />
      )}

      <Sheet open={checkout} onOpenChange={setCheckout}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto p-4">
          {branch && (
            <Checkout
              slug={slug}
              branchId={branch.id}
              mode={effectiveMode}
              zone={zone}
              minOrder={Math.max(branch.min_order_minor, zone?.min_order_minor ?? 0)}
              cart={cart}
              money={money}
              names={new Map((m?.products ?? []).map((p) => [p.id, p]))}
              onPlaced={(token, label) => {
                rememberOrder(slug, token, label)
                cart.clear()
                navigate(`/o/${slug}/track/${token}`)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Checkout({
  branchId,
  mode,
  zone,
  minOrder,
  cart,
  money,
  names,
  onPlaced,
}: {
  slug: string
  branchId: string
  mode: 'takeaway' | 'delivery'
  zone: { id: string; name: string; fee_minor: number } | undefined
  minOrder: number
  cart: ReturnType<typeof useCart>
  money: (m: number) => string
  names: Map<string, GuestProduct>
  onPlaced: (token: string, label: string) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const fee = mode === 'delivery' ? (zone?.fee_minor ?? 0) : 0
  const place = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('place_online_order', {
        p_branch_id: branchId,
        p_type: mode,
        p_items: cart.lines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          modifier_ids: l.modifier_ids,
          quantity: l.quantity,
          notes: l.notes,
        })),
        p_name: name,
        p_phone: phone,
        p_zone_id: zone?.id,
        p_address: address,
        p_notes: notes,
      })
      if (error) throw error
      return data as unknown as { token: string; order_number: number }
    },
    onSuccess: (d) => (pokeOutbox(), onPlaced(d.token, `#${d.order_number}`)),
  })
  const short = cart.total < minOrder
  const ok =
    name.trim() &&
    phone.replace(/\D/g, '').length >= 10 &&
    !short &&
    (mode === 'takeaway' || (zone && address.trim()))
  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <SheetTitle className="text-lg font-semibold">Your order</SheetTitle>
      <ul className="grid gap-2" aria-label="Cart">
        {cart.lines.map((l) => {
          const p = names.get(l.product_id)
          const variant = p?.variants.find((v) => v.id === l.variant_id)
          return (
            <li key={l.key} className="flex items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {p?.name}
                  {variant && p && p.variants.length > 1 && ` (${variant.name})`}
                </div>
                {l.notes && <div className="text-xs text-muted-foreground">{l.notes}</div>}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-7"
                  aria-label="One less"
                  onClick={() => cart.setQty(l.key, l.quantity - 1)}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-6 text-center tabular-nums">{l.quantity}</span>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-7"
                  aria-label="One more"
                  onClick={() => cart.setQty(l.key, l.quantity + 1)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <span className="w-20 text-right tabular-nums">
                {money(l.unit_minor * l.quantity)}
              </span>
            </li>
          )
        })}
      </ul>
      <dl className="grid gap-1 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{money(cart.total)}</dd>
        </div>
        {mode === 'delivery' && (
          <div className="flex justify-between">
            <dt>Delivery{zone ? ` · ${zone.name}` : ''}</dt>
            <dd className="tabular-nums">{zone ? (fee ? money(fee) : 'Free') : '—'}</dd>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums" data-testid="checkout-total">
            {money(cart.total + fee)}
          </dd>
        </div>
        <p className="text-xs text-muted-foreground">
          Tax is added on the bill as per your payment method.
        </p>
      </dl>
      {short && <Alert variant="warning">The minimum order is {money(minOrder)}.</Alert>}
      {mode === 'delivery' && !zone && (
        <Alert variant="warning">Choose your delivery area first.</Alert>
      )}
      <div className="grid gap-3">
        <Field id="co-name" label="Your name">
          <Input
            id="co-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          id="co-phone"
          label="Mobile number"
          hint="The restaurant may call to confirm your order."
        >
          <Input
            id="co-phone"
            type="tel"
            autoComplete="tel"
            placeholder="0300 1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        {mode === 'delivery' && (
          <Field id="co-address" label="Delivery address">
            <Textarea
              id="co-address"
              autoComplete="street-address"
              maxLength={300}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
        )}
        <Field id="co-notes" label="Notes for the restaurant (optional)">
          <Input
            id="co-notes"
            maxLength={200}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      {place.error && <Alert variant="destructive">{errorMessage(place.error)}</Alert>}
      <Button
        size="lg"
        className="bg-[var(--guest-accent)] text-[var(--guest-accent-fg)] hover:bg-[var(--guest-accent)]/90"
        disabled={!ok || place.isPending}
        onClick={() => place.mutate()}
      >
        Place order · {money(cart.total + fee)}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Pay on {mode === 'delivery' ? 'delivery' : 'pickup'}, or online from your order page if the
        restaurant accepts it.
      </p>
    </div>
  )
}

const STEPS = [
  ['new', 'Order received'],
  ['accepted', 'Confirmed'],
  ['preparing', 'Being prepared'],
  ['ready', 'Ready'],
  ['served', 'Done'],
] as const
const rank: Record<string, number> = {
  new: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  served: 4,
  completed: 4,
}

/** Order tracking: /o/:slug/track/:token */
export function TrackOrderPage() {
  const { slug = '', token = '' } = useParams()
  const t = useTracking(token)
  const o = t.data
  const params = new URLSearchParams(window.location.search)
  if (t.isPending) return <Skeleton className="m-6 h-96" />
  if (!o) return <p className="p-6 text-center text-sm">Order not found.</p>
  const money = (m: number) => formatMoney(m, o.currency)
  const current = rank[o.status] ?? 0
  const eta = o.eta_minutes
    ? new Date(new Date(o.placed_at).getTime() + o.eta_minutes * 60_000)
    : null
  const readyLabel = o.type === 'delivery' ? 'On the way' : 'Ready for pickup'
  const doneLabel = o.type === 'delivery' ? 'Delivered' : 'Collected'
  return (
    <div className="min-h-dvh bg-background px-4 py-6">
      <main className="mx-auto grid max-w-md gap-4">
        <div>
          <Link to={`/o/${slug}`} className="text-sm text-link hover:underline">
            ← {o.restaurant}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Order #{o.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            {o.type === 'delivery'
              ? `Delivery to ${o.delivery_address}`
              : `Pickup from ${o.branch}`}
          </p>
        </div>
        {o.status === 'cancelled' ? (
          <Alert variant="destructive" data-testid="track-status">
            This order was cancelled. Please call the restaurant if you have questions.
          </Alert>
        ) : (
          <ol
            className="grid gap-2 rounded-lg border bg-card p-4"
            data-testid="track-status"
            aria-label="Order progress"
          >
            {STEPS.map(([k, label], idx) => {
              const done = current > idx
              const now = current === idx
              const text = k === 'ready' ? readyLabel : k === 'served' ? doneLabel : label
              return (
                <li
                  key={k}
                  className={cn(
                    'flex items-center gap-3 text-sm',
                    !done && !now && 'text-muted-foreground',
                  )}
                  aria-current={now ? 'step' : undefined}
                >
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full border',
                      done && 'border-success bg-success text-success-foreground',
                      now && 'border-[var(--guest-accent)] text-[var(--guest-accent)]',
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : idx + 1}
                  </span>
                  <span className={cn(now && 'font-semibold')}>{text}</span>
                </li>
              )
            })}
            {eta && current < 3 && (
              <li className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                <Clock className="size-3.5" /> Expected around{' '}
                {eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </li>
            )}
          </ol>
        )}
        <PaymentResult result={params.get('payment')} className="w-full" />
        {o.bill_status === 'open' && o.status !== 'cancelled' && (
          <PayPanel token={token} className="w-full" />
        )}
        <section className="rounded-lg border bg-card p-4 text-sm">
          <ul className="grid gap-1">
            {o.items.map((it, n) => (
              <li key={n} className="flex justify-between gap-3">
                <span>
                  {it.quantity} × {it.name}
                  {it.variant && ` (${it.variant})`}
                </span>
                <span className="tabular-nums">{money(it.line_total_minor)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 grid gap-1 border-t pt-2">
            {o.delivery_fee_minor > 0 && (
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd className="tabular-nums">{money(o.delivery_fee_minor)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <dt>{o.bill_status === 'paid' ? 'Paid' : 'To pay (before tax)'}</dt>
              <dd className="tabular-nums">
                {money(o.bill_status === 'paid' ? o.paid_total_minor : o.base_minor)}
              </dd>
            </div>
          </dl>
        </section>
        <div className="flex flex-wrap gap-2">
          {o.branch_phone && (
            <Button variant="secondary" asChild>
              <a href={`tel:${o.branch_phone}`}>
                <Phone /> Call {o.branch}
              </a>
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link to={`/r/${token}`}>View bill</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}

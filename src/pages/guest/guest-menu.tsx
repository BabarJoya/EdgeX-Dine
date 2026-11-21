import { useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CheckCircle2,
  Minus,
  Plus,
  QrCode,
  Receipt,
  Search,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  useGuestMenu,
  useGuestRequest,
  useGuestSession,
  usePlaceOrder,
  type GuestMenu,
  type GuestProduct,
  type GuestSession,
  type RequestType,
} from '@/features/guest/api'
import { readGuestToken, saveGuestToken, useCart } from '@/features/guest/cart'
import { strings, tr, trl, type Lang, type Strings } from '@/features/guest/i18n'
import { ItemSheet } from '@/features/guest/item-sheet'
import { readableOn } from '@/lib/color'
import { errorMessage } from '@/lib/errors'
import { menuImageUrl } from '@/lib/images'
import { cn, formatMoney } from '@/lib/utils'

/**
 * Guest-facing QR menu. Separate, mobile-first layout with no staff chrome;
 * kept light so it loads quickly on a budget phone over mobile data.
 */
export function GuestMenuPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const tableToken = params.get('t')
  const menu = useGuestMenu(slug, tableToken)
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('edgex-guest-lang') as Lang) || 'en'
    } catch {
      return 'en'
    }
  })
  const t = strings[lang]

  const changeLang = () => {
    const next = lang === 'en' ? 'ur' : 'en'
    setLang(next)
    try {
      localStorage.setItem('edgex-guest-lang', next)
    } catch {
      /* ignore */
    }
  }

  if (menu.isPending) return <GuestSkeleton />
  if (menu.error || !menu.data) {
    const hint = (menu.error as { hint?: string } | null)?.hint
    return (
      <Centered icon={QrCode} title={hint === 'bad_table' ? t.badTable : t.notFound} lang={lang} />
    )
  }
  return <GuestApp menu={menu.data} tableToken={tableToken} lang={lang} t={t} onLang={changeLang} />
}

function GuestApp({
  menu,
  tableToken,
  lang,
  t,
  onLang,
}: {
  menu: GuestMenu
  tableToken: string | null
  lang: Lang
  t: Strings
  onLang: () => void
}) {
  const accent = menu.restaurant.brand_color || '#13233F'
  // Set on <html> so pop-up sheets (rendered outside this tree) get the brand colour too.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--guest-accent', accent)
    root.style.setProperty('--guest-accent-fg', readableOn(accent))
    return () => {
      root.style.removeProperty('--guest-accent')
      root.style.removeProperty('--guest-accent-fg')
    }
  }, [accent])
  const currency = menu.restaurant.currency
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<'menu' | 'orders'>('menu')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<GuestProduct | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [sentNumber, setSentNumber] = useState<number | null>(null)
  const [guestToken, setGuestToken] = useState(() => readGuestToken(tableToken))

  const cart = useCart(tableToken)
  const session = useGuestSession(guestToken)
  const place = usePlaceOrder(tableToken)

  const topCats = menu.categories.filter((c) => !c.parent_id)
  const catIdsUnder = (id: string) =>
    new Set([id, ...menu.categories.filter((c) => c.parent_id === id).map((c) => c.id)])

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (p: GuestProduct) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      tr('ur', p).includes(query.trim()) ||
      p.description.toLowerCase().includes(q)
    return topCats
      .filter((c) => !categoryId || c.id === categoryId)
      .map((c) => {
        const ids = catIdsUnder(c.id)
        return {
          category: c,
          products: menu.products.filter((p) => ids.has(p.category_id) && match(p)),
        }
      })
      .filter((s) => s.products.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, categoryId, query])

  const productById = (id: string) => menu.products.find((p) => p.id === id)

  const submitOrder = (notes: string) =>
    place.mutate(
      {
        items: cart.lines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          quantity: l.quantity,
          modifier_ids: l.modifier_ids,
          notes: l.notes,
        })),
        notes,
      },
      {
        onSuccess: (res) => {
          if (tableToken) saveGuestToken(tableToken, res.guest_token)
          setGuestToken(res.guest_token)
          cart.clear()
          setCartOpen(false)
          setTab('orders')
          setSentNumber(res.order_number)
          void queryClient.invalidateQueries({ queryKey: ['guest-session'] })
        },
        // Something changed (e.g. sold out): refresh prices and availability.
        onError: () => void queryClient.invalidateQueries({ queryKey: ['guest-menu'] }),
      },
    )

  const closed = session.data?.status === 'closed'

  return (
    <div
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
      className="mx-auto min-h-dvh max-w-md bg-background pb-28"
    >
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          {menu.restaurant.logo_url ? (
            <img src={menu.restaurant.logo_url} alt="" className="size-9 rounded-md object-cover" />
          ) : (
            <div className="grid size-9 place-items-center rounded-md bg-[var(--guest-accent)] text-sm font-semibold text-[var(--guest-accent-fg)]">
              {menu.restaurant.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base leading-tight font-semibold">
              {menu.restaurant.name}
            </h1>
            <div className="text-xs text-muted-foreground">
              {menu.table ? `${t.table} ${menu.table.label}` : menu.branch?.name}
              {menu.table && menu.branch && ` · ${menu.branch.name}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onLang}
            className="rounded-md border px-2.5 py-1 text-xs font-medium"
            lang={lang === 'en' ? 'ur' : 'en'}
          >
            {t.language}
          </button>
        </div>

        {menu.can_order && (
          <div className="flex gap-1 px-4 pb-2" role="tablist">
            {(['menu', 'orders'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn(
                  'flex-1 rounded-md py-1.5 text-sm font-medium',
                  tab === k
                    ? 'bg-[var(--guest-accent)] text-[var(--guest-accent-fg)]'
                    : 'text-muted-foreground',
                )}
              >
                {k === 'menu' ? t.menu : t.myOrders}
                {k === 'orders' && session.data?.orders.length
                  ? ` · ${session.data.orders.length}`
                  : ''}
              </button>
            ))}
          </div>
        )}

        {tab === 'menu' && (
          <>
            <div className="relative px-4 pb-2">
              <Search className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-[calc(50%+4px)] text-muted-foreground rtl:right-7 rtl:left-auto" />
              <input
                type="search"
                aria-label={t.search}
                placeholder={t.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 w-full rounded-full bg-muted px-10 text-sm outline-none"
              />
            </div>
            <nav className="flex gap-2 overflow-x-auto px-4 pb-3" aria-label="Categories">
              {[
                { id: null as string | null, label: t.all },
                ...topCats.map((c) => ({ id: c.id as string | null, label: tr(lang, c) })),
              ].map((c) => (
                <button
                  key={c.id ?? 'all'}
                  type="button"
                  lang={lang}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'shrink-0 rounded-full border px-3.5 py-1.5 text-[13px]',
                    categoryId === c.id
                      ? 'border-transparent bg-[var(--guest-accent)] text-[var(--guest-accent-fg)]'
                      : 'bg-card',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </nav>
          </>
        )}
      </header>

      {!menu.can_order && (
        <p className="mx-4 mt-3 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
          {t.browseOnly}
        </p>
      )}
      {closed && (
        <p className="mx-4 mt-3 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
          {t.closed}
        </p>
      )}
      {sentNumber !== null && (
        <div
          role="status"
          className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-[13px] font-medium text-success"
        >
          <CheckCircle2 className="size-4 shrink-0" />{' '}
          <span className="flex-1">{t.orderSent(sentNumber)}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setSentNumber(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {tab === 'menu' ? (
        <main className="px-4">
          {sections.map(({ category, products }) => (
            <section key={category.id} className="pt-5">
              <h2 lang={lang} className="mb-2 text-[15px] font-semibold">
                {tr(lang, category)}
              </h2>
              <ul className="divide-y rounded-lg border bg-card">
                {products.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    lang={lang}
                    t={t}
                    currency={currency}
                    onOpen={() => setOpen(p)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {sections.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              <UtensilsCrossed className="mx-auto mb-2 size-6" strokeWidth={1.5} />
              {t.noResults}
            </p>
          )}
        </main>
      ) : (
        <OrdersView session={session.data ?? null} t={t} lang={lang} currency={currency} />
      )}

      {/* Bottom bar: service button + cart */}
      {menu.can_order && !closed && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md gap-2 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setServiceOpen(true)}
            aria-label={t.service}
            className="grid size-12 shrink-0 place-items-center rounded-full border bg-card shadow-md"
          >
            <Bell className="size-5" />
          </button>
          {cart.count > 0 && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex h-12 flex-1 items-center justify-between rounded-full bg-[var(--guest-accent)] px-5 text-[15px] font-medium text-[var(--guest-accent-fg)] shadow-md"
            >
              <span>
                {t.viewOrder} · {t.items(cart.count)}
              </span>
              <span className="tabular-nums">{formatMoney(cart.total, currency)}</span>
            </button>
          )}
        </div>
      )}

      {open && (
        <ItemSheet
          menu={menu}
          product={open}
          lang={lang}
          onAdd={cart.add}
          onClose={() => setOpen(null)}
        />
      )}

      {cartOpen && (
        <CartSheet
          lines={cart.lines}
          productById={productById}
          menu={menu}
          lang={lang}
          t={t}
          error={place.error ? errorMessage(place.error) : null}
          placing={place.isPending}
          onQty={cart.setQty}
          onPlace={submitOrder}
          onClose={() => setCartOpen(false)}
          total={cart.total}
        />
      )}

      {serviceOpen && (
        <ServiceSheet
          tableToken={tableToken}
          t={t}
          lang={lang}
          onClose={() => setServiceOpen(false)}
        />
      )}
    </div>
  )
}

function ProductRow({
  product: p,
  lang,
  t,
  currency,
  onOpen,
}: {
  product: GuestProduct
  lang: Lang
  t: Strings
  currency: string
  onOpen: () => void
}) {
  const img = menuImageUrl(p.image_path)
  const minVariant = p.variants.length ? Math.min(...p.variants.map((v) => v.price_minor)) : null
  const [name, nameLang] = trl(lang, p)
  const [description, descLang] = trl(lang, p, 'description')
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn('flex w-full gap-3 p-3 text-start', !p.is_available && 'opacity-55')}
      >
        <div className="min-w-0 flex-1">
          <div lang={nameLang} dir="auto" className="font-medium">
            {name}
          </div>
          {description && (
            <p
              lang={descLang}
              dir="auto"
              className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground"
            >
              {description}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-sm tabular-nums">
            {p.is_available ? (
              <>
                <span className="font-medium">
                  {minVariant !== null && p.variants.length > 1 && `${t.from} `}
                  {formatMoney(minVariant ?? p.price_minor, currency)}
                </span>
                {p.compare_at_price_minor && !p.variants.length && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatMoney(p.compare_at_price_minor, currency)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs font-medium text-warning">{t.soldOut}</span>
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
      </button>
    </li>
  )
}

function CartSheet({
  lines,
  productById,
  menu,
  lang,
  t,
  error,
  placing,
  total,
  onQty,
  onPlace,
  onClose,
}: {
  lines: ReturnType<typeof useCart>['lines']
  productById: (id: string) => GuestProduct | undefined
  menu: GuestMenu
  lang: Lang
  t: Strings
  error: string | null
  placing: boolean
  total: number
  onQty: (key: string, q: number) => void
  onPlace: (notes: string) => void
  onClose: () => void
}) {
  const [notes, setNotes] = useState('')
  const currency = menu.restaurant.currency
  const modName = (id: string) => {
    for (const g of menu.groups) {
      const m = g.modifiers.find((x) => x.id === id)
      if (m) return tr(lang, m)
    }
    return ''
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="bg-background" dir={lang === 'ur' ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <SheetTitle className="text-base font-semibold">{t.yourOrder}</SheetTitle>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t.emptyCart}</p>
          ) : (
            <ul className="divide-y">
              {lines.map((l) => {
                const p = productById(l.product_id)
                const v = p?.variants.find((x) => x.id === l.variant_id)
                return (
                  <li key={l.key} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div lang={lang} className="font-medium">
                        {p ? tr(lang, p) : '—'}
                        {v && (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {tr(lang, v)}
                          </span>
                        )}
                      </div>
                      {l.modifier_ids.length > 0 && (
                        <div lang={lang} className="text-xs text-muted-foreground">
                          {l.modifier_ids.map(modName).join(', ')}
                        </div>
                      )}
                      {l.notes && (
                        <div className="text-xs text-muted-foreground italic">“{l.notes}”</div>
                      )}
                      <div className="mt-1 text-sm tabular-nums">
                        {formatMoney(l.unit_minor * l.quantity, currency)}
                      </div>
                    </div>
                    <div className="flex items-center rounded-full border">
                      <button
                        type="button"
                        aria-label="Fewer"
                        className="grid size-9 place-items-center"
                        onClick={() => onQty(l.key, l.quantity - 1)}
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-5 text-center text-sm tabular-nums">{l.quantity}</span>
                      <button
                        type="button"
                        aria-label="More"
                        className="grid size-9 place-items-center"
                        onClick={() => onQty(l.key, l.quantity + 1)}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="border-t px-5 py-4">
            <label htmlFor="order-notes" className="text-sm font-semibold">
              {t.orderNotes}
            </label>
            <textarea
              id="order-notes"
              lang={lang}
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">{t.taxesNote}</p>
          </div>
        </div>
        <div className="border-t px-5 py-3">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={lines.length === 0 || placing}
            onClick={() => onPlace(notes.trim())}
            className="flex h-12 w-full items-center justify-between rounded-full bg-[var(--guest-accent)] px-5 text-[15px] font-medium text-[var(--guest-accent-fg)] disabled:opacity-40"
          >
            <span>{placing ? t.placing : t.placeOrder}</span>
            <span className="tabular-nums">{formatMoney(total, currency)}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

const statusSteps = ['new', 'accepted', 'preparing', 'ready', 'served'] as const

function OrdersView({
  session,
  t,
  lang,
  currency,
}: {
  session: GuestSession | null
  t: Strings
  lang: Lang
  currency: string
}) {
  if (!session || session.orders.length === 0) {
    return (
      <div className="px-8 py-20 text-center text-sm text-muted-foreground">
        <Receipt className="mx-auto mb-3 size-7" strokeWidth={1.5} />
        {t.noOrders}
      </div>
    )
  }
  const total = session.orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((n, o) => n + o.total_minor, 0)
  return (
    <main className="grid gap-3 px-4 pt-4">
      {session.orders.map((o) => {
        const step = statusSteps.indexOf(o.status as (typeof statusSteps)[number])
        return (
          <article key={o.id} className="rounded-lg border bg-card">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div className="font-semibold">
                {t.order} #{o.number}
              </div>
              <span
                className={cn(
                  'rounded-sm px-2 py-0.5 text-xs font-medium',
                  o.status === 'cancelled'
                    ? 'bg-destructive-soft text-destructive'
                    : o.status === 'ready' || o.status === 'served' || o.status === 'completed'
                      ? 'bg-success-soft text-success'
                      : 'bg-warning-soft text-warning',
                )}
                data-testid="order-status"
              >
                {t.status[o.status]}
              </span>
            </header>
            {o.status !== 'cancelled' && step >= 0 && (
              <ol className="flex gap-1 px-4 pt-3" aria-hidden>
                {statusSteps.map((s, i) => (
                  <li
                    key={s}
                    className={cn(
                      'h-1 flex-1 rounded-full',
                      i <= step ? 'bg-[var(--guest-accent)]' : 'bg-muted',
                    )}
                  />
                ))}
              </ol>
            )}
            <ul className="grid gap-1.5 px-4 py-3 text-sm">
              {o.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-3">
                  <span lang={lang}>
                    {i.quantity}× {i.name}
                    {i.variant_name && (
                      <span className="text-muted-foreground"> · {i.variant_name}</span>
                    )}
                    {i.modifiers.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {i.modifiers.join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatMoney(i.line_total_minor, currency)}</span>
                </li>
              ))}
            </ul>
          </article>
        )
      })}
      <div className="flex justify-between px-1 pt-1 text-sm font-semibold">
        <span>{t.total}</span>
        <span className="tabular-nums">{formatMoney(total, currency)}</span>
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t.taxesNote}</p>
    </main>
  )
}

function ServiceSheet({
  tableToken,
  t,
  lang,
  onClose,
}: {
  tableToken: string | null
  t: Strings
  lang: Lang
  onClose: () => void
}) {
  const request = useGuestRequest(tableToken)
  const [sent, setSent] = useState<string | null>(null)
  const options: { type: RequestType; label: string }[] = [
    { type: 'assistance', label: t.callWaiter },
    { type: 'water', label: t.water },
    { type: 'napkins', label: t.napkins },
    { type: 'bill', label: t.bill },
  ]
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="bg-background" dir={lang === 'ur' ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <SheetTitle className="text-base font-semibold">{t.service}</SheetTitle>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5">
          {options.map((o) => (
            <button
              key={o.type}
              type="button"
              disabled={request.isPending}
              onClick={() =>
                request.mutate(o.type, {
                  onSuccess: (r) => setSent(r.duplicate ? t.alreadyRequested : t.requestSent),
                })
              }
              className="h-16 rounded-lg border bg-card text-sm font-medium hover:bg-accent"
            >
              {o.label}
            </button>
          ))}
        </div>
        {(sent || request.error) && (
          <p
            role="status"
            className={cn(
              'mx-5 mb-5 rounded-md px-3 py-2 text-[13px]',
              request.error
                ? 'bg-destructive-soft text-destructive'
                : 'bg-success-soft text-success',
            )}
          >
            {request.error ? errorMessage(request.error) : sent}
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Centered({ icon: Icon, title, lang }: { icon: typeof QrCode; title: string; lang: Lang }) {
  return (
    <div
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center"
      dir={lang === 'ur' ? 'rtl' : 'ltr'}
    >
      <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} />
      <h1 lang={lang} className="mt-4 text-base font-semibold">
        {title}
      </h1>
    </div>
  )
}

function GuestSkeleton() {
  return (
    <div className="mx-auto max-w-md space-y-3 p-4" aria-busy="true" aria-label="Loading menu">
      <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-full animate-pulse rounded-full bg-muted" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 w-full animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}

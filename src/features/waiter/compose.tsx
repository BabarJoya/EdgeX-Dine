import { Minus, Plus, Search, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { usePlaceStaffOrder, type Table } from '@/features/floor/api'
import type { GuestMenu, GuestProduct } from '@/features/guest/api'
import type { CartLine } from '@/features/guest/cart'
import { ItemSheet } from '@/features/guest/item-sheet'
import { errorMessage } from '@/lib/errors'
import { cn, formatMoney } from '@/lib/utils'

export type ComposerItem = {
  product_id: string
  variant_id: string | null
  quantity: number
  modifier_ids: string[]
  notes: string
}

/** Waiter: add an order to a table's sitting. */
export function OrderComposer({
  menu,
  table,
  onClose,
}: {
  menu: GuestMenu
  table: Table
  onClose: () => void
}) {
  const place = usePlaceStaffOrder()
  return (
    <ItemComposer
      menu={menu}
      title={`Table ${table.label}`}
      submitLabel="Send to kitchen"
      onClose={onClose}
      onSubmit={async (items, notes) => {
        const r = await place.mutateAsync({ tableId: table.id, items, notes })
        toast.success(`Order #${r.order_number} sent to the kitchen`)
        onClose()
      }}
    />
  )
}

/** Shared item picker + review used by the waiter app and the POS. */
export function ItemComposer({
  menu,
  title,
  submitLabel,
  extra,
  onSubmit,
  onClose,
}: {
  menu: GuestMenu
  title: string
  submitLabel: string
  /** Extra fields on the review step (e.g. customer name for takeaway). */
  extra?: ReactNode
  onSubmit: (items: ComposerItem[], notes: string) => Promise<void>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [open, setOpen] = useState<GuestProduct | null>(null)
  const [lines, setLines] = useState<CartLine[]>([])
  const [notes, setNotes] = useState('')
  const [review, setReview] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const currency = menu.restaurant.currency

  const top = menu.categories.filter((c) => !c.parent_id)
  const products = useMemo(() => {
    const q = query.trim().toLowerCase()
    const ids = categoryId
      ? new Set([
          categoryId,
          ...menu.categories.filter((c) => c.parent_id === categoryId).map((c) => c.id),
        ])
      : null
    return menu.products.filter(
      (p) => (!ids || ids.has(p.category_id)) && (!q || p.name.toLowerCase().includes(q)),
    )
  }, [menu, query, categoryId])

  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const total = lines.reduce((n, l) => n + l.unit_minor * l.quantity, 0)
  const name = (l: CartLine) => {
    const p = menu.products.find((x) => x.id === l.product_id)
    const v = p?.variants.find((x) => x.id === l.variant_id)
    const mods = l.modifier_ids
      .map((id) => menu.groups.flatMap((g) => g.modifiers).find((m) => m.id === id)?.name)
      .filter(Boolean)
      .join(', ')
    return { title: `${p?.name ?? '—'}${v ? ` (${v.name})` : ''}`, mods }
  }

  const send = async () => {
    setPending(true)
    setError(null)
    try {
      await onSubmit(
        lines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          quantity: l.quantity,
          modifier_ids: l.modifier_ids,
          notes: l.notes,
        })),
        notes.trim(),
      )
    } catch (e) {
      setError(e)
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[92dvh] max-w-lg bg-background">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <SheetTitle className="text-base font-semibold">
            {review ? 'Review order' : 'Add order'} · {title}
          </SheetTitle>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </header>

        {!review ? (
          <>
            <div className="grid gap-2 border-b px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search menu"
                  placeholder="Search items"
                  className="pl-8"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                {[
                  { id: null as string | null, name: 'All' },
                  ...top.map((c) => ({ id: c.id as string | null, name: c.name })),
                ].map((c) => (
                  <button
                    key={c.id ?? 'all'}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1 text-[13px]',
                      categoryId === c.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-card',
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <ul className="flex-1 divide-y overflow-y-auto">
              {products.map((p) => {
                const inCart = lines
                  .filter((l) => l.product_id === p.id)
                  .reduce((n, l) => n + l.quantity, 0)
                const min = p.variants.length
                  ? Math.min(...p.variants.map((v) => v.price_minor))
                  : p.price_minor
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={!p.is_available}
                      onClick={() => setOpen(p)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-50"
                    >
                      <span className="flex-1">
                        <span className="font-medium">{p.name}</span>
                        {!p.is_available && (
                          <span className="ml-2 text-xs text-warning">Sold out</span>
                        )}
                      </span>
                      {inCart > 0 && (
                        <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground tabular-nums">
                          {inCart}
                        </span>
                      )}
                      <span className="text-sm tabular-nums">{formatMoney(min, currency)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {!!error && (
              <div className="px-4 pt-3">
                <Alert variant="destructive">{errorMessage(error)}</Alert>
              </div>
            )}
            <ul className="divide-y">
              {lines.map((l) => {
                const n = name(l)
                return (
                  <li key={l.key} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{n.title}</div>
                      {n.mods && <div className="text-xs text-muted-foreground">{n.mods}</div>}
                      {l.notes && <div className="text-xs text-warning">“{l.notes}”</div>}
                    </div>
                    <div className="flex items-center rounded-full border">
                      <button
                        type="button"
                        aria-label="Fewer"
                        className="grid size-9 place-items-center"
                        onClick={() =>
                          setLines((ls) =>
                            l.quantity <= 1
                              ? ls.filter((x) => x.key !== l.key)
                              : ls.map((x) =>
                                  x.key === l.key ? { ...x, quantity: x.quantity - 1 } : x,
                                ),
                          )
                        }
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-5 text-center text-sm tabular-nums">{l.quantity}</span>
                      <button
                        type="button"
                        aria-label="More"
                        className="grid size-9 place-items-center"
                        onClick={() =>
                          setLines((ls) =>
                            ls.map((x) =>
                              x.key === l.key
                                ? { ...x, quantity: Math.min(50, x.quantity + 1) }
                                : x,
                            ),
                          )
                        }
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="border-t px-4 py-3">
              <label htmlFor="staff-order-notes" className="text-[13px] font-medium">
                Note for the kitchen
              </label>
              <Textarea
                id="staff-order-notes"
                className="mt-1.5"
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {extra && <div className="border-t px-4 py-3">{extra}</div>}
          </div>
        )}

        <footer className="flex gap-2 border-t px-4 py-3">
          {review && (
            <Button variant="secondary" size="lg" onClick={() => setReview(false)}>
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1 justify-between"
            disabled={count === 0 || pending}
            onClick={() => (review ? send() : setReview(true))}
          >
            <span>
              {review
                ? pending
                  ? 'Sending…'
                  : submitLabel
                : `Review · ${count} item${count === 1 ? '' : 's'}`}
            </span>
            <span className="tabular-nums">{formatMoney(total, currency)}</span>
          </Button>
        </footer>

        {open && (
          <ItemSheet
            menu={menu}
            product={open}
            lang="en"
            onAdd={(line) => setLines((ls) => [...ls, { ...line, key: crypto.randomUUID() }])}
            onClose={() => setOpen(null)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

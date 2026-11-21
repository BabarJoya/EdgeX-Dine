import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { menuImageUrl } from '@/lib/images'
import { cn, formatMoney } from '@/lib/utils'
import type { GuestGroup, GuestMenu, GuestProduct } from './api'
import type { CartLine } from './cart'
import { strings, tr, trl, type Lang } from './i18n'

export function ItemSheet({
  menu,
  product,
  lang,
  onAdd,
  onClose,
}: {
  menu: GuestMenu
  product: GuestProduct
  lang: Lang
  onAdd: (line: Omit<CartLine, 'key'>) => void
  onClose: () => void
}) {
  const t = strings[lang]
  const currency = menu.restaurant.currency
  const groups = product.group_ids
    .map((id) => menu.groups.find((g) => g.id === id))
    .filter((g): g is GuestGroup => !!g)
  const [variantId, setVariantId] = useState<string | null>(
    product.variants.find((v) => v.is_default)?.id ?? product.variants[0]?.id ?? null,
  )
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  const base = product.variants.length
    ? (product.variants.find((v) => v.id === variantId)?.price_minor ?? 0)
    : product.price_minor
  const modsTotal = groups
    .flatMap((g) => g.modifiers.filter((m) => selected[g.id]?.includes(m.id)))
    .reduce((n, m) => n + m.price_minor, 0)
  const unit = base + modsTotal
  const missing = groups.filter((g) => (selected[g.id]?.length ?? 0) < g.min_select)
  const canAdd =
    menu.can_order &&
    product.is_available &&
    missing.length === 0 &&
    (!product.variants.length || !!variantId)

  const toggle = (g: GuestGroup, id: string) => {
    const cur = selected[g.id] ?? []
    let next: string[]
    if (cur.includes(id)) next = cur.filter((x) => x !== id)
    else if (g.max_select === 1) next = [id]
    else if (cur.length >= g.max_select) return
    else next = [...cur, id]
    setSelected({ ...selected, [g.id]: next })
  }

  const ruleLabel = (g: GuestGroup) =>
    g.max_select === 1 && g.min_select <= 1
      ? t.chooseOne
      : g.min_select === 0
        ? t.chooseUpTo(g.max_select)
        : t.chooseRange(g.min_select, g.max_select)

  const image = menuImageUrl(product.image_path)
  const [title, titleLang] = trl(lang, product)
  const [description, descLang] = trl(lang, product, 'description')

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="bg-background" dir={lang === 'ur' ? 'rtl' : 'ltr'}>
        <div className="flex-1 overflow-y-auto">
          {image && (
            <img src={image} alt="" className="aspect-[16/10] w-full rounded-t-xl object-cover" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 grid size-9 place-items-center rounded-full border bg-card/90 shadow-sm rtl:right-auto rtl:left-3"
          >
            <X className="size-4" />
          </button>

          <div className="px-5 pt-5 pb-4">
            <SheetTitle
              lang={titleLang}
              className="pr-10 text-lg leading-snug font-semibold rtl:pr-0 rtl:pl-10"
            >
              {title}
            </SheetTitle>
            {description && (
              <p lang={descLang} dir="auto" className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          {product.variants.length > 0 && (
            <fieldset className="border-t px-5 py-4">
              <legend className="sr-only">{t.size}</legend>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{t.size}</span>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                  {t.required}
                </span>
              </div>
              {product.variants.map((v) => (
                <label key={v.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="variant"
                    className="size-4 accent-[var(--guest-accent)]"
                    checked={variantId === v.id}
                    onChange={() => setVariantId(v.id)}
                  />
                  <span lang={lang} className="flex-1">
                    {tr(lang, v)}
                  </span>
                  <span className="tabular-nums">{formatMoney(v.price_minor, currency)}</span>
                </label>
              ))}
            </fieldset>
          )}

          {groups.map((g) => {
            const count = selected[g.id]?.length ?? 0
            const short = count < g.min_select
            return (
              <fieldset key={g.id} className="border-t px-5 py-4">
                <legend className="sr-only">{tr(lang, g)}</legend>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div lang={lang} className="text-sm font-semibold">
                      {tr(lang, g)}
                    </div>
                    <div className="text-xs text-muted-foreground">{ruleLabel(g)}</div>
                  </div>
                  <span
                    className={cn(
                      'rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
                      g.min_select > 0
                        ? short
                          ? 'bg-warning-soft text-warning'
                          : 'bg-success-soft text-success'
                        : 'bg-muted',
                    )}
                  >
                    {g.min_select > 0 ? t.required : t.optional}
                  </span>
                </div>
                {g.modifiers.map((m) => {
                  const on = selected[g.id]?.includes(m.id) ?? false
                  const disabled =
                    !m.is_available || (!on && g.max_select > 1 && count >= g.max_select)
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        'flex min-h-11 items-center gap-3 text-sm',
                        disabled && 'opacity-50',
                      )}
                    >
                      <input
                        type={g.max_select === 1 ? 'radio' : 'checkbox'}
                        name={`g-${g.id}`}
                        className="size-4 accent-[var(--guest-accent)]"
                        checked={on}
                        disabled={disabled}
                        onClick={() => toggle(g, m.id)}
                        onChange={() => {}}
                      />
                      <span lang={lang} className="flex-1">
                        {tr(lang, m)}
                        {!m.is_available && (
                          <span className="text-muted-foreground"> · {t.soldOut}</span>
                        )}
                      </span>
                      {m.price_minor > 0 && (
                        <span className="tabular-nums">
                          +{formatMoney(m.price_minor, currency)}
                        </span>
                      )}
                    </label>
                  )
                })}
              </fieldset>
            )
          })}

          {menu.can_order && (
            <div className="border-t px-5 py-4">
              <label htmlFor="item-notes" className="text-sm font-semibold">
                {t.specialInstructions}
              </label>
              <textarea
                id="item-notes"
                lang={lang}
                maxLength={200}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.instructionsPlaceholder}
                className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </div>
          )}
        </div>

        {menu.can_order && (
          <div className="flex items-center gap-3 border-t bg-background px-5 py-3">
            <div className="flex items-center rounded-full border">
              <button
                type="button"
                aria-label="Fewer"
                className="grid size-10 place-items-center disabled:opacity-40"
                disabled={qty <= 1}
                onClick={() => setQty(qty - 1)}
              >
                <Minus className="size-4" />
              </button>
              <span className="w-6 text-center tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                aria-label="More"
                className="grid size-10 place-items-center disabled:opacity-40"
                disabled={qty >= 50}
                onClick={() => setQty(qty + 1)}
              >
                <Plus className="size-4" />
              </button>
            </div>
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => {
                onAdd({
                  product_id: product.id,
                  variant_id: product.variants.length ? variantId : null,
                  modifier_ids: Object.values(selected).flat(),
                  quantity: qty,
                  notes: notes.trim(),
                  unit_minor: unit,
                })
                onClose()
              }}
              className="flex h-12 flex-1 items-center justify-between rounded-full bg-[var(--guest-accent)] px-5 text-[15px] font-medium text-[var(--guest-accent-fg)] disabled:opacity-40"
            >
              <span>{product.is_available ? t.addToOrder : t.soldOut}</span>
              <span className="tabular-nums">{formatMoney(unit * qty, currency)}</span>
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

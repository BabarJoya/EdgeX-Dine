import type { GuestMenu } from '@/features/guest/api'
import type { ComposerItem } from '@/features/waiter/compose'

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

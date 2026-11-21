import type { GuestMenu } from '@/features/guest/api'
import type { Menu, Translations } from '@/features/menu/api'

/**
 * Builds the same shape the guest menu uses from the staff menu, applying the
 * branch's prices and availability (the server re-checks everything).
 */
export function toGuestMenu(
  menu: Menu,
  branchId: string,
  restaurant: GuestMenu['restaurant'],
): GuestMenu {
  const override = (pid: string) =>
    menu.overrides.find((o) => o.product_id === pid && o.branch_id === branchId)
  const activeCats = new Set(
    menu.categories
      .filter(
        (c) =>
          c.is_active &&
          (!c.parent_id || menu.categories.find((p) => p.id === c.parent_id)?.is_active),
      )
      .map((c) => c.id),
  )
  return {
    restaurant,
    branch: null,
    table: null,
    can_order: true,
    categories: menu.categories
      .filter((c) => activeCats.has(c.id))
      .map((c) => ({
        id: c.id,
        parent_id: c.parent_id,
        name: c.name,
        translations: c.translations as Translations,
      })),
    products: menu.products
      .filter(
        (p) =>
          p.is_active && activeCats.has(p.category_id) && override(p.id)?.is_available !== false,
      )
      .map((p) => ({
        id: p.id,
        category_id: p.category_id,
        name: p.name,
        description: p.description,
        translations: p.translations as Translations,
        image_path: p.image_path,
        tags: p.tags,
        price_minor: override(p.id)?.price_minor ?? p.price_minor,
        compare_at_price_minor: p.compare_at_price_minor,
        is_available: override(p.id)?.is_available ?? p.is_available,
        variants: p.product_variants.map((v) => ({
          ...v,
          translations: v.translations as Translations,
        })),
        group_ids: p.product_modifier_groups.map((g) => g.group_id),
      })),
    groups: menu.groups.map((g) => ({
      ...g,
      translations: g.translations as Translations,
      modifiers: g.modifiers.map((m) => ({ ...m, translations: m.translations as Translations })),
    })),
  }
}

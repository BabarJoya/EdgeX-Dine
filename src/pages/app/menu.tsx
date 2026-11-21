import {
  ArrowDown,
  ArrowUp,
  ChefHat,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RequirePerm } from '@/components/require-perm'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useDeleteStation,
  useMenu,
  useReorder,
  useSaveStation,
  useSetAvailability,
  type Category,
  type Menu,
  type ModifierGroup,
  type Product,
  type Translations,
} from '@/features/menu/api'
import { CategoryDialog } from '@/features/menu/category-dialog'
import { GroupDialog } from '@/features/menu/group-dialog'
import { ProductEditor } from '@/features/menu/product-editor'
import { tagLabel } from '@/features/menu/tags'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { menuImageUrl } from '@/lib/images'
import { cn, formatMoney } from '@/lib/utils'

export function MenuPage() {
  return (
    <RequirePerm any={['menu.view', 'menu.manage']}>
      <MenuContent />
    </RequirePerm>
  )
}

type Editing =
  | { kind: 'product'; product: Product | null }
  | { kind: 'category'; category: Category | null }
  | { kind: 'group'; group: ModifierGroup | null }
  | null

function MenuContent() {
  const { tenantId, can } = useTenant()
  const menu = useMenu(tenantId)
  const canManage = can('menu.manage')
  const [editing, setEditing] = useState<Editing>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)

  return (
    <>
      <PageHeader
        title="Menu"
        description="Items, prices and add-ons used by the QR menu, waiters and the POS."
        actions={
          canManage &&
          menu.data && (
            <Button
              onClick={() => setEditing({ kind: 'product', product: null })}
              disabled={menu.data.categories.length === 0}
            >
              <Plus /> New item
            </Button>
          )
        }
      />
      {menu.error && (
        <Alert variant="destructive" className="mb-4">
          {errorMessage(menu.error)}
        </Alert>
      )}

      {menu.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : menu.data ? (
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Items · {menu.data.products.length}</TabsTrigger>
            <TabsTrigger value="addons">Add-ons · {menu.data.groups.length}</TabsTrigger>
            <TabsTrigger value="stations">
              Kitchen stations · {menu.data.stations.length}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="items">
            <ItemsTab
              menu={menu.data}
              canManage={canManage}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              onEdit={setEditing}
            />
          </TabsContent>
          <TabsContent value="addons">
            <AddonsTab
              menu={menu.data}
              canManage={canManage}
              onEdit={(group) => setEditing({ kind: 'group', group })}
            />
          </TabsContent>
          <TabsContent value="stations">
            <StationsTab menu={menu.data} canManage={canManage} />
          </TabsContent>
        </Tabs>
      ) : null}

      {menu.data && editing?.kind === 'product' && (
        <ProductEditor
          menu={menu.data}
          product={editing.product}
          defaultCategoryId={categoryId ?? undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {menu.data && editing?.kind === 'category' && (
        <CategoryDialog
          menu={menu.data}
          category={editing.category}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'group' && (
        <GroupDialog group={editing.group} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function priceLabel(p: Product, currency: string) {
  if (p.product_variants.length) {
    const min = Math.min(...p.product_variants.map((v) => v.price_minor))
    return p.product_variants.length > 1
      ? `from ${formatMoney(min, currency)}`
      : formatMoney(min, currency)
  }
  return formatMoney(p.price_minor, currency)
}

function move<T>(list: T[], index: number, dir: -1 | 1) {
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(index + dir, 0, item)
  return next
}

function ItemsTab({
  menu,
  canManage,
  categoryId,
  setCategoryId,
  onEdit,
}: {
  menu: Menu
  canManage: boolean
  categoryId: string | null
  setCategoryId: (id: string | null) => void
  onEdit: (e: Editing) => void
}) {
  const { tenantId, membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const [query, setQuery] = useState('')
  const availability = useSetAvailability(tenantId)
  const reorder = useReorder(tenantId)

  const top = menu.categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => menu.categories.filter((c) => c.parent_id === id)
  const catName = (id: string) => menu.categories.find((c) => c.id === id)?.name ?? ''
  const countIn = (id: string) =>
    menu.products.filter(
      (p) => p.category_id === id || childrenOf(id).some((c) => c.id === p.category_id),
    ).length

  const products = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Menu order: top-level categories in order, each followed by its subcategories.
    const rank = new Map<string, number>()
    menu.categories
      .filter((c) => !c.parent_id)
      .forEach((c) => {
        rank.set(c.id, rank.size)
        menu.categories
          .filter((s) => s.parent_id === c.id)
          .forEach((s) => rank.set(s.id, rank.size))
      })
    let list = [...menu.products].sort(
      (a, b) =>
        (rank.get(a.category_id) ?? 0) - (rank.get(b.category_id) ?? 0) ||
        a.sort_order - b.sort_order,
    )
    if (categoryId) {
      const ids = new Set([
        categoryId,
        ...menu.categories.filter((c) => c.parent_id === categoryId).map((c) => c.id),
      ])
      list = list.filter((p) => ids.has(p.category_id))
    }
    if (q)
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          ((p.translations as Translations).ur?.name ?? '').includes(query.trim()) ||
          p.description.toLowerCase().includes(q),
      )
    return list
  }, [menu, categoryId, query])

  const soldOut = menu.products.filter((p) => !p.is_available).length
  const canReorderProducts =
    canManage && !!categoryId && !query && products.every((p) => p.category_id === categoryId)

  if (menu.categories.length === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="Start with a category"
        description="Categories group your menu, for example BBQ, Karahi, Drinks and Desserts."
        action={
          canManage && (
            <Button onClick={() => onEdit({ kind: 'category', category: null })}>
              <Plus /> Add category
            </Button>
          )
        }
      />
    )
  }

  const categoryRow = (c: Category, siblings: Category[], index: number, depth: 0 | 1) => (
    <li key={c.id} className="group flex items-center">
      <button
        type="button"
        onClick={() => setCategoryId(c.id)}
        aria-current={categoryId === c.id}
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between rounded-md py-1.5 pr-2 text-left text-sm hover:bg-accent',
          depth ? 'pl-6' : 'pl-2.5',
          categoryId === c.id && 'bg-accent font-medium',
          !c.is_active && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{c.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{countIn(c.id)}</span>
      </button>
      {canManage && (
        <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label={`Move ${c.name} up`}
            disabled={index === 0}
            onClick={() =>
              reorder.mutate({
                kind: 'categories',
                ids: move(siblings, index, -1).map((x) => x.id),
              })
            }
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label={`Move ${c.name} down`}
            disabled={index === siblings.length - 1}
            onClick={() =>
              reorder.mutate({ kind: 'categories', ids: move(siblings, index, 1).map((x) => x.id) })
            }
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label={`Edit ${c.name}`}
            onClick={() => onEdit({ kind: 'category', category: c })}
          >
            <Pencil className="size-3.5" />
          </button>
        </span>
      )}
    </li>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* Categories: sidebar on desktop, chips on mobile */}
      <Card className="hidden h-fit p-2 lg:block">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <span className="text-xs font-medium text-muted-foreground">Categories</span>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onEdit({ kind: 'category', category: null })}
            >
              <Plus /> Add
            </Button>
          )}
        </div>
        <ul className="grid gap-0.5">
          <li>
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              aria-current={categoryId === null}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent',
                categoryId === null && 'bg-accent font-medium',
              )}
            >
              All items{' '}
              <span className="text-xs text-muted-foreground tabular-nums">
                {menu.products.length}
              </span>
            </button>
          </li>
          {top.map((c, i) => (
            <li key={c.id}>
              <ul className="grid gap-0.5">
                {categoryRow(c, top, i, 0)}
                {childrenOf(c.id).map((s, j, arr) => categoryRow(s, arr, j, 1))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {[
          { id: null as string | null, name: 'All' },
          ...menu.categories.map((c) => ({
            id: c.id as string | null,
            name: c.parent_id ? `› ${c.name}` : c.name,
          })),
        ].map((c) => (
          <button
            key={c.id ?? 'all'}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-[13px]',
              categoryId === c.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {c.name}
          </button>
        ))}
        {canManage && (
          <button
            type="button"
            className="shrink-0 px-2 text-[13px] text-link"
            onClick={() => onEdit({ kind: 'category', category: null })}
          >
            + Category
          </button>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search menu"
              placeholder="Search items"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {soldOut > 0 && <Badge variant="warning">{soldOut} sold out</Badge>}
        </div>

        {availability.error && (
          <Alert variant="destructive" className="mb-3">
            {errorMessage(availability.error)}
          </Alert>
        )}

        {products.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title={query ? 'No items match your search' : 'No items in this category yet'}
            action={
              canManage &&
              !query && (
                <Button onClick={() => onEdit({ kind: 'product', product: null })}>
                  <Plus /> Add item
                </Button>
              )
            }
          />
        ) : (
          <Card className="divide-y">
            {products.map((p, i) => {
              const img = menuImageUrl(p.image_path)
              const ur = (p.translations as Translations).ur?.name
              const station = menu.stations.find((s) => s.id === p.kitchen_station_id)
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 sm:px-4',
                    !p.is_active && 'opacity-60',
                  )}
                >
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      className="size-11 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="grid size-11 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <UtensilsCrossed className="size-4" strokeWidth={1.5} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                    disabled={!canManage}
                    onClick={() => onEdit({ kind: 'product', product: p })}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {ur && (
                        <span
                          lang="ur"
                          dir="rtl"
                          className="text-xs leading-none text-muted-foreground"
                        >
                          {ur}
                        </span>
                      )}
                      {!p.is_active && <Badge>Hidden</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {!categoryId && <span>{catName(p.category_id)}</span>}
                      {station && (
                        <span className="inline-flex items-center gap-1">
                          <ChefHat className="size-3" /> {station.name}
                        </span>
                      )}
                      {p.product_modifier_groups.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Layers className="size-3" /> {p.product_modifier_groups.length} add-on
                          group{p.product_modifier_groups.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {p.tags.map((t) => (
                        <span key={t}>· {tagLabel(t)}</span>
                      ))}
                    </div>
                  </button>
                  <div className="text-right text-sm tabular-nums">
                    <div className="font-medium whitespace-nowrap">{priceLabel(p, currency)}</div>
                    {p.compare_at_price_minor && !p.product_variants.length && (
                      <div className="text-xs text-muted-foreground line-through">
                        {formatMoney(p.compare_at_price_minor, currency)}
                      </div>
                    )}
                  </div>
                  {canReorderProducts && (
                    <div className="hidden flex-col sm:flex">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label={`Move ${p.name} up`}
                        disabled={i === 0}
                        onClick={() =>
                          reorder.mutate({
                            kind: 'products',
                            ids: move(products, i, -1).map((x) => x.id),
                          })
                        }
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label={`Move ${p.name} down`}
                        disabled={i === products.length - 1}
                        onClick={() =>
                          reorder.mutate({
                            kind: 'products',
                            ids: move(products, i, 1).map((x) => x.id),
                          })
                        }
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-0.5">
                    <Switch
                      checked={p.is_available}
                      disabled={!canManage}
                      onCheckedChange={(v) => availability.mutate({ id: p.id, is_available: v })}
                      aria-label={`${p.name} available`}
                    />
                    <span
                      className={cn(
                        'text-[10px]',
                        p.is_available ? 'text-muted-foreground' : 'font-medium text-warning',
                      )}
                    >
                      {p.is_available ? 'In stock' : 'Sold out'}
                    </span>
                  </div>
                  {canManage && (
                    <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
                  )}
                </div>
              )
            })}
          </Card>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

function choiceLabel(g: ModifierGroup) {
  if (g.min_select === 0)
    return g.max_select === 1 ? 'Optional, pick 1' : `Optional, up to ${g.max_select}`
  if (g.min_select === g.max_select) return `Required, pick ${g.min_select}`
  return `Pick ${g.min_select}–${g.max_select}`
}

function AddonsTab({
  menu,
  canManage,
  onEdit,
}: {
  menu: Menu
  canManage: boolean
  onEdit: (g: ModifierGroup | null) => void
}) {
  const { membership } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const usedBy = (id: string) =>
    menu.products.filter((p) => p.product_modifier_groups.some((g) => g.group_id === id)).length

  return (
    <>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => onEdit(null)}>
            <Plus /> New add-on group
          </Button>
        </div>
      )}
      {menu.groups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No add-on groups yet"
          description="Create choices like “Choose your sauce” or “Extra toppings” once, then attach them to any item."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {menu.groups.map((g) => (
            <Card key={g.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {choiceLabel(g)} · used by {usedBy(g.id)} item{usedBy(g.id) === 1 ? '' : 's'}
                  </div>
                </div>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => onEdit(g)}>
                    Edit
                  </Button>
                )}
              </div>
              <ul className="grid gap-1 px-4 py-3 text-sm">
                {g.modifiers.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'flex justify-between',
                      !m.is_available && 'text-muted-foreground line-through',
                    )}
                  >
                    <span>{m.name}</span>
                    <span className="tabular-nums">
                      {m.price_minor ? `+${formatMoney(m.price_minor, currency)}` : 'Free'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Kitchen stations
// ---------------------------------------------------------------------------

function StationsTab({ menu, canManage }: { menu: Menu; canManage: boolean }) {
  const { tenantId } = useTenant()
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const save = useSaveStation(tenantId)
  const del = useDeleteStation(tenantId)
  const itemsAt = (id: string) => menu.products.filter((p) => p.kitchen_station_id === id).length
  const unassigned = menu.products.filter((p) => !p.kitchen_station_id).length

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-[13px] text-muted-foreground">
        Each station gets its own kitchen screen in Phase 4. Items are sent to the station chosen on
        the item.
      </p>
      {(save.error || del.error) && (
        <Alert variant="destructive" className="mb-3">
          {errorMessage(save.error ?? del.error)}
        </Alert>
      )}
      {canManage && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            save.mutate(
              { name, sort_order: menu.stations.length + 1 },
              { onSuccess: () => (setName(''), toast.success('Station added')) },
            )
          }}
        >
          <Input
            aria-label="New station name"
            placeholder="e.g. BBQ, Fast Food, Drinks"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={save.isPending || !name.trim()}>
            <Plus /> Add
          </Button>
        </form>
      )}
      {menu.stations.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title="No kitchen stations yet"
          description="Add stations like BBQ, Fast Food, Drinks and Desserts."
        />
      ) : (
        <Card className="divide-y">
          {menu.stations.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              {renaming?.id === s.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    save.mutate(
                      { id: s.id, name: renaming.name },
                      { onSuccess: () => setRenaming(null) },
                    )
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="Station name"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                  />
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </form>
              ) : (
                <>
                  <ChefHat className="size-4 text-muted-foreground" strokeWidth={1.75} />
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{itemsAt(s.id)} items</span>
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Rename ${s.name}`}
                        onClick={() => setRenaming({ id: s.id, name: s.name })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${s.name}`}
                        onClick={() =>
                          del.mutate(s.id, { onSuccess: () => toast.success(`${s.name} deleted`) })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </Card>
      )}
      {unassigned > 0 && menu.stations.length > 0 && (
        <p className="mt-3 text-[13px] text-warning">
          {unassigned} item{unassigned === 1 ? ' has' : 's have'} no station yet.
        </p>
      )}
    </div>
  )
}

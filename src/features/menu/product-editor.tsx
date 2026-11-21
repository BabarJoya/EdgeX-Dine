import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/money-input'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { deleteMenuImage, menuImageUrl, uploadMenuImage } from '@/lib/images'
import { toMajorInput, toMinor } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  useDeleteProduct,
  useSaveOverrides,
  useSaveProduct,
  type Menu,
  type Product,
  type Translations,
} from './api'
import { TAGS } from './tags'

type VariantRow = {
  key: string
  id?: string
  name: string
  nameUr: string
  price: string
  is_default: boolean
}
type OverrideRow = { price: string; available: 'default' | 'yes' | 'no' }

let rowSeq = 0
const rowKey = () => `row-${++rowSeq}`

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 border-b px-5 py-5 last:border-b-0 sm:px-6">
      <div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function ProductEditor({
  menu,
  product,
  defaultCategoryId,
  onClose,
}: {
  menu: Menu
  product: Product | null
  defaultCategoryId?: string
  onClose: () => void
}) {
  const { tenantId, membership, branches, can } = useTenant()
  const currency = membership?.tenants.currency ?? 'PKR'
  const tr = (product?.translations ?? {}) as Translations

  const [name, setName] = useState(product?.name ?? '')
  const [nameUr, setNameUr] = useState(tr.ur?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [descUr, setDescUr] = useState(tr.ur?.description ?? '')
  const [categoryId, setCategoryId] = useState(
    product?.category_id ?? defaultCategoryId ?? menu.categories[0]?.id ?? '',
  )
  const [imagePath, setImagePath] = useState<string | null>(product?.image_path ?? null)
  const [uploading, setUploading] = useState(false)
  const [price, setPrice] = useState(toMajorInput(product?.price_minor ?? null))
  const [compareAt, setCompareAt] = useState(toMajorInput(product?.compare_at_price_minor ?? null))
  const [useVariants, setUseVariants] = useState((product?.product_variants.length ?? 0) > 0)
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    product?.product_variants.length
      ? product.product_variants.map((v) => ({
          key: rowKey(),
          id: v.id,
          name: v.name,
          nameUr: ((v.translations ?? {}) as Translations).ur?.name ?? '',
          price: toMajorInput(v.price_minor),
          is_default: v.is_default,
        }))
      : [
          { key: rowKey(), name: 'Half', nameUr: '', price: '', is_default: true },
          { key: rowKey(), name: 'Full', nameUr: '', price: '', is_default: false },
        ],
  )
  const [groupIds, setGroupIds] = useState<string[]>(
    product?.product_modifier_groups.map((g) => g.group_id) ?? [],
  )
  const [stationId, setStationId] = useState(product?.kitchen_station_id ?? '')
  const [prepTime, setPrepTime] = useState(product?.prep_time_minutes?.toString() ?? '')
  const [tags, setTags] = useState<string[]>(product?.tags ?? [])
  const [available, setAvailable] = useState(product?.is_available ?? true)
  const [active, setActive] = useState(product?.is_active ?? true)
  const [overrides, setOverrides] = useState<Record<string, OverrideRow>>(() =>
    Object.fromEntries(
      branches.map((b) => {
        const o = menu.overrides.find((x) => x.product_id === product?.id && x.branch_id === b.id)
        return [
          b.id,
          {
            price: toMajorInput(o?.price_minor ?? null),
            available: o?.is_available == null ? 'default' : o.is_available ? 'yes' : 'no',
          },
        ]
      }),
    ),
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = useSaveProduct(tenantId)
  const saveOverrides = useSaveOverrides(tenantId)
  const del = useDeleteProduct(tenantId)
  const busy = save.isPending || saveOverrides.isPending || uploading

  const onPickImage = async (file: File | undefined) => {
    if (!file || !tenantId) return
    setUploading(true)
    setError(null)
    try {
      const path = await uploadMenuImage(tenantId, 'products', file)
      // Remove a replaced image that was uploaded during this edit.
      if (imagePath && imagePath !== product?.image_path) void deleteMenuImage(imagePath)
      setImagePath(path)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const close = () => {
    if (imagePath && imagePath !== product?.image_path) void deleteMenuImage(imagePath)
    onClose()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Enter a name for this item.')
    if (!categoryId) return setError('Choose a category.')

    const priceMinor = useVariants ? 0 : toMinor(price)
    if (priceMinor === null) return setError('Enter a valid price.')
    const compareMinor = compareAt.trim() ? toMinor(compareAt) : null
    if (compareAt.trim() && compareMinor === null) return setError('Enter a valid "was" price.')
    if (!useVariants && compareMinor !== null && compareMinor <= priceMinor)
      return setError('The "was" price must be higher than the price.')

    let variantRows: {
      id?: string
      name: string
      price_minor: number
      is_default: boolean
      translations: Translations
    }[] = []
    if (useVariants) {
      if (variants.length === 0) return setError('Add at least one size or option.')
      for (const v of variants) {
        const p = toMinor(v.price)
        if (!v.name.trim() || p === null)
          return setError('Each size needs a name and a valid price.')
        variantRows.push({
          id: v.id,
          name: v.name.trim(),
          price_minor: p,
          is_default: v.is_default,
          translations: v.nameUr.trim() ? { ur: { name: v.nameUr.trim() } } : {},
        })
      }
      if (!variantRows.some((v) => v.is_default))
        variantRows = variantRows.map((v, i) => ({ ...v, is_default: i === 0 }))
    }

    const overrideRows = branches.map((b) => {
      const o = overrides[b.id]
      return {
        branch_id: b.id,
        price_minor: o?.price.trim() ? toMinor(o.price) : null,
        is_available: o?.available === 'default' ? null : o?.available === 'yes',
      }
    })
    if (
      branches.some((b) => overrides[b.id]?.price.trim() && toMinor(overrides[b.id].price) === null)
    )
      return setError('Check the branch prices.')

    const translations: Translations = {}
    if (nameUr.trim() || descUr.trim())
      translations.ur = { name: nameUr.trim(), description: descUr.trim() }

    try {
      const id = await save.mutateAsync({
        product: {
          id: product?.id,
          category_id: categoryId,
          name: name.trim(),
          description: description.trim(),
          image_path: imagePath,
          price_minor: priceMinor,
          compare_at_price_minor: compareMinor,
          sku: '',
          kitchen_station_id: stationId || null,
          tags,
          prep_time_minutes: prepTime.trim() ? Number(prepTime) : null,
          translations,
          is_available: available,
          is_active: active,
        },
        variants: variantRows,
        groupIds,
      })
      // Send only branches whose override changed (the database also checks
      // that the user manages each branch).
      const changed = overrideRows.filter((r) => {
        const o = menu.overrides.find(
          (x) => x.product_id === product?.id && x.branch_id === r.branch_id,
        )
        return (
          (o?.price_minor ?? null) !== r.price_minor || (o?.is_available ?? null) !== r.is_available
        )
      })
      if (changed.length) await saveOverrides.mutateAsync({ productId: id, rows: changed })
      if (product?.image_path && product.image_path !== imagePath)
        void deleteMenuImage(product.image_path)
      toast.success(product ? `${name.trim()} saved` : `${name.trim()} added to the menu`)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const doDelete = () =>
    product &&
    del.mutate(product.id, {
      onSuccess: () => {
        if (product.image_path) void deleteMenuImage(product.image_path)
        toast.success(`${product.name} deleted`)
        onClose()
      },
      onError: (e) => setError(errorMessage(e)),
    })

  const topCategories = menu.categories.filter((c) => !c.parent_id)
  const imageUrl = menuImageUrl(imagePath)

  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full max-w-2xl bg-background sm:max-w-2xl">
        <form onSubmit={submit} className="flex h-full flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-5 sm:px-6">
            <SheetTitle className="text-base font-semibold">
              {product ? 'Edit item' : 'New menu item'}
            </SheetTitle>
            <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close">
              <X />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="px-5 pt-5 sm:px-6">
                <Alert variant="destructive">{error}</Alert>
              </div>
            )}

            <Section title="Details">
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div className="grid gap-4">
                  <Field id="p-name" label="Name">
                    <Input
                      id="p-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Chicken Tikka"
                    />
                  </Field>
                  <Field
                    id="p-name-ur"
                    label="Name in Urdu"
                    hint="Optional. Shown when guests switch the menu to Urdu."
                  >
                    <Input
                      id="p-name-ur"
                      lang="ur"
                      dir="rtl"
                      value={nameUr}
                      onChange={(e) => setNameUr(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-[13px] font-medium">Photo</span>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-md border border-dashed bg-muted text-xs text-muted-foreground hover:bg-accent"
                    aria-label={imageUrl ? 'Change photo' : 'Add photo'}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <span className="grid place-items-center gap-1">
                        <ImagePlus className="size-5" strokeWidth={1.5} />
                        {uploading ? 'Uploading…' : 'Add photo'}
                      </span>
                    )}
                  </button>
                  {imagePath && (
                    <button
                      type="button"
                      className="text-left text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setImagePath(null)}
                    >
                      Remove photo
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => onPickImage(e.target.files?.[0])}
                  />
                </div>
              </div>
              <Field id="p-category" label="Category">
                <NativeSelect
                  id="p-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {topCategories.map((c) => [
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>,
                    ...menu.categories
                      .filter((s) => s.parent_id === c.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {'   '}
                          {c.name} › {s.name}
                        </option>
                      )),
                  ])}
                </NativeSelect>
              </Field>
              <Field id="p-desc" label="Description">
                <Textarea
                  id="p-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Boneless chicken marinated in yoghurt and spices, char-grilled."
                />
              </Field>
              <Field id="p-desc-ur" label="Description in Urdu">
                <Textarea
                  id="p-desc-ur"
                  lang="ur"
                  dir="rtl"
                  value={descUr}
                  onChange={(e) => setDescUr(e.target.value)}
                />
              </Field>
            </Section>

            <Section
              title="Price"
              hint="Use sizes for items sold as Half / Full, Small / Large, etc."
            >
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={useVariants}
                  onChange={(e) => setUseVariants(e.target.checked)}
                />
                This item comes in different sizes or portions
              </label>
              {useVariants ? (
                <div className="grid gap-2">
                  <div className="hidden grid-cols-[1fr_1fr_120px_64px_32px] gap-2 text-xs text-muted-foreground sm:grid">
                    <span>Size</span>
                    <span>In Urdu</span>
                    <span>Price</span>
                    <span>Default</span>
                    <span />
                  </div>
                  {variants.map((v, i) => (
                    <div
                      key={v.key}
                      className="grid grid-cols-[1fr_120px_32px] gap-2 sm:grid-cols-[1fr_1fr_120px_64px_32px]"
                    >
                      <Input
                        aria-label={`Size ${i + 1} name`}
                        value={v.name}
                        placeholder="Half"
                        onChange={(e) =>
                          setVariants(
                            variants.map((x) =>
                              x.key === v.key ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <Input
                        aria-label={`Size ${i + 1} name in Urdu`}
                        lang="ur"
                        dir="rtl"
                        className="hidden sm:flex"
                        value={v.nameUr}
                        onChange={(e) =>
                          setVariants(
                            variants.map((x) =>
                              x.key === v.key ? { ...x, nameUr: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <MoneyInput
                        aria-label={`Size ${i + 1} price`}
                        currency={currency}
                        value={v.price}
                        onChange={(e) =>
                          setVariants(
                            variants.map((x) =>
                              x.key === v.key ? { ...x, price: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <label className="hidden items-center justify-center sm:flex">
                        <input
                          type="radio"
                          name="default-variant"
                          aria-label={`Make ${v.name || 'this size'} the default`}
                          className="accent-[var(--primary)]"
                          checked={v.is_default}
                          onChange={() =>
                            setVariants(
                              variants.map((x) => ({ ...x, is_default: x.key === v.key })),
                            )
                          }
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove size ${i + 1}`}
                        onClick={() => setVariants(variants.filter((x) => x.key !== v.key))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      setVariants([
                        ...variants,
                        {
                          key: rowKey(),
                          name: '',
                          nameUr: '',
                          price: '',
                          is_default: variants.length === 0,
                        },
                      ])
                    }
                  >
                    <Plus /> Add size
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="p-price" label="Price">
                    <MoneyInput
                      id="p-price"
                      currency={currency}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="850"
                    />
                  </Field>
                  <Field
                    id="p-compare"
                    label="Was (optional)"
                    hint="Shown struck through to highlight a discount."
                  >
                    <MoneyInput
                      id="p-compare"
                      currency={currency}
                      value={compareAt}
                      onChange={(e) => setCompareAt(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </Section>

            <Section title="Add-ons" hint="Choices guests can make, like sauces or extra toppings.">
              {menu.groups.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No add-on groups yet. Create them in the Add-ons tab.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {menu.groups.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={groupIds.includes(g.id)}
                        onChange={(e) =>
                          setGroupIds(
                            e.target.checked
                              ? [...groupIds, g.id]
                              : groupIds.filter((x) => x !== g.id),
                          )
                        }
                      />
                      <span>
                        {g.name}
                        <span className="block text-xs text-muted-foreground">
                          {g.modifiers.map((m) => m.name).join(', ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Kitchen">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="p-station"
                  label="Kitchen station"
                  hint="Where this item's ticket is sent."
                >
                  <NativeSelect
                    id="p-station"
                    value={stationId}
                    onChange={(e) => setStationId(e.target.value)}
                  >
                    <option value="">Not assigned</option>
                    {menu.stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="p-prep" label="Prep time (minutes)">
                  <Input
                    id="p-prep"
                    inputMode="numeric"
                    value={prepTime}
                    onChange={(e) => setPrepTime(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="15"
                  />
                </Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium">Labels</legend>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((t) => {
                    const on = tags.includes(t.value)
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setTags(on ? tags.filter((x) => x !== t.value) : [...tags, t.value])
                        }
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'hover:bg-accent',
                        )}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </Section>

            {branches.length > 1 && (
              <Section
                title="Branch prices"
                hint="Leave empty to use the main price. Useful when a branch charges more or doesn't sell an item."
              >
                <div className="grid gap-2">
                  {branches.map((b) => (
                    <div key={b.id} className="grid grid-cols-[1fr_120px_130px] items-center gap-2">
                      <span className="truncate text-sm">{b.name}</span>
                      <MoneyInput
                        aria-label={`${b.name} price`}
                        currency={currency}
                        placeholder={useVariants ? 'n/a' : price}
                        disabled={useVariants}
                        value={overrides[b.id]?.price ?? ''}
                        onChange={(e) =>
                          setOverrides({
                            ...overrides,
                            [b.id]: { ...overrides[b.id], price: e.target.value },
                          })
                        }
                      />
                      <NativeSelect
                        aria-label={`${b.name} availability`}
                        value={overrides[b.id]?.available ?? 'default'}
                        onChange={(e) =>
                          setOverrides({
                            ...overrides,
                            [b.id]: {
                              ...overrides[b.id],
                              available: e.target.value as OverrideRow['available'],
                            },
                          })
                        }
                      >
                        <option value="default">As main menu</option>
                        <option value="yes">Available</option>
                        <option value="no">Not sold here</option>
                      </NativeSelect>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Visibility">
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  Available now
                  <span className="block text-xs text-muted-foreground">
                    Turn off when it's sold out for the day.
                  </span>
                </span>
                <Switch
                  checked={available}
                  onCheckedChange={setAvailable}
                  aria-label="Available now"
                />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  Show on menu
                  <span className="block text-xs text-muted-foreground">
                    Turn off to hide the item without deleting it.
                  </span>
                </span>
                <Switch checked={active} onCheckedChange={setActive} aria-label="Show on menu" />
              </label>
            </Section>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t bg-background px-5 py-3 sm:px-6">
            <div>
              {product &&
                can('menu.manage') &&
                (confirmDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={doDelete}
                    disabled={del.isPending}
                  >
                    Confirm delete
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </Button>
                ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save item'}
              </Button>
            </div>
          </footer>
        </form>
      </SheetContent>
    </Sheet>
  )
}

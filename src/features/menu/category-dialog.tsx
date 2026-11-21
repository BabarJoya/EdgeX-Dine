import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import {
  useDeleteCategory,
  useSaveCategory,
  type Category,
  type Menu,
  type Translations,
} from './api'

export function CategoryDialog({
  menu,
  category,
  onClose,
}: {
  menu: Menu
  category: Category | null
  onClose: () => void
}) {
  const { tenantId } = useTenant()
  const tr = (category?.translations ?? {}) as Translations
  const [name, setName] = useState(category?.name ?? '')
  const [nameUr, setNameUr] = useState(tr.ur?.name ?? '')
  const [parentId, setParentId] = useState(category?.parent_id ?? '')
  const [active, setActive] = useState(category?.is_active ?? true)
  const save = useSaveCategory(tenantId)
  const del = useDeleteCategory(tenantId)
  const hasChildren = !!category && menu.categories.some((c) => c.parent_id === category.id)
  const itemCount = category ? menu.products.filter((p) => p.category_id === category.id).length : 0
  const parents = menu.categories.filter((c) => !c.parent_id && c.id !== category?.id)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    save.mutate(
      {
        id: category?.id,
        name,
        description: category?.description ?? '',
        parent_id: parentId || null,
        translations: nameUr.trim() ? { ur: { name: nameUr.trim() } } : {},
        is_active: active,
        sort_order: category ? undefined : menu.categories.length + 1,
      },
      {
        onSuccess: () => {
          toast.success(category ? 'Category saved' : `${name.trim()} added`)
          onClose()
        },
      },
    )
  }

  const error = save.error ?? del.error
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>
          {error && <Alert variant="destructive">{errorMessage(error)}</Alert>}
          <Field id="c-name" label="Name">
            <Input
              id="c-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="BBQ"
            />
          </Field>
          <Field id="c-name-ur" label="Name in Urdu">
            <Input
              id="c-name-ur"
              lang="ur"
              dir="rtl"
              value={nameUr}
              onChange={(e) => setNameUr(e.target.value)}
            />
          </Field>
          {!hasChildren && (
            <Field
              id="c-parent"
              label="Inside"
              hint="Make this a subcategory, e.g. Tikka inside BBQ."
            >
              <NativeSelect
                id="c-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Top level</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <label className="flex items-center justify-between text-sm">
            Show on menu
            <Switch
              checked={active}
              onCheckedChange={setActive}
              aria-label="Show category on menu"
            />
          </label>
          <DialogFooter className="sm:justify-between">
            {category ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={del.isPending || itemCount > 0 || hasChildren}
                title={
                  itemCount > 0 || hasChildren
                    ? 'Move or delete its items and subcategories first'
                    : undefined
                }
                onClick={() =>
                  del.mutate(category.id, {
                    onSuccess: () => {
                      toast.success('Category deleted')
                      onClose()
                    },
                  })
                }
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

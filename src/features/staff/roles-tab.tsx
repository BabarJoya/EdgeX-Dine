import { Lock, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  useCreateRole,
  useDeleteRole,
  usePermissionCatalog,
  useSetRolePermissions,
  type Member,
  type Role,
} from './api'

function NewRoleDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const { tenantId } = useTenant()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const create = useCreateRole(tenantId)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName('')
          setDescription('')
          create.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus /> New role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              { name, description },
              {
                onSuccess: (id) => {
                  setOpen(false)
                  onCreated(id)
                },
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
          </DialogHeader>
          {create.error && <Alert variant="destructive">{errorMessage(create.error)}</Alert>}
          <Field id="role-name" label="Name">
            <Input
              id="role-name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Head Waiter"
            />
          </Field>
          <Field id="role-desc" label="Description">
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Create role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RolesTab({ roles, members }: { roles: Role[]; members: Member[] }) {
  const { tenantId, can } = useTenant()
  const catalog = usePermissionCatalog()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0]
  const [draft, setDraft] = useState<Record<string, Set<string>>>({})
  const save = useSetRolePermissions(tenantId)
  const del = useDeleteRole(tenantId)
  const canEdit = can('roles.manage')

  const modules = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof catalog.data>>()
    for (const p of catalog.data ?? []) groups.set(p.module, [...(groups.get(p.module) ?? []), p])
    return [...groups.entries()]
  }, [catalog.data])

  if (!selected) return null
  const saved = new Set(selected.role_permissions.map((p) => p.permission_key))
  const current = draft[selected.id] ?? saved
  const dirty = current.size !== saved.size || [...current].some((k) => !saved.has(k))
  const memberCount = (id: string) => members.filter((m) => m.role_id === id).length

  const toggle = (key: string, on: boolean) => {
    const next = new Set(current)
    if (on) next.add(key)
    else next.delete(key)
    setDraft((d) => ({ ...d, [selected.id]: next }))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit p-2">
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <span className="text-xs font-medium text-muted-foreground">Roles</span>
          {canEdit && <NewRoleDialog onCreated={setSelectedId} />}
        </div>
        <ul className="grid gap-0.5">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent',
                  r.id === selected.id && 'bg-accent font-medium',
                )}
              >
                <span className="truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {memberCount(r.id)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold">{selected.name}</h3>
              {selected.is_system && <Badge>Standard</Badge>}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {selected.description || 'Custom role'}
            </p>
          </div>
          {canEdit && !selected.is_owner && (
            <div className="flex gap-2">
              {!selected.is_system && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={del.isPending || memberCount(selected.id) > 0}
                  title={
                    memberCount(selected.id) > 0 ? 'Move members to another role first' : undefined
                  }
                  onClick={() =>
                    del.mutate(selected.id, {
                      onSuccess: () => {
                        toast.success('Role deleted')
                        setSelectedId(null)
                      },
                    })
                  }
                >
                  <Trash2 /> Delete
                </Button>
              )}
              <Button
                size="sm"
                disabled={!dirty || save.isPending}
                onClick={() =>
                  save.mutate(
                    { roleId: selected.id, permissions: [...current] },
                    {
                      onSuccess: () => {
                        toast.success(`${selected.name} permissions saved`)
                        setDraft((d) => {
                          const { [selected.id]: _, ...rest } = d
                          void _
                          return rest
                        })
                      },
                    },
                  )
                }
              >
                {save.isPending ? 'Saving…' : 'Save permissions'}
              </Button>
            </div>
          )}
        </div>

        <div className="px-5 py-4">
          {(save.error || del.error) && (
            <Alert variant="destructive" className="mb-4">
              {errorMessage(save.error ?? del.error)}
            </Alert>
          )}
          {selected.is_owner ? (
            <Alert>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" /> The Owner has full access to everything. This can't be
                changed.
              </span>
            </Alert>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {modules.map(([module, perms]) => (
                <fieldset key={module}>
                  <legend className="mb-2 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
                    {module}
                  </legend>
                  <div className="grid gap-2.5">
                    {perms.map((p) => (
                      <label key={p.key} className="flex items-start gap-2.5 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={current.has(p.key)}
                          disabled={!canEdit}
                          onChange={(e) => toggle(p.key, e.target.checked)}
                        />
                        <span>
                          {p.label}
                          <span className="block text-xs text-muted-foreground">
                            {p.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { useRemoveMember, useUpdateMember, type Member, type Role } from './api'
import { BranchAccessPicker } from './branch-access'

export function MemberDialog({
  member,
  roles,
  onClose,
}: {
  member: Member
  roles: Role[]
  onClose: () => void
}) {
  const { tenantId, branches } = useTenant()
  const [roleId, setRoleId] = useState(member.role_id)
  const [access, setAccess] = useState({
    allBranches: member.all_branches,
    branchIds: member.member_branches.map((b) => b.branch_id),
  })
  const [disabled, setDisabled] = useState(member.status === 'disabled')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const update = useUpdateMember(tenantId)
  const remove = useRemoveMember(tenantId)
  const name = member.profile?.full_name || member.profile?.email || 'Team member'

  const save = () =>
    update.mutate(
      { memberId: member.id, roleId, ...access, status: disabled ? 'disabled' : 'active' },
      {
        onSuccess: () => {
          toast.success(`${name} updated`)
          onClose()
        },
      },
    )

  const doRemove = () =>
    remove.mutate(member.id, {
      onSuccess: () => {
        toast.success(`${name} removed`)
        onClose()
      },
    })

  const error = update.error ?? remove.error

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{member.profile?.email}</DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive">{errorMessage(error)}</Alert>}
        <Field id="member-role" label="Role">
          <NativeSelect id="member-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles
              .filter((r) => !r.is_owner)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <BranchAccessPicker branches={branches} {...access} onChange={setAccess} />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
          />
          <span>
            Suspend access
            <span className="block text-xs text-muted-foreground">
              They can't sign in to this restaurant until you turn this off.
            </span>
          </span>
        </label>
        <DialogFooter className="sm:justify-between">
          {confirmRemove ? (
            <Button variant="destructive" onClick={doRemove} disabled={remove.isPending}>
              {remove.isPending ? 'Removing…' : 'Confirm remove'}
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmRemove(true)}
            >
              Remove from team
            </Button>
          )}
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

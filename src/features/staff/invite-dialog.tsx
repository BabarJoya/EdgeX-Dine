import { Check, Copy, MessageCircle, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { useInviteMember, type Role } from './api'
import { BranchAccessPicker } from './branch-access'
import { inviteUrl } from './invite-url'

export function InviteDialog({ roles }: { roles: Role[] }) {
  const { tenantId, branches, membership } = useTenant()
  const assignable = roles.filter((r) => !r.is_owner)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [access, setAccess] = useState({ allBranches: false, branchIds: [] as string[] })
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const invite = useInviteMember(tenantId)

  const reset = () => {
    setEmail('')
    setRoleId(assignable.find((r) => r.template_key === 'waiter')?.id ?? assignable[0]?.id ?? '')
    setAccess({ allBranches: false, branchIds: branches[0] ? [branches[0].id] : [] })
    setLink(null)
    setCopied(false)
    invite.reset()
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    invite.mutate({ email, roleId, ...access }, { onSuccess: (token) => setLink(inviteUrl(token)) })
  }

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  const roleName = assignable.find((r) => r.id === roleId)?.name
  const whatsappText = encodeURIComponent(
    `You're invited to join ${membership?.tenants.name} on EdgeX as ${roleName}. Accept here: ${link}`,
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitation created</DialogTitle>
              <DialogDescription>
                Send this link to {email}. It works only for that email address and expires in 7
                days.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all">
              {link}
            </div>
            <DialogFooter>
              <Button variant="secondary" asChild>
                <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer">
                  <MessageCircle /> Share on WhatsApp
                </a>
              </Button>
              <Button onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                They'll get access when they accept with this email.
              </DialogDescription>
            </DialogHeader>
            {invite.error && <Alert variant="destructive">{errorMessage(invite.error)}</Alert>}
            <Field id="invite-email" label="Email">
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </Field>
            <Field id="invite-role" label="Role">
              <NativeSelect
                id="invite-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {assignable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <BranchAccessPicker branches={branches} {...access} onChange={setAccess} />
            <DialogFooter>
              <Button type="submit" disabled={invite.isPending || !email || !roleId}>
                {invite.isPending ? 'Creating…' : 'Create invitation'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

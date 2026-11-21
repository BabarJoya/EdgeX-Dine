import { LifeBuoy, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PageHeader } from '@/components/ui/page-header'
import { Textarea } from '@/components/ui/textarea'
import { useCreateTicket, useTickets } from '@/features/platform/api'
import { SupportThread } from '@/features/platform/support-thread'
import { stateBadge } from '@/features/platform/ticket-state'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

export function SupportPage() {
  const { tenantId } = useTenant()
  const tickets = useTickets(tenantId)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const list = tickets.data ?? []
  const current = list.find((t) => t.id === selected) ?? list[0]

  return (
    <>
      <PageHeader
        title="Help & support"
        description="Questions, problems or plan changes. The EdgeX team usually replies within a working day."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New request
          </Button>
        }
      />
      {list.length === 0 && !tickets.isPending ? (
        <EmptyState
          icon={LifeBuoy}
          title="No requests yet"
          description="Ask us anything: setting up your menu, printers, billing or a feature you need."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card className="h-fit p-1.5">
            <ul className="grid gap-0.5">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.id)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left hover:bg-accent',
                      current?.id === t.id && 'bg-accent',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{t.subject}</span>
                      <Badge variant={stateBadge[t.state].variant}>
                        {stateBadge[t.state].label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.updated_at).toLocaleDateString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {current && (
            <Card className="flex h-[min(70dvh,640px)] flex-col overflow-hidden">
              <SupportThread key={current.id} ticket={current} />
            </Card>
          )}
        </div>
      )}
      {creating && (
        <NewTicketDialog onClose={(id) => (setCreating(false), id && setSelected(id))} />
      )}
    </>
  )
}

function NewTicketDialog({ onClose }: { onClose: (id?: string) => void }) {
  const { tenantId } = useTenant()
  const create = useCreateTicket(tenantId)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('general')
  const [body, setBody] = useState('')
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              { subject, category, body },
              { onSuccess: (id) => (toast.success('Request sent'), onClose(id)) },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>New support request</DialogTitle>
          </DialogHeader>
          {create.error && <Alert variant="destructive">{errorMessage(create.error)}</Alert>}
          <Field id="t-subject" label="Subject">
            <Input
              id="t-subject"
              required
              minLength={3}
              maxLength={120}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field id="t-category" label="Topic">
            <NativeSelect
              id="t-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="general">General question</option>
              <option value="bug">Something isn't working</option>
              <option value="billing">Billing</option>
              <option value="feature">Feature request</option>
            </NativeSelect>
          </Field>
          <Field id="t-body" label="Details">
            <Textarea
              id="t-body"
              required
              rows={5}
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              type="submit"
              disabled={create.isPending || subject.trim().length < 3 || !body.trim()}
            >
              Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

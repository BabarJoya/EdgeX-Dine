import { Send } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-provider'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useReplyTicket, useTicketMessages, type Ticket } from './api'
import { stateBadge } from './ticket-state'

/** Message thread with reply box, used by restaurants and the EdgeX team. */
export function SupportThread({
  ticket,
  asPlatform = false,
}: {
  ticket: Ticket
  asPlatform?: boolean
}) {
  const { user } = useAuth()
  const messages = useTicketMessages(ticket.id)
  const reply = useReplyTicket()
  const [body, setBody] = useState('')
  return (
    <div className="flex min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">{ticket.subject}</h2>
        <Badge variant={stateBadge[ticket.state].variant}>{stateBadge[ticket.state].label}</Badge>
        {asPlatform && ticket.tenants && (
          <span className="text-[13px] text-muted-foreground">· {ticket.tenants.name}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground capitalize">{ticket.category}</span>
      </header>
      <ol className="grid flex-1 content-start gap-3 overflow-y-auto p-4">
        {(messages.data ?? []).map((m) => {
          const mine = m.author_id === user?.id
          return (
            <li
              key={m.id}
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                mine ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              <div
                className={cn(
                  'mb-0.5 text-[11px] font-medium',
                  mine ? 'opacity-80' : 'text-muted-foreground',
                )}
              >
                {m.from_platform ? 'EdgeX support' : mine ? 'You' : 'Restaurant'} ·{' '}
                {new Date(m.created_at).toLocaleString([], {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          )
        })}
      </ol>
      <form
        className="grid gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (body.trim())
            reply.mutate({ ticketId: ticket.id, body }, { onSuccess: () => setBody('') })
        }}
      >
        {reply.error && <Alert variant="destructive">{errorMessage(reply.error)}</Alert>}
        <Textarea
          aria-label="Reply"
          placeholder="Write a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
        />
        <div className="flex justify-between gap-2">
          {ticket.state !== 'closed' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => reply.mutate({ ticketId: ticket.id, body: '', state: 'closed' })}
            >
              Close ticket
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={!body.trim() || reply.isPending}>
            <Send /> Send
          </Button>
        </div>
      </form>
    </div>
  )
}

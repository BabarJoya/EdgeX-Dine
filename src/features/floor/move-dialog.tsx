import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useMergeSessions, useTransferSession, type Session, type Table } from './api'

/**
 * Move guests to a free table, or merge them into another occupied table.
 */
export function MoveTableDialog({
  mode,
  table,
  session,
  tables,
  sessions,
  onClose,
  onDone,
}: {
  mode: 'transfer' | 'merge'
  table: Table
  session: Session
  tables: Table[]
  sessions: Session[]
  onClose: () => void
  /** Called with the table the guests are now at. */
  onDone?: (tableId: string) => void
}) {
  const transfer = useTransferSession()
  const merge = useMergeSessions()
  const [target, setTarget] = useState<string | null>(null)
  const openTables = new Set(sessions.map((s) => s.table_id))
  const choices = tables.filter(
    (t) =>
      t.id !== table.id &&
      t.is_active &&
      (mode === 'transfer' ? !openTables.has(t.id) : openTables.has(t.id)),
  )
  const busy = transfer.isPending || merge.isPending
  const error = transfer.error ?? merge.error

  // mutateAsync: the dialog's table loses its sitting on success, which can
  // unmount this component before per-call callbacks would run.
  const submit = async () => {
    if (!target) return
    const label = tables.find((t) => t.id === target)?.label
    try {
      if (mode === 'transfer') {
        await transfer.mutateAsync({ sessionId: session.id, toTableId: target })
        toast.success(`Guests moved from ${table.label} to ${label}`)
      } else {
        const into = sessions.find((s) => s.table_id === target)!
        await merge.mutateAsync({ fromSessionId: session.id, intoSessionId: into.id })
        toast.success(`${table.label} merged into ${label}`)
      }
      onDone?.(target)
      onClose()
    } catch {
      /* error shown in the dialog */
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'transfer' ? `Move table ${table.label}` : `Merge table ${table.label}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'transfer'
              ? 'Choose a free table. Orders and the guests’ phones move with them.'
              : 'Choose the table to join. All orders end up on one bill.'}
          </DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive">{errorMessage(error)}</Alert>}
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {mode === 'transfer'
              ? 'No free tables right now.'
              : 'No other tables have guests right now.'}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {choices.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={target === t.id}
                onClick={() => setTarget(t.id)}
                className={cn(
                  'h-14 rounded-md border text-sm font-semibold',
                  target === t.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!target || busy} onClick={submit}>
            {mode === 'transfer' ? 'Move guests' : 'Merge tables'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

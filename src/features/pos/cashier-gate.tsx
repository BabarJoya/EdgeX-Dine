import { Delete, Lock, UserRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/auth-provider'
import { useTenant } from '@/features/tenant/tenant-provider'
import { errorMessage } from '@/lib/errors'
import { useSetMyPin, usePosUnlock, type Operator } from './api'

/** "Who's working?" — continue as the signed-in user, or a cashier enters their PIN. */
export function CashierGate({
  branchId,
  onReady,
}: {
  branchId: string
  onReady: (op: Operator) => void
}) {
  const { user } = useAuth()
  const { can, membership } = useTenant()
  const unlock = usePosUnlock()
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [setPinOpen, setSetPinOpen] = useState(false)
  const myName = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Me'

  const press = (d: string) => {
    setMessage(null)
    const next = (pin + d).slice(0, 6)
    setPin(next)
    if (next.length === 6) submit(next)
  }

  const submit = (value: string) =>
    unlock.mutate(
      { branchId, pin: value },
      {
        onSuccess: (r) => {
          setPin('')
          if (r.error || !r.token) return setMessage(r.message ?? 'Wrong PIN')
          onReady({
            token: r.token,
            userId: r.user_id!,
            name: r.name || 'Cashier',
            role: r.role ?? '',
          })
          toast.success(`Hi ${r.name || 'there'}`)
        },
        onError: (e) => {
          setPin('')
          setMessage(errorMessage(e))
        },
      },
    )

  return (
    <div className="grid flex-1 place-items-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          <Lock className="mx-auto mb-2 size-6 text-muted-foreground" strokeWidth={1.75} />
          <h1 className="text-lg font-semibold">Who's on the till?</h1>
          <p className="text-[13px] text-muted-foreground">
            Enter your 6-digit PIN. Payments are recorded under your name.
          </p>
        </div>

        <div
          className="mb-4 flex justify-center gap-2"
          aria-label={`${pin.length} of 6 digits entered`}
          role="status"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`size-3 rounded-full border-2 ${i < pin.length ? 'border-primary bg-primary' : 'border-input'}`}
            />
          ))}
        </div>
        {message && (
          <Alert variant="destructive" className="mb-3">
            {message}
          </Alert>
        )}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <Button
              key={d}
              variant="secondary"
              size="touch"
              disabled={unlock.isPending}
              onClick={() => press(d)}
            >
              {d}
            </Button>
          ))}
          <span />
          <Button
            variant="secondary"
            size="touch"
            disabled={unlock.isPending}
            onClick={() => press('0')}
          >
            0
          </Button>
          <Button
            variant="ghost"
            size="touch"
            aria-label="Delete digit"
            onClick={() => setPin(pin.slice(0, -1))}
          >
            <Delete />
          </Button>
        </div>

        <div className="mt-5 grid gap-2 border-t pt-4">
          {can('payments.take') && (
            <Button
              variant="secondary"
              onClick={() =>
                onReady({
                  token: null,
                  userId: user!.id,
                  name: myName,
                  role: membership?.roles.name ?? '',
                })
              }
            >
              <UserRound /> Continue as {myName}
            </Button>
          )}
          <Button variant="link" className="mx-auto" onClick={() => setSetPinOpen(true)}>
            Set or change my PIN
          </Button>
        </div>
      </Card>
      {setPinOpen && <SetPinDialog onClose={() => setSetPinOpen(false)} />}
    </div>
  )
}

export function SetPinDialog({ onClose }: { onClose: () => void }) {
  const { tenantId } = useTenant()
  const setMyPin = useSetMyPin()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const valid = /^\d{6}$/.test(pin) && pin === confirm
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setMyPin.mutate(
              { tenantId: tenantId!, pin },
              { onSuccess: () => (toast.success('PIN saved'), onClose()) },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Your POS PIN</DialogTitle>
            <DialogDescription>
              Six digits you'll use to open the till on a shared device. Don't share it.
            </DialogDescription>
          </DialogHeader>
          {setMyPin.error && <Alert variant="destructive">{errorMessage(setMyPin.error)}</Alert>}
          <Field id="pin-new" label="New PIN">
            <Input
              id="pin-new"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field
            id="pin-confirm"
            label="Confirm PIN"
            error={confirm.length === 6 && pin !== confirm ? "PINs don't match" : undefined}
          >
            <Input
              id="pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!valid || setMyPin.isPending}>
              Save PIN
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

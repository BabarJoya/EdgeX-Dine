import { useMutation, useQuery } from '@tanstack/react-query'
import { CalendarCheck, MapPin, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { time12 } from '@/features/reservations/api'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Info = {
  restaurant: { name: string; slug: string; logo_url: string | null; brand_color: string | null }
  today: string
  branches: {
    id: string
    name: string
    address: string | null
    phone: string | null
    max_party: number
    days_ahead: number
  }[]
}

const addDaysIso = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Public booking page: /book/:slug */
export function BookPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const info = useQuery({
    queryKey: ['booking-info', slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_booking_info', { p_slug: slug })
      if (error) throw error
      return data as unknown as Info | null
    },
  })
  const i = info.data
  const [branchId, setBranchId] = useState('')
  const [date, setDate] = useState('')
  const [party, setParty] = useState('2')
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const branch = i?.branches.find((b) => b.id === branchId) ?? i?.branches[0]
  // Today (restaurant time) until the guest picks a date.
  const day = date || i?.today || ''

  useEffect(() => {
    if (i?.restaurant.brand_color)
      document.documentElement.style.setProperty('--guest-accent', i.restaurant.brand_color)
  }, [i])

  const slots = useQuery({
    queryKey: ['slots', branch?.id, day, party],
    enabled: !!branch && !!day,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('reservation_slots', {
        p_branch_id: branch!.id,
        p_date: day,
        p_party: Number(party),
      })
      if (error) throw error
      return data as unknown as { time: string; available: boolean }[]
    },
  })
  const book = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('request_reservation', {
        p_branch_id: branch!.id,
        p_date: day,
        p_time: time,
        p_party: Number(party),
        p_name: name,
        p_phone: phone,
        p_notes: notes,
      })
      if (error) throw error
      return data as unknown as { token: string }
    },
    onSuccess: (d) => navigate(`/res/${d.token}`),
  })

  if (info.isPending) return <Skeleton className="m-6 h-96" />
  if (!i) return <p className="p-6 text-center text-sm">Restaurant not found.</p>

  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-[var(--guest-accent)] px-4 py-6 text-[var(--guest-accent-fg)]">
        <div className="mx-auto max-w-lg">
          <div className="text-sm opacity-80">Book a table</div>
          <h1 className="text-2xl font-semibold">{i.restaurant.name}</h1>
        </div>
      </header>
      <main className="mx-auto grid max-w-lg gap-5 px-4 py-6">
        {i.branches.length === 0 ? (
          <Alert variant="info">This restaurant is not taking online bookings right now.</Alert>
        ) : (
          <>
            {i.branches.length > 1 && (
              <Field id="bk-branch" label="Branch">
                <NativeSelect
                  id="bk-branch"
                  value={branch?.id}
                  onChange={(e) => (setBranchId(e.target.value), setTime(''))}
                >
                  {i.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {branch && (branch.address || branch.phone) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                {branch.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" /> {branch.address}
                  </span>
                )}
                {branch.phone && (
                  <a href={`tel:${branch.phone}`} className="flex items-center gap-1 text-link">
                    <Phone className="size-3.5" /> {branch.phone}
                  </a>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field id="bk-date" label="Date">
                <Input
                  id="bk-date"
                  type="date"
                  min={i.today}
                  max={addDaysIso(i.today, branch?.days_ahead ?? 30)}
                  value={day}
                  onChange={(e) => (setDate(e.target.value), setTime(''))}
                />
              </Field>
              <Field id="bk-party" label="Guests">
                <NativeSelect
                  id="bk-party"
                  value={party}
                  onChange={(e) => (setParty(e.target.value), setTime(''))}
                >
                  {Array.from({ length: branch?.max_party ?? 12 }, (_, n) => (
                    <option key={n + 1} value={n + 1}>
                      {n + 1} {n ? 'guests' : 'guest'}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Time</legend>
              {slots.data && slots.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No times left on this day. Try another date.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Time">
                  {(slots.data ?? []).map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      role="radio"
                      aria-checked={time === s.time}
                      disabled={!s.available}
                      onClick={() => setTime(s.time)}
                      className={cn(
                        'h-10 rounded-md border text-[13px] tabular-nums',
                        time === s.time
                          ? 'border-[var(--guest-accent)] bg-[var(--guest-accent)] text-[var(--guest-accent-fg)]'
                          : 'bg-card hover:bg-accent',
                        !s.available &&
                          'cursor-not-allowed text-muted-foreground line-through opacity-60',
                      )}
                    >
                      {time12(s.time)}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
            <div className="grid gap-3">
              <Field id="bk-name" label="Your name">
                <Input
                  id="bk-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field
                id="bk-phone"
                label="Mobile number"
                hint="We send your confirmation on WhatsApp."
              >
                <Input
                  id="bk-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="0300 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field id="bk-notes" label="Anything we should know? (optional)">
                <Textarea
                  id="bk-notes"
                  maxLength={300}
                  placeholder="Birthday, high chair, outdoor seating…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </div>
            {book.error && <Alert variant="destructive">{errorMessage(book.error)}</Alert>}
            <Button
              size="lg"
              className="bg-[var(--guest-accent)] text-[var(--guest-accent-fg)] hover:bg-[var(--guest-accent)]/90"
              disabled={
                !time || !name.trim() || phone.replace(/\D/g, '').length < 10 || book.isPending
              }
              onClick={() => book.mutate()}
            >
              <CalendarCheck /> Request booking
            </Button>
          </>
        )}
      </main>
    </div>
  )
}

type Booking = {
  restaurant: string
  slug: string
  brand_color: string | null
  branch: string
  address: string | null
  branch_phone: string | null
  name: string
  party_size: number
  status: string
  notes: string
  date: string
  time: string
  can_cancel: boolean
}

const guestStatus: Record<string, [string, 'info' | 'success' | 'warning' | 'destructive']> = {
  requested: ['Waiting for the restaurant to confirm', 'warning'],
  confirmed: ['Confirmed — see you soon!', 'success'],
  seated: ['Enjoy your meal!', 'success'],
  completed: ['Thanks for visiting', 'info'],
  cancelled: ['This booking was cancelled', 'destructive'],
  no_show: ['Marked as no-show', 'destructive'],
}

/** A guest's own booking: /res/:token */
export function ReservationPage() {
  const { token = '' } = useParams()
  const booking = useQuery({
    queryKey: ['my-booking', token],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_reservation', { p_token: token })
      if (error) throw error
      return data as unknown as Booking | null
    },
  })
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_my_reservation', { p_token: token })
      if (error) throw error
    },
    onSuccess: () => booking.refetch(),
  })
  const b = booking.data
  if (booking.isPending) return <Skeleton className="m-6 h-72" />
  if (!b) return <p className="p-6 text-center text-sm">Booking not found.</p>
  const [label, tone] = guestStatus[b.status]
  const when = new Date(`${b.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return (
    <div className="min-h-dvh bg-background px-4 py-8">
      <main className="mx-auto grid max-w-md gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{b.restaurant}</div>
          <h1 className="text-2xl font-semibold">Your booking</h1>
        </div>
        <Alert variant={tone} data-testid="booking-status">
          {label}
        </Alert>
        <dl className="grid gap-2 rounded-lg border bg-card p-4 text-sm">
          {[
            ['Name', b.name],
            ['When', `${when}, ${time12(b.time)}`],
            ['Guests', String(b.party_size)],
            ['Where', `${b.branch}${b.address ? ` · ${b.address}` : ''}`],
            ...(b.notes ? [['Notes', b.notes]] : []),
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[5rem_1fr] gap-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {cancel.error && <Alert variant="destructive">{errorMessage(cancel.error)}</Alert>}
        <div className="flex flex-wrap gap-2">
          {b.branch_phone && (
            <Button variant="secondary" asChild>
              <a href={`tel:${b.branch_phone}`}>
                <Phone /> Call the restaurant
              </a>
            </Button>
          )}
          {b.can_cancel && (
            <Button variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel booking
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Keep this link to check or cancel your booking.
        </p>
      </main>
    </div>
  )
}

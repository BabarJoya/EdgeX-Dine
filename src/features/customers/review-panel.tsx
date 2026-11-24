import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Star } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type ReviewState = {
  can_review: boolean
  rating: number | null
  comment: string | null
  google_review_url: string | null
}

const LABELS = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent']

/** "How was your meal?" on a paid receipt link. */
export function ReviewPanel({ token }: { token: string }) {
  const qc = useQueryClient()
  const state = useQuery({
    queryKey: ['review', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_review', { p_receipt_token: token })
      if (error) throw error
      return data as unknown as ReviewState | null
    },
  })
  const s = state.data
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState(false)
  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('submit_review', {
        p_receipt_token: token,
        p_rating: rating,
        p_comment: comment,
      })
      if (error) throw error
      return data as unknown as ReviewState
    },
    onSuccess: (d) => {
      qc.setQueryData(['review', token], d)
      setEditing(false)
      toast.success('Thank you for your feedback!')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (!s?.can_review && !s?.rating) return null

  const done = s.rating && !editing
  return (
    <section
      className="no-print mx-auto mb-4 w-[80mm] max-w-full rounded-lg border bg-card p-4 font-sans shadow-sm"
      aria-label="Rate your visit"
    >
      {done ? (
        <div className="grid gap-2">
          <div className="text-sm font-semibold">Thanks for your feedback</div>
          <Stars value={s.rating ?? 0} />
          {s.google_review_url && (
            <>
              <p className="text-[13px] text-muted-foreground">
                Glad you enjoyed it! Would you share it on Google? It helps us a lot.
              </p>
              <Button asChild>
                <a href={s.google_review_url} target="_blank" rel="noreferrer">
                  Review us on Google <ExternalLink />
                </a>
              </Button>
            </>
          )}
          {s.can_review && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => (
                setRating(s.rating ?? 0),
                setComment(s.comment ?? ''),
                setEditing(true)
              )}
            >
              Change my review
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="text-sm font-semibold">How was your meal?</div>
          <Stars value={rating} onChange={setRating} />
          {rating > 0 && (
            <div className="-mt-1 text-xs text-muted-foreground">{LABELS[rating]}</div>
          )}
          <Textarea
            aria-label="Tell us more (optional)"
            placeholder="Tell us more (optional)"
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button disabled={!rating || submit.isPending} onClick={() => submit.mutate()}>
            Send feedback
          </Button>
        </div>
      )}
    </section>
  )
}

export function Stars({
  value,
  onChange,
  size = 'md',
}: {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className="flex gap-1"
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={onChange ? 'Rating' : `${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = (
          <Star
            className={cn(
              size === 'sm' ? 'size-3.5' : 'size-7',
              n <= value ? 'fill-sidebar-highlight text-sidebar-highlight' : 'text-input',
            )}
            strokeWidth={1.5}
          />
        )
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)}
            className="rounded-sm"
          >
            {icon}
          </button>
        ) : (
          <span key={n}>{icon}</span>
        )
      })}
    </div>
  )
}

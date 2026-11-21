import { cn } from '@/lib/utils'

/** Wordmark: a plain square mark with an amber edge, no gradient. */
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
        <rect width="24" height="24" rx="4" fill={inverted ? '#F7F6F3' : '#13233F'} />
        <path
          d="M7 7h9v2.4H9.6v2.2H15V14H9.6v2.6H16V19H7z"
          fill={inverted ? '#13233F' : '#F7F6F3'}
        />
        <rect x="18" y="5" width="2" height="14" rx="1" fill="#D9A441" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">EdgeX</span>
    </span>
  )
}

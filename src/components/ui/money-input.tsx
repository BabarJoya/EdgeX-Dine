import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Text input for prices, with a currency prefix. Value is the typed string. */
export function MoneyInput({
  currency,
  className,
  ...props
}: ComponentProps<'input'> & { currency: string }) {
  return (
    <div
      className={cn(
        'flex h-9 items-center rounded-md border border-input bg-card text-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20',
        props['aria-invalid'] && 'border-destructive',
        className,
      )}
    >
      <span className="pl-3 text-xs text-muted-foreground">
        {currency === 'PKR' ? 'Rs' : currency}
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        className="h-full w-full min-w-0 bg-transparent px-2 tabular-nums outline-none"
        {...props}
      />
    </div>
  )
}

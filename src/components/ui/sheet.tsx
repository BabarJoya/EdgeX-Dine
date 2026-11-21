import { Dialog as SheetPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Side drawer (used for the mobile sidebar and detail panels). */
export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger
export const SheetClose = SheetPrimitive.Close
export const SheetTitle = SheetPrimitive.Title

export function SheetContent({
  className,
  side = 'left',
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & { side?: 'left' | 'right' | 'bottom' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <SheetPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed z-50 flex flex-col shadow-lg',
          side === 'bottom'
            ? 'inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full max-w-md rounded-t-xl'
            : cn('inset-y-0 w-72 max-w-[85vw]', side === 'left' ? 'left-0' : 'right-0'),
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

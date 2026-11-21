import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/hooks/use-theme'

export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            '!bg-popover !text-popover-foreground !border-border !rounded-md !shadow-md !font-sans',
          description: '!text-muted-foreground',
        },
      }}
    />
  )
}

import type { Enums } from '@/lib/supabase'

export const tableStatusMeta: Record<
  Enums<'table_status'>,
  { label: string; badge: 'success' | 'info' | 'warning' | 'neutral'; tile: string }
> = {
  available: {
    label: 'Available',
    badge: 'success',
    tile: 'border-success/50 bg-success-soft text-success',
  },
  occupied: { label: 'Occupied', badge: 'info', tile: 'border-info/50 bg-info-soft text-info' },
  reserved: {
    label: 'Reserved',
    badge: 'warning',
    tile: 'border-warning/50 bg-warning-soft text-warning',
  },
  cleaning: {
    label: 'Cleaning',
    badge: 'neutral',
    tile: 'border-border bg-muted text-muted-foreground',
  },
}

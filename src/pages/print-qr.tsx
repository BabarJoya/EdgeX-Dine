import { Printer } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { tableUrl, useFloor } from '@/features/floor/api'
import { QrSvg } from '@/features/floor/qr'
import { useTenant } from '@/features/tenant/tenant-provider'

/**
 * Printable table cards (A4, 2 × 3 per page). Opened in a new tab from the
 * Tables page; uses the browser's print dialog ("Save as PDF" works too).
 */
export function PrintQrPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch')
  const only = params.get('table')
  const { membership, branches } = useTenant()
  const floor = useFloor(branchId)
  const tenant = membership?.tenants
  const branch = branches.find((b) => b.id === branchId)
  const tables = (floor.data?.tables ?? []).filter((t) => t.is_active && (!only || t.id === only))

  if (!tenant || floor.isPending) return <Skeleton className="m-8 h-64" />

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      <style>{`@page { size: A4; margin: 10mm; } @media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div>
          <div className="font-semibold">QR table cards · {branch?.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {tables.length} card{tables.length === 1 ? '' : 's'}. Print on thick paper or card, cut
            along the lines, and place one on each table.
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to="/app/tables">Back</Link>
          </Button>
          <Button onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[190mm] grid-cols-2 gap-0 p-6 print:p-0">
        {tables.map((t) => (
          <div
            key={t.id}
            className="flex h-[90mm] break-inside-avoid flex-col items-center justify-center border border-dashed border-[#c9c5bc] bg-white px-6 text-center text-[#1c1f24]"
          >
            <div className="text-[13px] font-semibold tracking-wide uppercase">{tenant.name}</div>
            <div className="mt-1 text-[28px] leading-none font-semibold">Table {t.label}</div>
            <QrSvg
              value={tableUrl(tenant.slug, t.qr_token)}
              label={`QR code for table ${t.label}`}
              className="my-3 size-[44mm] [&>svg]:size-full"
            />
            <div className="text-[13px] font-medium">Scan to see the menu and order</div>
            <div
              lang="ur"
              dir="rtl"
              className="px-2 py-1 text-[13px]"
              style={{ fontFamily: 'var(--font-urdu)' }}
            >
              مینو دیکھنے اور آرڈر کرنے کے لیے اسکین کریں
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

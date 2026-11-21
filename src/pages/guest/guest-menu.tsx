import { QrCode } from 'lucide-react'
import { useParams } from 'react-router'

/**
 * Guest-facing QR menu. Separate, mobile-first layout with no staff chrome;
 * it must stay light enough to load quickly on a budget phone over 3G.
 */
export function GuestMenuPage() {
  const { slug } = useParams()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <header className="border-b px-5 py-4">
        <div className="text-xs text-muted-foreground">Menu</div>
        <div className="text-lg font-semibold">{slug}</div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <QrCode className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="mt-4 text-base font-semibold">This menu isn't live yet</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          QR ordering is being set up for this restaurant. Please ask your waiter for a menu.
        </p>
      </main>
    </div>
  )
}

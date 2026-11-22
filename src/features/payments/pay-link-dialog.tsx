import { Copy, Link2, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QrSvg } from '@/features/floor/qr'
import { receiptUrl } from '@/features/pos/receipt-url'
import { whatsappLink } from './whatsapp'

/** POS: let the guest pay on their phone (QR, WhatsApp or a copied link). */
export function PayLinkButton({
  token,
  phone,
  restaurant,
  amount,
}: {
  token: string
  phone: string | null
  restaurant: string
  amount: string
}) {
  const [open, setOpen] = useState(false)
  const url = receiptUrl(token)
  return (
    <>
      <Button variant="secondary" size="sm" className="mt-3 ml-2" onClick={() => setOpen(true)}>
        <Link2 /> Send pay link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay by phone</DialogTitle>
            <DialogDescription>
              The guest scans this to see the bill and pay {amount} online.
            </DialogDescription>
          </DialogHeader>
          <QrSvg value={url} label="Payment link QR code" className="mx-auto size-56" />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(url).catch(() => undefined)
                toast.success('Payment link copied')
              }}
            >
              <Copy /> Copy link
            </Button>
            <Button variant="secondary" asChild>
              <a
                href={whatsappLink(
                  phone,
                  `${restaurant}: your bill is ${amount}. Pay here: ${url}`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

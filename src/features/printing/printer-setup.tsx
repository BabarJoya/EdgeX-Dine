import { Printer } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { drawerBytes, testPageBytes } from './documents'
import {
  choosePrinter,
  DEFAULT_SETTINGS,
  print,
  savePrinterSettings,
  supports,
  type PrinterSettings,
  type Transport,
} from './printer'
import { usePrinterSettings } from './use-printer'

/** Printer icon button + setup dialog (per device). */
export function PrinterSetupButton({ kitchen = false }: { kitchen?: boolean }) {
  const [open, setOpen] = useState(false)
  const s = usePrinterSettings()
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Printer setup"
        title={s.transport ? `Printer: ${s.name}` : 'No printer connected'}
      >
        <Printer />
        <span className="hidden sm:inline">{s.transport ? s.name : 'Printer'}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt printer</DialogTitle>
            <DialogDescription>
              Print straight to a thermal printer from this device. Without one, receipts open the
              browser&apos;s print dialog.
            </DialogDescription>
          </DialogHeader>
          <PrinterSetupForm kitchen={kitchen} />
        </DialogContent>
      </Dialog>
    </>
  )
}

export function PrinterSetupForm({ kitchen }: { kitchen: boolean }) {
  const s = usePrinterSettings()
  const [busy, setBusy] = useState(false)
  const update = (patch: Partial<PrinterSettings>) => savePrinterSettings({ ...s, ...patch })
  const canSerial = supports.serial()
  const canUsb = supports.usb()

  const connect = async (transport: Transport) => {
    setBusy(true)
    try {
      const name = await choosePrinter(transport, s.baudRate)
      update({ transport, name })
      toast.success(`${name} connected`)
    } catch (e) {
      if ((e as Error).name !== 'NotFoundError') toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const run = async (bytes: Uint8Array) => {
    try {
      await print(bytes, s)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="grid gap-4">
      {!canSerial && !canUsb && (
        <Alert variant="warning">
          This browser can&apos;t talk to printers directly. Use Chrome or Edge on a computer or
          Android tablet, or keep using the print dialog.
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy || !canUsb} onClick={() => connect('usb')}>
          Connect USB
        </Button>
        <Button variant="secondary" disabled={busy || !canSerial} onClick={() => connect('serial')}>
          Connect serial / Bluetooth
        </Button>
      </div>
      {s.transport && (
        <p className="text-sm" data-testid="printer-status">
          Connected: <span className="font-medium">{s.name}</span> (
          {s.transport === 'usb' ? 'USB' : 'serial'})
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="paper" label="Paper width">
          <NativeSelect
            id="paper"
            value={String(s.columns)}
            onChange={(e) => update({ columns: Number(e.target.value) as 32 | 48 })}
          >
            <option value="48">80 mm</option>
            <option value="32">58 mm</option>
          </NativeSelect>
        </Field>
        {s.transport === 'serial' && (
          <Field id="baud" label="Speed (baud)">
            <NativeSelect
              id="baud"
              value={String(s.baudRate)}
              onChange={(e) => update({ baudRate: Number(e.target.value) })}
            >
              {[9600, 19200, 38400, 115200].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        {kitchen
          ? 'Print new kitchen tickets automatically'
          : 'Open the cash drawer after cash payments'}
        <Switch
          checked={kitchen ? s.autoKitchen : s.drawerOnCash}
          onCheckedChange={(v) => update(kitchen ? { autoKitchen: v } : { drawerOnCash: v })}
          aria-label={kitchen ? 'Auto-print kitchen tickets' : 'Open drawer after cash payments'}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!s.transport} onClick={() => run(testPageBytes(s.columns))}>
          Print test page
        </Button>
        {!kitchen && (
          <Button variant="secondary" disabled={!s.transport} onClick={() => run(drawerBytes())}>
            Open drawer
          </Button>
        )}
        {s.transport && (
          <Button variant="ghost" onClick={() => savePrinterSettings(DEFAULT_SETTINGS)}>
            Forget printer
          </Button>
        )}
      </div>
    </div>
  )
}

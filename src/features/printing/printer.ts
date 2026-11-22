/**
 * Direct printing to a thermal printer from the browser (Chrome / Edge):
 * Web Serial for serial, USB-serial and Bluetooth printers, WebUSB for USB
 * printers that expose a raw printer interface. The choice is remembered per
 * device (this tablet / PC), not per restaurant.
 */

// Minimal typings: Web Serial / WebUSB are not in TypeScript's DOM lib yet.
type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>
  readonly writable: WritableStream<Uint8Array> | null
  getInfo?(): { usbVendorId?: number; usbProductId?: number }
}
type UsbEndpoint = { direction: 'in' | 'out'; type: string; endpointNumber: number }
type UsbAlternate = { interfaceClass: number; endpoints: UsbEndpoint[] }
type UsbInterface = { interfaceNumber: number; alternate: UsbAlternate }
type UsbDeviceLike = {
  productName?: string
  opened: boolean
  configuration: { interfaces: UsbInterface[] } | null
  open(): Promise<void>
  selectConfiguration(n: number): Promise<void>
  claimInterface(n: number): Promise<void>
  transferOut(endpoint: number, data: Uint8Array): Promise<unknown>
}
type Nav = Navigator & {
  serial?: { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> }
  usb?: {
    requestDevice(o: { filters: unknown[] }): Promise<UsbDeviceLike>
    getDevices(): Promise<UsbDeviceLike[]>
  }
}
const nav = () => navigator as Nav

export type Transport = 'serial' | 'usb'

export type PrinterSettings = {
  transport: Transport | null
  name: string
  baudRate: number
  columns: 32 | 48
  /** Print new kitchen tickets automatically on this device's KDS. */
  autoKitchen: boolean
  /** Open the cash drawer after a cash payment. */
  drawerOnCash: boolean
}

const KEY = 'edgex.printer'
export const DEFAULT_SETTINGS: PrinterSettings = {
  transport: null,
  name: '',
  baudRate: 9600,
  columns: 48,
  autoKitchen: false,
  drawerOnCash: false,
}

export function loadPrinterSettings(): PrinterSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function savePrinterSettings(s: PrinterSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode: settings last for this visit only */
  }
  window.dispatchEvent(new Event('edgex-printer'))
}

export const supports = {
  serial: () => typeof navigator !== 'undefined' && 'serial' in navigator,
  usb: () => typeof navigator !== 'undefined' && 'usb' in navigator,
}

type Connection = { write(data: Uint8Array): Promise<void> }
let current: { transport: Transport; conn: Connection } | null = null

async function openSerial(port: SerialPortLike, baudRate: number): Promise<Connection> {
  if (!port.writable) await port.open({ baudRate })
  return {
    async write(data) {
      const writer = port.writable!.getWriter()
      try {
        await writer.write(data)
      } finally {
        writer.releaseLock()
      }
    },
  }
}

async function openUsb(device: UsbDeviceLike): Promise<Connection> {
  if (!device.opened) await device.open()
  if (!device.configuration) await device.selectConfiguration(1)
  const ifaces = device.configuration?.interfaces ?? []
  // Prefer the printer class (7); fall back to any bulk OUT endpoint.
  const pick =
    ifaces.find((i) => i.alternate.interfaceClass === 7) ??
    ifaces.find((i) => i.alternate.endpoints.some((e) => e.direction === 'out'))
  const ep = pick?.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
  if (!pick || !ep) throw new Error('This USB device has no printer interface')
  await device.claimInterface(pick.interfaceNumber)
  return {
    async write(data) {
      // Send in chunks; some printers have small buffers.
      for (let i = 0; i < data.length; i += 4096) {
        await device.transferOut(ep.endpointNumber, data.slice(i, i + 4096))
      }
    },
  }
}

/** Ask the user to pick a printer (must be called from a click). */
export async function choosePrinter(transport: Transport, baudRate: number) {
  if (transport === 'serial') {
    if (!supports.serial())
      throw new Error('This browser cannot use serial printers. Use Chrome or Edge.')
    const port = await nav().serial!.requestPort()
    current = { transport, conn: await openSerial(port, baudRate) }
    const info = port.getInfo?.()
    return info?.usbVendorId
      ? `Serial printer (${info.usbVendorId.toString(16)})`
      : 'Serial printer'
  }
  if (!supports.usb()) throw new Error('This browser cannot use USB printers. Use Chrome or Edge.')
  const device = await nav().usb!.requestDevice({ filters: [] })
  current = { transport, conn: await openUsb(device) }
  return device.productName || 'USB printer'
}

/** Reconnect to the printer picked earlier on this device (no prompt). */
async function connection(s: PrinterSettings): Promise<Connection> {
  if (current && current.transport === s.transport) return current.conn
  if (s.transport === 'serial' && supports.serial()) {
    const [port] = await nav().serial!.getPorts()
    if (port) {
      current = { transport: 'serial', conn: await openSerial(port, s.baudRate) }
      return current.conn
    }
  }
  if (s.transport === 'usb' && supports.usb()) {
    const [device] = await nav().usb!.getDevices()
    if (device) {
      current = { transport: 'usb', conn: await openUsb(device) }
      return current.conn
    }
  }
  throw new Error('Printer not connected. Open printer setup and connect it again.')
}

export const printerConfigured = (s = loadPrinterSettings()) => s.transport !== null

export async function print(data: Uint8Array, s = loadPrinterSettings()) {
  const conn = await connection(s)
  try {
    await conn.write(data)
  } catch (e) {
    current = null // force a reconnect next time
    throw e
  }
}

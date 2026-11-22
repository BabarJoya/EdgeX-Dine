/** What the database hands the server when a payment starts. */
export type StartContext = {
  txnRef: string
  amountMinor: number
  currency: string
  createdAt: Date
  expiresAt: Date
  billNumber: number
  restaurant: string
  customerPhone: string | null
  mode: 'sandbox' | 'live'
  settings: Record<string, string>
  secrets: Record<string, string>
  /** Where the gateway sends the guest (and its result) back to. */
  returnUrl: string
}

/** A stored attempt, looked up by our reference when the gateway calls back. */
export type Attempt = {
  txnRef: string
  amountMinor: number
  mode: 'sandbox' | 'live'
  settings: Record<string, string>
  secrets: Record<string, string>
  returnUrl: string
}

export type GatewayRequest = { action: string; fields: Record<string, string> }

export type GatewayResult = {
  success: boolean
  /** Amount the gateway says was paid (minor units), checked by the database. */
  amountMinor: number | null
  providerRef?: string
  code?: string
  message?: string
}

export type ReturnOutcome =
  | { type: 'result'; result: GatewayResult }
  /** The gateway needs another browser step (e.g. a confirm page). */
  | { type: 'form'; request: GatewayRequest }

export interface Gateway {
  start(ctx: StartContext): GatewayRequest
  /** Our reference from the callback parameters (not yet trusted). */
  reference(params: Record<string, string>): string | null
  /** Verify the callback (signature / server-to-server check). Throws if forged. */
  handleReturn(params: Record<string, string>, attempt: Attempt): Promise<ReturnOutcome>
}

export class SignatureError extends Error {}

/** yyyyMMddHHmmss in Pakistan time (gateways expect local time). */
export function pkTimestamp(d: Date, sep = '') {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}${p.month}${p.day}${sep}${p.hour}${p.minute}${p.second}`
}

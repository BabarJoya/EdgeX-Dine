/**
 * Tax-authority invoices in the "IMS" POS-integration format used by FBR
 * (and by PRA's PRAL system). One request per paid bill; the authority returns
 * a fiscal invoice number that must be printed on the receipt with a QR code.
 *
 * ⚠ Endpoints and field rules below follow the IMS integration guide as
 * commonly documented; verify them with the authority's sandbox and your POS
 * registration before going live (docs/INTEGRATIONS.md).
 */
export const FISCAL_ENDPOINTS: Record<string, Record<'sandbox' | 'live', string>> = {
  fbr: {
    sandbox: 'https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData',
    live: 'https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData',
  },
  pra: {
    sandbox: 'https://ims.pral.com.pk/ims/sandbox/api/Live/PostData',
    live: 'https://ims.pral.com.pk/ims/production/api/Live/PostData',
  },
}

export type FiscalPayload = {
  bill_number: number
  business_date: string
  paid_at: string
  branch_code: string
  subtotal_minor: number
  discount_minor: number
  service_minor: number
  base_minor: number
  tax_minor: number
  paid_total_minor: number
  customer_name: string | null
  customer_phone: string | null
  methods: string[]
  items: { code: string; name: string; quantity: number; total_minor: number }[]
}

const rs = (minor: number) => Math.round(minor) / 100

/** Spread `total` over `weights` in whole paisa, exactly (largest remainder). */
export function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!sum) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i]++
    left--
  }
  return out
}

/** 1 cash, 2 card, 5 mixed (digital wallets / bank are reported as card). */
export function paymentMode(methods: string[]) {
  const kinds = new Set(methods.map((m) => (m === 'cash' ? 1 : 2)))
  return kinds.size > 1 ? 5 : (kinds.values().next().value ?? 1)
}

export function imsInvoice(p: FiscalPayload, settings: Record<string, string>) {
  // Lines: items, plus the service charge as its own line.
  const lines = [
    ...p.items.map((i) => ({
      code: i.code,
      name: i.name,
      quantity: i.quantity,
      total: i.total_minor,
    })),
    ...(p.service_minor > 0
      ? [{ code: 'SERVICE', name: 'Service charge', quantity: 1, total: p.service_minor }]
      : []),
  ]
  const weights = lines.map((l) => l.total)
  // Discount applies to items only; tax is spread over everything sold.
  const discounts = allocate(p.discount_minor, [
    ...p.items.map((i) => i.total_minor),
    ...(p.service_minor > 0 ? [0] : []),
  ])
  const taxes = allocate(
    p.tax_minor,
    weights.map((w, i) => w - discounts[i]),
  )
  const rate = p.base_minor > 0 ? Math.round((p.tax_minor / p.base_minor) * 10000) / 100 : 0
  const usin = `${p.branch_code || 'POS'}-${p.business_date.replace(/-/g, '')}-${p.bill_number}`
  return {
    InvoiceNumber: '',
    POSID: Number(settings.pos_id) || 0,
    USIN: usin,
    DateTime: p.paid_at,
    BuyerNTN: '',
    BuyerCNIC: '',
    BuyerName: p.customer_name ?? '',
    BuyerPhoneNumber: p.customer_phone ?? '',
    TotalBillAmount: rs(p.paid_total_minor),
    TotalQuantity: lines.reduce((n, l) => n + l.quantity, 0),
    TotalSaleValue: rs(p.base_minor),
    TotalTaxCharged: rs(p.tax_minor),
    Discount: rs(p.discount_minor),
    FurtherTax: 0,
    PaymentMode: paymentMode(p.methods),
    RefUSIN: null,
    InvoiceType: 1,
    Items: lines.map((l, i) => ({
      ItemCode: l.code,
      ItemName: l.name.slice(0, 100),
      Quantity: l.quantity,
      PCTCode: settings.pct_code || '',
      TaxRate: rate,
      SaleValue: rs(l.total - discounts[i]),
      TotalAmount: rs(l.total - discounts[i] + taxes[i]),
      TaxCharged: rs(taxes[i]),
      Discount: rs(discounts[i]),
      FurtherTax: 0,
      InvoiceType: 1,
      RefUSIN: null,
    })),
  }
}

export async function postInvoice(
  authority: string,
  mode: 'sandbox' | 'live',
  token: string,
  invoice: ReturnType<typeof imsInvoice>,
  endpoint?: string,
) {
  const url = process.env.FISCAL_API_BASE
    ? `${process.env.FISCAL_API_BASE.replace(/\/$/, '')}/${authority}`
    : endpoint || FISCAL_ENDPOINTS[authority]?.[mode]
  if (!url) return { ok: false, final: true, error: `Unknown tax authority: ${authority}` }
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(invoice),
  })
  const body = (await r.json().catch(() => ({}))) as {
    InvoiceNumber?: string
    Code?: string | number
    Response?: string
    Errors?: unknown
  }
  if (r.ok && String(body.Code) === '100' && body.InvoiceNumber) {
    return { ok: true, id: body.InvoiceNumber }
  }
  const error = [
    body.Response,
    body.Errors ? JSON.stringify(body.Errors) : null,
    r.ok ? null : `HTTP ${r.status}`,
  ]
    .filter(Boolean)
    .join(' · ')
  // Validation errors won't fix themselves; outages and auth hiccups retry.
  return { ok: false, final: r.ok, error: error || 'Invoice was not accepted' }
}

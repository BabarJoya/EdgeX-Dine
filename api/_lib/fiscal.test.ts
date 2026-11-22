// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { allocate, imsInvoice, paymentMode, type FiscalPayload } from './fiscal.js'
import { templateBody, type Message } from './whatsapp.js'

describe('allocate', () => {
  it('splits exactly, largest remainders first', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(0, [5, 5])).toEqual([0, 0])
    expect(allocate(7, [0, 0])).toEqual([0, 0])
    const parts = allocate(35213, [190000, 20000, 12345])
    expect(parts.reduce((a, b) => a + b)).toBe(35213)
  })
})

describe('paymentMode', () => {
  it('maps methods to IMS payment modes', () => {
    expect(paymentMode(['cash'])).toBe(1)
    expect(paymentMode(['card'])).toBe(2)
    expect(paymentMode(['wallet'])).toBe(2)
    expect(paymentMode(['cash', 'card'])).toBe(5)
  })
})

describe('imsInvoice', () => {
  // 2 × Tikka 1,900 + Lassi 300 = 2,200; 10% discount (220); service 10% of
  // 1,980 = 198 → base 2,178; tax 16% cash = 348.48 → 34,848 paisa.
  const p: FiscalPayload = {
    bill_number: 42,
    business_date: '2026-11-22',
    paid_at: '2026-11-22 21:05:00',
    branch_code: 'CLIFTO',
    subtotal_minor: 220000,
    discount_minor: 22000,
    service_minor: 19800,
    base_minor: 217800,
    tax_minor: 34848,
    paid_total_minor: 252648,
    customer_name: 'Hamza',
    customer_phone: '03001234567',
    methods: ['cash'],
    items: [
      { code: 'a1b2c3d4', name: 'Chicken Tikka', quantity: 2, total_minor: 190000 },
      { code: 'e5f6a7b8', name: 'Lassi', quantity: 1, total_minor: 30000 },
    ],
  }
  const inv = imsInvoice(p, { pos_id: '123456', pct_code: '98173000' })
  const sum = (k: 'SaleValue' | 'TaxCharged' | 'Discount' | 'TotalAmount') =>
    Math.round(inv.Items.reduce((n, i) => n + i[k] * 100, 0))

  it('fills the header', () => {
    expect(inv).toMatchObject({
      POSID: 123456,
      USIN: 'CLIFTO-20261122-42',
      DateTime: '2026-11-22 21:05:00',
      TotalBillAmount: 2526.48,
      TotalSaleValue: 2178,
      TotalTaxCharged: 348.48,
      Discount: 220,
      PaymentMode: 1,
      InvoiceType: 1,
      TotalQuantity: 4,
      BuyerName: 'Hamza',
    })
  })
  it('lists the service charge as a line and keeps line totals consistent', () => {
    expect(inv.Items.map((i) => i.ItemName)).toEqual(['Chicken Tikka', 'Lassi', 'Service charge'])
    expect(inv.Items[2].Discount).toBe(0)
    expect(sum('SaleValue')).toBe(217800)
    expect(sum('TaxCharged')).toBe(34848)
    expect(sum('Discount')).toBe(22000)
    expect(sum('TotalAmount')).toBe(252648)
    expect(inv.Items.every((i) => i.PCTCode === '98173000' && i.TaxRate === 16)).toBe(true)
  })
})

describe('WhatsApp template body', () => {
  const m: Message = {
    id: '1',
    channel: 'whatsapp',
    mode: 'live',
    kind: 'receipt',
    to: '923001234567',
    params: {
      restaurant: 'Karachi Grill',
      bill_number: 7,
      total_minor: 255200,
      currency: 'PKR',
      receipt_token: 'abc',
    },
    settings: { language: 'ur' },
    secrets: {},
    enabled: true,
  }
  it('fills the receipt template in order', () => {
    expect(templateBody(m, 'https://app.pk')).toEqual({
      messaging_product: 'whatsapp',
      to: '923001234567',
      type: 'template',
      template: {
        name: 'edgex_receipt',
        language: { code: 'ur' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Karachi Grill' },
              { type: 'text', text: '7' },
              { type: 'text', text: 'Rs 2,552' },
              { type: 'text', text: 'https://app.pk/r/abc' },
            ],
          },
        ],
      },
    })
  })
})

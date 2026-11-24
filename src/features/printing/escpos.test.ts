import { describe, expect, it } from 'vitest'
import type { ReceiptData } from '@/features/pos/receipt-types'
import { receiptBytes } from './documents'
import { EscPos, wrap } from './escpos'

const ascii = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('EscPos', () => {
  it('starts with init and ends with a cut', () => {
    const b = new EscPos(32).line('Hi').cut().encode()
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40])
    expect([...b.slice(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00])
  })

  it('sends ASCII only, mapping common symbols', () => {
    expect(ascii(new EscPos().text('2 × Tikka — café · “x”').encode()).slice(2)).toBe(
      '2 x Tikka - cafe - "x"',
    )
    expect(ascii(new EscPos().text('چکن').encode()).slice(2)).toBe('???')
    expect(ascii(new EscPos().text('Rs 2,000').encode()).slice(2)).toBe('Rs 2,000')
  })

  it('lays out two columns to the paper width', () => {
    const out = ascii(new EscPos(32).row('Chicken Tikka', 'Rs 950').encode()).slice(2)
    expect(out).toBe('Chicken Tikka'.padEnd(25) + ' Rs 950\n')
    expect(out.length - 1).toBe(32)
    const wrapped = ascii(
      new EscPos(32).row('A very long dish name that wraps over', 'Rs 1').encode(),
    )
      .slice(2)
      .split('\n')
    expect(wrapped[0]).toBe('A very long dish name that')
    expect(wrapped[1]).toBe('wraps over'.padEnd(27) + ' Rs 1')
  })

  it('encodes a QR code with the right length bytes', () => {
    const b = [...new EscPos().qr('https://x.pk/r/abc').encode()]
    const store = b.findIndex((v, i) => v === 0x1d && b[i + 6] === 0x50)
    expect(b[store + 3] + (b[store + 4] << 8)).toBe('https://x.pk/r/abc'.length + 3)
  })

  it('pulses the cash drawer', () => {
    expect([...new EscPos().drawer().encode().slice(2)]).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa])
  })
})

describe('wrap', () => {
  it('breaks words and very long words', () => {
    expect(wrap('aa bb cc', 5)).toEqual(['aa bb', 'cc'])
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  })
})

describe('receiptBytes', () => {
  const r: ReceiptData = {
    restaurant: 'Karachi Grill',
    branch: 'Clifton',
    address: null,
    phone: null,
    tax_label: 'GST',
    tax_registration: 'NTN 123',
    footer: null,
    bill_number: 7,
    fiscal_authority: null,
    fiscal_invoice_number: null,
    fiscal_status: null,
    date: '2026-11-22T15:00:00Z',
    paid_at: '2026-11-22T15:30:00Z',
    type: 'dine_in',
    status: 'paid',
    table: 'T4',
    currency: 'PKR',
    customer_name: null,
    subtotal_minor: 220000,
    discount_minor: 0,
    discount_note: '',
    service_bps: 0,
    service_minor: 0,
    delivery_fee_minor: 0,
    delivery_address: null,
    base_minor: 220000,
    tax_minor: 35200,
    paid_total_minor: 255200,
    items: [
      {
        name: 'Tikka',
        variant: null,
        quantity: 2,
        line_total_minor: 200000,
        modifiers: ['Extra raita'],
      },
    ],
    payments: [
      {
        method: 'cash',
        provider: null,
        amount_minor: 255200,
        tax_minor: 35200,
        tax_bps: 1600,
        tendered_minor: 300000,
        change_minor: 44800,
        status: 'completed',
      },
    ],
  }
  it('prints the totals, tax by rate, change and a QR link', () => {
    const out = ascii(receiptBytes(r, { columns: 48, link: 'https://x.pk/r/t' }))
    expect(out).toContain('Bill #7')
    expect(out).toContain('Dine-in - Table T4')
    expect(out).toContain('2 x Tikka')
    expect(out).toContain('  + Extra raita')
    expect(out).toMatch(/GST 16% +Rs 352/)
    expect(out).toMatch(/TOTAL +Rs 2,552/)
    expect(out).toMatch(/Change +Rs 448/)
    expect(out).toContain('https://x.pk/r/t')
    expect(out).not.toContain('NOT PAID')
  })
  it('can open the cash drawer after printing', () => {
    const b = [...receiptBytes(r, { columns: 32, drawer: true })]
    expect(b.slice(-5)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa])
  })
})

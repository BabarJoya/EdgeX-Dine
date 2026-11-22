import { describe, expect, it } from 'vitest'
import type { SalesReport } from './api'
import { reportSheets } from './export'

const report = {
  range: {
    from: '2026-11-15',
    to: '2026-11-21',
    days: 7,
    prev_from: '2026-11-08',
    prev_to: '2026-11-14',
  },
  currency: 'PKR',
  totals: {
    net_sales_minor: 340000,
    tax_minor: 52200,
    collected_minor: 392200,
    bills: 3,
    orders: 3,
    cancelled_orders: 1,
    avg_bill_minor: 113333,
    discounts_minor: 0,
    refunds_minor: 0,
    prev_net_sales_minor: 0,
    prev_bills: 0,
    prev_orders: 0,
    prev_avg_bill_minor: 0,
  },
  daily: [{ date: '2026-11-21', net_sales_minor: 340000, orders: 3 }],
  hourly: [{ hour: 9, orders: 3 }],
  top_items: [{ name: 'Tikka', quantity: 3, revenue_minor: 300000 }],
  categories: [],
  payment_methods: [{ method: 'bank_transfer', payments: 1, amount_minor: 10000, tax_minor: 0 }],
  sources: [],
  branches: [],
  staff: [],
  kitchen: [],
  requests: { count: 0, avg_response_seconds: null },
} satisfies SalesReport

describe('reportSheets', () => {
  it('converts minor units to rupees for spreadsheets', () => {
    const summary = reportSheets(report)[0]
    expect(summary.rows[0]).toEqual(['Net sales (before tax)', 3400, 0])
    expect(summary.rows[4]).toEqual(['Average bill', 1133.33, 0])
  })
  it('uses readable names', () => {
    const payments = reportSheets(report).find((s) => s.name === 'Payments')!
    expect(payments.rows[0][0]).toBe('Bank / Raast')
    expect(reportSheets(report).find((s) => s.name === 'By hour')!.rows[0][0]).toBe('09:00')
  })
})

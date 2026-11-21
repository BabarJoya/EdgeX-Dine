import { describe, expect, it } from 'vitest'
import { cashSuggestions, equalShares, itemsShare, taxFor, withTax } from './split'

describe('tax', () => {
  it('matches the database rounding', () => {
    expect(taxFor(110000, 1600)).toBe(17600)
    expect(taxFor(22000, 1600)).toBe(3520)
    expect(taxFor(333, 500)).toBe(17) // 16.65 → 17
    expect(withTax(110000, 500)).toBe(115500)
  })
})

describe('equalShares', () => {
  it('adds up exactly, extra paisa go to the first shares', () => {
    const parts = equalShares(100001, 3)
    expect(parts).toEqual([33334, 33334, 33333])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100001)
  })
  it('handles one person', () => {
    expect(equalShares(5000, 1)).toEqual([5000])
  })
})

describe('itemsShare', () => {
  const bill = { subtotal_minor: 220000, base_minor: 220000 } // after discount + service
  it('splits discount and service proportionally', () => {
    expect(itemsShare(110000, bill, 220000)).toBe(110000)
    expect(itemsShare(20000, { subtotal_minor: 220000, base_minor: 242000 }, 242000)).toBe(22000)
  })
  it('never exceeds what is left', () => {
    expect(itemsShare(220000, bill, 5000)).toBe(5000)
  })
})

describe('cashSuggestions', () => {
  it('offers exact and round notes', () => {
    expect(cashSuggestions(127600)).toEqual([127600, 130000, 150000, 200000])
  })
})

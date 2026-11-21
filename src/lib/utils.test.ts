import { describe, expect, it } from 'vitest'
import { cn, formatMoney } from './utils'

describe('cn', () => {
  it('merges conflicting tailwind classes, last wins', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })
})

describe('formatMoney', () => {
  it('formats PKR from paisa without decimals', () => {
    expect(formatMoney(125000)).toMatch(/1,250/)
  })
  it('formats USD from cents with two decimals', () => {
    expect(formatMoney(1999, 'USD', 'en-US')).toBe('$19.99')
  })
})

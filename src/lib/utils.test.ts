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

import { ageLabel } from './time'
describe('ageLabel', () => {
  const now = Date.parse('2026-11-21T12:00:00Z')
  it('reads naturally', () => {
    expect(ageLabel('2026-11-21T11:59:40Z', now)).toBe('just now')
    expect(ageLabel('2026-11-21T11:55:00Z', now)).toBe('5 min ago')
    expect(ageLabel('2026-11-21T10:30:00Z', now)).toBe('1 h 30 min ago')
  })
})

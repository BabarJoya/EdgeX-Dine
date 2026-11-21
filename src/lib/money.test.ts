import { describe, expect, it } from 'vitest'
import { toMajorInput, toMinor } from './money'

describe('toMinor', () => {
  it('parses whole and decimal amounts', () => {
    expect(toMinor('450')).toBe(45000)
    expect(toMinor('1,250')).toBe(125000)
    expect(toMinor('12.5')).toBe(1250)
    expect(toMinor('0.07')).toBe(7)
    expect(toMinor('Rs 850')).toBe(85000)
  })
  it('avoids floating point drift', () => {
    expect(toMinor('19.99')).toBe(1999)
    expect(toMinor('1.10')).toBe(110)
  })
  it('rejects invalid input', () => {
    expect(toMinor('')).toBeNull()
    expect(toMinor('-5')).toBeNull()
    expect(toMinor('12.345')).toBeNull()
    expect(toMinor('abc')).toBeNull()
  })
})

describe('toMajorInput', () => {
  it('round-trips', () => {
    for (const v of ['450', '1250.50', '0.07', '19.99']) expect(toMajorInput(toMinor(v))).toBe(v)
  })
  it('handles empty', () => {
    expect(toMajorInput(null)).toBe('')
  })
})

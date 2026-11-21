import { describe, expect, it } from 'vitest'
import { readableOn } from './color'

describe('readableOn', () => {
  it('uses white on dark brand colours', () => {
    expect(readableOn('#13233F')).toBe('#ffffff')
    expect(readableOn('#B42318')).toBe('#ffffff')
  })
  it('uses charcoal on light brand colours', () => {
    expect(readableOn('#F5C542')).toBe('#1c1f24')
    expect(readableOn('#ffffff')).toBe('#1c1f24')
  })
})

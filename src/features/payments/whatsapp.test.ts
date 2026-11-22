import { describe, expect, it } from 'vitest'
import { waNumber, whatsappLink } from './whatsapp'

describe('waNumber', () => {
  it('converts Pakistani formats', () => {
    expect(waNumber('0300-1234567')).toBe('923001234567')
    expect(waNumber('+92 300 1234567')).toBe('923001234567')
    expect(waNumber('00923001234567')).toBe('923001234567')
    expect(waNumber('3001234567')).toBe('923001234567')
    expect(waNumber(null)).toBe('')
  })
  it('builds a click-to-chat link', () => {
    expect(whatsappLink('0300 1234567', 'Hi & bye')).toBe(
      'https://wa.me/923001234567?text=Hi%20%26%20bye',
    )
  })
})

import { describe, expect, it } from 'vitest'
import { SLUG_PATTERN, slugify } from './slug'

describe('slugify', () => {
  it('builds a URL-safe slug', () => {
    expect(slugify('Karachi Grill & BBQ')).toBe('karachi-grill-bbq')
    expect(slugify('  Café Déjà Vu ')).toBe('cafe-deja-vu')
  })
  it('produces slugs the database accepts', () => {
    expect(SLUG_PATTERN.test(slugify('Lahore Bites'))).toBe(true)
    expect(SLUG_PATTERN.test('a')).toBe(false)
    expect(SLUG_PATTERN.test('-bad-')).toBe(false)
  })
})

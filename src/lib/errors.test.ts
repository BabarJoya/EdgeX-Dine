import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('hides raw RLS errors behind a friendly message', () => {
    expect(
      errorMessage({
        code: '42501',
        message: 'new row violates row-level security policy for table "branches"',
      }),
    ).toBe("You don't have permission to do that.")
  })
  it('passes through messages raised by our own database functions', () => {
    expect(
      errorMessage({
        code: 'P0001',
        message: 'Your plan allows 2 branch(es). Upgrade to add more.',
      }),
    ).toBe('Your plan allows 2 branch(es). Upgrade to add more.')
  })
  it('handles empty errors', () => {
    expect(errorMessage(null)).toBe('Something went wrong.')
  })
})

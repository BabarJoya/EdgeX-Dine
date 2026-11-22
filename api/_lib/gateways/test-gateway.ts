import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'
import { SignatureError, type Gateway } from './types.js'

/**
 * A stand-in gateway for development and automated tests: a page with
 * Approve / Decline buttons. Only available when ENABLE_TEST_GATEWAY=1.
 */
export const sign = (...parts: string[]) =>
  createHmac('sha256', env.testGatewaySecret()).update(parts.join('|')).digest('hex')

export const testGateway: Gateway = {
  start(ctx) {
    const amount = String(ctx.amountMinor)
    return {
      action: new URL('/api/pay/test-gateway', ctx.returnUrl).toString(),
      fields: {
        ref: ctx.txnRef,
        amount,
        return_url: ctx.returnUrl,
        sig: sign(ctx.txnRef, amount, ctx.returnUrl),
      },
    }
  },
  reference: (p) => p.ref || null,
  async handleReturn(p) {
    const expected = sign(p.ref ?? '', p.amount ?? '', p.result ?? '')
    const got = p.sig ?? ''
    if (
      got.length !== expected.length ||
      !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
    ) {
      throw new SignatureError('Test gateway signature does not match')
    }
    return {
      type: 'result',
      result: {
        success: p.result === 'approved',
        amountMinor: Number(p.amount),
        providerRef: `TEST-${p.ref}`,
        code: p.result === 'approved' ? '000' : '999',
        message: p.result === 'approved' ? 'Approved (test)' : 'Declined (test)',
      },
    }
  },
}

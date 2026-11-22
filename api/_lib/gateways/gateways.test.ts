// @vitest-environment node
import { createDecipheriv } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { easypaisaGateway, easypaisaHash } from './easypaisa.js'
import { jazzcash, jazzcashHash } from './jazzcash.js'
import { pkTimestamp, SignatureError, type Attempt, type StartContext } from './types.js'

const ctx = (over: Partial<StartContext> = {}): StartContext => ({
  txnRef: 'EX261122224500ABC123',
  amountMinor: 210000,
  currency: 'PKR',
  createdAt: new Date(Date.UTC(2026, 10, 22, 17, 45, 0)),
  expiresAt: new Date(Date.UTC(2026, 10, 22, 18, 15, 0)),
  billNumber: 12,
  restaurant: 'Karachi Grill',
  customerPhone: '+92 300 1234567',
  mode: 'sandbox',
  settings: { merchant_id: 'MC100', store_id: '4321', account_number: '9876' },
  secrets: {
    password: 'pw',
    integrity_salt: 'salt123',
    hash_key: '0123456789abcdef',
    username: 'u',
    password2: '',
  },
  returnUrl: 'https://app.edgex.pk/api/pay/return/x',
  ...over,
})
const attempt = (c = ctx()): Attempt => ({
  txnRef: c.txnRef,
  amountMinor: c.amountMinor,
  mode: c.mode,
  settings: c.settings,
  secrets: c.secrets,
  returnUrl: c.returnUrl,
})

describe('pkTimestamp', () => {
  it('formats in Pakistan time', () => {
    expect(pkTimestamp(new Date(Date.UTC(2026, 10, 22, 17, 45, 0)))).toBe('20261122224500')
    expect(pkTimestamp(new Date(Date.UTC(2026, 10, 22, 17, 45, 0)), ' ')).toBe('20261122 224500')
  })
})

describe('JazzCash', () => {
  it('signs non-empty pp fields sorted by name, salt first', () => {
    // Same algorithm written out by hand.
    expect(jazzcashHash({ pp_B: '2', pp_A: '1', pp_C: '', other: 'x' }, 'k')).toBe(
      jazzcashHash({ pp_A: '1', pp_B: '2' }, 'k'),
    )
    expect(jazzcashHash({ pp_A: '1' }, 'k')).toMatch(/^[0-9A-F]{64}$/)
  })

  it('builds the hosted checkout request', () => {
    const r = jazzcash.start(ctx())
    expect(r.action).toContain('sandbox.jazzcash.com.pk')
    expect(r.fields).toMatchObject({
      pp_Amount: '210000',
      pp_TxnRefNo: 'EX261122224500ABC123',
      pp_TxnDateTime: '20261122224500',
      pp_TxnExpiryDateTime: '20261122231500',
      pp_MerchantID: 'MC100',
      pp_BillReference: 'bill12',
    })
    expect(r.fields.pp_SecureHash).toBe(jazzcashHash(r.fields, 'salt123'))
    expect(jazzcash.start(ctx({ mode: 'live' })).action).toContain('payments.jazzcash.com.pk')
  })

  const response = (over: Record<string, string> = {}) => {
    const f: Record<string, string> = {
      pp_TxnRefNo: 'EX261122224500ABC123',
      pp_Amount: '210000',
      pp_ResponseCode: '000',
      pp_ResponseMessage: 'Thank you for Using JazzCash, your transaction was successful.',
      pp_RetreivalReferenceNo: '261122123456',
      ...over,
    }
    f.pp_SecureHash = jazzcashHash(f, 'salt123')
    return f
  }

  it('accepts a correctly signed success', async () => {
    const out = await jazzcash.handleReturn(response(), attempt())
    expect(out).toEqual({
      type: 'result',
      result: expect.objectContaining({
        success: true,
        amountMinor: 210000,
        providerRef: '261122123456',
      }),
    })
  })

  it('reports a signed failure as unpaid', async () => {
    const out = await jazzcash.handleReturn(response({ pp_ResponseCode: '124' }), attempt())
    expect(out.type === 'result' && out.result.success).toBe(false)
  })

  it('rejects tampered callbacks', async () => {
    const forged = { ...response(), pp_ResponseCode: '000', pp_Amount: '100' }
    await expect(jazzcash.handleReturn(forged, attempt())).rejects.toBeInstanceOf(SignatureError)
    await expect(
      jazzcash.handleReturn({ ...response(), pp_SecureHash: '' }, attempt()),
    ).rejects.toBeInstanceOf(SignatureError)
  })
})

describe('Easypaisa', () => {
  it('encrypts the sorted request string with the hash key', () => {
    const fields = { storeId: '4321', amount: '2100.0', orderRefNum: 'R1', emailAddr: '' }
    const enc = easypaisaHash(fields, '0123456789abcdef')
    const d = createDecipheriv('aes-128-ecb', Buffer.from('0123456789abcdef'), null)
    const plain = Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString()
    expect(plain).toBe('amount=2100.0&orderRefNum=R1&storeId=4321')
  })

  it('builds the checkout request in rupees with a local phone number', () => {
    const r = easypaisaGateway().start(ctx())
    expect(r.action).toBe('https://easypaystg.easypaisa.com.pk/easypay/Index.jsf')
    expect(r.fields).toMatchObject({
      amount: '2100.0',
      storeId: '4321',
      mobileNum: '03001234567',
      expiryDate: '20261122 231500',
    })
  })

  it('passes the auth token on to the confirm page', async () => {
    const out = await easypaisaGateway().handleReturn({ auth_token: 'tok' }, attempt())
    expect(out).toEqual({
      type: 'form',
      request: {
        action: 'https://easypaystg.easypaisa.com.pk/easypay/Confirm.jsf',
        fields: { auth_token: 'tok', postBackURL: 'https://app.edgex.pk/api/pay/return/x' },
      },
    })
  })

  it('trusts the inquiry API, not the redirect', async () => {
    const calls: unknown[] = []
    const gw = easypaisaGateway(async (host, body, creds) => {
      calls.push([host, body, creds])
      return { transactionStatus: 'FAILED', transactionAmount: '2100.0' }
    })
    const out = await gw.handleReturn(
      { status: '0000', orderRefNumber: 'EX261122224500ABC123' },
      attempt(),
    )
    expect(out.type === 'result' && out.result.success).toBe(false)
    expect(calls[0]).toEqual([
      'https://easypaystg.easypaisa.com.pk',
      { orderId: 'EX261122224500ABC123', storeId: '4321', accountNum: '9876' },
      Buffer.from('u:pw').toString('base64'),
    ])
    const paid = easypaisaGateway(async () => ({
      transactionStatus: 'PAID',
      transactionAmount: 2100,
      transactionId: 'T9',
    }))
    const ok = await paid.handleReturn({}, attempt())
    expect(ok).toEqual({
      type: 'result',
      result: expect.objectContaining({ success: true, amountMinor: 210000, providerRef: 'T9' }),
    })
  })
})

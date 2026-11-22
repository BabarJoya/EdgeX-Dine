import { createHmac, timingSafeEqual } from 'node:crypto'
import { pkTimestamp, SignatureError, type Gateway } from './types.js'

/**
 * JazzCash Hosted Checkout ("Page Redirection", API v1.1).
 *
 * Written from JazzCash's merchant integration guide as commonly documented:
 * HMAC-SHA256 keyed with the integrity salt over
 * `salt&value1&value2…` (non-empty pp* fields, sorted by field name),
 * upper-case hex. Response code "000" means success.
 * ⚠ Verify against the JazzCash sandbox with your merchant credentials before
 * going live (see docs/INTEGRATIONS.md).
 */
export const JAZZCASH_URLS = {
  sandbox: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
  live: 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
}

export function jazzcashHash(fields: Record<string, string>, salt: string) {
  const keys = Object.keys(fields)
    .filter((k) => k.startsWith('pp') && k !== 'pp_SecureHash' && fields[k] !== '')
    .sort()
  const message = [salt, ...keys.map((k) => fields[k])].join('&')
  return createHmac('sha256', salt).update(message, 'utf8').digest('hex').toUpperCase()
}

const clean = (s: string, max: number) => s.replace(/[^A-Za-z0-9 .,#-]/g, '').slice(0, max)

export const jazzcash: Gateway = {
  start(ctx) {
    const fields: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: ctx.settings.txn_type ?? '',
      pp_Language: 'EN',
      pp_MerchantID: ctx.settings.merchant_id ?? '',
      pp_SubMerchantID: '',
      pp_Password: ctx.secrets.password ?? '',
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: ctx.txnRef,
      pp_Amount: String(ctx.amountMinor), // paisa
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: pkTimestamp(ctx.createdAt),
      pp_BillReference: `bill${ctx.billNumber}`,
      pp_Description: clean(`${ctx.restaurant} bill ${ctx.billNumber}`, 100) || 'Restaurant bill',
      pp_TxnExpiryDateTime: pkTimestamp(ctx.expiresAt),
      pp_ReturnURL: ctx.returnUrl,
      ppmpf_1: '',
      ppmpf_2: '',
      ppmpf_3: '',
      ppmpf_4: '',
      ppmpf_5: '',
    }
    fields.pp_SecureHash = jazzcashHash(fields, ctx.secrets.integrity_salt ?? '')
    return { action: JAZZCASH_URLS[ctx.mode], fields }
  },

  reference: (p) => p.pp_TxnRefNo || null,

  async handleReturn(p, attempt) {
    const expected = jazzcashHash(p, attempt.secrets.integrity_salt ?? '')
    const got = (p.pp_SecureHash ?? '').toUpperCase()
    if (
      got.length !== expected.length ||
      !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
    ) {
      throw new SignatureError('JazzCash signature does not match')
    }
    return {
      type: 'result',
      result: {
        success: p.pp_ResponseCode === '000',
        amountMinor: p.pp_Amount ? Number(p.pp_Amount) : null,
        providerRef: p.pp_RetreivalReferenceNo || p.pp_RetrievalReferenceNo || p.pp_TxnRefNo,
        code: p.pp_ResponseCode,
        message: p.pp_ResponseMessage,
      },
    }
  },
}

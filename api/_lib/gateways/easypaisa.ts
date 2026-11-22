import { createCipheriv } from 'node:crypto'
import { pkTimestamp, type Gateway } from './types.js'

/**
 * Easypaisa (Easypay) hosted checkout.
 *
 * Flow: POST to Index.jsf → Easypaisa returns the guest to us with an
 * auth_token → we POST it to Confirm.jsf → the guest pays → Easypaisa returns
 * the guest with status/orderRefNumber. That last redirect is NOT signed, so
 * the result is confirmed server-to-server with the transaction inquiry API
 * before anything is recorded.
 * ⚠ Written from Easypaisa's merchant guide as commonly documented; verify the
 * URLs, hash format and inquiry API in the Easypaisa sandbox before going live
 * (see docs/INTEGRATIONS.md).
 */
const HOSTS = {
  sandbox: 'https://easypaystg.easypaisa.com.pk',
  live: 'https://easypay.easypaisa.com.pk',
}

/** AES-128-ECB (PKCS#5) of the sorted request string, base64. */
export function easypaisaHash(fields: Record<string, string>, hashKey: string) {
  const message = Object.keys(fields)
    .filter((k) => fields[k] !== '')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&')
  const cipher = createCipheriv('aes-128-ecb', Buffer.from(hashKey, 'utf8'), null)
  return Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]).toString('base64')
}

const rupees = (minor: number) => (minor / 100).toFixed(1)

export type Inquiry = (
  host: string,
  body: Record<string, string>,
  credentials: string,
) => Promise<{
  transactionStatus?: string
  transactionAmount?: number | string
  transactionId?: string
  responseCode?: string
  responseDesc?: string
}>

export const inquireEasypaisa: Inquiry = async (host, body, credentials) => {
  const r = await fetch(`${host}/easypay-service/rest/v4/inquire-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Credentials: credentials },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Easypaisa inquiry failed (${r.status})`)
  return r.json()
}

export function easypaisaGateway(inquire: Inquiry = inquireEasypaisa): Gateway {
  return {
    start(ctx) {
      const fields: Record<string, string> = {
        amount: rupees(ctx.amountMinor),
        autoRedirect: '1',
        emailAddr: '',
        expiryDate: pkTimestamp(ctx.expiresAt, ' '),
        mobileNum: (ctx.customerPhone ?? '').replace(/\D/g, '').replace(/^92/, '0').slice(0, 11),
        orderRefNum: ctx.txnRef,
        paymentMethod: ctx.settings.payment_method ?? '',
        postBackURL: ctx.returnUrl,
        storeId: ctx.settings.store_id ?? '',
      }
      fields.merchantHashedReq = easypaisaHash(fields, ctx.secrets.hash_key ?? '')
      return { action: `${HOSTS[ctx.mode]}/easypay/Index.jsf`, fields }
    },

    reference: (p) => p.orderRefNumber || p.orderRefNum || p.ref || null,

    async handleReturn(p, attempt) {
      const host = HOSTS[attempt.mode]
      if (p.auth_token) {
        // Step 2: hand the token back to Easypaisa's confirm page.
        return {
          type: 'form',
          request: {
            action: `${host}/easypay/Confirm.jsf`,
            fields: { auth_token: p.auth_token, postBackURL: attempt.returnUrl },
          },
        }
      }
      // Final step: never trust the redirect, ask Easypaisa.
      const credentials = Buffer.from(
        `${attempt.secrets.username ?? ''}:${attempt.secrets.password ?? ''}`,
      ).toString('base64')
      const r = await inquire(
        host,
        {
          orderId: attempt.txnRef,
          storeId: attempt.settings.store_id ?? '',
          accountNum: attempt.settings.account_number ?? '',
        },
        credentials,
      )
      const paid = r.transactionStatus === 'PAID'
      return {
        type: 'result',
        result: {
          success: paid,
          amountMinor:
            r.transactionAmount != null ? Math.round(Number(r.transactionAmount) * 100) : null,
          providerRef: r.transactionId,
          code: r.responseCode ?? p.status,
          message: r.responseDesc ?? p.desc,
        },
      }
    },
  }
}

export const easypaisa = easypaisaGateway()

export const providerName: Record<string, string> = {
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  raast: 'Raast',
  test_gateway: 'Test gateway',
}

/** The built-in test gateway is offered only in dev/test builds. */
export const testGatewayEnabled = import.meta.env.VITE_TEST_GATEWAY === '1'

/** Ask the server to start a gateway payment, then hand the guest to the gateway. */
export async function startOnlinePayment(receiptToken: string, provider: string) {
  const r = await fetch('/api/pay/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipt_token: receiptToken, provider }),
  })
  const body = (await r.json().catch(() => ({}))) as {
    action?: string
    fields?: Record<string, string>
    error?: string
  }
  if (!r.ok || !body.action || !body.fields) {
    throw new Error(body.error ?? 'Could not start the payment. Please try again.')
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = body.action
  for (const [name, value] of Object.entries(body.fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

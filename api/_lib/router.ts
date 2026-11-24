import { health } from './health.js'
import { paymentReturn, startPayment, testGatewayPage } from './payments.js'
import { flushMessages, testFiscal, testWhatsApp } from './whatsapp.js'

/** Routes for local dev/preview; on Vercel each file in /api is a function. */
export async function route(req: Request): Promise<Response | null> {
  const path = new URL(req.url).pathname
  if (path === '/api/health') return health()
  if (path === '/api/pay/start') return startPayment(req)
  if (path === '/api/pay/test-gateway') return testGatewayPage(req)
  if (path === '/api/notify/flush') return flushMessages(req)
  if (path.startsWith('/api/test/whatsapp')) return testWhatsApp(req)
  if (path.startsWith('/api/test/fiscal')) return testFiscal(req)
  const m = path.match(/^\/api\/pay\/return\/([a-z_]+)$/)
  if (m) return paymentReturn(req, m[1])
  return null
}

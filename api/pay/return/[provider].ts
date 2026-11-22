import { paymentReturn } from '../../_lib/payments.js'

const handle = (req: Request) => {
  const provider = new URL(req.url).pathname.split('/').pop() ?? ''
  return paymentReturn(req, provider)
}

export const GET = handle
export const POST = handle

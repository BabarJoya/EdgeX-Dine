import { startPayment } from '../_lib/payments.js'

export const POST = (req: Request) => startPayment(req)

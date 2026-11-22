import { flushMessages } from '../_lib/whatsapp.js'

export const GET = (req: Request) => flushMessages(req)
export const POST = (req: Request) => flushMessages(req)

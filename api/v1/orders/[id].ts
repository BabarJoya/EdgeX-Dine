import { publicApi } from '../../_lib/public-api.js'

export const GET = (req: Request) =>
  publicApi(req, 'orders', new URL(req.url).pathname.split('/').pop())

import { easypaisa } from './easypaisa.js'
import { jazzcash } from './jazzcash.js'
import { testGateway } from './test-gateway.js'
import type { Gateway } from './types.js'

export const gateways: Record<string, Gateway> = {
  jazzcash,
  easypaisa,
  test_gateway: testGateway,
}

/**
 * Server-only configuration (Vercel environment variables). None of these are
 * VITE_-prefixed, so they never reach the browser bundle.
 */
export const env = {
  supabaseUrl: () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  serviceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  /** Public URL of the app; gateways send guests back here. */
  appUrl: (req: Request) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, ''),
  /** The built-in test gateway. Never set this in production. */
  testGateway: () => process.env.ENABLE_TEST_GATEWAY === '1',
  testGatewaySecret: () =>
    process.env.TEST_GATEWAY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
}

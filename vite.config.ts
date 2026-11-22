/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Serves the Vercel functions in /api from `vite dev` and `vite preview`, so
 * payment flows work locally and in end-to-end tests. Server-only variables
 * (no VITE_ prefix) are loaded into process.env here and never bundled.
 */
function apiFunctions(): Plugin {
  const middleware =
    (): Connect.NextHandleFunction =>
    async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      if (!req.url?.startsWith('/api/')) return next()
      try {
        const { route } = await import('./api/_lib/router.ts')
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const request = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method,
          headers: Object.entries(req.headers).flatMap(([k, v]) =>
            v === undefined ? [] : [[k, Array.isArray(v) ? v.join(', ') : v] as [string, string]],
          ),
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        })
        const response = await route(request)
        if (!response) return next()
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch (e) {
        next(e)
      }
    }
  return {
    name: 'edgex-api-functions',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '')
      for (const key of [
        'SUPABASE_SERVICE_ROLE_KEY',
        'ENABLE_TEST_GATEWAY',
        'TEST_GATEWAY_SECRET',
        'APP_URL',
        'WHATSAPP_API_BASE',
        'FISCAL_API_BASE',
      ]) {
        if (env[key] && !process.env[key]) process.env[key] = env[key]
      }
      if (!process.env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL)
        process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL
    },
    configureServer: (server) => void server.middlewares.use(middleware()),
    configurePreviewServer: (server) => void server.middlewares.use(middleware()),
  }
}

export default defineConfig({
  plugins: [
    apiFunctions(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'EdgeX Restaurant ERP',
        short_name: 'EdgeX',
        description: 'Restaurant operating system: POS, QR ordering, kitchen display and more.',
        theme_color: '#13233F',
        background_color: '#F7F6F3',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Never cache Supabase API traffic; data must always be live.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
    css: false,
  },
})

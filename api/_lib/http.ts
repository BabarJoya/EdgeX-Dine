export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export const redirect = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>` +
  `<style>body{font:15px/1.5 system-ui,sans-serif;background:#f7f6f3;color:#1c1f24;display:grid;place-items:center;min-height:100vh;margin:0}` +
  `main{background:#fff;border:1px solid #e3e0d9;border-radius:8px;padding:24px;max-width:360px;width:calc(100% - 32px)}` +
  `button{font:inherit;padding:10px 14px;border-radius:6px;border:1px solid #d6d2c9;background:#fff;cursor:pointer;width:100%;margin-top:8px}` +
  `button.primary{background:#13233f;color:#fff;border-color:#13233f}</style></head><body><main>${body}</main></body></html>`

export const html = (title: string, body: string, status = 200) =>
  new Response(page(title, body), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action https: http://localhost:* http://127.0.0.1:*",
    },
  })

/** A page that immediately POSTs a form to the gateway (or back to us). */
export function autoPost(
  action: string,
  fields: Record<string, string>,
  label = 'Redirecting to payment…',
) {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('')
  return html(
    label,
    `<form id="f" method="post" action="${escapeHtml(action)}">${inputs}<p>${escapeHtml(label)}</p>` +
      `<noscript><button class="primary">Continue</button></noscript></form>` +
      `<script>document.getElementById('f').submit()</script>`,
  )
}

/** Read gateway parameters from a query string and/or a form / JSON body. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  new URL(req.url).searchParams.forEach((v, k) => (out[k] = v))
  if (req.method === 'POST') {
    const type = req.headers.get('content-type') ?? ''
    if (type.includes('application/json')) {
      const body = (await req.json()) as Record<string, unknown>
      for (const [k, v] of Object.entries(body ?? {})) out[k] = String(v ?? '')
    } else {
      new URLSearchParams(await req.text()).forEach((v, k) => (out[k] = v))
    }
  }
  return out
}

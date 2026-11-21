/**
 * Turn Supabase / Postgres errors into messages a restaurant owner can act on.
 * Our database functions raise human-readable messages already; generic
 * Postgres errors get a friendly fallback.
 */
type MaybePgError = { code?: string; message?: string; hint?: string | null } | null | undefined

const friendly: Record<string, string> = {
  '42501': "You don't have permission to do that.",
  '23505': 'That already exists.',
  '23503': "This is still in use, so it can't be removed.",
  PGRST301: 'Your session has expired. Please sign in again.',
}

export function errorMessage(error: unknown): string {
  const e = error as MaybePgError
  if (!e) return 'Something went wrong.'
  const msg = e.message ?? ''
  // Raw permission errors from RLS ("permission denied for table x",
  // "new row violates row-level security policy") → generic message.
  if (/permission denied|row-level security/i.test(msg)) return friendly['42501']
  if (/duplicate key/i.test(msg)) return friendly['23505']
  if (/violates foreign key/i.test(msg)) return friendly['23503']
  if (msg) return msg
  return (e.code && friendly[e.code]) || 'Something went wrong.'
}

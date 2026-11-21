import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until .env.local is filled in (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Browser client. Uses the public anon key only; every query is checked by
 * Row Level Security in the database. The service-role key must never be
 * imported into frontend code.
 */
export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

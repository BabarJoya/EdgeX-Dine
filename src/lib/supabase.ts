import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** False until .env.local is filled in (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Browser client. Uses the public anon key only; every query is checked by
 * Row Level Security in the database. The service-role key must never be
 * imported into frontend code.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url || 'http://localhost:54321',
  anonKey || 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
)

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

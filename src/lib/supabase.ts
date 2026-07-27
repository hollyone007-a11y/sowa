import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Connection settings are read at runtime from `config.json` next to the app,
 * falling back to build-time environment variables.
 *
 * The runtime file is what makes the deployed site configurable by editing one
 * text file instead of adding CI secrets and rebuilding. The anon key is safe
 * to publish either way — it ends up in the JavaScript bundle regardless, and
 * Row Level Security, not the key, is what grants access.
 */

interface Config {
  supabaseUrl?: string
  supabaseAnonKey?: string
}

let client: SupabaseClient | null = null

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

async function readConfigFile(): Promise<Config> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' })
    if (!response.ok) return {}
    return (await response.json()) as Config
  } catch {
    // No file, offline, or invalid JSON: treated the same as "not configured".
    return {}
  }
}

/** Resolves once the client is either built or known to be impossible. */
export async function initSupabase(): Promise<boolean> {
  let url = clean(import.meta.env.VITE_SUPABASE_URL)
  let anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY)

  if (!url || !anonKey) {
    const config = await readConfigFile()
    url = url || clean(config.supabaseUrl)
    anonKey = anonKey || clean(config.supabaseAnonKey)
  }

  // Placeholders shipped in the template must not count as configuration.
  if (!url.startsWith('https://') || anonKey.length < 20) return false

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return true
}

export const getClient = () => client
export const isSupabaseConfigured = () => client !== null

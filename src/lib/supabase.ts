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

/** Why there is no connection — the setup screen turns this into advice. */
export type ConfigProblem = 'none' | 'empty' | 'bad-url' | 'bad-key'

let client: SupabaseClient | null = null
let problem: ConfigProblem = 'empty'

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** `https://<project>.supabase.co`, nothing else. */
export const looksLikeProjectUrl = (value: string) =>
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(value)

/**
 * Anon keys are JWTs (`eyJ…`) or the newer `sb_publishable_…` strings. The one
 * thing they are never is a URL — which is exactly what lands here when the
 * two setup steps get mixed up.
 */
export const looksLikeAnonKey = (value: string) =>
  value.length >= 30 && !value.includes('://') && !/\s/.test(value)

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

  if (!url && !anonKey) {
    problem = 'empty'
    return false
  }
  // Refusing a wrong value beats building a client that fails on every call
  // with an error nobody can act on.
  if (!looksLikeProjectUrl(url)) {
    problem = 'bad-url'
    return false
  }
  if (!looksLikeAnonKey(anonKey)) {
    problem = 'bad-key'
    return false
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  problem = 'none'
  return true
}

export const getClient = () => client
export const isSupabaseConfigured = () => client !== null
export const configProblem = (): ConfigProblem => problem

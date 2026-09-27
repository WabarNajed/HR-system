import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { fetchWithTimeout, getSupabaseEnv } from './env';

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let browserClient: BrowserClient | null = null;

/**
 * Browser Supabase client (singleton). Session lives in cookies shared with the server.
 * Use for small interactive reads/writes protected by RLS (notifications, uploads).
 * Returns `null` when Supabase isn't configured so callers can show an error state.
 */
export function createClient(): BrowserClient | null {
  if (browserClient) return browserClient;
  const env = getSupabaseEnv();
  if (!env) return null;
  browserClient = createBrowserClient<Database>(env.url, env.anonKey, {
    global: { fetch: fetchWithTimeout() },
  });
  return browserClient;
}

export type BrowserSupabaseClient = BrowserClient;

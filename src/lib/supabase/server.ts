import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { fetchWithTimeout, getSupabaseEnv } from './env';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user (RLS applies). Create one per request — never share across requests.
 *
 * Every HTTP call aborts after 8 s (`fetchWithTimeout`), so layouts never hang on a slow backend.
 * Throws `SupabaseNotConfiguredError` when the public env vars are missing; layouts check
 * `isSupabaseConfigured()` first and render the configuration screen instead.
 */
export async function createClient(options: { timeoutMs?: number } = {}) {
  const env = getSupabaseEnv();
  if (!env) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    global: { fetch: fetchWithTimeout(options.timeoutMs) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options: cookieOptions } of cookiesToSet) {
            cookieStore.set(name, value, cookieOptions);
          }
        } catch {
          // Called from a Server Component (read-only cookies). Safe to ignore: the proxy
          // refreshes the session on every navigation.
        }
      },
    },
  });
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    this.name = 'SupabaseNotConfiguredError';
  }
}

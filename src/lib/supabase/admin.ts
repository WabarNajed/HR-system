import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchWithTimeout } from './env';

/**
 * Service-role client — BYPASSES RLS. Server-only (the `server-only` import makes any client
 * bundle that reaches this module fail to build).
 *
 * Allowed uses (ARCHITECTURE §7): Auth admin operations (invite, create/link/disable users,
 * bootstrap), org-reset storage cleanup, email logging/delivery bookkeeping — always AFTER an
 * explicit authorization check with the user's own client / session context.
 */
export function createAdminClient(options: { timeoutMs?: number } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server only).',
    );
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout(options.timeoutMs ?? 15000) },
  });
}

/** True when the service-role key is available (e.g. to degrade email logging gracefully). */
export function isAdminClientConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Supabase environment (public values only — safe in client bundles).
 *
 * `NEXT_PUBLIC_*` variables are inlined at build time, so they must be referenced literally.
 * When the URL or anon key is missing the app renders a "configuration required" screen
 * (see `ConfigurationRequired`) instead of crashing.
 */

export type SupabasePublicEnv = { url: string; anonKey: string };

/** Default timeout for every Supabase HTTP call made by the app (ms). */
export const SUPABASE_FETCH_TIMEOUT_MS = 8000;

export function getSupabaseEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    // Reject obviously malformed URLs early (a bad value would otherwise throw deep in supabase-js).
    new URL(url);
  } catch {
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

/**
 * `fetch` wrapper that aborts after `timeoutMs` (combined with any caller-provided signal),
 * so a slow or unreachable Supabase never hangs a render, route handler or proxy invocation.
 */
export function fetchWithTimeout(timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal =
      init?.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, timeout]) : (init?.signal ?? timeout);
    return fetch(input, { ...init, signal });
  };
}

/** Public site URL (email links, QR codes). Falls back to localhost in development. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!raw) return 'http://localhost:3000';
  const withProtocol = raw.startsWith('http') ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

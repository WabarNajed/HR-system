import 'server-only';

import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { getPublicBranding } from '@/lib/branding';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { LOCALE_COOKIE, defaultLocale, isLocale, type Locale } from './config';

/** Supabase auth cookies are named `sb-<project-ref>-auth-token` (optionally chunked `.0`, `.1`). */
export function hasSupabaseAuthCookie(names: Iterable<string>): boolean {
  for (const name of names) if (/^sb-.+-auth-token(\.\d+)?$/.test(name)) return true;
  return false;
}

/**
 * Request locale (ARCHITECTURE §4): cookie `NEXT_LOCALE` → profile.preferred_language →
 * organization default_language → `ar`.
 *
 * The cookie is written on sign-in and by the language switch, so the DB fallbacks only run for
 * first visits / cleared cookies. Every lookup has a short timeout and falls through on failure.
 */
export const resolveRequestLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  if (isSupabaseConfigured() && hasSupabaseAuthCookie(store.getAll().map((c) => c.name))) {
    try {
      const supabase = await createClient({ timeoutMs: 3000 });
      const { data: claimsData } = await supabase.auth.getClaims();
      const uid = claimsData?.claims?.sub;
      if (uid) {
        const { data } = await supabase.from('profiles').select('preferred_language').eq('id', uid).maybeSingle();
        const preferred = (data as { preferred_language?: string | null } | null)?.preferred_language;
        if (isLocale(preferred)) return preferred;
      }
    } catch (error) {
      unstable_rethrow(error);
      // fall through to the organization default
    }
  }

  const branding = await getPublicBranding();
  return branding.defaultLanguage ?? defaultLocale;
});

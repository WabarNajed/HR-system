'use server';

import { revalidatePath } from 'next/cache';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { isLocale, type Locale } from './config';
import { writeLocaleCookie } from './cookie';

/**
 * Language switch (ARCHITECTURE §4): writes the `NEXT_LOCALE` cookie (1 year, sameSite=lax) and,
 * when signed in, persists `profiles.preferred_language`. The profile update is best-effort (a
 * failure never blocks the switch). Callers should `router.refresh()` afterwards.
 */
export async function setLocale(locale: Locale): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };
  await writeLocaleCookie(locale);

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient({ timeoutMs: 4000 });
      const { data } = await supabase.auth.getClaims();
      const uid = data?.claims?.sub;
      if (typeof uid === 'string') {
        const { error } = await supabase.from('profiles').update({ preferred_language: locale }).eq('id', uid);
        if (error) console.error('[i18n] saving preferred_language failed:', error.code, error.message);
      }
    } catch (error) {
      console.error('[i18n] saving preferred_language failed:', error instanceof Error ? error.message : error);
    }
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

import 'server-only';

import { writeLocaleCookie } from '@/lib/i18n/cookie';
import { isLocale } from '@/lib/i18n/config';
import type { ServerSupabaseClient } from '@/lib/supabase/server';

/** After an email-link sign-in: remember the profile language, record the login, return the profile status. */
export async function afterLinkSignIn(supabase: ServerSupabaseClient): Promise<string | null> {
  try {
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (typeof uid !== 'string') return null;
    const { data } = await supabase.from('profiles').select('status, preferred_language').eq('id', uid).maybeSingle();
    const row = data as { status?: string | null; preferred_language?: string | null } | null;
    if (isLocale(row?.preferred_language)) await writeLocaleCookie(row.preferred_language);
    // Email-link sign-ins count as logins (last_login_at + `auth.login` audit).
    const { error } = await supabase.rpc('record_login');
    if (error) console.error('[auth] record_login failed:', error.code, error.message);
    return row?.status ?? null;
  } catch (error) {
    console.error('[auth] post-link lookup failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

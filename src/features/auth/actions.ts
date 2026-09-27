'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ActionError, fail, ok, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { safeNextPath } from '@/lib/auth/guards';
import { getPublicBranding } from '@/lib/branding';
import { mapError } from '@/lib/errors';
import { LOCALE_COOKIE, isLocale, type Locale } from '@/lib/i18n/config';
import { writeLocaleCookie } from '@/lib/i18n/cookie';
import { siteUrl } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './schemas';

/**
 * Authentication Server Actions. Errors are i18n keys (see lib/errors.ts); raw Auth errors are
 * logged server-side only.
 */

/** Best-effort bookkeeping after a successful sign-in (never blocks or fails the sign-in). */
async function afterSignIn(userId: string): Promise<Locale | null> {
  const supabase = await createClient();
  let preferred: Locale | null = null;
  try {
    const { data } = await supabase.from('profiles').select('preferred_language').eq('id', userId).maybeSingle();
    const value = (data as { preferred_language?: string | null } | null)?.preferred_language;
    preferred = isLocale(value) ? value : null;
  } catch (error) {
    console.error('[auth] reading preferred_language failed:', error instanceof Error ? error.message : error);
  }

  // Remember the language: profile preference wins; otherwise persist the language chosen on the sign-in page.
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  if (preferred) {
    await writeLocaleCookie(preferred);
  } else if (isLocale(cookieLocale)) {
    const { error } = await supabase.from('profiles').update({ preferred_language: cookieLocale }).eq('id', userId);
    if (error) console.error('[auth] saving preferred_language failed:', error.code, error.message);
  }

  // RPC record_login(): stamps profiles.last_login_at and writes the `auth.login` audit event.
  const { error: loginError } = await supabase.rpc('record_login');
  if (loginError) console.error('[auth] record_login failed:', loginError.code, loginError.message);
  return preferred;
}

export const signIn = withAction(
  loginSchema,
  async ({ email, password, next }) => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const key = mapError(error);
      if (key === 'errors.generic' || key === 'errors.serverError') console.error('[auth] sign-in failed:', error?.name, error?.message);
      return fail(key === 'errors.generic' ? 'errors.invalidCredentials' : key);
    }
    await afterSignIn(data.user.id);
    redirect(safeNextPath(next));
  },
  { auth: 'none', scope: 'auth.signIn' },
);

/** Signs out this device, audits `auth.logout` and returns to /login. */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const uid = data?.claims?.sub;
    if (typeof uid === 'string') {
      await logAuditEvent({ action: 'auth.logout', entityType: 'profile', entityId: uid }, supabase);
    }
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) console.error('[auth] sign-out failed:', error.message);
  } catch (error) {
    console.error('[auth] sign-out failed:', error instanceof Error ? error.message : error);
  }
  redirect('/login?signedout=1');
}

export const signUp = withAction(
  registerSchema,
  async ({ fullName, employeeNumber, email, mobile, password }) => {
    const branding = await getPublicBranding();
    if (!branding.isFallback && !branding.allowSelfRegistration) throw new ActionError('errors.signupDisabled');
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, mobile, employee_number: employeeNumber },
        emailRedirectTo: `${siteUrl()}/auth/confirm?next=/pending-approval`,
      },
    });
    if (error) throw error;
    // Email confirmation disabled → a session exists → go straight to the status page.
    if (data.session) redirect('/pending-approval');
    // Supabase returns a user without identities for an existing (confirmed) email — don't leak it.
    return ok({ needsConfirmation: true as const, email });
  },
  { auth: 'none', scope: 'auth.signUp' },
);

export const requestPasswordReset = withAction(
  forgotPasswordSchema,
  async ({ email }) => {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    });
    if (error) {
      const key = mapError(error);
      // Never reveal whether the address exists; only surface transient problems.
      if (key === 'errors.rateLimited' || key === 'errors.network' || key === 'errors.timeout') return fail(key);
      console.error('[auth] resetPasswordForEmail failed:', error.name, error.message);
    }
    return ok({ email });
  },
  { auth: 'none', scope: 'auth.requestPasswordReset' },
);

export const updatePassword = withAction(
  resetPasswordSchema,
  async ({ password }) => {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const uid = claims?.claims?.sub;
    if (typeof uid !== 'string') throw new ActionError('errors.tokenExpired');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await logAuditEvent({ action: 'auth.password_changed', entityType: 'profile', entityId: uid }, supabase);
    return ok(undefined, 'auth.reset.success');
  },
  { auth: 'none', scope: 'auth.updatePassword' },
);

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  ACCOUNT_DETAILS_FIELDS,
  readFields,
  toFormState,
  type AccountDetailsFormState,
  type ChangePasswordFormState,
} from '@/features/auth/form-state';
import { changePasswordSchema } from '@/features/auth/schemas';
import { ActionError, fail, ok, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { mapError } from '@/lib/errors';
import { writeLocaleCookie } from '@/lib/i18n/cookie';
import { createClient } from '@/lib/supabase/server';
import { accountDetailsSchema, preferencesSchema } from './schemas';

/**
 * My profile — self-service actions. Profile writes go through RLS (self may update only full_name,
 * mobile, preferred_language and theme); the password change re-authenticates first.
 */

export const updateAccountDetailsAction = withAction(
  accountDetailsSchema,
  async ({ fullName, mobile }, { ctx }) => {
    const supabase = await createClient();
    const { error } = await supabase.from('profiles').update({ full_name: fullName, mobile: mobile || null }).eq('id', ctx.user.id);
    if (error) throw error;
    revalidatePath('/profile');
    return ok(undefined, 'profile.toast.detailsSaved');
  },
  { scope: 'profile.updateAccount' },
);

export const changePasswordAction = withAction(
  changePasswordSchema,
  async ({ currentPassword, password }, { ctx }) => {
    const email = ctx.user.email;
    if (!email) throw new ActionError('errors.invalidState');
    const supabase = await createClient();
    // Re-authenticate: proves knowledge of the current password (and refreshes the session, which
    // Supabase's "secure password change" requires for older sessions).
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (authError) {
      const key = mapError(authError);
      if (key === 'errors.rateLimited' || key === 'errors.network' || key === 'errors.timeout') return fail(key);
      return fail('profile.security.currentIncorrect', { currentPassword: 'profile.security.currentIncorrect' });
    }
    const { error } = await supabase.auth.updateUser({ password, data: { password_set_at: new Date().toISOString() } });
    if (error) throw error;
    await logAuditEvent({ action: 'auth.password_changed', entityType: 'profile', entityId: ctx.user.id, summary: 'profile' }, supabase);
    return ok(undefined, 'profile.toast.passwordChanged');
  },
  { scope: 'profile.changePassword' },
);

export const savePreferencesAction = withAction(
  preferencesSchema,
  async ({ language, theme }, { ctx }) => {
    const supabase = await createClient();
    const { error } = await supabase.from('profiles').update({ preferred_language: language, theme }).eq('id', ctx.user.id);
    if (error) throw error;
    await writeLocaleCookie(language);
    revalidatePath('/', 'layout');
    return ok(undefined, 'profile.toast.preferencesSaved');
  },
  { scope: 'profile.savePreferences' },
);

/** Signs out every session of this account (all devices), audited as `auth.logout`. */
export const signOutEverywhereAction = withAction(
  z.object({}),
  async (_input, { ctx }) => {
    const supabase = await createClient();
    await logAuditEvent({ action: 'auth.logout', entityType: 'profile', entityId: ctx.user.id, summary: 'all_devices' }, supabase);
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) throw error;
    redirect('/login?signedout=1');
  },
  { scope: 'profile.signOutEverywhere' },
);

/* ─── form adapters (progressive enhancement: `<form action={serverAction}>` (React renders method="POST") + useActionState) ── */

export async function saveAccountDetailsForm(prev: AccountDetailsFormState, formData: FormData): Promise<AccountDetailsFormState> {
  const v = readFields(formData, ACCOUNT_DETAILS_FIELDS);
  const result = await updateAccountDetailsAction(v);
  return toFormState(prev, result, v);
}

export async function changePasswordForm(prev: ChangePasswordFormState, formData: FormData): Promise<ChangePasswordFormState> {
  const v = readFields(formData, ['currentPassword', 'password', 'confirmPassword'] as const);
  const result = await changePasswordAction(v);
  return toFormState(prev, result, {});
}

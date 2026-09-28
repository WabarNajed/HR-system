import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ResetLinkHandler } from '@/features/auth/components/reset-link-handler';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { isRecentLinkSession } from '@/features/auth/link-session';
import { getSessionState } from '@/lib/auth/session';
import { pageMetadata } from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('auth.reset.title');

/**
 * Set a password — doubles as "Set your password" for invitations.
 * Reached from invitation / recovery links: `/auth/confirm` (token hash) or `/auth/callback` (PKCE)
 * establish the session first; implicit-flow links carry it in the URL fragment and are completed
 * client-side by `ResetLinkHandler`. Invitation mode: `?type=invite`, or an admin-invited account
 * that has never set a password (`profiles.invited_at` + no `user_metadata.password_set_at`).
 */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [state, params] = await Promise.all([getSessionState(), searchParams]);
  if (state.status !== 'authenticated') return <ResetLinkHandler />;

  const supabase = await createClient();
  const [{ data: claims }, { data: profile, error: profileError }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from('profiles').select('invited_at').eq('id', state.ctx.user.id).maybeSingle(),
  ]);
  // A regular (password) session must not change the password without the current one: send active
  // users to My profile › Account & security (re-authenticates); others see "link invalid/expired".
  if (!isRecentLinkSession(claims?.claims as Record<string, unknown> | undefined)) {
    if (state.ctx.profile.status === 'active') redirect('/profile?tab=security');
    return <ResetLinkHandler invalid />;
  }

  let invite = params.type === 'invite';
  if (!invite) {
    if (profileError) console.error('[auth] reset-password mode detection failed:', profileError.code, profileError.message);
    const meta = (claims?.claims?.user_metadata ?? {}) as { password_set_at?: string };
    invite = Boolean((profile as { invited_at?: string | null } | null)?.invited_at) && !meta.password_set_at;
  }
  return <ResetPasswordForm mode={invite ? 'invite' : 'recovery'} email={state.ctx.user.email} />;
}

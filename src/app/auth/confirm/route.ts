import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { afterLinkSignIn } from '../shared';

/**
 * GET /auth/confirm?token_hash=…&type=invite|recovery|signup|email|email_change|magiclink&next=…
 * Verifies an email OTP (token-hash email templates):
 *   invite / recovery → /reset-password (set a password)
 *   signup / email    → /pending-approval (awaiting HR) or /dashboard (already active)
 *   email_change      → /profile
 * Failure → /login?error=link_expired.
 */
export const dynamic = 'force-dynamic';

const TYPES: readonly EmailOtpType[] = ['invite', 'recovery', 'signup', 'email', 'email_change', 'magiclink'];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');

  if (tokenHash && type && TYPES.includes(type)) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) {
        const status = await afterLinkSignIn(supabase);
        let destination: string;
        if (type === 'invite' || type === 'recovery') destination = '/reset-password';
        else if (type === 'email_change') destination = '/profile';
        else if (type === 'signup' || type === 'email') destination = status === 'active' ? safeNextPath(next, '/dashboard') : '/pending-approval';
        else destination = safeNextPath(next, '/dashboard');
        return NextResponse.redirect(new URL(destination, request.url));
      }
      console.error('[auth] verifyOtp failed:', error.code ?? error.name, error.message);
    } catch (error) {
      console.error('[auth] verifyOtp threw:', error instanceof Error ? error.message : error);
    }
  }
  return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
}

import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { afterLinkSignIn } from '../shared';

/**
 * GET /auth/callback?code=…&next=/reset-password
 * PKCE code exchange for email links (password recovery, invitations, magic links) sent with
 * `redirectTo: <site>/auth/callback?next=…`. Success → `next`; failure → /login?error=link_expired.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'), '/dashboard');

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await afterLinkSignIn(supabase);
        return NextResponse.redirect(new URL(next, request.url));
      }
      console.error('[auth] code exchange failed:', error.code ?? error.name, error.message);
    } catch (error) {
      console.error('[auth] code exchange threw:', error instanceof Error ? error.message : error);
    }
  }
  return NextResponse.redirect(new URL('/login?error=link_expired', request.url));
}

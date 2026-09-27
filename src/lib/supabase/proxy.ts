import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';
import { fetchWithTimeout, getSupabaseEnv } from './env';

/**
 * Session refresh + route protection for `src/proxy.ts` (Next 16 "proxy", formerly middleware).
 *
 * - Refreshes the Supabase session (cookie rotation) on every matched request.
 * - Signed-out users on protected pages → `/login?next=<path>`.
 * - Signed-in users on `/login` or `/register` → `?next` (if safe) or `/dashboard`.
 * - No database queries: only `auth.getClaims()` (local JWT verification; network `getUser()` for
 *   symmetric keys) with a 5 s timeout. Profile status checks happen in the (app) layout.
 * - If Supabase is unreachable the request passes through; the layouts render an error state.
 */

export const PATHNAME_HEADER = 'x-hr-pathname';

const PUBLIC_EXACT = new Set(['/login', '/register', '/forgot-password', '/reset-password']);
const PUBLIC_PREFIXES = ['/auth/', '/verify/', '/api/cron/'];
const GUEST_ONLY = new Set(['/login', '/register']);

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (pathname === '/auth') return true;
  // Development-only UI gallery (404 in production builds).
  if (process.env.NODE_ENV !== 'production' && pathname.startsWith('/dev/')) return true;
  return false;
}

/** Route handlers answer 401 themselves — never redirect API calls to an HTML login page. */
function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/^\/(login|register|auth\/|api\/)/.test(value)) return null;
  return value;
}

type PendingCookie = { name: string; value: string; options: CookieOptions };

/**
 * Query parameters that must never live in a URL. A form submitted before hydration falls back to a
 * native GET, which would put the typed password into the address bar, history and Referer. Such a
 * request is answered with a redirect to the same URL without them (the form is simply shown again).
 */
const SECRET_PARAMS = ['password', 'confirmPassword', 'newPassword', 'currentPassword', 'passwordConfirm'];

export function stripSecretParams(url: URL): URL | null {
  const leaked = SECRET_PARAMS.filter((p) => url.searchParams.has(p));
  if (!leaked.length) return null;
  const clean = new URL(url);
  for (const p of leaked) clean.searchParams.delete(p);
  // Other fields of the same form (e.g. the e-mail address) are dropped as well.
  for (const p of ['email', 'fullName', 'full_name', 'mobile']) clean.searchParams.delete(p);
  return clean;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const env = getSupabaseEnv();

  if (request.method === 'GET' && !isApiPath(pathname) && !pathname.startsWith('/auth/')) {
    const clean = stripSecretParams(request.nextUrl);
    if (clean) {
      const response = NextResponse.redirect(clean, 303);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    }
  }

  const forwardHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set(PATHNAME_HEADER, `${pathname}${search}`);
    return headers;
  };

  // Not configured → let the layouts render the "configuration required" screen.
  if (!env) return NextResponse.next({ request: { headers: forwardHeaders() } });

  let pendingCookies: PendingCookie[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    global: { fetch: fetchWithTimeout(5000) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Make refreshed tokens visible to Server Components of this same request…
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        // …and remember them for the response.
        pendingCookies = cookiesToSet;
        pendingHeaders = headers ?? {};
      },
    },
  });

  let userId: string | null = null;
  let backendDown = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
    if (error && !userId) {
      const status = (error as { status?: number }).status;
      backendDown =
        error.name === 'AuthRetryableFetchError' ||
        (typeof status === 'number' && (status === 0 || status >= 500)) ||
        /fetch failed|timed? ?out|aborted/i.test(error.message);
    }
  } catch {
    backendDown = true;
  }

  const finalize = (response: NextResponse) => {
    for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options);
    for (const [key, value] of Object.entries(pendingHeaders)) response.headers.set(key, value);
    return response;
  };

  // Server Action POSTs and API routes enforce auth themselves (they must not get HTML redirects).
  const isAction = request.headers.has('next-action');

  if (!userId && !backendDown && !isAction && !isApiPath(pathname) && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const target = `${pathname}${search}`;
    if (pathname !== '/' && pathname !== '/dashboard') url.searchParams.set('next', target);
    return finalize(NextResponse.redirect(url));
  }

  if (userId && GUEST_ONLY.has(pathname) && !isAction) {
    const url = request.nextUrl.clone();
    const next = safeNext(request.nextUrl.searchParams.get('next'));
    url.pathname = next ? next.split('?')[0]! : '/dashboard';
    url.search = next && next.includes('?') ? `?${next.split('?').slice(1).join('?')}` : '';
    return finalize(NextResponse.redirect(url));
  }

  return finalize(NextResponse.next({ request: { headers: forwardHeaders() } }));
}

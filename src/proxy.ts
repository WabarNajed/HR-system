import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Next 16 proxy (formerly `middleware.ts`): refreshes the Supabase session and redirects
 * signed-out users away from protected pages. See `src/lib/supabase/proxy.ts`.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static files:
     * _next/static, _next/image, metadata files (favicon/icon/apple-icon/robots/sitemap/manifest)
     * and common static asset extensions.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icon|apple-icon|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf|css|js|map|txt|xml)$).*)',
  ],
};

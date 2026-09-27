import 'server-only';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from './config';

/**
 * Writes the `NEXT_LOCALE` cookie (1 year, sameSite=lax, path /). Only callable where cookies are
 * writable: Server Actions and Route Handlers.
 */
export async function writeLocaleCookie(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  });
}

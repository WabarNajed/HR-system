import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_TIME_ZONE, isLocale } from './config';
import { formats } from './formats';
import { loadMessages } from './messages';
import { resolveRequestLocale } from './resolve-locale';

/**
 * next-intl request configuration (no locale in the URL).
 * Locale: an explicit override (`getTranslations({ locale: 'en' })` — emails, exports, PDFs)
 * → cookie `NEXT_LOCALE` → profile preference → organization default → `ar`
 * (see `resolve-locale.ts`). The cookie is written on sign-in from the profile preference and by
 * the language switch (`src/lib/i18n/actions.ts`), so it is the fast path for every request.
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = isLocale(explicit) ? explicit : await resolveRequestLocale();

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: DEFAULT_TIME_ZONE,
    formats,
  };
});

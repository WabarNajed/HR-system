import { createTranslator } from 'next-intl';
import { DEFAULT_TIME_ZONE, type Locale } from './config';
import { formats } from './formats';
import { getMessages } from './messages';

/**
 * Request-independent translator for server code that renders in an explicit language
 * (emails, exports, PDFs, cron jobs) — no dependency on cookies or the request scope.
 * Keys are untyped (dynamic keys from the DB are common here); unknown keys return the key.
 *
 *   const t = getTranslator('ar'); t('statuses.request.approved'); t.has('errors.x')
 */
export type LooseTranslator = ((key: string, values?: Record<string, string | number | Date>) => string) & {
  has: (key: string) => boolean;
  locale: Locale;
};

const cache = new Map<Locale, LooseTranslator>();

export function getTranslator(locale: Locale): LooseTranslator {
  const cached = cache.get(locale);
  if (cached) return cached;
  const messages = getMessages(locale);
  const t = createTranslator({
    locale,
    messages,
    formats,
    timeZone: DEFAULT_TIME_ZONE,
    onError: () => {},
    getMessageFallback: ({ key, namespace }) => (namespace ? `${namespace}.${key}` : key),
  }) as unknown as ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

  const has = (key: string): boolean => {
    let node: unknown = messages;
    for (const part of key.split('.')) {
      if (!node || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) return false;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string';
  };
  const loose = Object.assign((key: string, values?: Record<string, string | number | Date>) => t(key, values), {
    has,
    locale,
  }) as LooseTranslator;
  cache.set(locale, loose);
  return loose;
}

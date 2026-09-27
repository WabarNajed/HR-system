import type { Locale } from './config';
import type { AppFormats } from './formats';
import type { Messages } from './messages';

/**
 * Type registration for next-intl: typed locale, message keys and named formats.
 * Dynamic keys (e.g. a DB status) should go through a typed helper (see StatusBadge) or be
 * checked with `t.has(key)`.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
    Formats: AppFormats;
  }
}

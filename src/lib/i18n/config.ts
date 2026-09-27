/**
 * i18n configuration — shared by server and client code (no server-only imports here).
 *
 * The locale is NOT part of the URL. Resolution order (see ARCHITECTURE §2/§4):
 * cookie `NEXT_LOCALE` → profile preference → organization default → `ar`.
 */

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export type Direction = 'rtl' | 'ltr';

export const defaultLocale: Locale = 'ar';

/** Cookie holding the active UI language (1 year, sameSite=lax). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Organization default time zone; every date is rendered in it unless stated otherwise. */
export const DEFAULT_TIME_ZONE = 'Asia/Riyadh';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Normalizes any input (cookie, DB value, header) to a supported locale. */
export function resolveLocale(value: unknown, fallback: Locale = defaultLocale): Locale {
  if (isLocale(value)) return value;
  if (typeof value === 'string') {
    const base = value.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return fallback;
}

export function dir(locale: Locale | string): Direction {
  return resolveLocale(locale) === 'ar' ? 'rtl' : 'ltr';
}

export function isRtl(locale: Locale | string): boolean {
  return dir(locale) === 'rtl';
}

/** The other supported locale (used for bilingual fallbacks). */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

/**
 * BCP-47 tags for `Intl.*` formatting.
 * Arabic uses Latin digits and the Gregorian calendar explicitly (readability of IDs/dates,
 * and because some engines default `ar-SA` to the Umm al-Qura calendar / Arabic-Indic digits).
 * English uses `en-AE`, which renders GCC-style `27 Sep 2026` dates.
 */
export const intlLocales: Record<Locale, string> = {
  ar: 'ar-SA-u-ca-gregory-nu-latn',
  en: 'en-AE-u-ca-gregory-nu-latn',
};

/** Hijri (Umm al-Qura) formatting tags — used where the domain needs Hijri dates (Iqama expiry). */
export const hijriIntlLocales: Record<Locale, string> = {
  ar: 'ar-SA-u-ca-islamic-umalqura-nu-latn',
  en: 'en-SA-u-ca-islamic-umalqura-nu-latn',
};

export function intlLocale(locale: Locale | string): string {
  return intlLocales[resolveLocale(locale)];
}

export function hijriIntlLocale(locale: Locale | string): string {
  return hijriIntlLocales[resolveLocale(locale)];
}

/** Native language names (always shown in their own language in switchers). */
export const localeNames: Record<Locale, string> = {
  ar: 'العربية',
  en: 'English',
};

/** Compact language marks for icon-sized switchers (shown in their own script). */
export const localeShortNames: Record<Locale, string> = {
  ar: 'ع',
  en: 'EN',
};

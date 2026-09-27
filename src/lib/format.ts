/**
 * Locale-aware number formatting (isomorphic). Latin digits by default in both languages
 * (ARCHITECTURE §4) — pass `{ digits: 'native' }` to opt into Arabic-Indic digits.
 * Dates live in `@/lib/dates` / `useDateFormat()`.
 */
import { intlLocale, type Locale } from '@/lib/i18n/config';

export type DigitsOption = { digits?: 'latn' | 'native' };

const cache = new Map<string, Intl.NumberFormat>();

function nf(locale: Locale, options: Intl.NumberFormatOptions & DigitsOption = {}): Intl.NumberFormat {
  const { digits = 'latn', ...rest } = options;
  const tag = digits === 'native' && locale === 'ar' ? 'ar-SA' : intlLocale(locale);
  const key = `${tag}|${JSON.stringify(rest)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(tag, rest);
    cache.set(key, f);
  }
  return f;
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return isNum(n) ? n : null;
}

/** `1,234.5` — empty string for null/invalid. */
export function formatNumber(
  value: number | string | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions & DigitsOption = {},
): string {
  const n = toNum(value);
  if (n === null) return '';
  return nf(locale, { maximumFractionDigits: 2, ...options }).format(n);
}

/** Integer with grouping: `12,480`. */
export function formatInteger(value: number | string | null | undefined, locale: Locale): string {
  return formatNumber(value, locale, { maximumFractionDigits: 0 });
}

/** Up to one decimal (leave days): `2.5`. */
export function formatDays(value: number | string | null | undefined, locale: Locale): string {
  return formatNumber(value, locale, { maximumFractionDigits: 1 });
}

/**
 * Currency using the organization currency (default SAR): `SAR 12,500.00` / `‏12,500.00 ر.س.‏`.
 * `display: 'code'` renders the ISO code instead of the local symbol.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  locale: Locale,
  currency = 'SAR',
  options: { display?: 'symbol' | 'code' | 'narrowSymbol'; fractionDigits?: number } & DigitsOption = {},
): string {
  const n = toNum(value);
  if (n === null) return '';
  const fd = options.fractionDigits ?? 2;
  try {
    return nf(locale, {
      style: 'currency',
      currency,
      currencyDisplay: options.display ?? 'symbol',
      minimumFractionDigits: fd,
      maximumFractionDigits: fd,
      digits: options.digits,
    }).format(n);
  } catch {
    // Unknown currency code → plain number + code.
    return `${formatNumber(n, locale, { minimumFractionDigits: fd, maximumFractionDigits: fd })} ${currency}`;
  }
}

/** Percent from a ratio (`0.425` → `42.5%`). Use `{ fromPercent: true }` for `42.5` inputs. */
export function formatPercent(
  value: number | string | null | undefined,
  locale: Locale,
  options: { fractionDigits?: number; fromPercent?: boolean } = {},
): string {
  const n = toNum(value);
  if (n === null) return '';
  return nf(locale, { style: 'percent', maximumFractionDigits: options.fractionDigits ?? 1 }).format(options.fromPercent ? n / 100 : n);
}

/** Compact: `12.5K` / `12.5 ألف`. */
export function formatCompact(value: number | string | null | undefined, locale: Locale): string {
  const n = toNum(value);
  if (n === null) return '';
  return nf(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Human file size with localized units: `820 KB`, `1.4 MB` (`كيلوبايت` / `ميغابايت` in Arabic). */
export function formatFileSize(bytes: number | null | undefined, locale: Locale): string {
  if (!isNum(bytes) || bytes < 0) return '';
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : value < 10 ? 1 : 0;
  return nf(locale, { style: 'unit', unit: units[i], unitDisplay: 'short', maximumFractionDigits: digits }).format(value);
}

/** Saudi IBAN display in groups of 4 (`SA03 8000 0000 6080 1016 7519`). */
export function formatIban(iban: string | null | undefined): string {
  if (!iban) return '';
  return iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

/** Masks all but the last 4 characters (`•••• 7519`). */
export function maskTail(value: string | null | undefined, visible = 4): string {
  if (!value) return '';
  const clean = value.replace(/\s+/g, '');
  return clean.length <= visible ? clean : `•••• ${clean.slice(-visible)}`;
}

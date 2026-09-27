import { DEFAULT_TIME_ZONE, hijriIntlLocale, intlLocale, type Locale } from './config';

/**
 * Deterministic date formatting per contract (ARCHITECTURE §4): Gregorian `dd MMM yyyy`
 * (e.g. `27 Sep 2026` / `27 سبتمبر 2026`) with Latin digits in both languages.
 *
 * Built from `Intl.DateTimeFormat#formatToParts` and assembled in a fixed order so the output
 * is identical on the server and in every browser (ICU versions disagree on separators and
 * ordering — e.g. `Sep 27, 2026` vs `27 Sep 2026` — which would cause hydration mismatches).
 *
 * Inputs:
 *  - `yyyy-MM-dd` strings are treated as calendar dates (no time-zone shift).
 *  - Timestamps (Date / ISO with time) are shown in the organization time zone (Asia/Riyadh).
 */

export type DateInput = Date | string | number | null | undefined;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toInstant(value: DateInput): { date: Date; timeZone: string } | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return { date: new Date(Date.UTC(y, m - 1, d)), timeZone: 'UTC' };
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, timeZone: '' };
}

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

function parts(date: Date, locale: string, options: Intl.DateTimeFormatOptions) {
  const out: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of formatter(locale, options).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

export type DateFormatOptions = {
  /** Time zone for timestamps (default Asia/Riyadh). Ignored for `yyyy-MM-dd` strings. */
  timeZone?: string;
  /** `short` → "Sep" (default), `long` → "September". */
  month?: 'short' | 'long';
};

/** `27 Sep 2026` / `27 سبتمبر 2026` — empty string for null/invalid input. */
export function formatDate(value: DateInput, locale: Locale, options: DateFormatOptions = {}): string {
  const inst = toInstant(value);
  if (!inst) return '';
  const p = parts(inst.date, intlLocale(locale), {
    day: '2-digit',
    month: options.month ?? 'short',
    year: 'numeric',
    timeZone: inst.timeZone || options.timeZone || DEFAULT_TIME_ZONE,
  });
  return `${p.day} ${p.month} ${p.year}`;
}

/** `27 Sep` — for compact ranges and charts. */
export function formatDayMonth(value: DateInput, locale: Locale, options: DateFormatOptions = {}): string {
  const inst = toInstant(value);
  if (!inst) return '';
  const p = parts(inst.date, intlLocale(locale), {
    day: '2-digit',
    month: options.month ?? 'short',
    timeZone: inst.timeZone || options.timeZone || DEFAULT_TIME_ZONE,
  });
  return `${p.day} ${p.month}`;
}

/** `14:05` (24-hour, Latin digits). */
export function formatTime(value: DateInput, locale: Locale, options: Pick<DateFormatOptions, 'timeZone'> = {}): string {
  const inst = toInstant(value);
  if (!inst) return '';
  const p = parts(inst.date, intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: inst.timeZone || options.timeZone || DEFAULT_TIME_ZONE,
  });
  return `${p.hour}:${p.minute}`;
}

/** `27 Sep 2026 · 14:05`. */
export function formatDateTime(value: DateInput, locale: Locale, options: DateFormatOptions = {}): string {
  const d = formatDate(value, locale, options);
  return d ? `${d} · ${formatTime(value, locale, options)}` : '';
}

/** `01 Sep – 27 Sep 2026` (same year) or `20 Dec 2025 – 05 Jan 2026`. */
export function formatDateRange(from: DateInput, to: DateInput, locale: Locale, options: DateFormatOptions = {}): string {
  const a = toInstant(from);
  const b = toInstant(to);
  if (a && b) {
    const sameYear = formatter('en-US', { year: 'numeric', timeZone: a.timeZone || options.timeZone || DEFAULT_TIME_ZONE }).format(a.date) ===
      formatter('en-US', { year: 'numeric', timeZone: b.timeZone || options.timeZone || DEFAULT_TIME_ZONE }).format(b.date);
    return `${sameYear ? formatDayMonth(from, locale, options) : formatDate(from, locale, options)} – ${formatDate(to, locale, options)}`;
  }
  return formatDate(from ?? to, locale, options);
}

/** `Sep 2026` / `سبتمبر 2026`. */
export function formatMonthYear(value: DateInput, locale: Locale, options: DateFormatOptions = {}): string {
  const inst = toInstant(value);
  if (!inst) return '';
  const p = parts(inst.date, intlLocale(locale), {
    month: options.month ?? 'short',
    year: 'numeric',
    timeZone: inst.timeZone || options.timeZone || DEFAULT_TIME_ZONE,
  });
  return `${p.month} ${p.year}`;
}

/** Hijri (Umm al-Qura) date: `16 ربيع الآخر 1448` / `16 Rabiʻ II 1448`. */
export function formatHijriDate(value: DateInput, locale: Locale, options: Pick<DateFormatOptions, 'timeZone'> = {}): string {
  const inst = toInstant(value);
  if (!inst) return '';
  const p = parts(inst.date, hijriIntlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: inst.timeZone || options.timeZone || DEFAULT_TIME_ZONE,
  });
  return `${p.day} ${p.month} ${p.year}`;
}

/** Date-only ISO (`yyyy-MM-dd`) of "today" in the organization time zone. */
export function todayIso(timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = parts(new Date(), 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone });
  return `${p.year}-${p.month}-${p.day}`;
}

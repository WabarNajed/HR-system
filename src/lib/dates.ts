/**
 * Date utilities (isomorphic): contract formatting (Gregorian `dd MMM yyyy`, Latin digits),
 * Hijri (Umm al-Qura), relative time, parsing, business-day math, expiry buckets and SLA state.
 *
 * Components should prefer `useDateFormat()` (`@/lib/i18n/use-date-format`) which binds the
 * active locale; these functions take the locale explicitly (server code, exports, emails, PDFs).
 *
 * Calendar dates (`yyyy-MM-dd`) are handled as UTC midnights to avoid time-zone drift.
 * Weekdays use JavaScript numbering (0 = Sunday … 6 = Saturday), matching
 * `organization_settings.working_days` (default `{0,1,2,3,4}` = Sun–Thu).
 */
import {
  formatDate as formatContractDate,
  formatDateRange,
  formatDateTime as formatContractDateTime,
  formatDayMonth,
  formatHijriDate,
  formatMonthYear,
  formatTime,
  todayIso,
  type DateInput,
} from '@/lib/i18n/date-format';
import { DEFAULT_TIME_ZONE, intlLocale, type Locale } from '@/lib/i18n/config';

export type { DateInput };
export { formatDateRange, formatDayMonth, formatMonthYear, formatTime, todayIso };

export type DateStyle = 'short' | 'long' | 'dayMonth' | 'monthYear' | 'iso';

/** `27 Sep 2026` (short, default) · `27 September 2026` (long) · `27 Sep` · `Sep 2026` · `2026-09-27`. */
export function formatDate(value: DateInput, locale: Locale, style: DateStyle = 'short', timeZone = DEFAULT_TIME_ZONE): string {
  switch (style) {
    case 'long':
      return formatContractDate(value, locale, { month: 'long', timeZone });
    case 'dayMonth':
      return formatDayMonth(value, locale, { timeZone });
    case 'monthYear':
      return formatMonthYear(value, locale, { timeZone });
    case 'iso': {
      const d = toDate(value);
      return d ? toIsoDate(d, timeZone) : '';
    }
    default:
      return formatContractDate(value, locale, { timeZone });
  }
}

/** `27 Sep 2026 · 14:05` in the organization time zone. */
export function formatDateTime(value: DateInput, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  return formatContractDateTime(value, locale, { timeZone });
}

/** Hijri (Umm al-Qura) date, e.g. `16 ربيع الآخر 1448`. */
export function formatHijri(value: DateInput, locale: Locale, timeZone = DEFAULT_TIME_ZONE): string {
  return formatHijriDate(value, locale, { timeZone });
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

/**
 * Relative time with Latin digits: "5 minutes ago" / "قبل 5 دقائق", "in 3 days".
 * Falls back to the absolute date beyond ~30 days.
 */
export function formatRelative(value: DateInput, locale: Locale, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return '';
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const key = intlLocale(locale);
  let rtf = rtfCache.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(key, { numeric: 'auto', style: 'long' });
    rtfCache.set(key, rtf);
  }
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatContractDate(d, locale);
}

/* ─── Parsing ─────────────────────────────────────────────────────────────── */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict `yyyy-MM-dd` → UTC-midnight Date (null when invalid, e.g. 2026-02-30). */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null;
}

/** Date | ISO string | timestamp → Date (null when invalid). `yyyy-MM-dd` → UTC midnight. */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && ISO_DATE.test(value)) return parseIsoDate(value);
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → `yyyy-MM-dd` in the given time zone (calendar date as seen there). */
export function toIsoDate(date: Date, timeZone = DEFAULT_TIME_ZONE): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** UTC-midnight Date → `yyyy-MM-dd` (no time-zone conversion). */
export function utcIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Lenient parser for user/imported input: `yyyy-MM-dd`, `yyyy/MM/dd`, `dd/MM/yyyy`, `dd-MM-yyyy`,
 * `dd.MM.yyyy`, Excel serial numbers (1900 system) and Date objects. Returns `yyyy-MM-dd` or null.
 * Arabic-Indic digits are normalized first. Ambiguous `MM/dd/yyyy` is NOT supported (GCC uses d/M/y).
 */
export function parseDateLoose(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : utcIsoDate(new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())));
  if (typeof value === 'number') {
    if (value > 59 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      return utcIsoDate(new Date(ms));
    }
    return null;
  }
  const s = normalizeDigits(String(value)).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return validYmd(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function validYmd(y: number, m: number, d: number): string | null {
  const iso = `${y.toString().padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return parseIsoDate(iso) ? iso : null;
}

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Latin. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/* ─── Calendar math (UTC calendar dates) ──────────────────────────────────── */

const DAY_MS = 86_400_000;

function asCalendarDate(value: DateInput): Date | null {
  const d = toDate(value);
  if (!d) return null;
  if (typeof value === 'string' && ISO_DATE.test(value)) return d;
  return parseIsoDate(toIsoDate(d));
}

export function addDays(date: DateInput, days: number): string | null {
  const d = asCalendarDate(date);
  return d ? utcIsoDate(new Date(d.getTime() + days * DAY_MS)) : null;
}

/** Whole days from `from` to `to` (calendar dates; negative when `to` is earlier). */
export function daysBetween(from: DateInput, to: DateInput): number | null {
  const a = asCalendarDate(from);
  const b = asCalendarDate(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Days until `date` from today (org time zone). Negative when past. */
export function daysUntil(date: DateInput, today: string = todayIso()): number | null {
  return daysBetween(today, date);
}

export type HolidayRange = { start_date: string; end_date: string } | string;

function holidaySet(holidays: readonly HolidayRange[] = []): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    if (typeof h === 'string') {
      if (isValidIsoDate(h)) set.add(h);
      continue;
    }
    const start = parseIsoDate(h.start_date);
    const end = parseIsoDate(h.end_date);
    if (!start || !end) continue;
    for (let t = start.getTime(); t <= end.getTime() && set.size < 5000; t += DAY_MS) set.add(utcIsoDate(new Date(t)));
  }
  return set;
}

export const DEFAULT_WORKING_DAYS: readonly number[] = [0, 1, 2, 3, 4];

/** True when the calendar date is a working day and not a holiday. */
export function isBusinessDay(date: DateInput, workingDays: readonly number[] = DEFAULT_WORKING_DAYS, holidays: readonly HolidayRange[] = []): boolean {
  const d = asCalendarDate(date);
  if (!d) return false;
  return workingDays.includes(d.getUTCDay()) && !holidaySet(holidays).has(utcIsoDate(d));
}

/**
 * Adds `n` business days to `date` (the start date itself is not counted), skipping non-working
 * weekdays and holidays. `n = 0` returns the next business day on/after `date`.
 */
export function addBusinessDays(
  date: DateInput,
  n: number,
  workingDays: readonly number[] = DEFAULT_WORKING_DAYS,
  holidays: readonly HolidayRange[] = [],
): string | null {
  const start = asCalendarDate(date);
  if (!start || !workingDays.length) return null;
  const off = holidaySet(holidays);
  const isWorking = (d: Date) => workingDays.includes(d.getUTCDay()) && !off.has(utcIsoDate(d));
  let cursor = start;
  if (n <= 0) {
    for (let i = 0; i < 400 && !isWorking(cursor); i++) cursor = new Date(cursor.getTime() + DAY_MS);
    return utcIsoDate(cursor);
  }
  let remaining = n;
  for (let i = 0; i < 3660 && remaining > 0; i++) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isWorking(cursor)) remaining--;
  }
  return utcIsoDate(cursor);
}

/** Business days in the inclusive range [start, end] (0 when end < start). */
export function businessDaysBetween(
  start: DateInput,
  end: DateInput,
  workingDays: readonly number[] = DEFAULT_WORKING_DAYS,
  holidays: readonly HolidayRange[] = [],
): number {
  const a = asCalendarDate(start);
  const b = asCalendarDate(end);
  if (!a || !b || b < a) return 0;
  const off = holidaySet(holidays);
  let count = 0;
  for (let t = a.getTime(); t <= b.getTime(); t += DAY_MS) {
    const d = new Date(t);
    if (workingDays.includes(d.getUTCDay()) && !off.has(utcIsoDate(d))) count++;
  }
  return count;
}

/* ─── Expiry & SLA ───────────────────────────────────────────────────────── */

export type ExpiryBucket = 'expired' | 'd7' | 'd14' | 'd30' | 'd60' | 'd90' | 'ok';

export const EXPIRY_BUCKETS: readonly ExpiryBucket[] = ['expired', 'd7', 'd14', 'd30', 'd60', 'd90', 'ok'];

/** Expiry bucket for a document/Iqama/passport date (null when there is no date). */
export function expiryBucket(date: DateInput, today: string = todayIso()): ExpiryBucket | null {
  const days = daysBetween(today, date);
  if (days === null) return null;
  if (days < 0) return 'expired';
  if (days <= 7) return 'd7';
  if (days <= 14) return 'd14';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'ok';
}

export type SlaState = 'on_track' | 'due_soon' | 'overdue';

/** Final request statuses: the SLA clock stops. */
export const FINAL_REQUEST_STATUSES: readonly string[] = ['approved', 'rejected', 'completed', 'cancelled'];

/** Window before `due_at` in which an open request is "due soon". */
export const SLA_DUE_SOON_MS = 24 * 3600 * 1000;

/**
 * SLA state for a request. Open requests compare `now` with `dueAt`; finished requests (final
 * status) compare their close time (`closedAt`, else now) — so a request completed late stays
 * `overdue` and one completed on time is `on_track`. Returns null without a due date.
 */
export function slaStatus(
  dueAt: DateInput,
  finalStatus?: string | null,
  options: { closedAt?: DateInput; now?: Date } = {},
): SlaState | null {
  const due = toDate(dueAt);
  if (!due) return null;
  const now = options.now ?? new Date();
  const isFinal = !!finalStatus && FINAL_REQUEST_STATUSES.includes(finalStatus);
  if (isFinal) {
    const closed = toDate(options.closedAt ?? null) ?? now;
    return closed.getTime() > due.getTime() ? 'overdue' : 'on_track';
  }
  const diff = due.getTime() - now.getTime();
  if (diff < 0) return 'overdue';
  if (diff <= SLA_DUE_SOON_MS) return 'due_soon';
  return 'on_track';
}

/**
 * Value normalizers for imported cells. Every parser returns `null` for blank input and a
 * discriminated result otherwise — callers turn failures into validation issues. Nothing here
 * invents data: unparseable values are reported, never guessed.
 */
import { gregorianToHijri, hijriToGregorian } from '@tabby_ai/hijri-converter';
import { cleanInvisible, foldArabic, latinDigits, matchKey } from './normalize';
import type { JsonCell } from './types';

/* ─── Text ────────────────────────────────────────────────────────────────── */

/** True for null/undefined/empty or whitespace-only strings. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return cleanInvisible(value).trim() === '';
  return false;
}

/**
 * Cell → text, trimmed only (names and free text are kept exactly as written). Integer numbers
 * are rendered without decimals so numeric IDs survive (`2345678901` not `2345678901.0`).
 */
export function cellText(value: JsonCell | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const s = cleanInvisible(value).trim();
  return s === '' ? null : s;
}

/** Identifier text (Iqama, passport, employee number): trimmed, Latin digits, no inner spaces. */
export function identifierText(value: JsonCell | undefined): string | null {
  const text = cellText(value);
  if (text === null) return null;
  const out = latinDigits(text).replace(/\s+/g, '');
  // Excel sometimes stores long IDs as scientific notation text ("2.34568E+09") — that is lossy.
  return out === '' ? null : out;
}

export function isScientificNotation(value: string): boolean {
  return /^\d(\.\d+)?e\+\d+$/i.test(value);
}

/* ─── Dates ───────────────────────────────────────────────────────────────── */

export type DateOrder = 'dmy' | 'mdy';

export type ParsedDate =
  | { ok: true; iso: string; calendar: 'gregorian' | 'hijri'; hijri: string | null }
  | { ok: false; reason: 'invalid' | 'hijriOutOfRange' };

const GREGORIAN_MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
  // Arabic (Gulf/Egyptian and Levantine names), folded
  يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, مايو: 5, يونيو: 6, يونيه: 6, يوليو: 7, يوليه: 7, اغسطس: 8,
  سبتمبر: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
  'كانون الثاني': 1, شباط: 2, اذار: 3, نيسان: 4, ايار: 5, حزيران: 6, تموز: 7, اب: 8, ايلول: 9,
  'تشرين الاول': 10, 'تشرين الثاني': 11, 'كانون الاول': 12,
};

const HIJRI_MONTHS: Record<string, number> = {
  محرم: 1, صفر: 2, 'ربيع الاول': 3, 'ربيع اول': 3, 'ربيع الثاني': 4, 'ربيع الاخر': 4, 'ربيع ثاني': 4,
  'جمادي الاولي': 5, 'جمادي الاول': 5, 'جمادي اولي': 5, 'جمادي الثانيه': 6, 'جمادي الاخره': 6, 'جمادي الثاني': 6,
  'جمادي الاخر': 6, رجب: 7, شعبان: 8, رمضان: 9, شوال: 10, 'ذو القعده': 11, 'ذي القعده': 11, 'ذو الحجه': 12,
  'ذي الحجه': 12,
  muharram: 1, safar: 2, 'rabi al awwal': 3, 'rabi i': 3, 'rabi al thani': 4, 'rabi ii': 4, 'jumada al ula': 5,
  'jumada i': 5, 'jumada al akhirah': 6, 'jumada ii': 6, rajab: 7, shaban: 8, ramadan: 9, shawwal: 10,
  'dhu al qadah': 11, 'dhul qadah': 11, 'dhu al hijjah': 12, 'dhul hijjah': 12,
};

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function validGregorian(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2200) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

function fromHijri(y: number, m: number, d: number): ParsedDate {
  if (m < 1 || m > 12 || d < 1 || d > 30) return { ok: false, reason: 'invalid' };
  try {
    const g = hijriToGregorian({ year: y, month: m, day: d });
    const iso = validGregorian(g.year, g.month, g.day);
    if (!iso) return { ok: false, reason: 'invalid' };
    return { ok: true, iso, calendar: 'hijri', hijri: `${pad(y, 4)}/${pad(m)}/${pad(d)}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ok: false, reason: /range/i.test(message) ? 'hijriOutOfRange' : 'invalid' };
  }
}

/** Gregorian ISO date → Hijri `yyyy/MM/dd` (Umm al-Qura), or null outside 1343–1500 AH. */
export function isoToHijri(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  try {
    const h = gregorianToHijri({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
    return `${pad(h.year, 4)}/${pad(h.month)}/${pad(h.day)}`;
  } catch {
    return null;
  }
}

function fromParts(y: number, m: number, d: number, hint: 'hijri' | 'gregorian' | null): ParsedDate {
  if (y >= 1300 && y <= 1599 && hint !== 'gregorian') return fromHijri(y, m, d);
  const iso = validGregorian(y, m, d);
  return iso ? { ok: true, iso, calendar: 'gregorian', hijri: null } : { ok: false, reason: 'invalid' };
}

function expandTwoDigitYear(yy: number, hint: 'hijri' | 'gregorian' | null): number {
  if (hint === 'hijri') return 1400 + yy;
  return yy < 50 ? 2000 + yy : 1900 + yy;
}

function lookupMonth(name: string): { month: number; calendar: 'gregorian' | 'hijri' } | null {
  const key = matchKey(name).replace(/\./g, '');
  if (key in GREGORIAN_MONTHS) return { month: GREGORIAN_MONTHS[key]!, calendar: 'gregorian' };
  if (key in HIJRI_MONTHS) return { month: HIJRI_MONTHS[key]!, calendar: 'hijri' };
  return null;
}

const CALENDAR_SUFFIX = /\s*(?:هـ|ه|ھ|هجري|هجريه|هجرية|a\.?h\.?|h|hijri|م|ميلادي|ميلاديه|ميلادية|a\.?d\.?|g|gregorian)\.?\s*$/i;
const TIME_SUFFIX = /(?:[T\s]+)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:am|pm|ص|م)?\s*(?:z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Parses a date cell: ISO strings (from Excel date cells), Excel serial numbers, `yyyymmdd`,
 * `yyyy-MM-dd`, `dd/MM/yyyy` (or `MM/dd/yyyy` when `order` is `mdy`), 2-digit years, month names
 * (English, Arabic, Hijri) and Hijri dates (years 1300–1599 → converted with Umm al-Qura).
 * Returns null for blank cells.
 */
export function parseDateValue(value: JsonCell | undefined, order: DateOrder = 'dmy'): ParsedDate | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return { ok: false, reason: 'invalid' };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' };
    const int = Math.trunc(value);
    if (int >= 13000101 && int <= 15991230) return fromParts(Math.floor(int / 10000), Math.floor((int % 10000) / 100), int % 100, 'hijri');
    if (int >= 19000101 && int <= 22001231) return fromParts(Math.floor(int / 10000), Math.floor((int % 10000) / 100), int % 100, 'gregorian');
    // Excel serial date (1900 date system): 367 = 1901-01-01 … 80000 ≈ 2119.
    if (value >= 367 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400) * 1000;
      const d = new Date(ms);
      const iso = validGregorian(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      return iso ? { ok: true, iso, calendar: 'gregorian', hijri: null } : { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'invalid' };
  }

  let s = latinDigits(cleanInvisible(value)).trim();
  if (!s) return null;

  // Full ISO timestamps from Excel date cells with a time part.
  const isoTs = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}/.exec(s);
  if (isoTs) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      // Round to the nearest minute (Excel floating point) and read the UTC calendar date.
      const rounded = new Date(Math.round(d.getTime() / 60000) * 60000);
      const iso = validGregorian(rounded.getUTCFullYear(), rounded.getUTCMonth() + 1, rounded.getUTCDate());
      if (iso) return { ok: true, iso, calendar: 'gregorian', hijri: null };
    }
  }

  let hint: 'hijri' | 'gregorian' | null = null;
  s = s.replace(TIME_SUFFIX, '').trim();
  const suffix = CALENDAR_SUFFIX.exec(s);
  if (suffix) {
    const marker = foldArabic(suffix[0]).trim().replace(/\./g, '');
    hint = /^(ه|ھ|هجري|هجريه|ah|h|hijri)$/.test(marker) ? 'hijri' : 'gregorian';
    s = s.slice(0, suffix.index).trim();
  }
  s = s.replace(/[،,]/g, ' ').replace(/\s+/g, ' ').trim();

  let m = /^(\d{4})[-/.\s](\d{1,2})[-/.\s](\d{1,2})$/.exec(s);
  if (m) return fromParts(Number(m[1]), Number(m[2]), Number(m[3]), hint);

  m = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    const mdy = a <= 12 && b > 12 ? true : a > 12 ? false : order === 'mdy';
    return mdy ? fromParts(y, a, b, hint) : fromParts(y, b, a, hint);
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = expandTwoDigitYear(Number(m[3]), hint);
    const mdy = a <= 12 && b > 12 ? true : a > 12 ? false : order === 'mdy';
    return mdy ? fromParts(y, a, b, hint) : fromParts(y, b, a, hint);
  }

  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return fromParts(Number(m[1]), Number(m[2]), Number(m[3]), hint);

  // "12 March 2025", "12-Mar-25", "12 رمضان 1446"
  m = /^(\d{1,2})[\s\-/.]+([^\d\s\-/.]+(?:\s[^\d\s\-/.]+){0,2})[\s\-/.]+(\d{2,4})$/.exec(s);
  if (m) {
    const month = lookupMonth(m[2]!);
    if (month) {
      const cal = hint ?? month.calendar;
      const y = m[3]!.length === 2 ? expandTwoDigitYear(Number(m[3]), cal) : Number(m[3]);
      return month.calendar === 'hijri' ? fromHijri(y, month.month, Number(m[1])) : fromParts(y, month.month, Number(m[1]), cal);
    }
  }
  // "March 12 2025"
  m = /^([^\d\s\-/.]+(?:\s[^\d\s\-/.]+){0,2})[\s\-/.]+(\d{1,2})[\s\-/.]+(\d{4})$/.exec(s);
  if (m) {
    const month = lookupMonth(m[1]!);
    if (month) {
      return month.calendar === 'hijri' ? fromHijri(Number(m[3]), month.month, Number(m[2])) : fromParts(Number(m[3]), month.month, Number(m[2]), hint);
    }
  }
  return { ok: false, reason: 'invalid' };
}

/** Infers the column's day/month order from its values (`mdy` only when unambiguous). */
export function inferDateOrder(values: readonly JsonCell[]): DateOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(latinDigits(v).trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dayFirst++;
    else if (b > 12 && a <= 12) monthFirst++;
  }
  return monthFirst > 0 && dayFirst === 0 ? 'mdy' : 'dmy';
}

/** True when the value looks like a Hijri date (year 1300–1599). */
export function looksHijri(value: JsonCell | undefined): boolean {
  const parsed = parseDateValue(value ?? null);
  return Boolean(parsed && parsed.ok && parsed.calendar === 'hijri');
}

/* ─── Numbers, booleans, enums ────────────────────────────────────────────── */

export type Parsed<T> = { ok: true; value: T } | { ok: false };

export function parseNumberValue(value: JsonCell | undefined): Parsed<number> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  if (typeof value === 'boolean') return { ok: false };
  let s = latinDigits(cleanInvisible(value)).trim();
  if (!s) return null;
  s = s
    .replace(/[٬,](?=\d{3}\b)/g, '')
    .replace(/٫/g, '.')
    .replace(/\s*(?:days?|d|يوم|أيام|ايام|يوما|يوماً)\.?$/i, '')
    .trim();
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(s)) return { ok: false };
  const n = Number(s);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}

const TRUE_WORDS = new Set(['yes', 'y', 'true', 't', '1', 'نعم', 'اي', 'ايوه', 'صح', 'صحيح', 'active', 'نشط', 'فعال', 'مفعل', 'x', '✓', '✔']);
const FALSE_WORDS = new Set(['no', 'n', 'false', 'f', '0', 'لا', 'خطا', 'خطأ', 'inactive', 'غير نشط', 'غير فعال', 'معطل', 'موقوف']);

export function parseBooleanValue(value: JsonCell | undefined): Parsed<boolean> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'number') return value === 1 ? { ok: true, value: true } : value === 0 ? { ok: true, value: false } : { ok: false };
  const key = matchKey(value);
  if (!key) return null;
  if (TRUE_WORDS.has(key)) return { ok: true, value: true };
  if (FALSE_WORDS.has(key)) return { ok: true, value: false };
  return { ok: false };
}

/**
 * "Outside the Kingdom" status: نعم/لا, yes/no, 1/0, خارج/داخل, outside/inside (and phrases
 * containing them). Anything else is unrecognized (kept as text in extra_data by the caller).
 */
export function parseOutsideKingdom(value: JsonCell | undefined): Parsed<boolean> | null {
  const bool = parseBooleanValue(value ?? null);
  if (bool === null) return null;
  if (bool.ok) return bool;
  const key = matchKey(value);
  if (/(^|\s)(خارج|برا|بره|outside|out|abroad|overseas)(\s|$)/.test(key)) return { ok: true, value: true };
  if (/(^|\s)(داخل|جوا|inside|in|local|onshore)(\s|$)/.test(key)) return { ok: true, value: false };
  return { ok: false };
}

const GENDER_WORDS: Record<string, 'male' | 'female'> = {
  male: 'male', m: 'male', man: 'male', ذكر: 'male', ذ: 'male', رجل: 'male', مذكر: 'male',
  female: 'female', f: 'female', woman: 'female', انثي: 'female', ا: 'female', امراه: 'female', مونث: 'female', سيده: 'female',
};

export function parseGenderValue(value: JsonCell | undefined): Parsed<'male' | 'female'> | null {
  const text = cellText(value);
  if (text === null) return null;
  const g = GENDER_WORDS[matchKey(text)];
  return g ? { ok: true, value: g } : { ok: false };
}

/** Matches an enum value against its synonyms (DB value, labels in both languages, extras). */
export function parseEnumValue<T extends string>(value: JsonCell | undefined, synonyms: ReadonlyMap<string, T>): Parsed<T> | null {
  const text = cellText(value);
  if (text === null) return null;
  const hit = synonyms.get(matchKey(text));
  return hit ? { ok: true, value: hit } : { ok: false };
}

/* ─── Contact ─────────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

/** E-mail: trimmed, `mailto:` removed, lower-cased. Blank → null (stored as NULL). */
export function parseEmailValue(value: JsonCell | undefined): Parsed<string> | null {
  const text = cellText(value);
  if (text === null) return null;
  const email = text.replace(/^mailto:/i, '').trim().toLowerCase();
  if (!email || email === '-' || email === '—' || email === 'n/a' || email === 'na' || email === 'لا يوجد') return null;
  return EMAIL_RE.test(email) ? { ok: true, value: email } : { ok: false };
}

/** Phone: formatting characters removed (digits and a leading +), nothing added. */
export function parsePhoneValue(value: JsonCell | undefined): Parsed<string> | null {
  const text = cellText(value);
  if (text === null) return null;
  const cleaned = latinDigits(text).replace(/[\s\-().]/g, '');
  if (!cleaned || cleaned === '-') return null;
  if (!/^\+?\d{7,15}$/.test(cleaned)) return { ok: false };
  return { ok: true, value: cleaned };
}

/** Verbatim JSON for `extra_data`: strings trimmed, numbers/booleans as-is. */
export function verbatim(value: JsonCell | undefined): JsonCell {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  return value;
}

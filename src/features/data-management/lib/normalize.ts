/**
 * Text normalization for matching (headers, master-data names, enum values). Never used to
 * change stored values — names are imported exactly as written.
 */

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → Latin. */
export function latinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** Removes invisible direction marks / BOM and turns NBSP & friends into plain spaces. */
export function cleanInvisible(value: string): string {
  return value.replace(INVISIBLE, '').replace(/[  -   　]/g, ' ');
}

/**
 * Folds Arabic spelling variants: diacritics and tatweel removed, أ/إ/آ/ٱ → ا, ة → ه, ى → ي,
 * ؤ → و, ئ → ي, Persian ک/ی → ك/ي. Latin text is lower-cased.
 */
export function foldArabic(value: string): string {
  return latinDigits(cleanInvisible(value))
    .replace(TASHKEEL, '')
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ی/g, 'ي')
    .toLowerCase();
}

/** Key for equality matching of names/codes: folded, punctuation-insensitive, single spaces. */
export function matchKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  return foldArabic(String(value))
    .replace(/[\s_\-./\\|,:;'"`()[\]{}]+/g, ' ')
    .trim();
}

const TOKEN_ALIASES: Record<string, string> = {
  no: 'number',
  num: 'number',
  nbr: 'number',
  nr: 'number',
  '#': 'number',
  id: 'id',
  dob: 'birth',
  exp: 'expiry',
  expiration: 'expiry',
  expire: 'expiry',
  expires: 'expiry',
  expired: 'expiry',
  issued: 'issue',
  issuance: 'issue',
  mob: 'mobile',
  tel: 'phone',
  telephone: 'phone',
  emp: 'employee',
  empl: 'employee',
  dept: 'department',
  dep: 'department',
  desig: 'designation',
  hijiri: 'hijri',
  hejri: 'hijri',
  higri: 'hijri',
  greg: 'gregorian',
  iqamah: 'iqama',
  eqama: 'iqama',
  akama: 'iqama',
  residency: 'iqama',
  passport: 'passport',
  pp: 'passport',
  // Arabic
  رقم: 'number',
  الرقم: 'number',
  تاريخ: 'date',
  التاريخ: 'date',
  هـ: 'hijri',
  ه: 'hijri',
  هجري: 'hijri',
  هجريه: 'hijri',
  الهجري: 'hijri',
  ميلادي: 'gregorian',
  ميلاديه: 'gregorian',
  الميلادي: 'gregorian',
  م: 'gregorian',
};

/** Removes the Arabic definite article and common attached prefixes from a token. */
function stemArabic(token: string): string {
  if (!/[؀-ۿ]/.test(token)) return token;
  let t = token;
  if (t.length > 4 && (t.startsWith('وال') || t.startsWith('بال') || t.startsWith('كال') || t.startsWith('فال'))) t = t.slice(3);
  else if (t.length > 4 && t.startsWith('لل')) t = t.slice(2);
  else if (t.length > 3 && t.startsWith('ال')) t = t.slice(2);
  return t;
}

/** Header → normalized tokens (folded, stemmed, aliased). */
export function headerTokens(value: string): string[] {
  const folded = foldArabic(value)
    .replace(/e-mail/g, 'email')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/[_\-./\\|,:;'"`()[\]{}*؟?!]+/g, ' ')
    .replace(/#/g, ' # ')
    .trim();
  if (!folded) return [];
  return folded
    .split(/\s+/)
    .map((raw) => {
      const alias = TOKEN_ALIASES[raw];
      if (alias) return alias;
      const stemmed = stemArabic(raw);
      return TOKEN_ALIASES[stemmed] ?? stemmed;
    })
    .filter(Boolean);
}

/** Normalized header string (tokens joined) — used for exact synonym matching. */
export function normalizeHeader(value: string): string {
  return headerTokens(value).join(' ');
}

/** True when the text contains Arabic letters. */
export function hasArabic(value: string): boolean {
  return /[؀-ۿ]/.test(value);
}

/** Excel-style column letter for a 0-based index (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

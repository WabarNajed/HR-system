/**
 * Documents & compliance — shared constants and pure helpers (isomorphic: server pages, client
 * components, export datasets and the cron job all use them).
 */
import { addDays } from '@/lib/dates';
import { UPLOAD_LIMITS } from '@/lib/storage';

export const DOCUMENT_TYPES = [
  'employment_contract',
  'national_id',
  'iqama',
  'passport',
  'medical_insurance',
  'iban_certificate',
  'educational_certificate',
  'professional_certificate',
  'medical_report',
  'visa',
  'signed_hr_form',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export const DOCUMENT_STATUSES = ['valid', 'expired', 'pending_review', 'rejected', 'archived'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Types that are usually stored with an expiry date (the form hints at it). */
export const EXPIRING_TYPES: readonly DocumentType[] = ['national_id', 'iqama', 'passport', 'medical_insurance', 'visa', 'employment_contract'];

/** Sources of the unified expiry monitor (`expiry_items.kind`). */
export const EXPIRY_KINDS = ['iqama', 'passport', 'contract', 'insurance', 'document'] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

export const EXPIRY_SUBJECTS = ['employee', 'dependent'] as const;
export type ExpirySubject = (typeof EXPIRY_SUBJECTS)[number];

/**
 * Expiry bands (exclusive, like `dashboard_stats`): expired (< 0) · 0–7 · 8–14 · 15–30 · 31–60 · 61–90 ·
 * later (> 90). `none` = no expiry date (documents only).
 */
export const EXPIRY_BANDS = ['expired', 'd7', 'd14', 'd30', 'd60', 'd90', 'later'] as const;
export type ExpiryBand = (typeof EXPIRY_BANDS)[number];
export const DOCUMENT_EXPIRY_BANDS = [...EXPIRY_BANDS, 'none'] as const;
export type DocumentExpiryBand = (typeof DOCUMENT_EXPIRY_BANDS)[number];

const BAND_DAYS: Record<Exclude<ExpiryBand, 'expired' | 'later'>, [number, number]> = {
  d7: [0, 7],
  d14: [8, 14],
  d30: [15, 30],
  d60: [31, 60],
  d90: [61, 90],
};

/** Band for a number of days left (null = no date). */
export function expiryBand(daysLeft: number | null | undefined): ExpiryBand | null {
  if (daysLeft === null || daysLeft === undefined || Number.isNaN(daysLeft)) return null;
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'd7';
  if (daysLeft <= 14) return 'd14';
  if (daysLeft <= 30) return 'd30';
  if (daysLeft <= 60) return 'd60';
  if (daysLeft <= 90) return 'd90';
  return 'later';
}

export type BandTone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

export function bandTone(band: ExpiryBand | null): BandTone {
  switch (band) {
    case 'expired':
    case 'd7':
      return 'danger';
    case 'd14':
    case 'd30':
      return 'warning';
    case 'd60':
    case 'd90':
      return 'info';
    case 'later':
      return 'success';
    default:
      return 'neutral';
  }
}

/**
 * PostgREST `or=(…)` expression selecting the given bands on a date column, relative to `today`
 * (`yyyy-MM-dd`). Returns null when nothing valid was requested.
 */
export function bandsOrFilter(bands: readonly string[], today: string, column = 'expiry_date'): string | null {
  const parts: string[] = [];
  for (const band of bands) {
    if (band === 'expired') parts.push(`${column}.lt.${today}`);
    else if (band === 'later') parts.push(`${column}.gt.${addDays(today, 90)}`);
    else if (band === 'none') parts.push(`${column}.is.null`);
    else if (band in BAND_DAYS) {
      const [from, to] = BAND_DAYS[band as keyof typeof BAND_DAYS];
      parts.push(`and(${column}.gte.${addDays(today, from)},${column}.lte.${addDays(today, to)})`);
    }
  }
  return parts.length ? parts.join(',') : null;
}

/** Whole days from `today` to `date` (both `yyyy-MM-dd`), or null. */
export function daysLeft(date: string | null | undefined, today: string): number | null {
  if (!date) return null;
  const a = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/* ─── Uploads ─────────────────────────────────────────────────────────────── */

export const DOCUMENT_UPLOAD = UPLOAD_LIMITS.document;
/** Accept list for the dropzone (extensions + MIME types). */
export const DOCUMENT_ACCEPT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

/* ─── Page tabs & list params ─────────────────────────────────────────────── */

export const DOCUMENT_TABS = ['documents', 'expiry', 'missing', 'review'] as const;
export type DocumentTab = (typeof DOCUMENT_TABS)[number];

export const DOCUMENT_LIST_FILTERS = ['type', 'status', 'bucket', 'department', 'confidential', 'createdFrom', 'createdTo'] as const;
export const DOCUMENT_LIST_SORTS = ['employee', 'document_type', 'expiry_date', 'issue_date', 'created_at', 'status'] as const;

export const EXPIRY_LIST_FILTERS = ['kind', 'subject', 'bucket', 'department'] as const;
export const EXPIRY_LIST_SORTS = ['employee', 'expiry_date', 'kind'] as const;

export const GAP_LIST_FILTERS = ['missing', 'department'] as const;
export const GAP_LIST_SORTS = ['employee', 'missing_count'] as const;

/** Types required per employee (see `employee_document_gaps` in the M6 migration). */
export const REQUIRED_DOCUMENT_TYPES: readonly DocumentType[] = ['iqama', 'national_id', 'passport', 'employment_contract'];

/** Mirrors `private.is_saudi_nationality`: true / false / null (unknown). */
export function isSaudiNationality(nationality: string | null | undefined): boolean | null {
  const value = (nationality ?? '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (/non[^a-z]*saudi/.test(lower) || /غير\s*(ال)?سعود/.test(value)) return false;
  if (/(saudi|^ksa$|^sa$|^sau$)/.test(lower) || /سعود/.test(value)) return true;
  return false;
}

/** Required document types for an employee (same rule as `employee_document_gaps`). */
export function requiredDocumentTypes(idType: string | null | undefined, nationality: string | null | undefined): DocumentType[] {
  const saudi = idType === 'iqama' ? false : idType === 'national_id' ? true : isSaudiNationality(nationality);
  return saudi === false ? ['iqama', 'passport', 'employment_contract'] : ['national_id', 'employment_contract'];
}

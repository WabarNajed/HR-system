/** Display values shared by the profile, the self-service panel, the directory and exports (isomorphic). */
import { formatHijri } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';

/**
 * Hijri (Umm al-Qura) Iqama expiry: the imported Hijri text when one was recorded, otherwise derived
 * from the Gregorian expiry date (ARCHITECTURE §4 — Iqama expiry is always shown in Hijri as well).
 */
export function iqamaExpiryHijri(employee: { iqama_expiry_date: string | null; iqama_expiry_hijri: string | null }, locale: Locale): string | null {
  const stored = employee.iqama_expiry_hijri?.trim();
  if (stored) return stored;
  return employee.iqama_expiry_date ? formatHijri(employee.iqama_expiry_date, locale) || null : null;
}

/**
 * Nationality is free text (imports keep the source value). The two canonical workbook values —
 * Saudi / Non-Saudi, in either language — are shown with the translated label; anything else
 * (e.g. a specific country) is shown as recorded.
 */
export function nationalityKey(value: string | null | undefined): 'saudi' | 'nonSaudi' | null {
  const v = (value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!v) return null;
  if (/^(non saudi|not saudi|غير سعودي(ة)?)$/.test(v)) return 'nonSaudi';
  if (/^(saudi|saudi arabian|ksa|سعودي(ة)?)$/.test(v)) return 'saudi';
  return null;
}

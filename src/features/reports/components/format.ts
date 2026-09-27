'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { formatNumber, formatPercent } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import type { ValueFormat } from '../definitions';

/** Loose translator for keys built from report metadata (definitions hold plain strings). */
export type LooseT = ((key: string, values?: Record<string, string | number | Date>) => string) & { has: (key: string) => boolean };

export function useReportT(): LooseT {
  const t = useTranslations();
  return t as unknown as LooseT;
}

/** Translates `key` when it exists, else returns the raw value (unknown DB codes stay visible). */
export function tOr(t: LooseT, key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  return t.has(key) ? t(key) : String(raw);
}

export function formatValue(value: unknown, format: ValueFormat, locale: Locale, t: LooseT): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  switch (format) {
    case 'percent':
      return formatPercent(n, locale, { fractionDigits: 1 });
    case 'days':
      return t('reports.units.days', { value: formatNumber(n, locale, { maximumFractionDigits: 1 }) });
    case 'years':
      return t('reports.units.years', { value: formatNumber(n, locale, { maximumFractionDigits: 1 }) });
    case 'decimal':
      return formatNumber(n, locale, { maximumFractionDigits: 1 });
    default:
      return formatNumber(n, locale, { maximumFractionDigits: 0 });
  }
}

/** Plain number for chart axes/tooltips (percent values are fractions). */
export function useNumberFormat() {
  const locale = useLocale() as Locale;
  return useMemo(
    () => ({
      locale,
      integer: (v: number) => formatNumber(v, locale, { maximumFractionDigits: 0 }),
      decimal: (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 }),
      percent: (v: number) => formatPercent(v, locale, { fractionDigits: 0 }),
      compact: (v: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v),
    }),
    [locale],
  );
}

/** Localized `<base>_ar` / `<base>_en` pick with fallback to the other language. */
export function pickLocalized(row: Record<string, unknown>, base: string, locale: Locale): string | null {
  const primary = row[`${base}_${locale}`];
  const other = row[`${base}_${locale === 'ar' ? 'en' : 'ar'}`];
  if (typeof primary === 'string' && primary.trim()) return primary;
  if (typeof other === 'string' && other.trim()) return other;
  return null;
}

import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import type { RequestListRow } from './types';

/** Localized subtype label for a request row (falls back to the raw value). Isomorphic. */
export function subtypeLabel(row: Pick<RequestListRow, 'subtype' | 'type'>, locale: Locale): string | null {
  if (!row.subtype) return null;
  const o = row.type?.subtypes.find((s) => s.value === row.subtype);
  return o ? localized(o, 'label', locale) || row.subtype : row.subtype;
}

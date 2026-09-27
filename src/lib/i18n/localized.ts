import { otherLocale, type Locale } from './config';

type Text = string | null | undefined;

/** A row carrying bilingual columns `<field>_ar` / `<field>_en` (e.g. `name_ar`, `name_en`). */
export type BilingualRow<F extends string> = { [K in `${F}_ar` | `${F}_en`]?: Text };

function clean(value: Text): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns `row[field_<locale>]`, falling back to the other language when empty.
 * `localized(dept, 'name', 'en')` → `dept.name_en || dept.name_ar || ''`.
 */
export function localized<F extends string>(
  row: BilingualRow<F> | null | undefined,
  field: F,
  locale: Locale,
): string {
  if (!row) return '';
  const r = row as Record<string, Text>;
  return clean(r[`${field}_${locale}`]) || clean(r[`${field}_${otherLocale(locale)}`]);
}

/** Like `localized` but returns `null` when both languages are empty (for "—" placeholders). */
export function localizedOrNull<F extends string>(
  row: BilingualRow<F> | null | undefined,
  field: F,
  locale: Locale,
): string | null {
  return localized(row, field, locale) || null;
}

export type EmployeeNameFields = { name_ar?: Text; name_en?: Text };

/**
 * Employee display name per contract (ARCHITECTURE §4):
 * English UI shows `name_en` only when present, otherwise the real Arabic name.
 * Arabic UI shows `name_ar`, falling back to `name_en` if the Arabic name is missing.
 * Never transliterates or invents a name.
 */
export function employeeDisplayName(emp: EmployeeNameFields | null | undefined, locale: Locale): string {
  if (!emp) return '';
  const ar = clean(emp.name_ar);
  const en = clean(emp.name_en);
  if (locale === 'en') return en || ar;
  return ar || en;
}

/** The employee's name in the other language, when it exists and differs (for subtitles). */
export function employeeAlternateName(emp: EmployeeNameFields | null | undefined, locale: Locale): string | null {
  if (!emp) return null;
  const primary = employeeDisplayName(emp, locale);
  const alt = locale === 'en' ? clean(emp.name_ar) : clean(emp.name_en);
  return alt && alt !== primary ? alt : null;
}

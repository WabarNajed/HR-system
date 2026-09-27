/**
 * Certificate template variables (PRODUCT-SPEC §12 + a few useful extras) and conditional flags.
 * Isomorphic: the editor's variables panel and the server renderer share this list.
 *
 *   {{token}}                 → replaced with the escaped value (per section language)
 *   data-if="<flag>"          → block removed when the flag is false/empty
 *   data-if-not="<flag>"      → block removed when the flag is true/non-empty
 */

export const VARIABLE_GROUPS = ['employee', 'salary', 'company', 'certificate'] as const;
export type VariableGroup = (typeof VARIABLE_GROUPS)[number];

export const TEMPLATE_VARIABLES = [
  { key: 'employee_name_ar', group: 'employee' },
  { key: 'employee_name_en', group: 'employee' },
  { key: 'employee_id', group: 'employee' },
  { key: 'job_title_ar', group: 'employee' },
  { key: 'job_title_en', group: 'employee' },
  { key: 'department_ar', group: 'employee' },
  { key: 'department_en', group: 'employee' },
  { key: 'joining_date', group: 'employee' },
  { key: 'nationality', group: 'employee' },
  { key: 'passport_number', group: 'employee' },
  { key: 'national_id', group: 'employee' },
  { key: 'basic_salary', group: 'salary' },
  { key: 'housing_allowance', group: 'salary' },
  { key: 'transport_allowance', group: 'salary' },
  { key: 'other_allowance', group: 'salary' },
  { key: 'total_salary', group: 'salary' },
  { key: 'company_name_ar', group: 'company' },
  { key: 'company_name_en', group: 'company' },
  { key: 'company_address_ar', group: 'company' },
  { key: 'company_address_en', group: 'company' },
  { key: 'company_cr', group: 'company' },
  { key: 'company_vat', group: 'company' },
  { key: 'company_phone', group: 'company' },
  { key: 'company_website', group: 'company' },
  { key: 'certificate_number', group: 'certificate' },
  { key: 'current_date', group: 'certificate' },
  { key: 'current_date_hijri', group: 'certificate' },
  { key: 'addressed_to', group: 'certificate' },
  { key: 'purpose', group: 'certificate' },
] as const satisfies readonly { key: string; group: VariableGroup }[];

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]['key'];

export const VARIABLE_KEYS: ReadonlySet<string> = new Set(TEMPLATE_VARIABLES.map((v) => v.key));

/** Salary tokens resolve to empty unless the request asked to include the salary. */
export const SALARY_VARIABLES: ReadonlySet<string> = new Set([
  'basic_salary',
  'housing_allowance',
  'transport_allowance',
  'other_allowance',
  'total_salary',
]);

/** Flags usable in `data-if` / `data-if-not`. */
export const CONDITION_FLAGS = ['include_salary', 'include_allowances', 'addressed_to'] as const;
export type ConditionFlag = (typeof CONDITION_FLAGS)[number];

/** Editor "show this block" choices → attributes. */
export const BLOCK_CONDITIONS = [
  { id: 'always', attr: null, flag: null },
  { id: 'salary', attr: 'data-if', flag: 'include_salary' },
  { id: 'allowances', attr: 'data-if', flag: 'include_allowances' },
  { id: 'addressedTo', attr: 'data-if', flag: 'addressed_to' },
  { id: 'noAddressedTo', attr: 'data-if-not', flag: 'addressed_to' },
] as const;
export type BlockConditionId = (typeof BLOCK_CONDITIONS)[number]['id'];

export const TOKEN_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Unknown `{{tokens}}` used in the given HTML fragments (for editor warnings). */
export function findUnknownTokens(...fragments: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const html of fragments) {
    if (!html) continue;
    for (const match of html.matchAll(TOKEN_RE)) {
      if (!VARIABLE_KEYS.has(match[1])) out.add(match[1]);
    }
  }
  return [...out];
}

export const CERTIFICATE_TYPES = ['salary', 'employment', 'salary_employment', 'experience', 'custom'] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_LANGUAGES = ['ar', 'en', 'bilingual'] as const;
export type CertificateLanguage = (typeof CERTIFICATE_LANGUAGES)[number];

export const KNOWN_VARIANTS = ['general', 'bank', 'embassy', 'government', 'university', 'other'] as const;

export function isCertificateType(value: unknown): value is CertificateType {
  return typeof value === 'string' && (CERTIFICATE_TYPES as readonly string[]).includes(value);
}

export function isCertificateLanguage(value: unknown): value is CertificateLanguage {
  return typeof value === 'string' && (CERTIFICATE_LANGUAGES as readonly string[]).includes(value);
}

/** A template can render the requested language when it is bilingual or of that exact language. */
export function templateSupportsLanguage(templateLanguage: string, requested: CertificateLanguage): boolean {
  return templateLanguage === 'bilingual' || templateLanguage === requested;
}

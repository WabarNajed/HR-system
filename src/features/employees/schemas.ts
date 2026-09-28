import { z } from 'zod';
import { isValidIsoDate, normalizeDigits } from '@/lib/dates';
import {
  DEPENDENT_INSURANCE_STATUSES,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  ID_TYPES,
  INSURANCE_STATUSES,
  MARITAL_STATUSES,
  RELATIONSHIPS,
} from './types';

/**
 * Zod schemas shared by the client forms (react-hook-form) and the server actions. Form values are
 * strings ('' = empty); the server converts them to DB values (`toNullable`). Messages are i18n keys.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (max: number) => z.string().trim().max(max);
/**
 * Numbers typed on an Arabic keyboard (٠-٩ / ۰-۹) are stored with Latin digits, so IDs, IBANs and
 * phone numbers stay searchable, unique and valid. Applied to identifiers, never to names/free text.
 */
const code = (max: number) => text(max).transform(normalizeDigits);

/** Amount as typed → plain decimal: Latin digits, `٫` → `.`, thousands separators dropped. */
export function normalizeAmount(value: string): string {
  return normalizeDigits(value).replace(/٫/g, '.').replace(/[٬,\s]/g, '');
}
const isoDate = () => z.string().trim().refine((v) => v === '' || isValidIsoDate(v), { message: 'validation.invalidDate' });
const uuidOrEmpty = () => z.string().trim().refine((v) => v === '' || UUID_RE.test(v), { message: 'validation.invalidValue' });
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(['', ...values] as unknown as readonly [string, ...string[]]);
const money = () =>
  z
    .string()
    .trim()
    .transform(normalizeAmount)
    .refine((v) => v === '' || /^\d{1,10}(\.\d{1,2})?$/.test(v), { message: 'employees.validation.amount' });

/** Upper-case, no spaces (as stored by the DB trigger). */
export function normalizeIban(value: string): string {
  return normalizeDigits(value).replace(/\s+/g, '').toUpperCase();
}

/** Hard format rule: `SA` + 22 digits/letters (Saudi IBANs are 24 characters). */
export function isValidSaudiIbanFormat(value: string): boolean {
  return /^SA\d{4}[A-Z0-9]{18}$/.test(normalizeIban(value));
}

/** ISO 7064 mod-97 checksum (soft check: legacy/imported numbers are not blocked). */
export function hasValidIbanChecksum(value: string): boolean {
  const iban = normalizeIban(value);
  if (iban.length < 5) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/**
 * Soft check for Saudi identity numbers — returns a warning key (never blocks saving: imported
 * records may carry legacy formats). National ID: 10 digits starting with 1; Iqama: starting with 2.
 */
export function identityNumberWarning(idType: string, value: string): string | null {
  const v = normalizeDigits(value.trim());
  if (!v) return null;
  const type = idType || (v.startsWith('1') ? 'national_id' : v.startsWith('2') ? 'iqama' : '');
  if (type === 'national_id' && !/^1\d{9}$/.test(v)) return 'employees.form.warnings.nationalId';
  if (type === 'iqama' && !/^2\d{9}$/.test(v)) return 'employees.form.warnings.iqama';
  if (!type && !/^[12]\d{9}$/.test(v)) return 'employees.form.warnings.identity';
  return null;
}

export const employeeFormSchema = z
  .object({
    // Identity & contact
    employee_number: code(50),
    name_ar: text(200),
    name_en: text(200),
    company_email: text(254),
    personal_email: text(254),
    mobile: code(30),
    alt_mobile: code(30),
    gender: optionalEnum(GENDERS),
    nationality: text(100),
    date_of_birth: isoDate(),
    marital_status: optionalEnum(MARITAL_STATUSES),
    address: text(500),
    // Employment
    department_id: uuidOrEmpty(),
    division: text(100),
    section: text(100),
    job_title_id: uuidOrEmpty(),
    grade: text(50),
    manager_id: uuidOrEmpty(),
    employment_type: optionalEnum(EMPLOYMENT_TYPES),
    employment_status: z.enum(EMPLOYMENT_STATUSES),
    joining_date: isoDate(),
    probation_end_date: isoDate(),
    contract_start_date: isoDate(),
    contract_end_date: isoDate(),
    termination_date: isoDate(),
    location_id: uuidOrEmpty(),
    cost_center_id: uuidOrEmpty(),
    // Government documents
    id_type: optionalEnum(ID_TYPES),
    national_id: code(30),
    iqama_issue_date: isoDate(),
    iqama_expiry_date: isoDate(),
    iqama_expiry_hijri: text(30),
    iqama_profession: text(100),
    passport_number: code(30),
    passport_expiry_date: isoDate(),
    employer_number: code(30),
    is_outside_kingdom: z.enum(['', 'inside', 'outside']),
    // Emergency contact
    emergency_contact_name: text(200),
    emergency_contact_relationship: text(100),
    emergency_contact_mobile: code(30),
    // Compensation (bank.edit)
    basic_salary: money(),
    housing_allowance: money(),
    transport_allowance: money(),
    other_allowance: money(),
    compensation_effective_date: isoDate(),
    // Bank (bank.edit)
    bank_name: text(100),
    iban: code(40),
    account_holder: text(200),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (!v.name_ar && !v.name_en) {
      issue('name_ar', 'validation.atLeastOneName');
      issue('name_en', 'validation.atLeastOneName');
    }
    if (v.company_email && !EMAIL_RE.test(v.company_email)) issue('company_email', 'validation.email');
    if (v.personal_email && !EMAIL_RE.test(v.personal_email)) issue('personal_email', 'validation.email');
    if (v.contract_start_date && v.contract_end_date && v.contract_end_date <= v.contract_start_date) {
      issue('contract_end_date', 'employees.validation.contractEndAfterStart');
    }
    if (v.joining_date && v.probation_end_date && v.probation_end_date < v.joining_date) {
      issue('probation_end_date', 'employees.validation.probationAfterJoining');
    }
    if (v.joining_date && v.termination_date && v.termination_date < v.joining_date) {
      issue('termination_date', 'employees.validation.terminationAfterJoining');
    }
    if (v.iqama_issue_date && v.iqama_expiry_date && v.iqama_expiry_date < v.iqama_issue_date) {
      issue('iqama_expiry_date', 'employees.validation.expiryAfterIssue');
    }
    if (v.iban && !isValidSaudiIbanFormat(v.iban)) issue('iban', 'validation.iban');
  });

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

/** Field groups (for permission-based stripping on the server and read-only rendering on the client). */
export const PERSONAL_FIELDS = [
  'personal_email',
  'date_of_birth',
  'marital_status',
  'address',
  'id_type',
  'national_id',
  'iqama_issue_date',
  'iqama_expiry_date',
  'iqama_expiry_hijri',
  'iqama_profession',
  'passport_number',
  'passport_expiry_date',
  'employer_number',
  'is_outside_kingdom',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_mobile',
] as const satisfies readonly (keyof EmployeeFormValues)[];

export const COMPENSATION_FIELDS = [
  'basic_salary',
  'housing_allowance',
  'transport_allowance',
  'other_allowance',
  'compensation_effective_date',
] as const satisfies readonly (keyof EmployeeFormValues)[];

export const BANK_FIELDS = ['bank_name', 'iban', 'account_holder'] as const satisfies readonly (keyof EmployeeFormValues)[];

export const EMPTY_EMPLOYEE_FORM: EmployeeFormValues = {
  employee_number: '',
  name_ar: '',
  name_en: '',
  company_email: '',
  personal_email: '',
  mobile: '',
  alt_mobile: '',
  gender: '',
  nationality: '',
  date_of_birth: '',
  marital_status: '',
  address: '',
  department_id: '',
  division: '',
  section: '',
  job_title_id: '',
  grade: '',
  manager_id: '',
  employment_type: '',
  employment_status: 'active',
  joining_date: '',
  probation_end_date: '',
  contract_start_date: '',
  contract_end_date: '',
  termination_date: '',
  location_id: '',
  cost_center_id: '',
  id_type: '',
  national_id: '',
  iqama_issue_date: '',
  iqama_expiry_date: '',
  iqama_expiry_hijri: '',
  iqama_profession: '',
  passport_number: '',
  passport_expiry_date: '',
  employer_number: '',
  is_outside_kingdom: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_mobile: '',
  basic_salary: '',
  housing_allowance: '',
  transport_allowance: '',
  other_allowance: '',
  compensation_effective_date: '',
  bank_name: '',
  iban: '',
  account_holder: '',
};

export const saveEmployeeSchema = z.object({
  id: z.string().uuid().nullable(),
  values: employeeFormSchema,
});

export const employeeIdSchema = z.object({ id: z.string().uuid() });

/* ─── Dependents ─────────────────────────────────────────────────────────── */

export const dependentFormSchema = z
  .object({
    name_ar: text(200),
    name_en: text(200),
    relationship: z.enum(RELATIONSHIPS, { message: 'validation.selectOne' }),
    date_of_birth: isoDate(),
    nationality: text(100),
    national_id: code(30),
    iqama_expiry_date: isoDate(),
    passport_number: code(30),
    passport_expiry_date: isoDate(),
    insurance_status: optionalEnum(DEPENDENT_INSURANCE_STATUSES),
    insurance_member_number: code(50),
    notes: text(1000),
  })
  .superRefine((v, ctx) => {
    if (!v.name_ar && !v.name_en) {
      ctx.addIssue({ code: 'custom', path: ['name_ar'], message: 'validation.atLeastOneName' });
      ctx.addIssue({ code: 'custom', path: ['name_en'], message: 'validation.atLeastOneName' });
    }
  });

export type DependentFormValues = z.infer<typeof dependentFormSchema>;

export const EMPTY_DEPENDENT_FORM: DependentFormValues = {
  name_ar: '',
  name_en: '',
  relationship: 'spouse',
  date_of_birth: '',
  nationality: '',
  national_id: '',
  iqama_expiry_date: '',
  passport_number: '',
  passport_expiry_date: '',
  insurance_status: '',
  insurance_member_number: '',
  notes: '',
};

export const saveDependentSchema = z.object({
  employeeId: z.string().uuid(),
  id: z.string().uuid().nullable(),
  values: dependentFormSchema,
});

/* ─── Insurance ──────────────────────────────────────────────────────────── */

export const insuranceFormSchema = z
  .object({
    dependent_id: uuidOrEmpty(),
    provider: text(150),
    policy_number: code(60),
    class: text(30),
    member_number: code(60),
    start_date: isoDate(),
    expiry_date: isoDate(),
    status: z.enum(INSURANCE_STATUSES),
  })
  .superRefine((v, ctx) => {
    if (!v.provider && !v.policy_number && !v.member_number) {
      ctx.addIssue({ code: 'custom', path: ['provider'], message: 'employees.validation.insuranceIdentity' });
    }
    if (v.start_date && v.expiry_date && v.expiry_date < v.start_date) {
      ctx.addIssue({ code: 'custom', path: ['expiry_date'], message: 'validation.endBeforeStart' });
    }
  });

export type InsuranceFormValues = z.infer<typeof insuranceFormSchema>;

export const EMPTY_INSURANCE_FORM: InsuranceFormValues = {
  dependent_id: '',
  provider: '',
  policy_number: '',
  class: '',
  member_number: '',
  start_date: '',
  expiry_date: '',
  status: 'active',
};

export const saveInsuranceSchema = z.object({
  employeeId: z.string().uuid(),
  id: z.string().uuid().nullable(),
  values: insuranceFormSchema,
});

export const deleteChildSchema = z.object({ employeeId: z.string().uuid(), id: z.string().uuid() });

/** '' → null for DB writes (strings are already trimmed by the schema). */
export function toNullable(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

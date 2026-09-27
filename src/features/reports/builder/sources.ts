import {
  AwardIcon,
  CalendarRangeIcon,
  FolderOpenIcon,
  HeartHandshakeIcon,
  InboxIcon,
  ShieldPlusIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import type { StatusDomain } from '@/components/shared/status-badge';
import { can, type Permission, type PermissionSubject } from '@/lib/permissions';

/**
 * Custom report builder — whitelisted data sources and fields (isomorphic metadata). The server
 * maps each field key to a fixed PostgREST select/filter path (`builder/server.ts`); client input
 * is only ever a field key, an operator from the fixed list and a validated value.
 */

export const BUILDER_SOURCES = [
  'employees',
  'requests',
  'leave_balances',
  'leave_requests',
  'documents',
  'certificates',
  'dependents',
  'insurance',
] as const;
export type BuilderSourceKey = (typeof BUILDER_SOURCES)[number];

export type BuilderFieldType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'enum' | 'status' | 'reference';
export type FilterKind = 'text' | 'number' | 'date' | 'options' | 'boolean';
export type ReferenceList = 'departments' | 'jobTitles' | 'locations' | 'leaveTypes' | 'requestTypes';

export type BuilderField = {
  key: string;
  type: BuilderFieldType;
  /** i18n key: `reports.builder.fields.<labelId>`. */
  labelId: string;
  enumKey?: string;
  statusDomain?: StatusDomain;
  /** Allowed values for enum/status filters. */
  values?: readonly string[];
  /** Option list for reference filters. */
  reference?: ReferenceList;
  /** Filter kind (omitted → not filterable). */
  filter?: FilterKind;
  sortable?: boolean;
  /** Usable as the report's date-range column. */
  dateRange?: boolean;
  /** Extra permission needed to see this field. */
  permission?: Permission;
  /** Pre-selected when the source is chosen. */
  preset?: boolean;
  /** Numbers shown without grouping (years). */
  plain?: boolean;
  /** Picker grouping. */
  section: 'record' | 'employee' | 'personal' | 'compensation' | 'dates';
};

export type BuilderSourceDef = {
  key: BuilderSourceKey;
  icon: LucideIcon;
  /** Module permission to use the source (RLS decides the rows). */
  permission: Permission;
  fields: readonly BuilderField[];
  defaultSort: string;
  defaultDateField?: string;
};

export const OPERATORS: Record<FilterKind, readonly string[]> = {
  text: ['contains', 'equals', 'notEquals', 'startsWith', 'isEmpty', 'isNotEmpty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  date: ['on', 'before', 'after', 'isEmpty', 'isNotEmpty'],
  options: ['in', 'notIn', 'isEmpty', 'isNotEmpty'],
  boolean: ['isTrue', 'isFalse'],
};

/** Operators that take no value. */
export const VALUELESS_OPERATORS = new Set(['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse']);

export function filterKindOf(field: BuilderField): FilterKind | null {
  return field.filter ?? null;
}

const EMPLOYMENT_STATUSES = ['active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated'];
const REQUEST_STATUSES = [
  'submitted',
  'pending_manager_approval',
  'pending_hr_review',
  'returned',
  'approved',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
];

type FieldInit = Omit<BuilderField, 'key' | 'type' | 'labelId' | 'section'> & {
  labelId?: string;
  section?: BuilderField['section'];
};
const f = (key: string, type: BuilderFieldType, init: FieldInit = {}): BuilderField => ({
  ...init,
  key,
  type,
  labelId: init.labelId ?? key,
  section: init.section ?? 'record',
  sortable: init.sortable ?? true,
});

/* Employee sub-fields shared by employee-owned sources. */
const OWNER_FIELDS: BuilderField[] = [
  f('employee', 'text', { section: 'employee', preset: true, sortable: true }),
  f('employeeNumber', 'text', {
    section: 'employee',
    filter: 'text',
    preset: true,
  }),
  f('department', 'reference', {
    section: 'employee',
    reference: 'departments',
    filter: 'options',
    sortable: false,
  }),
];

const PERSONAL: Permission = 'personal_data.view';
const BANK: Permission = 'bank.view';

export const BUILDER_SOURCE_DEFS: readonly BuilderSourceDef[] = [
  {
    key: 'employees',
    icon: UsersIcon,
    permission: 'employees.view',
    defaultSort: 'nameEn',
    defaultDateField: 'joiningDate',
    fields: [
      f('employeeNumber', 'text', { filter: 'text', preset: true }),
      f('nameAr', 'text', { filter: 'text', preset: true }),
      f('nameEn', 'text', { filter: 'text', preset: true }),
      f('department', 'reference', {
        reference: 'departments',
        filter: 'options',
        preset: true,
      }),
      f('jobTitle', 'reference', {
        reference: 'jobTitles',
        filter: 'options',
        preset: true,
      }),
      f('location', 'reference', { reference: 'locations', filter: 'options' }),
      f('costCenter', 'text', { sortable: false }),
      f('manager', 'text'),
      f('grade', 'text', { filter: 'text' }),
      f('division', 'text', { filter: 'text' }),
      f('section', 'text', { filter: 'text' }),
      f('employmentType', 'enum', {
        enumKey: 'employmentType',
        values: ['full_time', 'part_time', 'contract', 'temporary', 'intern'],
        filter: 'options',
      }),
      f('employmentStatus', 'status', {
        statusDomain: 'employment',
        values: EMPLOYMENT_STATUSES,
        filter: 'options',
        preset: true,
      }),
      f('nationality', 'text', { filter: 'text' }),
      f('gender', 'enum', {
        enumKey: 'gender',
        values: ['male', 'female'],
        filter: 'options',
      }),
      f('companyEmail', 'text', { filter: 'text' }),
      f('mobile', 'text', { filter: 'text' }),
      f('joiningDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('probationEndDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('contractStartDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('contractEndDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('terminationDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('dateOfBirth', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'personal',
        permission: PERSONAL,
      }),
      f('maritalStatus', 'enum', {
        enumKey: 'maritalStatus',
        values: ['single', 'married', 'divorced', 'widowed'],
        filter: 'options',
        section: 'personal',
        permission: PERSONAL,
      }),
      f('personalEmail', 'text', {
        filter: 'text',
        section: 'personal',
        permission: PERSONAL,
      }),
      f('idType', 'enum', {
        enumKey: 'idType',
        values: ['iqama', 'national_id'],
        filter: 'options',
        section: 'personal',
        permission: PERSONAL,
      }),
      f('nationalId', 'text', {
        filter: 'text',
        section: 'personal',
        permission: PERSONAL,
      }),
      f('iqamaExpiryDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'personal',
        permission: PERSONAL,
      }),
      f('passportNumber', 'text', {
        filter: 'text',
        section: 'personal',
        permission: PERSONAL,
      }),
      f('passportExpiryDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'personal',
        permission: PERSONAL,
      }),
      f('basicSalary', 'number', {
        section: 'compensation',
        permission: BANK,
        sortable: false,
      }),
      f('housingAllowance', 'number', {
        section: 'compensation',
        permission: BANK,
        sortable: false,
      }),
      f('transportAllowance', 'number', {
        section: 'compensation',
        permission: BANK,
        sortable: false,
      }),
      f('otherAllowance', 'number', {
        section: 'compensation',
        permission: BANK,
        sortable: false,
      }),
      f('totalSalary', 'number', {
        section: 'compensation',
        permission: BANK,
        sortable: false,
      }),
      f('bankName', 'text', {
        section: 'compensation',
        permission: BANK,
        sortable: false,
      }),
      f('iban', 'text', {
        section: 'compensation',
        permission: BANK,
        sortable: false,
      }),
    ],
  },
  {
    key: 'requests',
    icon: InboxIcon,
    permission: 'requests.view',
    defaultSort: 'submittedAt',
    defaultDateField: 'submittedAt',
    fields: [
      f('requestNumber', 'text', { filter: 'text', preset: true }),
      f('requestType', 'reference', {
        reference: 'requestTypes',
        filter: 'options',
        preset: true,
      }),
      f('title', 'text', { filter: 'text' }),
      f('requestStatus', 'status', {
        statusDomain: 'request',
        values: REQUEST_STATUSES,
        filter: 'options',
        preset: true,
      }),
      f('priority', 'enum', {
        enumKey: 'priority',
        values: ['low', 'normal', 'high', 'urgent'],
        filter: 'options',
      }),
      f('currentStep', 'enum', {
        enumKey: 'stepType',
        values: ['manager', 'hr', 'role', 'user'],
        filter: 'options',
      }),
      ...OWNER_FIELDS,
      f('submittedAt', 'datetime', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('dueAt', 'datetime', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('completedAt', 'datetime', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('cancelledAt', 'datetime', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('createdAt', 'datetime', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
    ],
  },
  {
    key: 'leave_balances',
    icon: WalletIcon,
    permission: 'leave.view',
    defaultSort: 'year',
    fields: [
      ...OWNER_FIELDS,
      f('leaveType', 'reference', {
        reference: 'leaveTypes',
        filter: 'options',
        preset: true,
      }),
      f('year', 'number', { plain: true, filter: 'number', preset: true }),
      f('openingBalance', 'number', { filter: 'number' }),
      f('entitlement', 'number', { filter: 'number', preset: true }),
      f('adjustment', 'number', { filter: 'number' }),
      f('used', 'number', { filter: 'number', preset: true }),
      f('pending', 'number', { filter: 'number' }),
      f('remaining', 'number', { filter: 'number', preset: true }),
    ],
  },
  {
    key: 'leave_requests',
    icon: CalendarRangeIcon,
    permission: 'leave.view',
    defaultSort: 'startDate',
    defaultDateField: 'startDate',
    fields: [
      f('requestNumber', 'text', { preset: true, sortable: false }),
      ...OWNER_FIELDS,
      f('leaveType', 'reference', {
        reference: 'leaveTypes',
        filter: 'options',
        preset: true,
      }),
      f('startDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('endDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('returnDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('days', 'number', { filter: 'number', preset: true }),
      f('requestStatus', 'status', {
        statusDomain: 'request',
        values: REQUEST_STATUSES,
        filter: 'options',
        preset: true,
        sortable: false,
      }),
      f('balanceEffect', 'status', {
        statusDomain: 'leaveBalanceEffect',
        values: ['none', 'pending', 'used', 'reversed'],
        filter: 'options',
      }),
      f('year', 'number', { plain: true, filter: 'number' }),
    ],
  },
  {
    key: 'documents',
    icon: FolderOpenIcon,
    permission: 'documents.view',
    defaultSort: 'expiryDate',
    defaultDateField: 'expiryDate',
    fields: [
      ...OWNER_FIELDS,
      f('documentType', 'enum', {
        enumKey: 'documentType',
        values: [
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
        ],
        filter: 'options',
        preset: true,
      }),
      f('documentNumber', 'text', { filter: 'text' }),
      f('issueDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('expiryDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('documentStatus', 'status', {
        statusDomain: 'document',
        values: ['valid', 'expired', 'pending_review', 'rejected', 'archived'],
        filter: 'options',
        preset: true,
      }),
      f('fileName', 'text', { filter: 'text' }),
      f('isConfidential', 'boolean', { filter: 'boolean' }),
      f('uploadedAt', 'datetime', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
    ],
  },
  {
    key: 'certificates',
    icon: AwardIcon,
    permission: 'certificates.view',
    defaultSort: 'issueDate',
    defaultDateField: 'issueDate',
    fields: [
      f('certificateNumber', 'text', { filter: 'text', preset: true }),
      ...OWNER_FIELDS,
      f('certificateType', 'enum', {
        enumKey: 'certificateType',
        values: ['salary', 'employment', 'salary_employment', 'experience', 'custom'],
        filter: 'options',
        preset: true,
      }),
      f('language', 'enum', {
        enumKey: 'certificateLanguage',
        values: ['ar', 'en', 'bilingual'],
        filter: 'options',
      }),
      f('issueDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('certificateStatus', 'status', {
        statusDomain: 'certificate',
        values: ['valid', 'revoked'],
        filter: 'options',
        preset: true,
      }),
      f('addressedTo', 'text', { filter: 'text' }),
      f('purpose', 'text', { filter: 'text' }),
      f('revokedAt', 'datetime', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
    ],
  },
  {
    key: 'dependents',
    icon: HeartHandshakeIcon,
    permission: 'personal_data.view',
    defaultSort: 'dependentNameEn',
    fields: [
      ...OWNER_FIELDS,
      f('dependentNameAr', 'text', { filter: 'text', preset: true }),
      f('dependentNameEn', 'text', { filter: 'text', preset: true }),
      f('relationship', 'enum', {
        enumKey: 'relationship',
        values: ['spouse', 'son', 'daughter', 'father', 'mother', 'other'],
        filter: 'options',
        preset: true,
      }),
      f('dateOfBirth', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('nationality', 'text', { filter: 'text' }),
      f('nationalId', 'text', { filter: 'text' }),
      f('iqamaExpiryDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('passportNumber', 'text', { filter: 'text' }),
      f('passportExpiryDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('insuranceStatus', 'enum', {
        enumKey: 'insuranceStatus',
        values: ['insured', 'not_insured', 'pending'],
        filter: 'options',
        preset: true,
      }),
      f('insuranceMemberNumber', 'text', { filter: 'text' }),
    ],
  },
  {
    key: 'insurance',
    icon: ShieldPlusIcon,
    permission: 'insurance.view',
    defaultSort: 'expiryDate',
    defaultDateField: 'expiryDate',
    fields: [
      ...OWNER_FIELDS,
      f('insuredDependent', 'text', { sortable: false }),
      f('provider', 'text', { filter: 'text', preset: true }),
      f('policyNumber', 'text', { filter: 'text' }),
      f('insuranceClass', 'text', { filter: 'text', preset: true }),
      f('memberNumber', 'text', { filter: 'text', preset: true }),
      f('startDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
      }),
      f('expiryDate', 'date', {
        filter: 'date',
        dateRange: true,
        section: 'dates',
        preset: true,
      }),
      f('insuranceStatus', 'status', {
        labelId: 'policyStatus',
        statusDomain: 'insurance',
        values: ['active', 'expired', 'pending', 'cancelled'],
        filter: 'options',
        preset: true,
      }),
    ],
  },
];

const SOURCE_BY_KEY = new Map(BUILDER_SOURCE_DEFS.map((s) => [s.key, s]));

export function getBuilderSource(key: string): BuilderSourceDef | null {
  return SOURCE_BY_KEY.get(key as BuilderSourceKey) ?? null;
}

export function canUseSource(subject: PermissionSubject | null | undefined, source: BuilderSourceDef): boolean {
  return can(subject, source.permission);
}

export function canUseField(subject: PermissionSubject | null | undefined, field: BuilderField): boolean {
  return !field.permission || can(subject, field.permission);
}

/** Fields of a source the user may see. */
export function visibleFields(subject: PermissionSubject | null | undefined, source: BuilderSourceDef): BuilderField[] {
  return source.fields.filter((fld) => canUseField(subject, fld));
}

/* ─── Config (URL-safe) ─────────────────────────────────────────────────── */

export type BuilderFilter = {
  field: string;
  op: string;
  value?: string | string[] | null;
};

export type BuilderConfig = {
  source: BuilderSourceKey;
  columns: string[];
  filters: BuilderFilter[];
  sort: { field: string; dir: 'asc' | 'desc' } | null;
  dateField: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export const BUILDER_LIMITS = {
  columns: 40,
  filters: 12,
  previewRows: 50,
  valueLength: 200,
  listValues: 100,
} as const;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Compact URL encoding of a builder config (`?cfg=`); no commas, so it survives list-param parsing. */
export function encodeBuilderConfig(config: BuilderConfig): string {
  return toBase64Url(JSON.stringify(config));
}

/** Decodes `?cfg=`; returns null when malformed (structure is validated separately). */
export function decodeBuilderConfig(value: string | null | undefined): unknown {
  if (!value || value.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return JSON.parse(fromBase64Url(value));
  } catch {
    return null;
  }
}

export function defaultBuilderConfig(subject: PermissionSubject | null | undefined, source: BuilderSourceDef): BuilderConfig {
  const fields = visibleFields(subject, source);
  return {
    source: source.key,
    columns: fields.filter((x) => x.preset).map((x) => x.key),
    filters: [],
    sort: {
      field: source.defaultSort,
      dir: source.key === 'employees' || source.key === 'dependents' ? 'asc' : 'desc',
    },
    dateField: source.defaultDateField ?? null,
    dateFrom: null,
    dateTo: null,
  };
}

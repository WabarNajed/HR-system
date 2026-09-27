import 'server-only';

import { z } from 'zod';
import { ActionError } from '@/lib/action';
import type { SessionContext } from '@/lib/auth/session';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { toIlikePattern } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import {
  BUILDER_LIMITS,
  BUILDER_SOURCES,
  OPERATORS,
  VALUELESS_OPERATORS,
  canUseField,
  canUseSource,
  getBuilderSource,
  type BuilderConfig,
  type BuilderField,
  type BuilderSourceDef,
  type BuilderSourceKey,
} from './sources';

/**
 * Report builder — server side. Field keys map to FIXED PostgREST select / filter / order paths
 * below; nothing from the client is interpolated except validated values passed as parameters to
 * the query builder. Rows come from the caller's RLS client, and fields behind extra permissions
 * (personal data, compensation/bank) are rejected unless the caller holds them.
 */

type Row = Record<string, unknown>;
type Embed = { alias: string; rel: string; cols: string[] };
type FieldImpl = {
  select: (string | Embed)[];
  get: (row: Row, locale: Locale) => unknown;
  /** Filter column path (base column or `embed.column`). */
  filterCol?: string;
  /** Order expression (base column or `embed(column)`), may depend on the locale. */
  sortCol?: string | ((locale: Locale) => string);
};

type Named = { name_ar?: string | null; name_en?: string | null } | null | undefined;

const col = (name: string, opts: { filter?: boolean; sort?: boolean } = {}): FieldImpl => ({
  select: [name],
  get: (row) => row[name] ?? null,
  filterCol: opts.filter === false ? undefined : name,
  sortCol: opts.sort === false ? undefined : name,
});

const named = (alias: string, rel: string, fkCol?: string): FieldImpl => ({
  select: [{ alias, rel, cols: ['name_ar', 'name_en'] }],
  get: (row, locale) => {
    const v = row[alias] as Named;
    return v ? localized(v, 'name', locale) || null : null;
  },
  filterCol: fkCol,
  sortCol: (locale) => `${alias}(name_${locale})`,
});

/* Employee owner embed (employee-owned sources). */
const OWNER: Embed = {
  alias: 'employee',
  rel: 'employees!inner',
  cols: ['name_ar', 'name_en', 'employee_number', 'department:department_id(name_ar,name_en)'],
};

const ownerFields: Record<string, FieldImpl> = {
  employee: {
    select: [OWNER],
    get: (row, locale) => {
      const e = row.employee as Named;
      return e ? employeeDisplayName(e, locale) || null : null;
    },
    sortCol: (locale) => `employee(name_${locale})`,
  },
  employeeNumber: {
    select: [OWNER],
    get: (row) => (row.employee as { employee_number?: string | null } | null)?.employee_number ?? null,
    filterCol: 'employee.employee_number',
    sortCol: 'employee(employee_number)',
  },
  department: {
    select: [OWNER],
    get: (row, locale) => {
      const d = (row.employee as { department?: Named } | null)?.department;
      return d ? localized(d, 'name', locale) || null : null;
    },
    filterCol: 'employee.department_id',
  },
};

type SourceImpl = {
  table: string;
  fields: Record<string, FieldImpl>;
  /** Fixed constraints (never user-controlled). */
  base: (q: LooseQuery) => LooseQuery;
  rowId: string;
};

const SOURCE_IMPLS: Record<BuilderSourceKey, SourceImpl> = {
  employees: {
    table: 'employees',
    rowId: 'id',
    base: (q) => q.is('archived_at', null),
    fields: {
      employeeNumber: col('employee_number'),
      nameAr: col('name_ar'),
      nameEn: col('name_en'),
      department: named('department', 'department_id', 'department_id'),
      jobTitle: named('job_title', 'job_title_id', 'job_title_id'),
      location: named('location', 'location_id', 'location_id'),
      costCenter: {
        ...named('cost_center', 'cost_center_id'),
        sortCol: undefined,
      },
      manager: {
        select: [{ alias: 'manager', rel: 'manager_id', cols: ['name_ar', 'name_en'] }],
        get: (row, locale) => {
          const m = row.manager as Named;
          return m ? employeeDisplayName(m, locale) || null : null;
        },
        sortCol: (locale) => `manager(name_${locale})`,
      },
      grade: col('grade'),
      division: col('division'),
      section: col('section'),
      employmentType: col('employment_type'),
      employmentStatus: col('employment_status'),
      nationality: col('nationality'),
      gender: col('gender'),
      companyEmail: col('company_email'),
      mobile: col('mobile'),
      joiningDate: col('joining_date'),
      probationEndDate: col('probation_end_date'),
      contractStartDate: col('contract_start_date'),
      contractEndDate: col('contract_end_date'),
      terminationDate: col('termination_date'),
      dateOfBirth: col('date_of_birth'),
      maritalStatus: col('marital_status'),
      personalEmail: col('personal_email'),
      idType: col('id_type'),
      nationalId: col('national_id'),
      iqamaExpiryDate: col('iqama_expiry_date'),
      passportNumber: col('passport_number'),
      passportExpiryDate: col('passport_expiry_date'),
      ...Object.fromEntries(
        (
          [
            ['basicSalary', 'basic_salary'],
            ['housingAllowance', 'housing_allowance'],
            ['transportAllowance', 'transport_allowance'],
            ['otherAllowance', 'other_allowance'],
            ['totalSalary', 'total_salary'],
          ] as const
        ).map(([key, column]) => [
          key,
          {
            select: [
              {
                alias: 'compensation',
                rel: 'employee_compensation',
                cols: [column],
              },
            ],
            get: (row: Row) => {
              const c = row.compensation as Record<string, unknown> | Record<string, unknown>[] | null;
              const obj = Array.isArray(c) ? c[0] : c;
              const v = obj?.[column];
              return v === null || v === undefined ? null : Number(v);
            },
          } satisfies FieldImpl,
        ]),
      ),
      ...Object.fromEntries(
        (
          [
            ['bankName', 'bank_name'],
            ['iban', 'iban'],
          ] as const
        ).map(([key, column]) => [
          key,
          {
            select: [
              {
                alias: 'bank',
                rel: 'employee_bank_accounts',
                cols: ['bank_name', 'iban', 'is_primary'],
              },
            ],
            get: (row: Row) => {
              const list = (row.bank as Array<Record<string, unknown>> | null) ?? [];
              const primary = list.find((b) => b.is_primary) ?? list[0];
              return (primary?.[column] as string | undefined) ?? null;
            },
          } satisfies FieldImpl,
        ]),
      ),
    },
  },
  requests: {
    table: 'hr_requests',
    rowId: 'id',
    base: (q) => q.neq('status', 'draft').is('employee.archived_at', null),
    fields: {
      requestNumber: col('request_number'),
      requestType: named('request_type', 'request_types', 'request_type_id'),
      title: col('title'),
      requestStatus: col('status'),
      priority: col('priority'),
      currentStep: col('current_step_type'),
      ...ownerFields,
      submittedAt: col('submitted_at'),
      dueAt: col('due_at'),
      completedAt: col('completed_at'),
      cancelledAt: col('cancelled_at'),
      createdAt: col('created_at'),
    },
  },
  leave_balances: {
    table: 'leave_balances',
    rowId: 'id',
    base: (q) => q.is('employee.archived_at', null),
    fields: {
      ...ownerFields,
      leaveType: named('leave_type', 'leave_types', 'leave_type_id'),
      year: col('year'),
      openingBalance: col('opening_balance'),
      entitlement: col('entitlement'),
      adjustment: col('adjustment'),
      used: col('used'),
      pending: col('pending'),
      remaining: col('remaining'),
    },
  },
  leave_requests: {
    table: 'leave_requests',
    rowId: 'id',
    base: (q) => q.neq('request.status', 'draft').is('employee.archived_at', null),
    fields: {
      requestNumber: {
        select: [
          {
            alias: 'request',
            rel: 'hr_requests!inner',
            cols: ['request_number', 'status'],
          },
        ],
        get: (row) => (row.request as { request_number?: string | null } | null)?.request_number ?? null,
      },
      ...ownerFields,
      leaveType: named('leave_type', 'leave_types', 'leave_type_id'),
      startDate: col('start_date'),
      endDate: col('end_date'),
      returnDate: col('return_date'),
      days: col('days'),
      requestStatus: {
        select: [
          {
            alias: 'request',
            rel: 'hr_requests!inner',
            cols: ['request_number', 'status'],
          },
        ],
        get: (row) => (row.request as { status?: string | null } | null)?.status ?? null,
        filterCol: 'request.status',
      },
      balanceEffect: col('balance_effect'),
      year: col('year'),
    },
  },
  documents: {
    table: 'employee_documents',
    rowId: 'id',
    base: (q) => q.is('employee.archived_at', null),
    fields: {
      ...ownerFields,
      documentType: col('document_type'),
      documentNumber: col('document_number'),
      issueDate: col('issue_date'),
      expiryDate: col('expiry_date'),
      documentStatus: col('status'),
      fileName: col('file_name'),
      isConfidential: col('is_confidential'),
      uploadedAt: col('created_at'),
    },
  },
  certificates: {
    table: 'certificates',
    rowId: 'id',
    base: (q) => q.is('employee.archived_at', null),
    fields: {
      certificateNumber: col('certificate_number'),
      ...ownerFields,
      certificateType: col('certificate_type'),
      language: col('language'),
      issueDate: col('issue_date'),
      certificateStatus: col('status'),
      addressedTo: col('addressed_to'),
      purpose: col('purpose'),
      revokedAt: col('revoked_at'),
    },
  },
  dependents: {
    table: 'employee_dependents',
    rowId: 'id',
    base: (q) => q.is('employee.archived_at', null),
    fields: {
      ...ownerFields,
      dependentNameAr: col('name_ar'),
      dependentNameEn: col('name_en'),
      relationship: col('relationship'),
      dateOfBirth: col('date_of_birth'),
      nationality: col('nationality'),
      nationalId: col('national_id'),
      iqamaExpiryDate: col('iqama_expiry_date'),
      passportNumber: col('passport_number'),
      passportExpiryDate: col('passport_expiry_date'),
      insuranceStatus: col('insurance_status'),
      insuranceMemberNumber: col('insurance_member_number'),
    },
  },
  insurance: {
    table: 'employee_insurance',
    rowId: 'id',
    base: (q) => q.is('employee.archived_at', null),
    fields: {
      ...ownerFields,
      insuredDependent: {
        select: [
          {
            alias: 'dependent',
            rel: 'employee_dependents',
            cols: ['name_ar', 'name_en'],
          },
        ],
        get: (row, locale) => {
          const d = row.dependent as Named;
          return d ? employeeDisplayName(d, locale) || null : null;
        },
      },
      provider: col('provider'),
      policyNumber: col('policy_number'),
      insuranceClass: col('class'),
      memberNumber: col('member_number'),
      startDate: col('start_date'),
      expiryDate: col('expiry_date'),
      insuranceStatus: col('status'),
    },
  },
};

// Every whitelisted field needs an implementation (fails fast on drift).
for (const key of BUILDER_SOURCES) {
  const def = getBuilderSource(key)!;
  for (const field of def.fields) {
    if (!SOURCE_IMPLS[key].fields[field.key]) throw new Error(`[report-builder] no implementation for ${key}.${field.key}`);
  }
}

/* ─── Validation ─────────────────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const builderConfigSchema = z.object({
  source: z.enum(BUILDER_SOURCES),
  columns: z.array(z.string().max(64)).min(1).max(BUILDER_LIMITS.columns),
  filters: z
    .array(
      z.object({
        field: z.string().max(64),
        op: z.string().max(32),
        value: z
          .union([
            z.string().max(BUILDER_LIMITS.valueLength),
            z.array(z.string().max(BUILDER_LIMITS.valueLength)).max(BUILDER_LIMITS.listValues),
          ])
          .nullish(),
      }),
    )
    .max(BUILDER_LIMITS.filters),
  sort: z.object({ field: z.string().max(64), dir: z.enum(['asc', 'desc']) }).nullable(),
  dateField: z.string().max(64).nullable(),
  dateFrom: z.string().regex(ISO_DATE).nullable(),
  dateTo: z.string().regex(ISO_DATE).nullable(),
});

export type ValidatedBuilder = {
  config: BuilderConfig;
  source: BuilderSourceDef;
  fields: BuilderField[];
};

function fieldOf(source: BuilderSourceDef, key: string): BuilderField {
  const field = source.fields.find((x) => x.key === key);
  if (!field) throw new ActionError('errors.validation');
  return field;
}

/**
 * Structural + permission validation. Throws `ActionError('errors.validation' | 'errors.forbidden')`.
 */
export function validateBuilderConfig(raw: unknown, ctx: SessionContext): ValidatedBuilder {
  const parsed = builderConfigSchema.safeParse(raw);
  if (!parsed.success) throw new ActionError('errors.validation');
  const config = parsed.data as BuilderConfig;
  const source = getBuilderSource(config.source);
  if (!source) throw new ActionError('errors.validation');
  if (!canUseSource(ctx, source)) throw new ActionError('errors.forbidden');

  const columns = Array.from(new Set(config.columns));
  const fields = columns.map((key) => fieldOf(source, key));
  const check = (field: BuilderField) => {
    if (!canUseField(ctx, field)) throw new ActionError('errors.forbidden');
  };
  fields.forEach(check);

  for (const flt of config.filters) {
    const field = fieldOf(source, flt.field);
    check(field);
    const kind = field.filter;
    if (!kind || !OPERATORS[kind].includes(flt.op)) throw new ActionError('errors.validation');
    if (VALUELESS_OPERATORS.has(flt.op)) continue;
    const value = flt.value;
    if (kind === 'options') {
      const list = Array.isArray(value) ? value : value ? [value] : [];
      if (!list.length) throw new ActionError('errors.validation');
      if (field.type === 'reference' ? list.some((v) => !UUID.test(v)) : list.some((v) => !field.values?.includes(v))) {
        throw new ActionError('errors.validation');
      }
    } else if (typeof value !== 'string' || !value.trim()) {
      throw new ActionError('errors.validation');
    } else if (kind === 'number' && !Number.isFinite(Number(value))) {
      throw new ActionError('errors.validation');
    } else if (kind === 'date' && !ISO_DATE.test(value)) {
      throw new ActionError('errors.validation');
    }
  }

  if (config.sort) {
    const field = fieldOf(source, config.sort.field);
    check(field);
    if (!field.sortable || !SOURCE_IMPLS[source.key].fields[field.key]?.sortCol) config.sort = null;
  }
  if (config.dateField) {
    const field = fieldOf(source, config.dateField);
    check(field);
    if (!field.dateRange) throw new ActionError('errors.validation');
  }
  if (config.dateFrom && config.dateTo && config.dateFrom > config.dateTo)
    [config.dateFrom, config.dateTo] = [config.dateTo, config.dateFrom];

  return { config: { ...config, columns }, source, fields };
}

/* ─── Query ──────────────────────────────────────────────────────────────── */

type LooseQuery = {
  select: (cols: string, opts?: { count?: 'exact' }) => LooseQuery;
  is: (col: string, value: null | boolean) => LooseQuery;
  not: (col: string, op: string, value: unknown) => LooseQuery;
  eq: (col: string, value: unknown) => LooseQuery;
  neq: (col: string, value: unknown) => LooseQuery;
  gt: (col: string, value: unknown) => LooseQuery;
  gte: (col: string, value: unknown) => LooseQuery;
  lt: (col: string, value: unknown) => LooseQuery;
  lte: (col: string, value: unknown) => LooseQuery;
  in: (col: string, values: unknown[]) => LooseQuery;
  ilike: (col: string, pattern: string) => LooseQuery;
  order: (col: string, opts: { ascending: boolean; nullsFirst?: boolean }) => LooseQuery;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null;
    error: unknown;
    count: number | null;
  }>;
};

/** Org-local (Asia/Riyadh by default) day boundary as an ISO timestamp for timestamptz filters. */
function dayStart(iso: string, timeZone = 'Asia/Riyadh'): string {
  const probe = new Date(`${iso}T12:00:00Z`);
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = tzName && /GMT[+-]\d{2}:\d{2}/.test(tzName) ? tzName.replace('GMT', '') : '+00:00';
  return `${iso}T00:00:00${offset}`;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function selectString(impls: FieldImpl[], rowId: string): string {
  const base = new Set<string>([rowId]);
  const embeds = new Map<string, { rel: string; cols: Set<string> }>();
  for (const impl of impls) {
    for (const part of impl.select) {
      if (typeof part === 'string') base.add(part);
      else {
        const e = embeds.get(part.alias) ?? {
          rel: part.rel,
          cols: new Set<string>(),
        };
        part.cols.forEach((c) => e.cols.add(c));
        embeds.set(part.alias, e);
      }
    }
  }
  return [...base, ...Array.from(embeds, ([alias, e]) => `${alias}:${e.rel}(${Array.from(e.cols).join(',')})`)].join(',');
}

function applyFilter(
  q: LooseQuery,
  field: BuilderField,
  impl: FieldImpl,
  op: string,
  value: string | string[] | null | undefined,
): LooseQuery {
  const path = impl.filterCol;
  if (!path) throw new ActionError('errors.validation');
  const v = Array.isArray(value) ? value : (value ?? '');
  const isDateTime = field.type === 'datetime';
  switch (op) {
    case 'isEmpty':
      return q.is(path, null);
    case 'isNotEmpty':
      return q.not(path, 'is', null);
    case 'isTrue':
      return q.eq(path, true);
    case 'isFalse':
      return q.eq(path, false);
    case 'contains':
      return q.ilike(path, toIlikePattern(String(v)));
    case 'startsWith':
      return q.ilike(path, `${toIlikePattern(String(v)).slice(1)}`);
    case 'equals':
      return q.eq(path, String(v));
    case 'notEquals':
      return q.neq(path, String(v));
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return q[op](path, Number(v));
    case 'on':
      return isDateTime ? q.gte(path, dayStart(String(v))).lt(path, dayStart(nextDay(String(v)))) : q.eq(path, String(v));
    case 'before':
      return q.lt(path, isDateTime ? dayStart(String(v)) : String(v));
    case 'after':
      return isDateTime ? q.gte(path, dayStart(nextDay(String(v)))) : q.gt(path, String(v));
    case 'in':
      return q.in(path, Array.isArray(v) ? v : [v]);
    case 'notIn':
      return q.not(path, 'in', `(${(Array.isArray(v) ? v : [v]).join(',')})`);
    default:
      throw new ActionError('errors.validation');
  }
}

function buildQuery(supabase: ServerSupabaseClient, validated: ValidatedBuilder, locale: Locale, count: boolean): LooseQuery {
  const { config, source, fields } = validated;
  const impl = SOURCE_IMPLS[source.key];
  const used = new Map<string, FieldImpl>();
  for (const field of fields) used.set(field.key, impl.fields[field.key]!);
  // Filters/sort/date on embedded paths need their embed in the select (inner joins apply).
  for (const flt of config.filters) used.set(flt.field, impl.fields[flt.field]!);
  if (source.key !== 'employees') used.set('employee', impl.fields.employee!);
  if (source.key === 'leave_requests') used.set('requestNumber', impl.fields.requestNumber!);

  const from = supabase.from as unknown as (table: string) => LooseQuery;
  let q = from
    .call(supabase, impl.table)
    .select(selectString(Array.from(used.values()), impl.rowId), count ? { count: 'exact' } : undefined);
  q = impl.base(q);

  for (const flt of config.filters) {
    const field = fieldOf(source, flt.field);
    q = applyFilter(q, field, impl.fields[field.key]!, flt.op, flt.value);
  }

  if (config.dateField && (config.dateFrom || config.dateTo)) {
    const field = fieldOf(source, config.dateField);
    const path = impl.fields[field.key]!.filterCol;
    if (path) {
      const dt = field.type === 'datetime';
      if (config.dateFrom) q = q.gte(path, dt ? dayStart(config.dateFrom) : config.dateFrom);
      if (config.dateTo) q = dt ? q.lt(path, dayStart(nextDay(config.dateTo))) : q.lte(path, config.dateTo);
    }
  }

  const sortImpl = config.sort ? impl.fields[config.sort.field] : undefined;
  const sortCol = sortImpl?.sortCol ? (typeof sortImpl.sortCol === 'function' ? sortImpl.sortCol(locale) : sortImpl.sortCol) : null;
  if (sortCol && config.sort)
    q = q.order(sortCol, {
      ascending: config.sort.dir === 'asc',
      nullsFirst: false,
    });
  q = q.order(impl.rowId, { ascending: true });
  return q;
}

/** Normalized row: `{ <fieldKey>: value }` with localized names resolved for `locale`. */
function project(rows: Row[], validated: ValidatedBuilder, locale: Locale): Row[] {
  const impl = SOURCE_IMPLS[validated.source.key];
  return rows.map((row) => {
    const out: Row = { __id: row[impl.rowId] };
    for (const field of validated.fields) {
      const v = impl.fields[field.key]!.get(row, locale);
      out[field.key] = field.type === 'number' && v !== null && v !== undefined ? Number(v) : v;
    }
    return out;
  });
}

export async function runBuilderQuery(
  supabase: ServerSupabaseClient,
  validated: ValidatedBuilder,
  locale: Locale,
  range: { from: number; to: number },
  count = false,
): Promise<{ rows: Row[]; total: number | null }> {
  const { data, error, count: total } = await buildQuery(supabase, validated, locale, count).range(range.from, range.to);
  if (error) throw error;
  return { rows: project(data ?? [], validated, locale), total: total ?? null };
}

/** All rows up to `limit` (exports), paged by 1000. */
export async function runBuilderQueryAll(
  supabase: ServerSupabaseClient,
  validated: ValidatedBuilder,
  locale: Locale,
  limit: number,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const to = Math.min(from + 1000, limit) - 1;
    const { rows } = await runBuilderQuery(supabase, validated, locale, {
      from,
      to,
    });
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

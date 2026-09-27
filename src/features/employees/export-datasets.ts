import type { SessionContext } from '@/lib/auth/session';
import { defineDataset, type AnyExportDataset, type ExportColumn, type ExportContext } from '@/lib/export/types';
import type { LooseTranslator } from '@/lib/i18n/translator';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { ListParams } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { DIRECTORY_FILTER_KEYS, DIRECTORY_SORTS, sanitizeFilter, type DirectoryFilterKey } from './directory-params';
import { applyDirectoryFilters, applyDirectorySort, fetchDirectoryIds, getViewer, type EmployeeViewer } from './queries';
import type { NamedRef } from './types';

/**
 * Export datasets of the employees module (`GET /api/export/<key>`), all honouring the directory's
 * search, filters and sort (same URL contract, `directory-params.ts`) and RLS:
 *
 *  - `employees`       Excel/CSV — every master field; identity documents with org `personal_data.view`,
 *                      salary and bank columns with org `bank.view`.
 *  - `employees_list`  PDF — the directory columns in a printable layout.
 *  - `dependents`      Excel/CSV/PDF — dependents of the filtered employees (org `personal_data.view`).
 *  - `insurance`       Excel/CSV/PDF — policies of the filtered employees (org `insurance.view`).
 */

// The export route calls fetchRows before columns with the same session object: remember the viewer's
// org-scoped permissions for that request so `columns()` (synchronous) can include sensitive columns.
const viewers = new WeakMap<SessionContext, EmployeeViewer>();

async function viewerFor(ctx: ExportContext): Promise<EmployeeViewer> {
  const cached = viewers.get(ctx.session);
  if (cached) return cached;
  const viewer = await getViewer(ctx.session);
  viewers.set(ctx.session, viewer);
  return viewer;
}

const orgCan = (ctx: ExportContext, permission: Parameters<EmployeeViewer['orgCan']>[0]) =>
  viewers.get(ctx.session)?.orgCan(permission) ?? false;

type EmployeeExportRow = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  company_email: string | null;
  personal_email: string | null;
  mobile: string | null;
  alt_mobile: string | null;
  gender: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  address: string | null;
  division: string | null;
  section: string | null;
  grade: string | null;
  employment_type: string | null;
  employment_status: string;
  joining_date: string | null;
  probation_end_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  termination_date: string | null;
  id_type: string | null;
  national_id: string | null;
  iqama_issue_date: string | null;
  iqama_expiry_date: string | null;
  iqama_expiry_hijri: string | null;
  iqama_profession: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
  employer_number: string | null;
  is_outside_kingdom: boolean | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_mobile: string | null;
  archived_at: string | null;
  department: NamedRef | null;
  job_title: NamedRef | null;
  location: NamedRef | null;
  cost_center: NamedRef | null;
  manager: { name_ar: string | null; name_en: string | null; employee_number: string | null } | null;
  portal: { status: string } | { status: string }[] | null;
  compensation?: {
    basic_salary: number;
    housing_allowance: number;
    transport_allowance: number;
    other_allowance: number;
    total_salary: number | null;
  } | null;
  bank?: { bank_name: string | null; iban: string | null; account_holder: string | null; is_primary: boolean }[] | null;
};

const EMBEDS =
  'department:departments!department_id(id, name_ar, name_en), job_title:job_titles!job_title_id(id, name_ar, name_en), ' +
  'location:locations!location_id(id, name_ar, name_en), cost_center:cost_centers!cost_center_id(id, name_ar, name_en), ' +
  'manager:manager_id(name_ar, name_en, employee_number), portal:profiles!profiles_employee_id_fkey(status)';

const tr = (t: LooseTranslator, key: string, value: string | null | undefined) => {
  if (!value) return '';
  const k = `${key}.${value}`;
  return t.has(k) ? t(k) : value;
};

const named = (row: NamedRef | null, t: LooseTranslator) => (row ? localized(row, 'name', t.locale) : '');

function describeDirectoryFilters(params: ListParams, t: LooseTranslator): string[] {
  const out: string[] = [];
  const f = (key: DirectoryFilterKey) => sanitizeFilter(key, params.filters[key]);
  const status = f('status');
  if (status.length) {
    out.push(
      t('employees.export.filter', {
        name: t('employees.filters.status'),
        value: status.map((s) => tr(t, 'statuses.employment', s)).join(t.locale === 'ar' ? '، ' : ', '),
      }),
    );
  }
  const types = f('employmentType');
  if (types.length) {
    out.push(
      t('employees.export.filter', {
        name: t('employees.filters.employmentType'),
        value: types.map((s) => tr(t, 'enums.employmentType', s)).join(t.locale === 'ar' ? '، ' : ', '),
      }),
    );
  }
  const nationality = f('nationality');
  if (nationality.length) out.push(t('employees.export.filter', { name: t('employees.filters.nationality'), value: nationality.join(', ') }));
  const [iqama] = f('iqama');
  if (iqama) out.push(t('employees.export.filter', { name: t('employees.filters.iqamaExpiry'), value: tr(t, 'enums.expiryBucket', iqama) }));
  const [portal] = f('portal');
  if (portal) {
    out.push(
      t('employees.export.filter', {
        name: t('employees.filters.portalAccess'),
        value: portal === 'with' ? t('employees.filters.withPortal') : t('employees.filters.withoutPortal'),
      }),
    );
  }
  const [archived] = f('archived');
  if (archived === 'include') out.push(t('employees.export.archivedIncluded'));
  if (archived === 'only') out.push(t('employees.export.archivedOnly'));
  return out;
}

async function fetchEmployees(
  supabase: ServerSupabaseClient,
  params: ListParams,
  ctx: ExportContext & { limit: number },
  select: string,
): Promise<EmployeeExportRow[]> {
  const viewer = await viewerFor(ctx);
  const rows: EmployeeExportRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < ctx.limit; from += pageSize) {
    let query = supabase.from('employees').select(select);
    query = applyDirectoryFilters(query, params, viewer);
    query = applyDirectorySort(query, params, ctx.locale);
    const { data, error } = await query.range(from, Math.min(from + pageSize, ctx.limit) - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as EmployeeExportRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const portalStatus = (row: EmployeeExportRow) => {
  const p = Array.isArray(row.portal) ? row.portal[0] : row.portal;
  return p?.status ?? null;
};

const employeesDataset = defineDataset<EmployeeExportRow>({
  key: 'employees',
  permission: 'employees.export',
  titleKey: 'employees.export.employees',
  formats: ['xlsx', 'csv'],
  filterKeys: DIRECTORY_FILTER_KEYS,
  allowedSorts: DIRECTORY_SORTS,
  defaultSort: 'name',
  defaultDir: 'asc',
  columns: (t, ctx) => {
    const personal = orgCan(ctx, 'personal_data.view');
    const bank = orgCan(ctx, 'bank.view');
    const cols: (ExportColumn<EmployeeExportRow> | false)[] = [
      { key: 'employee_number', header: t('employees.fields.employeeNumber'), width: 14 },
      { key: 'name_ar', header: t('employees.fields.nameAr'), width: 30 },
      { key: 'name_en', header: t('employees.fields.nameEn'), width: 30 },
      { key: 'company_email', header: t('employees.fields.companyEmail'), width: 28 },
      personal && { key: 'personal_email', header: t('employees.fields.personalEmail'), width: 28 },
      { key: 'mobile', header: t('employees.fields.mobile'), width: 16 },
      { key: 'alt_mobile', header: t('employees.fields.altMobile'), width: 16 },
      { key: 'gender', header: t('employees.fields.gender'), width: 10, value: (r) => tr(t, 'enums.gender', r.gender) },
      { key: 'nationality', header: t('employees.fields.nationality'), width: 16 },
      personal && { key: 'date_of_birth', header: t('employees.fields.dateOfBirth'), type: 'date' },
      personal && {
        key: 'marital_status',
        header: t('employees.fields.maritalStatus'),
        width: 12,
        value: (r) => tr(t, 'enums.maritalStatus', r.marital_status),
      },
      personal && { key: 'address', header: t('employees.fields.address'), width: 30 },
      { key: 'department', header: t('employees.fields.department'), width: 22, value: (r) => named(r.department, t) },
      { key: 'division', header: t('employees.fields.division'), width: 18 },
      { key: 'section', header: t('employees.fields.section'), width: 18 },
      { key: 'job_title', header: t('employees.fields.jobTitle'), width: 24, value: (r) => named(r.job_title, t) },
      { key: 'grade', header: t('employees.fields.grade'), width: 10 },
      { key: 'manager', header: t('employees.fields.manager'), width: 28, value: (r) => (r.manager ? employeeDisplayName(r.manager, t.locale) : '') },
      {
        key: 'employment_type',
        header: t('employees.fields.employmentType'),
        width: 14,
        value: (r) => tr(t, 'enums.employmentType', r.employment_type),
      },
      {
        key: 'employment_status',
        header: t('employees.fields.employmentStatus'),
        width: 14,
        value: (r) => tr(t, 'statuses.employment', r.employment_status),
      },
      { key: 'joining_date', header: t('employees.fields.joiningDate'), type: 'date' },
      { key: 'probation_end_date', header: t('employees.fields.probationEndDate'), type: 'date' },
      { key: 'contract_start_date', header: t('employees.fields.contractStartDate'), type: 'date' },
      { key: 'contract_end_date', header: t('employees.fields.contractEndDate'), type: 'date' },
      { key: 'termination_date', header: t('employees.fields.terminationDate'), type: 'date' },
      { key: 'location', header: t('employees.fields.location'), width: 18, value: (r) => named(r.location, t) },
      { key: 'cost_center', header: t('employees.fields.costCenter'), width: 18, value: (r) => named(r.cost_center, t) },
      personal && { key: 'id_type', header: t('employees.fields.idType'), width: 12, value: (r) => tr(t, 'enums.idType', r.id_type) },
      personal && { key: 'national_id', header: t('employees.fields.nationalId'), width: 16 },
      personal && { key: 'iqama_issue_date', header: t('employees.fields.iqamaIssueDate'), type: 'date' },
      { key: 'iqama_expiry_date', header: t('employees.fields.iqamaExpiryDate'), type: 'date' },
      personal && { key: 'iqama_expiry_hijri', header: t('employees.fields.iqamaExpiryHijri'), width: 14 },
      personal && { key: 'iqama_profession', header: t('employees.fields.iqamaProfession'), width: 20 },
      personal && { key: 'passport_number', header: t('employees.fields.passportNumber'), width: 14 },
      personal && { key: 'passport_expiry_date', header: t('employees.fields.passportExpiryDate'), type: 'date' },
      personal && { key: 'employer_number', header: t('employees.fields.employerNumber'), width: 14 },
      personal && {
        key: 'is_outside_kingdom',
        header: t('employees.fields.outsideKingdom'),
        width: 16,
        value: (r) =>
          r.is_outside_kingdom === null ? '' : t(r.is_outside_kingdom ? 'enums.outsideKingdom.outside' : 'enums.outsideKingdom.inside'),
      },
      personal && { key: 'emergency_contact_name', header: t('employees.fields.emergencyName'), width: 24 },
      personal && { key: 'emergency_contact_relationship', header: t('employees.fields.emergencyRelationship'), width: 14 },
      personal && { key: 'emergency_contact_mobile', header: t('employees.fields.emergencyMobile'), width: 16 },
      bank && { key: 'basic_salary', header: t('employees.fields.basicSalary'), type: 'currency', value: (r) => r.compensation?.basic_salary ?? null },
      bank && {
        key: 'housing_allowance',
        header: t('employees.fields.housingAllowance'),
        type: 'currency',
        value: (r) => r.compensation?.housing_allowance ?? null,
      },
      bank && {
        key: 'transport_allowance',
        header: t('employees.fields.transportAllowance'),
        type: 'currency',
        value: (r) => r.compensation?.transport_allowance ?? null,
      },
      bank && { key: 'other_allowance', header: t('employees.fields.otherAllowance'), type: 'currency', value: (r) => r.compensation?.other_allowance ?? null },
      bank && { key: 'total_salary', header: t('employees.fields.totalSalary'), type: 'currency', value: (r) => r.compensation?.total_salary ?? null },
      bank && { key: 'bank_name', header: t('employees.fields.bankName'), width: 18, value: (r) => primaryBank(r)?.bank_name ?? '' },
      bank && { key: 'iban', header: t('employees.fields.iban'), width: 28, value: (r) => primaryBank(r)?.iban ?? '' },
      bank && { key: 'account_holder', header: t('employees.fields.accountHolder'), width: 26, value: (r) => primaryBank(r)?.account_holder ?? '' },
      {
        key: 'portal',
        header: t('employees.columns.portal'),
        width: 16,
        value: (r) => {
          const s = portalStatus(r);
          return s ? tr(t, 'statuses.profile', s) : t('employees.filters.withoutPortal');
        },
      },
      { key: 'archived_at', header: t('employees.fields.archivedAt'), type: 'date' },
    ];
    return cols.filter((c): c is ExportColumn<EmployeeExportRow> => Boolean(c));
  },
  fetchRows: async (supabase, params, ctx) => {
    const viewer = await viewerFor(ctx);
    const withBank = viewer.orgCan('bank.view');
    const select = `*, ${EMBEDS}${withBank ? ', compensation:employee_compensation(basic_salary, housing_allowance, transport_allowance, other_allowance, total_salary), bank:employee_bank_accounts(bank_name, iban, account_holder, is_primary)' : ''}`;
    return fetchEmployees(supabase, params, ctx, select);
  },
  describeFilters: describeDirectoryFilters,
});

function primaryBank(row: EmployeeExportRow) {
  const list = row.bank ?? [];
  return list.find((b) => b.is_primary) ?? list[0] ?? null;
}

const employeesListDataset = defineDataset<EmployeeExportRow>({
  key: 'employees_list',
  permission: 'employees.export',
  titleKey: 'employees.export.employees',
  formats: ['pdf'],
  filterKeys: DIRECTORY_FILTER_KEYS,
  allowedSorts: DIRECTORY_SORTS,
  defaultSort: 'name',
  defaultDir: 'asc',
  columns: (t) => [
    { key: 'employee_number', header: t('employees.columns.employeeNumber') },
    { key: 'name', header: t('employees.columns.employee'), value: (r) => employeeDisplayName(r, t.locale) },
    { key: 'job_title', header: t('employees.columns.jobTitle'), value: (r) => named(r.job_title, t) },
    { key: 'department', header: t('employees.columns.department'), value: (r) => named(r.department, t) },
    { key: 'manager', header: t('employees.columns.manager'), value: (r) => (r.manager ? employeeDisplayName(r.manager, t.locale) : '') },
    { key: 'employment_status', header: t('employees.columns.status'), value: (r) => tr(t, 'statuses.employment', r.employment_status) },
    { key: 'joining_date', header: t('employees.columns.joiningDate'), type: 'date' },
    { key: 'iqama_expiry_date', header: t('employees.columns.iqamaExpiry'), type: 'date' },
    { key: 'mobile', header: t('employees.columns.mobile') },
  ],
  fetchRows: (supabase, params, ctx) =>
    fetchEmployees(
      supabase,
      params,
      ctx,
      'id, employee_number, name_ar, name_en, mobile, employment_status, joining_date, iqama_expiry_date, archived_at, ' +
        'department:departments!department_id(id, name_ar, name_en), job_title:job_titles!job_title_id(id, name_ar, name_en), ' +
        'manager:manager_id(name_ar, name_en, employee_number), portal:profiles!profiles_employee_id_fkey(status)',
    ),
  describeFilters: describeDirectoryFilters,
});

/* ─── Dependents & insurance of the filtered employees ────────────────────── */

type Owner = { employee_number: string | null; name_ar: string | null; name_en: string | null };

type DependentExportRow = {
  employee: Owner | null;
  name_ar: string | null;
  name_en: string | null;
  relationship: string;
  date_of_birth: string | null;
  nationality: string | null;
  national_id: string | null;
  iqama_expiry_date: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
  insurance_status: string | null;
  insurance_member_number: string | null;
  notes: string | null;
};

type InsuranceExportRow = {
  employee: Owner | null;
  dependent: { name_ar: string | null; name_en: string | null; relationship: string } | null;
  provider: string | null;
  policy_number: string | null;
  class: string | null;
  member_number: string | null;
  start_date: string | null;
  expiry_date: string | null;
  status: string;
};

async function fetchChildRows<Row>(
  supabase: ServerSupabaseClient,
  params: ListParams,
  ctx: ExportContext & { limit: number },
  table: 'employee_dependents' | 'employee_insurance',
  select: string,
): Promise<Row[]> {
  const viewer = await viewerFor(ctx);
  const ids = await fetchDirectoryIds(supabase, params, viewer, ctx.limit);
  const out: Row[] = [];
  for (let i = 0; i < ids.length && out.length < ctx.limit; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data, error } = await supabase.from(table).select(select).in('employee_id', chunk).order('employee_id').order('created_at');
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Row[]));
  }
  const nameOf = (r: { employee: Owner | null }) => (r.employee ? employeeDisplayName(r.employee, ctx.locale) : '');
  return (out as unknown as { employee: Owner | null }[])
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b), ctx.locale))
    .slice(0, ctx.limit) as unknown as Row[];
}

const ownerColumns = <R extends { employee: Owner | null }>(t: LooseTranslator): ExportColumn<R>[] => [
  { key: 'employee_number', header: t('employees.fields.employeeNumber'), width: 14, value: (r) => r.employee?.employee_number ?? '' },
  { key: 'employee_name', header: t('employees.export.employeeName'), width: 30, value: (r) => (r.employee ? employeeDisplayName(r.employee, t.locale) : '') },
];

const OWNER = 'employee:employees!employee_id(employee_number, name_ar, name_en)';

const dependentsDataset = defineDataset<DependentExportRow>({
  key: 'dependents',
  permission: 'employees.export',
  titleKey: 'employees.export.dependents',
  filterKeys: DIRECTORY_FILTER_KEYS,
  columns: (t) => [
    ...ownerColumns<DependentExportRow>(t),
    { key: 'dependent_name', header: t('employees.export.dependentName'), width: 28, value: (r) => employeeDisplayName(r, t.locale) },
    { key: 'name_ar', header: t('employees.fields.nameAr'), width: 26 },
    { key: 'name_en', header: t('employees.fields.nameEn'), width: 26 },
    { key: 'relationship', header: t('employees.dependents.fields.relationship'), width: 12, value: (r) => tr(t, 'enums.relationship', r.relationship) },
    { key: 'date_of_birth', header: t('employees.dependents.fields.dateOfBirth'), type: 'date' },
    { key: 'nationality', header: t('employees.dependents.fields.nationality'), width: 14 },
    { key: 'national_id', header: t('employees.dependents.fields.idNumber'), width: 16 },
    { key: 'iqama_expiry_date', header: t('employees.dependents.fields.iqamaExpiry'), type: 'date' },
    { key: 'passport_number', header: t('employees.dependents.fields.passportNumber'), width: 14 },
    { key: 'passport_expiry_date', header: t('employees.dependents.fields.passportExpiry'), type: 'date' },
    {
      key: 'insurance_status',
      header: t('employees.dependents.fields.insuranceStatus'),
      width: 14,
      value: (r) => tr(t, 'enums.insuranceStatus', r.insurance_status),
    },
    { key: 'insurance_member_number', header: t('employees.dependents.fields.memberNumber'), width: 16 },
    { key: 'notes', header: t('employees.dependents.fields.notes'), width: 30 },
  ],
  fetchRows: async (supabase, params, ctx) => {
    const viewer = await viewerFor(ctx);
    if (!viewer.orgCan('personal_data.view')) return [];
    return fetchChildRows<DependentExportRow>(
      supabase,
      params,
      ctx,
      'employee_dependents',
      `name_ar, name_en, relationship, date_of_birth, nationality, national_id, iqama_expiry_date, passport_number, passport_expiry_date, insurance_status, insurance_member_number, notes, ${OWNER}`,
    );
  },
  describeFilters: describeDirectoryFilters,
});

const insuranceDataset = defineDataset<InsuranceExportRow>({
  key: 'insurance',
  permission: 'employees.export',
  titleKey: 'employees.export.insurance',
  filterKeys: DIRECTORY_FILTER_KEYS,
  columns: (t) => [
    ...ownerColumns<InsuranceExportRow>(t),
    {
      key: 'insured',
      header: t('employees.export.insuredMember'),
      width: 28,
      value: (r) =>
        r.dependent
          ? `${employeeDisplayName(r.dependent, t.locale)} (${tr(t, 'enums.relationship', r.dependent.relationship)})`
          : t('employees.insurance.fields.self'),
    },
    { key: 'provider', header: t('employees.insurance.fields.provider'), width: 22 },
    { key: 'policy_number', header: t('employees.insurance.fields.policyNumber'), width: 18 },
    { key: 'class', header: t('employees.insurance.fields.class'), width: 10 },
    { key: 'member_number', header: t('employees.insurance.fields.memberNumber'), width: 18 },
    { key: 'start_date', header: t('employees.insurance.fields.startDate'), type: 'date' },
    { key: 'expiry_date', header: t('employees.insurance.fields.expiryDate'), type: 'date' },
    { key: 'status', header: t('employees.insurance.fields.status'), width: 12, value: (r) => tr(t, 'statuses.insurance', r.status) },
  ],
  fetchRows: async (supabase, params, ctx) => {
    const viewer = await viewerFor(ctx);
    if (!viewer.orgCan('insurance.view')) return [];
    return fetchChildRows<InsuranceExportRow>(
      supabase,
      params,
      ctx,
      'employee_insurance',
      `provider, policy_number, class, member_number, start_date, expiry_date, status, ${OWNER}, dependent:employee_dependents!dependent_id(name_ar, name_en, relationship)`,
    );
  },
  describeFilters: describeDirectoryFilters,
});

export const datasets: AnyExportDataset[] = [employeesDataset, employeesListDataset, dependentsDataset, insuranceDataset];

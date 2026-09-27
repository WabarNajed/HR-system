import {
  ActivityIcon,
  AlarmClockIcon,
  AwardIcon,
  BadgeCheckIcon,
  BanIcon,
  Building2Icon,
  BriefcaseIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarRangeIcon,
  CircleCheckBigIcon,
  CircleXIcon,
  ClockIcon,
  DownloadIcon,
  EarthIcon,
  FileSignatureIcon,
  GaugeIcon,
  HourglassIcon,
  IdCardIcon,
  InboxIcon,
  LayersIcon,
  LogInIcon,
  PencilLineIcon,
  PercentIcon,
  PlaneTakeoffIcon,
  ScaleIcon,
  ShieldPlusIcon,
  SigmaIcon,
  TimerIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  UserXIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import type { StatTone } from '@/components/shared/stat-card';
import type { StatusDomain } from '@/components/shared/status-badge';
import type { Permission } from '@/lib/permissions';

/**
 * Report Center catalog (isomorphic — no server imports). The server half (queries) lives in
 * `registry.ts`; pages and the export route look reports up by `key` (the URL segment).
 *
 * Each report declares: group, i18n id, icon, access (reports.view — or managers for team-scoped
 * reports — plus extra module permissions), the filters it supports, KPI tiles, charts and table
 * columns. Everything a report shows is computed from real data with the caller's RLS client.
 */

export const REPORT_GROUPS = ['employees', 'leave', 'requests', 'compliance', 'certificates', 'audit'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export const REPORT_GROUP_ICONS: Record<ReportGroup, LucideIcon> = {
  employees: UsersIcon,
  leave: CalendarRangeIcon,
  requests: InboxIcon,
  compliance: ShieldPlusIcon,
  certificates: AwardIcon,
  audit: ActivityIcon,
};

/* ─── Filters ────────────────────────────────────────────────────────────── */

/** URL keys of the report filter bar (multi values are comma separated). */
export const FILTER_KEYS = [
  'employee',
  'department',
  'manager',
  'location',
  'nationality',
  'jobTitle',
  'requestType',
  'leaveType',
  'status',
  'bucket',
  'category',
  'certificateType',
  'year',
] as const;
export type ReportFilterKey = (typeof FILTER_KEYS)[number];

/** Date-range semantics (label of the range control). */
export type DateRangeKind =
  | 'joiningDate'
  | 'terminationDate'
  | 'trendPeriod'
  | 'expiryDate'
  | 'leaveDates'
  | 'submittedDate'
  | 'resolvedDate'
  | 'issueDate'
  | 'activityDate';

export type RangePreset = 'last30Days' | 'last90Days' | 'last12Months' | 'thisYear' | 'calendarYear';

export type StatusFilterDef =
  | { kind: 'status'; domain: StatusDomain; values: readonly string[] }
  | { kind: 'enum'; enumKey: string; values: readonly string[] };

/* ─── Columns ────────────────────────────────────────────────────────────── */

export type ColumnKind =
  | 'text'
  | 'code'
  | 'localized'
  | 'employee'
  | 'user'
  | 'integer'
  | 'decimal'
  | 'days'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'status'
  | 'enum'
  | 'bucket'
  | 'category'
  | 'request'
  | 'month'
  | 'sla'
  | 'daysLeft'
  | 'hijri';

export type ReportColumn = {
  /** Table column id — also the `?sort=` value when sortable. */
  id: string;
  /** i18n key (full path). */
  labelKey: string;
  kind: ColumnKind;
  /** Row field (default `id`). For `localized`: base name (`department` → `department_ar/_en`). */
  field?: string;
  /** Sortable on the server (default true). */
  sortable?: boolean;
  statusDomain?: StatusDomain;
  /** `enums.<enumKey>.<value>` for `enum` columns. */
  enumKey?: string;
  /** Row field holding the linked record id (employee / request). */
  linkField?: string;
  defaultHidden?: boolean;
  /** `hijri`: Gregorian date field converted when the stored Hijri text is empty. */
  dateField?: string;
  /** i18n key shown instead of an empty value (e.g. "Employee" for self-insured rows). */
  emptyKey?: string;
  /** Export column width (characters). */
  width?: number;
};

/* ─── KPIs & charts ──────────────────────────────────────────────────────── */

export type ValueFormat = 'integer' | 'decimal' | 'days' | 'percent' | 'years';

export type KpiDef = {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  tone: StatTone;
  format: ValueFormat;
  /** Secondary line (i18n key; receives `{value}` of `hintValueKey` when set). */
  hintKey?: string;
  /** KPI value key rendered inside the hint, or `largest` for the localized largest-group label. */
  hintValueKey?: string;
};

export type ChartCategory = 'month' | 'day' | 'localized' | 'status' | 'enum' | 'bucket' | 'category';

export type ChartSeries = {
  key: string;
  labelKey: string;
  /** Categorical slot 0..7 (default by order) or a status color for status-meaning series. */
  color?: number | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
};

export type ChartDef = {
  /** Key inside the summary's `charts` object. */
  key: string;
  /** View-switcher id + label (`reports.chartTabs.<tab>`), defaults to `key`. */
  tab?: string;
  titleKey: string;
  type: 'column' | 'bar' | 'line' | 'area' | 'stacked' | 'stackedBar' | 'grouped';
  category: ChartCategory;
  statusDomain?: StatusDomain;
  enumKey?: string;
  series: ChartSeries[];
  format: ValueFormat;
  /** Status tone per category (bucket charts). */
  colorByCategory?: boolean;
  /** Keep only the top N categories (rest folded into "Other"). */
  top?: number;
};

/* ─── Report definition ─────────────────────────────────────────────────── */

export type ReportDefinition = {
  key: string;
  /** Message id under `reports.items.<i18n>`. */
  i18n: string;
  group: ReportGroup;
  icon: LucideIcon;
  /** Team-scoped report also open to managers (without `reports.view`). */
  managers: boolean;
  /** Extra permissions (all required) on top of report access. */
  requires: readonly Permission[];
  /**
   * Permission the export route checks before any query (default `reports.export`). Reports over
   * more sensitive data use a stricter one; exports always need `reports.export` + report access too.
   */
  exportPermission?: Permission;
  dateRange?: { kind: DateRangeKind; defaultPreset?: RangePreset };
  filters: readonly ReportFilterKey[];
  status?: StatusFilterDef;
  kpis: readonly KpiDef[];
  charts: readonly ChartDef[];
  columns: readonly ReportColumn[];
  defaultSort: { id: string; desc: boolean };
  /** `paged`: server-side pagination; `all`: small aggregate tables sorted/searched in memory. */
  table: 'paged' | 'all';
  /** Table title key (defaults to `reports.view.details`). */
  tableTitleKey?: string;
  /** Catalog preview metric (key of `report_catalog_stats`) and its label key. */
  preview?: { stat: string; labelKey: string; tone?: 'danger' | 'warning' };
};

const C = (id: string, kind: ColumnKind, extra: Partial<ReportColumn> = {}): ReportColumn => ({
  id,
  kind,
  labelKey: `reports.columns.${id}`,
  ...extra,
});

/* Shared column sets */
const EMPLOYEE_COL = C('employee', 'employee', {
  linkField: 'employee_id',
  width: 30,
});
/** Shown as the employee cell subtitle on screen; a separate column in exports. */
const EMPLOYEE_NUMBER_COL = C('employeeNumber', 'code', {
  field: 'employee_number',
  width: 14,
  defaultHidden: true,
});
const DEPARTMENT_COL = C('department', 'localized', {
  field: 'department',
  width: 22,
});
const JOB_TITLE_COL = C('jobTitle', 'localized', {
  field: 'job_title',
  width: 22,
});

const EMPLOYMENT_STATUSES = ['active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated'] as const;
const CURRENT_STATUSES = ['active', 'probation', 'on_leave', 'suspended'] as const;
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
] as const;
const OPEN_STATUSES = ['submitted', 'pending_manager_approval', 'pending_hr_review', 'returned', 'in_progress'] as const;
export const EXPIRY_BUCKETS = ['expired', 'within30', 'within60', 'within90', 'valid', 'missing'] as const;
export const AUDIT_CATEGORIES = ['auth', 'employees', 'requests', 'leave', 'certificates', 'users', 'settings', 'data', 'other'] as const;
export const CERTIFICATE_TYPES = ['salary', 'employment', 'salary_employment', 'experience', 'custom'] as const;

const EMPLOYEE_FILTERS = ['department', 'location', 'nationality', 'manager'] as const;

/* Shared KPI / chart building blocks */
const K = (key: string, icon: LucideIcon, tone: StatTone, format: ValueFormat = 'integer', extra: Partial<KpiDef> = {}): KpiDef => ({
  key,
  icon,
  tone,
  format,
  labelKey: `reports.kpis.${key}`,
  ...extra,
});

/** Chart series: `label` → `reports.series.<label>`; `dataKey` is the point field (single series use `value`). */
const S = (label: string, color?: ChartSeries['color'], dataKey = 'value'): ChartSeries => ({
  key: dataKey,
  labelKey: `reports.series.${label}`,
  color,
});

function breakdownReport(
  key: string,
  i18n: string,
  icon: LucideIcon,
  dimensionColumn: ReportColumn,
  groupsKpi: string,
  filters: readonly ReportFilterKey[],
  previewStat: string,
): ReportDefinition {
  return {
    key,
    i18n,
    group: 'employees',
    icon,
    managers: true,
    requires: ['employees.view'],
    filters,
    status: { kind: 'status', domain: 'employment', values: CURRENT_STATUSES },
    kpis: [
      K('headcount', UsersIcon, 'primary'),
      K('groups', LayersIcon, 'info', 'integer', {
        labelKey: `reports.kpis.${groupsKpi}`,
      }),
      K('largest', TrendingUpIcon, 'secondary', 'integer', {
        hintKey: 'reports.kpiHints.largest',
        hintValueKey: 'largest',
      }),
      K('unassigned', TriangleAlertIcon, 'warning', 'integer', {
        hintKey: 'reports.kpiHints.unassigned',
      }),
    ],
    charts: [
      {
        key: 'breakdown',
        titleKey: `reports.charts.${i18n}`,
        type: 'bar',
        category: 'localized',
        series: [S('employees')],
        format: 'integer',
        top: 12,
      },
    ],
    columns: [
      dimensionColumn,
      C('headcount', 'integer', { width: 12 }),
      C('share', 'percent', { width: 10 }),
      C('active', 'integer', { width: 10 }),
      C('probation', 'integer', { width: 10 }),
      C('onLeave', 'integer', { field: 'on_leave', width: 10 }),
      C('male', 'integer', { width: 10 }),
      C('female', 'integer', { width: 10 }),
      C('avgTenure', 'decimal', { field: 'avg_tenure_years', width: 12 }),
    ],
    defaultSort: { id: 'headcount', desc: true },
    table: 'all',
    tableTitleKey: 'reports.view.breakdownTable',
    preview: { stat: previewStat, labelKey: `reports.preview.${previewStat}` },
  };
}

function expiryReport(
  key: string,
  i18n: string,
  icon: LucideIcon,
  requires: readonly Permission[],
  extraColumns: readonly ReportColumn[],
  previewStat: string,
): ReportDefinition {
  return {
    key,
    i18n,
    group: 'compliance',
    icon,
    managers: false,
    requires,
    dateRange: { kind: 'expiryDate' },
    filters: ['bucket', 'department', 'location', 'nationality', 'manager', 'employee'],
    kpis: [
      K('expired', CircleXIcon, 'danger'),
      K('within30', AlarmClockIcon, 'warning'),
      K('within60', CalendarClockIcon, 'secondary'),
      K('within90', CalendarCheckIcon, 'info'),
      K('valid', BadgeCheckIcon, 'success'),
    ],
    charts: [
      {
        key: 'buckets',
        titleKey: 'reports.charts.expiryBuckets',
        type: 'column',
        category: 'bucket',
        series: [S('records')],
        format: 'integer',
        colorByCategory: true,
      },
    ],
    columns: [
      EMPLOYEE_COL,
      EMPLOYEE_NUMBER_COL,
      DEPARTMENT_COL,
      ...extraColumns,
      C('expiryDate', 'date', { field: 'expiry_date', width: 14 }),
      C('daysLeft', 'daysLeft', { field: 'days_left', width: 12 }),
      C('bucket', 'bucket', { width: 16 }),
      { ...JOB_TITLE_COL, defaultHidden: true },
      C('nationality', 'text', { defaultHidden: true, width: 16 }),
    ],
    defaultSort: { id: 'expiryDate', desc: false },
    table: 'paged',
    preview: {
      stat: previewStat,
      labelKey: 'reports.preview.expiring90',
      tone: 'warning',
    },
  };
}

function requestColumns(...extra: ReportColumn[]): ReportColumn[] {
  return [
    C('requestNumber', 'request', {
      field: 'request_number',
      linkField: 'id',
      width: 18,
    }),
    C('requestType', 'localized', { field: 'type', width: 26 }),
    EMPLOYEE_COL,
    { ...DEPARTMENT_COL, defaultHidden: true },
    ...extra,
  ];
}

const REQUEST_FILTERS = ['requestType', 'status', 'department', 'location', 'manager', 'employee'] as const;

export const REPORTS: readonly ReportDefinition[] = [
  /* ── Employees ─────────────────────────────────────────────────────────── */
  {
    key: 'employee-master',
    i18n: 'employeeMaster',
    group: 'employees',
    icon: UsersIcon,
    managers: true,
    requires: ['employees.view'],
    dateRange: { kind: 'joiningDate' },
    filters: ['department', 'jobTitle', 'location', 'nationality', 'manager', 'status', 'employee'],
    status: {
      kind: 'status',
      domain: 'employment',
      values: EMPLOYMENT_STATUSES,
    },
    kpis: [
      K('total', UsersIcon, 'primary'),
      K('active', UserCheckIcon, 'success', 'integer', {
        labelKey: 'reports.kpis.activeWorkforce',
      }),
      K('probation', HourglassIcon, 'info'),
      K('departments', Building2Icon, 'secondary'),
      K('avgTenure', TimerIcon, 'neutral', 'years'),
    ],
    charts: [],
    columns: [
      EMPLOYEE_COL,
      EMPLOYEE_NUMBER_COL,
      DEPARTMENT_COL,
      JOB_TITLE_COL,
      C('location', 'localized', {
        field: 'location',
        width: 18,
        defaultHidden: true,
      }),
      C('manager', 'localized', { field: 'manager_name', width: 26 }),
      C('nationality', 'text', { width: 16 }),
      C('gender', 'enum', {
        enumKey: 'gender',
        width: 10,
        defaultHidden: true,
      }),
      C('employmentType', 'enum', { field: 'employment_type', enumKey: 'employmentType', width: 14, defaultHidden: true }),
      C('status', 'status', { field: 'employment_status', statusDomain: 'employment', width: 14 }),
      C('joiningDate', 'date', { field: 'joining_date', width: 14 }),
      C('contractEnd', 'date', {
        field: 'contract_end_date',
        width: 14,
        defaultHidden: true,
      }),
      C('email', 'text', {
        field: 'company_email',
        width: 28,
        defaultHidden: true,
      }),
      C('mobile', 'text', { width: 16, defaultHidden: true }),
      C('tenure', 'decimal', { field: 'tenure_years', width: 10 }),
    ],
    defaultSort: { id: 'employee', desc: false },
    table: 'paged',
    preview: { stat: 'employees', labelKey: 'reports.preview.employees' },
  },
  {
    key: 'headcount',
    i18n: 'headcount',
    group: 'employees',
    icon: TrendingUpIcon,
    managers: true,
    requires: ['employees.view'],
    dateRange: { kind: 'trendPeriod', defaultPreset: 'last12Months' },
    filters: [...EMPLOYEE_FILTERS],
    kpis: [
      K('headcount', UsersIcon, 'primary', 'integer', {
        hintKey: 'reports.kpiHints.currentHeadcount',
      }),
      K('joiners', UserPlusIcon, 'success', 'integer', {
        hintKey: 'reports.kpiHints.inPeriod',
      }),
      K('leavers', UserMinusIcon, 'danger', 'integer', {
        hintKey: 'reports.kpiHints.inPeriod',
      }),
      K('netChange', SigmaIcon, 'info', 'integer', {
        hintKey: 'reports.kpiHints.inPeriod',
      }),
      K('turnover', PercentIcon, 'warning', 'percent', {
        hintKey: 'reports.kpiHints.turnover',
      }),
    ],
    charts: [
      {
        key: 'trend',
        titleKey: 'reports.charts.headcountTrend',
        type: 'area',
        category: 'month',
        series: [S('headcount', undefined, 'headcount')],
        format: 'integer',
      },
      {
        key: 'trend',
        tab: 'movement',
        titleKey: 'reports.charts.joinersLeavers',
        type: 'grouped',
        category: 'month',
        series: [S('joiners', 0, 'joiners'), S('leavers', 1, 'leavers')],
        format: 'integer',
      },
    ],
    columns: [
      C('month', 'month', { width: 14 }),
      C('headcount', 'integer', { width: 12 }),
      C('joiners', 'integer', { width: 12 }),
      C('leavers', 'integer', { width: 12 }),
      C('netChange', 'integer', { field: 'net_change', width: 12 }),
    ],
    defaultSort: { id: 'month', desc: true },
    table: 'all',
    tableTitleKey: 'reports.view.monthlyTable',
    preview: { stat: 'headcount', labelKey: 'reports.preview.headcount' },
  },
  breakdownReport(
    'employees-by-department',
    'byDepartment',
    Building2Icon,
    C('department', 'localized', {
      field: 'label',
      width: 28,
      emptyKey: 'reports.view.notSet',
    }),
    'departments',
    ['location', 'nationality', 'manager', 'status'],
    'departments',
  ),
  breakdownReport(
    'employees-by-nationality',
    'byNationality',
    EarthIcon,
    C('nationality', 'localized', {
      field: 'label',
      width: 24,
      emptyKey: 'reports.view.notSet',
    }),
    'nationalities',
    ['department', 'location', 'manager', 'status'],
    'nationalities',
  ),
  breakdownReport(
    'employees-by-job-title',
    'byJobTitle',
    BriefcaseIcon,
    C('jobTitle', 'localized', {
      field: 'label',
      width: 28,
      emptyKey: 'reports.view.notSet',
    }),
    'jobTitles',
    ['department', 'location', 'nationality', 'manager', 'status'],
    'jobTitles',
  ),
  {
    key: 'new-joiners',
    i18n: 'newJoiners',
    group: 'employees',
    icon: UserPlusIcon,
    managers: true,
    requires: ['employees.view'],
    dateRange: { kind: 'joiningDate', defaultPreset: 'last12Months' },
    filters: [...EMPLOYEE_FILTERS, 'jobTitle', 'status'],
    status: {
      kind: 'status',
      domain: 'employment',
      values: EMPLOYMENT_STATUSES,
    },
    kpis: [
      K('joiners', UserPlusIcon, 'primary'),
      K('probation', HourglassIcon, 'info', 'integer', {
        labelKey: 'reports.kpis.inProbation',
      }),
      K('departments', Building2Icon, 'secondary'),
      K('stillEmployed', UserCheckIcon, 'success'),
    ],
    charts: [
      {
        key: 'byMonth',
        titleKey: 'reports.charts.joinersByMonth',
        type: 'column',
        category: 'month',
        series: [S('joiners')],
        format: 'integer',
      },
    ],
    columns: [
      EMPLOYEE_COL,
      EMPLOYEE_NUMBER_COL,
      DEPARTMENT_COL,
      JOB_TITLE_COL,
      C('joiningDate', 'date', { field: 'joining_date', width: 14 }),
      C('probationEnd', 'date', { field: 'probation_end_date', width: 14 }),
      C('employmentType', 'enum', {
        field: 'employment_type',
        enumKey: 'employmentType',
        width: 14,
      }),
      C('status', 'status', {
        field: 'employment_status',
        statusDomain: 'employment',
        width: 14,
      }),
      C('manager', 'localized', {
        field: 'manager_name',
        width: 26,
        defaultHidden: true,
      }),
    ],
    defaultSort: { id: 'joiningDate', desc: true },
    table: 'paged',
    preview: { stat: 'joiners90', labelKey: 'reports.preview.joiners90' },
  },
  {
    key: 'leavers',
    i18n: 'leavers',
    group: 'employees',
    icon: UserMinusIcon,
    managers: true,
    requires: ['employees.view'],
    dateRange: { kind: 'terminationDate', defaultPreset: 'last12Months' },
    filters: [...EMPLOYEE_FILTERS, 'status'],
    status: {
      kind: 'status',
      domain: 'employment',
      values: ['resigned', 'terminated'],
    },
    kpis: [
      K('leavers', UserMinusIcon, 'primary'),
      K('resigned', UserXIcon, 'warning'),
      K('terminated', BanIcon, 'danger'),
      K('avgTenure', TimerIcon, 'neutral', 'years', {
        hintKey: 'reports.kpiHints.atExit',
      }),
    ],
    charts: [
      {
        key: 'byMonth',
        titleKey: 'reports.charts.leaversByMonth',
        type: 'stacked',
        category: 'month',
        series: [S('resigned', 1, 'resigned'), S('terminated', 3, 'terminated')],
        format: 'integer',
      },
    ],
    columns: [
      EMPLOYEE_COL,
      EMPLOYEE_NUMBER_COL,
      DEPARTMENT_COL,
      JOB_TITLE_COL,
      C('joiningDate', 'date', { field: 'joining_date', width: 14 }),
      C('terminationDate', 'date', { field: 'termination_date', width: 14 }),
      C('status', 'status', {
        field: 'employment_status',
        statusDomain: 'employment',
        width: 14,
      }),
      C('tenure', 'decimal', { field: 'tenure_years', width: 10 }),
    ],
    defaultSort: { id: 'terminationDate', desc: true },
    table: 'paged',
    preview: { stat: 'leavers365', labelKey: 'reports.preview.leavers365' },
  },

  /* ── Compliance ───────────────────────────────────────────────────────── */
  expiryReport(
    'contract-expiry',
    'contractExpiry',
    FileSignatureIcon,
    ['employees.view'],
    [
      C('employmentType', 'enum', {
        field: 'employment_type',
        enumKey: 'employmentType',
        width: 14,
      }),
    ],
    'contract90',
  ),
  expiryReport(
    'iqama-expiry',
    'iqamaExpiry',
    IdCardIcon,
    ['personal_data.view'],
    [
      C('iqamaNumber', 'code', { field: 'reference', width: 16 }),
      C('hijriExpiry', 'hijri', {
        field: 'expiry_hijri',
        dateField: 'expiry_date',
        width: 18,
        sortable: false,
      }),
    ],
    'iqama90',
  ),
  expiryReport(
    'passport-expiry',
    'passportExpiry',
    PlaneTakeoffIcon,
    ['personal_data.view'],
    [C('passportNumber', 'code', { field: 'reference', width: 16 })],
    'passport90',
  ),
  expiryReport(
    'insurance-expiry',
    'insuranceExpiry',
    ShieldPlusIcon,
    ['insurance.view'],
    [
      C('insuredPerson', 'localized', {
        field: 'dependent_name',
        width: 24,
        sortable: false,
        emptyKey: 'reports.view.employeeSelf',
      }),
      C('provider', 'text', { width: 20 }),
      C('insuranceClass', 'text', { field: 'insurance_class', width: 10 }),
      C('memberNumber', 'code', { field: 'reference', width: 16 }),
    ],
    'insurance90',
  ),

  /* ── Leave ─────────────────────────────────────────────────────────────── */
  {
    key: 'leave-balance',
    i18n: 'leaveBalance',
    group: 'leave',
    icon: WalletIcon,
    managers: true,
    requires: ['leave.view'],
    filters: ['year', 'leaveType', 'department', 'location', 'manager', 'employee'],
    kpis: [
      K('available', CalendarRangeIcon, 'primary', 'days', {
        hintKey: 'reports.kpiHints.employeesCovered',
        hintValueKey: 'employees',
      }),
      K('used', CalendarCheckIcon, 'info', 'days'),
      K('pending', HourglassIcon, 'warning', 'days'),
      K('remaining', WalletIcon, 'success', 'days'),
      K('utilization', PercentIcon, 'secondary', 'percent'),
    ],
    charts: [
      {
        key: 'byType',
        titleKey: 'reports.charts.balanceByType',
        type: 'stackedBar',
        category: 'localized',
        series: [S('used', 0, 'used'), S('pending', 1, 'pending'), S('available', 2, 'remaining')],
        format: 'days',
      },
    ],
    columns: [
      EMPLOYEE_COL,
      EMPLOYEE_NUMBER_COL,
      { ...DEPARTMENT_COL, defaultHidden: true },
      C('leaveType', 'localized', { field: 'leave_type', width: 20 }),
      C('year', 'text', { width: 8, defaultHidden: true }),
      C('openingBalance', 'days', {
        field: 'opening_balance',
        width: 12,
        defaultHidden: true,
      }),
      C('entitlement', 'days', { width: 12 }),
      C('adjustment', 'days', { width: 12, defaultHidden: true }),
      C('totalAvailable', 'days', { field: 'total_available', width: 12 }),
      C('used', 'days', { width: 10 }),
      C('pending', 'days', { width: 10 }),
      C('remaining', 'days', { width: 12 }),
      C('utilization', 'percent', { width: 12 }),
    ],
    defaultSort: { id: 'employee', desc: false },
    table: 'paged',
    preview: {
      stat: 'balanceEmployees',
      labelKey: 'reports.preview.balanceEmployees',
    },
  },
  {
    key: 'leave-usage',
    i18n: 'leaveUsage',
    group: 'leave',
    icon: CalendarRangeIcon,
    managers: true,
    requires: ['leave.view'],
    dateRange: { kind: 'leaveDates', defaultPreset: 'calendarYear' },
    filters: ['leaveType', 'status', 'department', 'location', 'manager', 'employee'],
    status: { kind: 'status', domain: 'request', values: REQUEST_STATUSES },
    kpis: [
      K('daysTaken', CalendarCheckIcon, 'primary', 'days'),
      K('requests', InboxIcon, 'info', 'integer', {
        labelKey: 'reports.kpis.leaveRequests',
        hintKey: 'reports.kpiHints.pendingDays',
        hintValueKey: 'daysPending',
      }),
      K('employees', UsersIcon, 'secondary', 'integer', {
        labelKey: 'reports.kpis.employeesOnLeave',
      }),
      K('avgDays', ScaleIcon, 'neutral', 'days', {
        hintKey: 'reports.kpiHints.perRequest',
      }),
    ],
    charts: [
      {
        key: 'byMonth',
        titleKey: 'reports.charts.leaveByMonth',
        type: 'column',
        category: 'month',
        series: [S('days')],
        format: 'days',
      },
      {
        key: 'byType',
        titleKey: 'reports.charts.leaveByType',
        type: 'bar',
        category: 'localized',
        series: [S('days')],
        format: 'days',
        top: 10,
      },
      {
        key: 'byDepartment',
        titleKey: 'reports.charts.leaveByDepartment',
        type: 'bar',
        category: 'localized',
        series: [S('days')],
        format: 'days',
        top: 10,
      },
    ],
    columns: [
      C('requestNumber', 'request', {
        field: 'request_number',
        linkField: 'request_id',
        width: 18,
      }),
      EMPLOYEE_COL,
      { ...DEPARTMENT_COL, defaultHidden: true },
      C('leaveType', 'localized', { field: 'leave_type', width: 20 }),
      C('startDate', 'date', { field: 'start_date', width: 14 }),
      C('endDate', 'date', { field: 'end_date', width: 14 }),
      C('days', 'days', { width: 10 }),
      C('status', 'status', { statusDomain: 'request', width: 18 }),
    ],
    defaultSort: { id: 'startDate', desc: true },
    table: 'paged',
    preview: {
      stat: 'leaveDaysYear',
      labelKey: 'reports.preview.leaveDaysYear',
    },
  },

  /* ── Requests ──────────────────────────────────────────────────────────── */
  {
    key: 'hr-requests',
    i18n: 'hrRequests',
    group: 'requests',
    icon: InboxIcon,
    managers: true,
    requires: ['requests.view'],
    dateRange: { kind: 'submittedDate' },
    filters: REQUEST_FILTERS,
    status: { kind: 'status', domain: 'request', values: REQUEST_STATUSES },
    kpis: [
      K('total', InboxIcon, 'primary'),
      K('open', ClockIcon, 'info'),
      K('completed', CircleCheckBigIcon, 'success'),
      K('rejected', CircleXIcon, 'danger'),
      K('overdue', AlarmClockIcon, 'warning'),
    ],
    charts: [
      {
        key: 'byStatus',
        titleKey: 'reports.charts.requestsByStatus',
        type: 'bar',
        category: 'status',
        statusDomain: 'request',
        series: [S('requests')],
        format: 'integer',
      },
      {
        key: 'byType',
        titleKey: 'reports.charts.requestsByType',
        type: 'bar',
        category: 'localized',
        series: [S('requests')],
        format: 'integer',
        top: 10,
      },
      {
        key: 'byMonth',
        titleKey: 'reports.charts.requestsByMonth',
        type: 'column',
        category: 'month',
        series: [S('requests')],
        format: 'integer',
      },
    ],
    columns: requestColumns(
      C('status', 'status', { statusDomain: 'request', width: 18 }),
      C('priority', 'enum', {
        enumKey: 'priority',
        width: 10,
        defaultHidden: true,
      }),
      C('submittedAt', 'date', { field: 'submitted_at', width: 14 }),
      C('dueAt', 'date', { field: 'due_at', width: 14 }),
      C('resolvedAt', 'date', {
        field: 'resolved_at',
        width: 14,
        defaultHidden: true,
      }),
      C('sla', 'sla', { field: 'sla_state', width: 14 }),
    ),
    defaultSort: { id: 'submittedAt', desc: true },
    table: 'paged',
    preview: { stat: 'requests', labelKey: 'reports.preview.requests' },
  },
  {
    key: 'open-requests',
    i18n: 'openRequests',
    group: 'requests',
    icon: ClockIcon,
    managers: true,
    requires: ['requests.view'],
    dateRange: { kind: 'submittedDate' },
    filters: REQUEST_FILTERS,
    status: { kind: 'status', domain: 'request', values: OPEN_STATUSES },
    kpis: [
      K('open', ClockIcon, 'primary'),
      K('pendingManager', UserCheckIcon, 'info'),
      K('pendingHr', BriefcaseIcon, 'secondary'),
      K('overdue', AlarmClockIcon, 'danger', 'integer', {
        hintKey: 'reports.kpiHints.dueSoon',
        hintValueKey: 'dueSoon',
      }),
      K('avgAge', TimerIcon, 'neutral', 'days', {
        hintKey: 'reports.kpiHints.sinceSubmission',
      }),
    ],
    charts: [
      {
        key: 'byStatus',
        titleKey: 'reports.charts.openByStage',
        type: 'bar',
        category: 'status',
        statusDomain: 'request',
        series: [S('requests')],
        format: 'integer',
      },
      {
        key: 'byType',
        titleKey: 'reports.charts.requestsByType',
        type: 'bar',
        category: 'localized',
        series: [S('requests')],
        format: 'integer',
        top: 10,
      },
    ],
    columns: requestColumns(
      C('status', 'status', { statusDomain: 'request', width: 18 }),
      C('submittedAt', 'date', { field: 'submitted_at', width: 14 }),
      C('dueAt', 'date', { field: 'due_at', width: 14 }),
      C('ageDays', 'integer', { field: 'age_days', width: 10 }),
      C('sla', 'sla', { field: 'sla_state', width: 14 }),
    ),
    defaultSort: { id: 'submittedAt', desc: false },
    table: 'paged',
    preview: { stat: 'open', labelKey: 'reports.preview.open' },
  },
  {
    key: 'completed-requests',
    i18n: 'completedRequests',
    group: 'requests',
    icon: CircleCheckBigIcon,
    managers: true,
    requires: ['requests.view'],
    dateRange: { kind: 'resolvedDate', defaultPreset: 'last12Months' },
    filters: REQUEST_FILTERS,
    status: {
      kind: 'status',
      domain: 'request',
      values: ['approved', 'completed'],
    },
    kpis: [
      K('completed', CircleCheckBigIcon, 'primary'),
      K('onTimeRate', GaugeIcon, 'success', 'percent'),
      K('avgResolution', TimerIcon, 'info', 'days', {
        hintKey: 'reports.kpiHints.businessDays',
      }),
      K('employees', UsersIcon, 'secondary'),
    ],
    charts: [
      {
        key: 'byMonth',
        titleKey: 'reports.charts.completedByMonth',
        type: 'column',
        category: 'month',
        series: [S('requests')],
        format: 'integer',
      },
      {
        key: 'byType',
        titleKey: 'reports.charts.requestsByType',
        type: 'bar',
        category: 'localized',
        series: [S('requests')],
        format: 'integer',
        top: 10,
      },
    ],
    columns: requestColumns(
      C('status', 'status', { statusDomain: 'request', width: 18 }),
      C('submittedAt', 'date', { field: 'submitted_at', width: 14 }),
      C('resolvedAt', 'date', { field: 'resolved_at', width: 14 }),
      C('resolutionDays', 'integer', {
        field: 'resolution_business_days',
        width: 12,
      }),
      C('sla', 'sla', { field: 'sla_state', width: 14 }),
    ),
    defaultSort: { id: 'resolvedAt', desc: true },
    table: 'paged',
    preview: { stat: 'completed30', labelKey: 'reports.preview.last30Days' },
  },
  {
    key: 'rejected-requests',
    i18n: 'rejectedRequests',
    group: 'requests',
    icon: CircleXIcon,
    managers: true,
    requires: ['requests.view'],
    dateRange: { kind: 'resolvedDate', defaultPreset: 'last12Months' },
    filters: ['requestType', 'department', 'location', 'manager', 'employee'],
    kpis: [
      K('rejected', CircleXIcon, 'danger'),
      K('employees', UsersIcon, 'secondary'),
      K('avgResolution', TimerIcon, 'info', 'days', {
        hintKey: 'reports.kpiHints.businessDays',
      }),
    ],
    charts: [
      {
        key: 'byType',
        titleKey: 'reports.charts.rejectedByType',
        type: 'bar',
        category: 'localized',
        series: [S('requests')],
        format: 'integer',
        top: 10,
      },
      {
        key: 'byMonth',
        titleKey: 'reports.charts.rejectedByMonth',
        type: 'column',
        category: 'month',
        series: [S('requests')],
        format: 'integer',
      },
    ],
    columns: requestColumns(
      C('submittedAt', 'date', { field: 'submitted_at', width: 14 }),
      C('rejectedAt', 'date', { field: 'resolved_at', width: 14 }),
      C('rejectedBy', 'text', { field: 'decision_by', width: 22 }),
      C('rejectionReason', 'text', {
        field: 'decision_comment',
        width: 40,
        sortable: false,
      }),
    ),
    defaultSort: { id: 'rejectedAt', desc: true },
    table: 'paged',
    preview: { stat: 'rejected30', labelKey: 'reports.preview.last30Days' },
  },
  {
    key: 'overdue-requests',
    i18n: 'overdueRequests',
    group: 'requests',
    icon: AlarmClockIcon,
    managers: true,
    requires: ['requests.view'],
    dateRange: { kind: 'submittedDate' },
    filters: REQUEST_FILTERS,
    status: { kind: 'status', domain: 'request', values: OPEN_STATUSES },
    kpis: [
      K('overdue', AlarmClockIcon, 'danger'),
      K('avgOverdue', TimerIcon, 'warning', 'days'),
      K('maxOverdue', TriangleAlertIcon, 'danger', 'days'),
      K('employees', UsersIcon, 'secondary'),
    ],
    charts: [
      {
        key: 'byType',
        titleKey: 'reports.charts.overdueByType',
        type: 'bar',
        category: 'localized',
        series: [S('requests')],
        format: 'integer',
        top: 10,
      },
      {
        key: 'byStatus',
        titleKey: 'reports.charts.openByStage',
        type: 'bar',
        category: 'status',
        statusDomain: 'request',
        series: [S('requests')],
        format: 'integer',
      },
    ],
    columns: requestColumns(
      C('status', 'status', { statusDomain: 'request', width: 18 }),
      C('currentStep', 'enum', {
        field: 'current_step_type',
        enumKey: 'stepType',
        width: 16,
      }),
      C('dueAt', 'date', { field: 'due_at', width: 14 }),
      C('overdueDays', 'integer', { field: 'overdue_days', width: 12 }),
    ),
    defaultSort: { id: 'overdueDays', desc: true },
    table: 'paged',
    preview: {
      stat: 'overdue',
      labelKey: 'reports.preview.overdue',
      tone: 'danger',
    },
  },
  {
    key: 'sla-performance',
    i18n: 'slaPerformance',
    group: 'requests',
    icon: GaugeIcon,
    managers: true,
    requires: ['requests.view'],
    dateRange: { kind: 'submittedDate', defaultPreset: 'last12Months' },
    filters: ['requestType', 'department', 'location', 'manager'],
    kpis: [
      K('onTimeRate', GaugeIcon, 'success', 'percent', {
        hintKey: 'reports.kpiHints.closedRequests',
        hintValueKey: 'closed',
      }),
      K('avgResolution', TimerIcon, 'info', 'days', {
        hintKey: 'reports.kpiHints.businessDays',
      }),
      K('late', TriangleAlertIcon, 'warning'),
      K('overdue', AlarmClockIcon, 'danger', 'integer', {
        hintKey: 'reports.kpiHints.openNow',
      }),
    ],
    charts: [
      {
        key: 'byType',
        titleKey: 'reports.charts.onTimeByType',
        type: 'bar',
        category: 'localized',
        series: [S('onTimeRate')],
        format: 'percent',
        top: 12,
      },
    ],
    columns: [
      C('requestType', 'localized', { field: 'type', width: 26 }),
      C('slaDays', 'integer', { field: 'sla_business_days', width: 10 }),
      C('total', 'integer', { width: 10 }),
      C('closed', 'integer', { width: 10 }),
      C('onTime', 'integer', { field: 'on_time', width: 10 }),
      C('late', 'integer', { width: 10 }),
      C('onTimeRate', 'percent', { field: 'on_time_rate', width: 12 }),
      C('avgResolution', 'decimal', {
        field: 'avg_resolution_days',
        width: 14,
      }),
      C('openNow', 'integer', { field: 'open', width: 10 }),
      C('overdueNow', 'integer', { field: 'overdue', width: 10 }),
    ],
    defaultSort: { id: 'total', desc: true },
    table: 'all',
    tableTitleKey: 'reports.view.byTypeTable',
    preview: {
      stat: 'overdue',
      labelKey: 'reports.preview.overdue',
      tone: 'danger',
    },
  },

  /* ── Certificates ──────────────────────────────────────────────────────── */
  {
    key: 'certificates-issued',
    i18n: 'certificatesIssued',
    group: 'certificates',
    icon: AwardIcon,
    managers: false,
    requires: ['certificates.view'],
    dateRange: { kind: 'issueDate', defaultPreset: 'thisYear' },
    filters: ['certificateType', 'status', 'department', 'location', 'employee'],
    status: {
      kind: 'status',
      domain: 'certificate',
      values: ['valid', 'revoked'],
    },
    kpis: [
      K('issued', AwardIcon, 'primary'),
      K('valid', BadgeCheckIcon, 'success', 'integer', {
        labelKey: 'reports.kpis.validCertificates',
      }),
      K('revoked', BanIcon, 'danger'),
      K('employees', UsersIcon, 'secondary'),
    ],
    charts: [
      {
        key: 'byType',
        titleKey: 'reports.charts.certificatesByType',
        type: 'bar',
        category: 'enum',
        enumKey: 'certificateType',
        series: [S('certificates')],
        format: 'integer',
      },
      {
        key: 'byMonth',
        titleKey: 'reports.charts.certificatesByMonth',
        type: 'column',
        category: 'month',
        series: [S('certificates')],
        format: 'integer',
      },
    ],
    columns: [
      C('certificateNumber', 'code', {
        field: 'certificate_number',
        width: 18,
      }),
      EMPLOYEE_COL,
      { ...DEPARTMENT_COL, defaultHidden: true },
      C('certificateType', 'enum', {
        field: 'certificate_type',
        enumKey: 'certificateType',
        width: 26,
      }),
      C('language', 'enum', { enumKey: 'certificateLanguage', width: 14 }),
      C('issueDate', 'date', { field: 'issue_date', width: 14 }),
      C('status', 'status', { statusDomain: 'certificate', width: 12 }),
      C('requestNumber', 'request', {
        field: 'request_number',
        linkField: 'request_id',
        width: 18,
      }),
    ],
    defaultSort: { id: 'issueDate', desc: true },
    table: 'paged',
    preview: {
      stat: 'certificatesYear',
      labelKey: 'reports.preview.certificatesYear',
    },
  },

  /* ── Audit ─────────────────────────────────────────────────────────────── */
  {
    key: 'user-activity',
    i18n: 'userActivity',
    group: 'audit',
    icon: ActivityIcon,
    managers: false,
    requires: ['audit.view'],
    exportPermission: 'audit.export',
    dateRange: { kind: 'activityDate', defaultPreset: 'last30Days' },
    filters: ['category', 'employee'],
    kpis: [
      K('events', ActivityIcon, 'primary'),
      K('users', UsersIcon, 'info', 'integer', {
        labelKey: 'reports.kpis.activeUsers',
      }),
      K('logins', LogInIcon, 'secondary'),
      K('changes', PencilLineIcon, 'success'),
      K('exports', DownloadIcon, 'neutral'),
    ],
    charts: [
      {
        key: 'byDay',
        titleKey: 'reports.charts.eventsByDay',
        type: 'column',
        category: 'day',
        series: [S('events')],
        format: 'integer',
      },
      {
        key: 'byCategory',
        titleKey: 'reports.charts.eventsByCategory',
        type: 'bar',
        category: 'category',
        series: [S('events')],
        format: 'integer',
      },
    ],
    columns: [
      C('user', 'user', { width: 30 }),
      C('events', 'integer', { width: 10 }),
      C('logins', 'integer', { width: 10 }),
      C('changes', 'integer', { width: 10 }),
      C('requestActions', 'integer', { field: 'requests', width: 12 }),
      C('exports', 'integer', { width: 10 }),
      C('activeDays', 'integer', { field: 'active_days', width: 12 }),
      C('topCategory', 'category', { field: 'top_category', width: 16 }),
      C('lastActivity', 'datetime', { field: 'last_activity', width: 20 }),
    ],
    defaultSort: { id: 'events', desc: true },
    table: 'all',
    tableTitleKey: 'reports.view.byUserTable',
    preview: { stat: 'events30', labelKey: 'reports.preview.events30' },
  },
];

const BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));

export function getReportDefinition(key: string): ReportDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export const REPORT_KEYS: readonly string[] = REPORTS.map((r) => r.key);

/** Export dataset key of a report (`/api/export/report-<key>`). */
export function reportDatasetKey(key: string): string {
  return `report-${key}`;
}

/** Row field of a column (default: its id). */
export function columnField(col: ReportColumn): string {
  return col.field ?? col.id;
}

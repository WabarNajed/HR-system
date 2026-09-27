import { checkAccess, can, hasAll, type PermissionSubject } from '@/lib/permissions';
import {
  AUDIT_CATEGORIES,
  CERTIFICATE_TYPES,
  EXPIRY_BUCKETS,
  FILTER_KEYS,
  type RangePreset,
  type ReportDefinition,
  type ReportFilterKey,
} from './definitions';

/**
 * Report filters (isomorphic): URL ⇄ state ⇄ SQL filter object. The same parser serves the report
 * page (searchParams) and the export route (ListParams.filters), so an export always applies exactly
 * the filters on screen. Every value is validated and whitelisted here and again in SQL.
 *
 * URL: ?dateFrom=2026-01-01&dateTo=2026-09-30&department=<uuid>,<uuid>&status=active&period=all
 * `period=all` records that the user cleared a report's default date range.
 */

export const DATE_FROM_KEY = 'dateFrom';
export const DATE_TO_KEY = 'dateTo';
export const PERIOD_KEY = 'period';

/** All URL keys a report page may carry besides table state (export datasets read these). */
export const REPORT_URL_KEYS: readonly string[] = [DATE_FROM_KEY, DATE_TO_KEY, PERIOD_KEY, ...FILTER_KEYS];

export type ReportFilterState = {
  dateFrom: string | null;
  dateTo: string | null;
  /** The effective range came from the report default (no explicit dates in the URL). */
  isDefaultRange: boolean;
  /** The user cleared the default range (`period=all`). */
  allTime: boolean;
  /** Year applied when the `year` filter is empty (the current year). */
  defaultYear: number;
  values: Partial<Record<ReportFilterKey, string[]>>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const UUID_FILTERS: readonly ReportFilterKey[] = ['employee', 'department', 'manager', 'location', 'jobTitle', 'requestType', 'leaveType'];

function isValidIso(value: string | null | undefined): value is string {
  if (!value || !ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2200-12-31';
}

function split(raw: string | null | undefined, max = 50): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ).slice(0, max);
}

function shiftIso(iso: string, { days = 0, months = 0 }: { days?: number; months?: number }): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1 + months, d + days));
  return date.toISOString().slice(0, 10);
}

/** Resolves a preset to an ISO range ending today (`today` = org-local ISO date). */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case 'last30Days':
      return { from: shiftIso(today, { days: -29 }), to: today };
    case 'last90Days':
      return { from: shiftIso(today, { days: -89 }), to: today };
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'calendarYear':
      return {
        from: `${today.slice(0, 4)}-01-01`,
        to: `${today.slice(0, 4)}-12-31`,
      };
    case 'last12Months':
    default:
      return {
        from: shiftIso(`${today.slice(0, 7)}-01`, { months: -11 }),
        to: today,
      };
  }
}

/** Allowed values of a filter for a report (null = any well-formed value). */
export function allowedValues(def: ReportDefinition, key: ReportFilterKey): readonly string[] | null {
  switch (key) {
    case 'status':
      return def.status?.values ?? [];
    case 'bucket':
      return EXPIRY_BUCKETS;
    case 'category':
      return AUDIT_CATEGORIES;
    case 'certificateType':
      return CERTIFICATE_TYPES;
    default:
      return null;
  }
}

/** Parses + validates the report filters from any key → raw-string getter. */
export function readReportFilters(
  def: ReportDefinition,
  get: (key: string) => string | null | undefined,
  today: string,
): ReportFilterState {
  const values: Partial<Record<ReportFilterKey, string[]>> = {};
  for (const key of def.filters) {
    let list = split(get(key));
    if (!list.length) continue;
    if (UUID_FILTERS.includes(key)) list = list.filter((v) => UUID_RE.test(v));
    else if (key === 'year') list = list.filter((v) => /^\d{4}$/.test(v) && Number(v) >= 2000 && Number(v) <= 2100).slice(0, 1);
    else if (key === 'nationality') list = list.map((v) => v.slice(0, 100)).slice(0, 20);
    else {
      const allowed = allowedValues(def, key);
      if (allowed) list = list.filter((v) => allowed.includes(v));
    }
    if (key === 'employee') list = list.slice(0, 20);
    if (list.length) values[key] = list;
  }

  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  let isDefaultRange = false;
  const allTime = get(PERIOD_KEY) === 'all';
  if (def.dateRange) {
    const rawFrom = get(DATE_FROM_KEY);
    const rawTo = get(DATE_TO_KEY);
    dateFrom = isValidIso(rawFrom) ? rawFrom : null;
    dateTo = isValidIso(rawTo) ? rawTo : null;
    if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
    if (!dateFrom && !dateTo && !allTime && def.dateRange.defaultPreset) {
      const range = presetRange(def.dateRange.defaultPreset, today);
      dateFrom = range.from;
      dateTo = range.to;
      isDefaultRange = true;
    }
  }
  return {
    dateFrom,
    dateTo,
    isDefaultRange,
    allTime,
    values,
    defaultYear: Number(today.slice(0, 4)),
  };
}

/** Adapter for Next `searchParams` objects. */
export function searchParamsGetter(sp: Record<string, string | string[] | undefined> | URLSearchParams): (key: string) => string | null {
  if (sp instanceof URLSearchParams) return (key) => sp.get(key);
  return (key) => {
    const raw = sp[key];
    return Array.isArray(raw) ? raw.join(',') : (raw ?? null);
  };
}

/** Number of user-set filters (for the "Filters (n)" badge / reset button). */
export function activeFilterCount(state: ReportFilterState): number {
  const n = Object.values(state.values).filter((v) => v && v.length).length;
  return n + (state.dateFrom || state.dateTo ? (state.isDefaultRange ? 0 : 1) : 0);
}

/** SQL filter object (`p_filters`) for the report functions. */
export function toSqlFilters(state: ReportFilterState): Record<string, unknown> {
  const v = state.values;
  const out: Record<string, unknown> = {};
  const put = (key: string, list: string[] | undefined) => {
    if (list?.length) out[key] = list;
  };
  if (state.dateFrom) out.date_from = state.dateFrom;
  if (state.dateTo) out.date_to = state.dateTo;
  put('employee_ids', v.employee);
  put('department_ids', v.department);
  put('manager_ids', v.manager);
  put('location_ids', v.location);
  put('job_title_ids', v.jobTitle);
  put('nationalities', v.nationality);
  put('request_type_ids', v.requestType);
  put('leave_type_ids', v.leaveType);
  put('statuses', v.status);
  put('buckets', v.bucket);
  put('categories', v.category);
  put('certificate_types', v.certificateType);
  out.year = v.year?.[0] ?? String(state.defaultYear);
  return out;
}

/* ─── Access ─────────────────────────────────────────────────────────────── */

/** Report Center access (mirrors ROUTE_ACCESS['/reports']). */
export function canOpenReportCenter(subject: PermissionSubject | null | undefined): boolean {
  return checkAccess(subject, { anyOf: ['reports.view'], managers: true });
}

/** Whether the user may open one report: reports.view (or manager for team reports) + extra permissions. */
export function canViewReport(subject: PermissionSubject | null | undefined, def: ReportDefinition): boolean {
  if (!subject) return false;
  if (subject.isSuperAdmin) return true;
  const base = can(subject, 'reports.view') || (def.managers && Boolean(subject.isManager));
  return base && hasAll(subject, def.requires);
}

/**
 * Exports need `reports.export` (+ the report's stricter export permission, e.g. `audit.export` for
 * User Activity) on top of report access. The export datasets check exactly the same.
 */
export function canExportReport(subject: PermissionSubject | null | undefined, def: ReportDefinition): boolean {
  return canViewReport(subject, def) && can(subject, 'reports.export') && (!def.exportPermission || can(subject, def.exportPermission));
}

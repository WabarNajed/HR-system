import 'server-only';

import { businessDaysBetween, daysBetween } from '@/lib/dates';
import { defineDataset, fetchAllPages, type AnyExportDataset } from '@/lib/export/types';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { LooseTranslator } from '@/lib/i18n/translator';
import type { ListParams } from '@/lib/list-params';
import {
  BALANCE_FILTERS,
  BALANCE_SORTS,
  buildBalancesQuery,
  buildLeaveRequestsQuery,
  getLeaveAccess,
  getLeaveOrgSettings,
  mapBalanceRows,
  mapLeaveRequestRows,
  REQUEST_FILTERS,
  REQUEST_SORTS,
  resolveScope,
} from './queries';
import type { BalanceRow, LeaveRequestListRow } from './types';

/**
 * Export datasets of the leave module, served by `GET /api/export/<key>` with the same filters as
 * the /leave tables (RLS decides the rows: own, direct reports or organization).
 */

function statusLabel(t: LooseTranslator, status: string): string {
  const key = `statuses.request.${status}`;
  return t.has(key) ? t(key) : status;
}

function describeRequestFilters(params: ListParams, t: LooseTranslator): string[] {
  const f = params.filters as Record<string, string[] | undefined>;
  const lines: string[] = [];
  if (f.status?.length) lines.push(`${t('common.status')}: ${f.status.map((s) => statusLabel(t, s)).join(', ')}`);
  if (f.periodFrom?.[0] || f.periodTo?.[0]) lines.push(`${t('leave.fields.period')}: ${f.periodFrom?.[0] ?? '…'} – ${f.periodTo?.[0] ?? '…'}`);
  if (f.scope?.[0]) lines.push(`${t('leave.scope.label')}: ${t.has(`leave.scope.${f.scope[0]}`) ? t(`leave.scope.${f.scope[0]}`) : f.scope[0]}`);
  return lines;
}

const leaveRequests = defineDataset<LeaveRequestListRow>({
  key: 'leave_requests',
  permission: 'leave.export',
  titleKey: 'leave.export.requestsTitle',
  filterKeys: REQUEST_FILTERS,
  allowedSorts: REQUEST_SORTS,
  defaultSort: 'start_date',
  defaultDir: 'desc',
  columns: (t, ctx) => [
    { key: 'request_number', header: t('leave.fields.requestNumber'), width: 18 },
    { key: 'employee_number', header: t('leave.fields.employeeNumber'), width: 14, value: (r) => r.employee.employee_number ?? '' },
    { key: 'employee', header: t('leave.fields.employee'), width: 30, value: (r) => employeeDisplayName(r.employee, ctx.locale) },
    { key: 'department', header: t('common.department'), width: 24, value: (r) => (r.employee.department ? localized(r.employee.department, 'name', ctx.locale) : '') },
    { key: 'leave_type', header: t('leave.fields.leaveType'), width: 22, value: (r) => (r.leave_type ? localized(r.leave_type, 'name', ctx.locale) : '') },
    { key: 'start_date', header: t('common.startDate'), type: 'date' },
    { key: 'end_date', header: t('common.endDate'), type: 'date' },
    { key: 'return_date', header: t('leave.fields.returnDate'), type: 'date' },
    { key: 'days', header: t('leave.fields.days'), type: 'number', width: 10 },
    { key: 'status', header: t('common.status'), width: 22, value: (r) => statusLabel(t, r.status) },
    { key: 'submitted_at', header: t('leave.fields.submitted'), type: 'date' },
  ],
  describeFilters: describeRequestFilters,
  fetchRows: async (supabase, params, ctx) => {
    const access = await getLeaveAccess(ctx.session);
    const raw = await fetchAllPages(
      (from, to) => buildLeaveRequestsQuery(supabase, params, access, ctx.locale).range(from, to) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>,
      ctx.limit,
    );
    return mapLeaveRequestRows(raw, new Map());
  },
});

const leaveBalances = defineDataset<BalanceRow>({
  key: 'leave_balances',
  permission: 'leave.export',
  titleKey: 'leave.export.balancesTitle',
  filterKeys: [...BALANCE_FILTERS, 'scope'],
  allowedSorts: BALANCE_SORTS,
  defaultSort: 'employee',
  defaultDir: 'asc',
  columns: (t, ctx) => [
    { key: 'employee_number', header: t('leave.fields.employeeNumber'), width: 14, value: (r) => r.employee?.employee_number ?? '' },
    { key: 'employee', header: t('leave.fields.employee'), width: 30, value: (r) => employeeDisplayName(r.employee, ctx.locale) },
    { key: 'department', header: t('common.department'), width: 24, value: (r) => (r.employee?.department ? localized(r.employee.department, 'name', ctx.locale) : '') },
    { key: 'leave_type', header: t('leave.fields.leaveType'), width: 22, value: (r) => localized(r.leave_type, 'name', ctx.locale) },
    { key: 'year', header: t('leave.fields.year'), type: 'integer', width: 8 },
    { key: 'opening_balance', header: t('leave.fields.opening'), type: 'number', width: 12 },
    { key: 'entitlement', header: t('leave.fields.entitlement'), type: 'number', width: 12 },
    { key: 'adjustment', header: t('leave.fields.adjustment'), type: 'number', width: 12 },
    { key: 'used', header: t('leave.fields.used'), type: 'number', width: 10 },
    { key: 'pending', header: t('leave.fields.pending'), type: 'number', width: 10 },
    { key: 'remaining', header: t('leave.fields.remaining'), type: 'number', width: 12 },
    { key: 'available', header: t('leave.fields.available'), type: 'number', width: 12 },
  ],
  describeFilters: (params, t) => {
    const f = params.filters as Record<string, string[] | undefined>;
    return f.year?.[0] ? [`${t('leave.fields.year')}: ${f.year[0]}`] : [];
  },
  fetchRows: async (supabase, params, ctx) => {
    const [access, settings] = await Promise.all([getLeaveAccess(ctx.session), getLeaveOrgSettings()]);
    const f = params.filters as Record<string, string[] | undefined>;
    const yearValue = Number(f.year?.[0]);
    const year = Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2200 ? yearValue : settings.year;
    // The balances table is the team / organization view; "mine" exports the viewer's own rows.
    const scope = resolveScope(f.scope?.[0], access);
    const raw = await fetchAllPages(
      (from, to) => buildBalancesQuery(supabase, params, access, scope, year, ctx.locale).range(from, to) as unknown as PromiseLike<{ data: unknown[] | null; error: unknown }>,
      ctx.limit,
    );
    return mapBalanceRows(raw);
  },
});

/* ─── Configuration (master-data pattern: /settings/leave-types, /settings/public-holidays) ─── */

type LeaveTypeExportRow = {
  code: string;
  name_ar: string;
  name_en: string;
  is_paid: boolean;
  deducts_balance: boolean;
  default_entitlement: number;
  max_days_per_request: number | null;
  day_count_basis: string;
  requires_attachment: boolean;
  gender_restriction: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
};

const yesNo = (t: LooseTranslator, v: boolean) => (v ? t('common.yes') : t('common.no'));

/** Filters of the client-side configuration tables (`?q=`, `?status=active,inactive`, `?deducts=yes,no`). */
function matchesConfigFilters(params: ListParams, active: boolean, text: string, deducts?: boolean): boolean {
  const f = params.filters as Record<string, string[] | undefined>;
  if (f.status?.length && !f.status.includes(active ? 'active' : 'inactive')) return false;
  if (deducts !== undefined && f.deducts?.length && !f.deducts.includes(deducts ? 'yes' : 'no')) return false;
  return !params.q || text.toLowerCase().includes(params.q.toLowerCase());
}

const leaveTypes = defineDataset<LeaveTypeExportRow>({
  key: 'leave_types',
  permission: 'settings.export',
  titleKey: 'nav.settings.items.leaveTypes',
  filterKeys: ['status', 'deducts'],
  columns: (t) => [
    { key: 'code', header: t('common.code'), width: 16 },
    { key: 'name_ar', header: t('common.nameAr'), width: 26 },
    { key: 'name_en', header: t('common.nameEn'), width: 26 },
    { key: 'is_paid', header: t('leave.types.fields.paid'), width: 12, value: (r) => yesNo(t, r.is_paid) },
    { key: 'deducts_balance', header: t('leave.types.fields.deducts'), width: 14, value: (r) => yesNo(t, r.deducts_balance) },
    { key: 'default_entitlement', header: t('leave.types.fields.defaultEntitlement'), type: 'number', width: 14 },
    { key: 'max_days_per_request', header: t('leave.types.fields.maxDays'), type: 'number', width: 14 },
    { key: 'day_count_basis', header: t('leave.types.fields.basis'), width: 18, value: (r) => t(`enums.dayCountBasis.${r.day_count_basis}`) },
    { key: 'requires_attachment', header: t('leave.types.fields.attachment'), width: 14, value: (r) => yesNo(t, r.requires_attachment) },
    { key: 'gender_restriction', header: t('leave.types.fields.gender'), width: 18, value: (r) => t(`enums.genderRestriction.${r.gender_restriction ?? 'all'}`) },
    { key: 'color', header: t('leave.types.fields.color'), width: 10 },
    { key: 'sort_order', header: t('leave.types.fields.sortOrder'), type: 'integer', width: 10 },
    { key: 'is_active', header: t('common.status'), width: 12, value: (r) => (r.is_active ? t('common.active') : t('common.inactive')) },
  ],
  fetchRows: async (supabase, params) => {
    const { data, error } = await supabase
      .from('leave_types')
      .select('code, name_ar, name_en, is_paid, deducts_balance, default_entitlement, max_days_per_request, day_count_basis, requires_attachment, gender_restriction, color, sort_order, is_active')
      .order('sort_order')
      .order('name_en')
      .limit(1000);
    if (error) throw error;
    return (data ?? [])
      .filter((r) => matchesConfigFilters(params, r.is_active, `${r.name_ar} ${r.name_en} ${r.code}`, r.deducts_balance))
      .map((r) => ({
        ...r,
        default_entitlement: Number(r.default_entitlement),
        max_days_per_request: r.max_days_per_request === null ? null : Number(r.max_days_per_request),
      }));
  },
});

type HolidayExportRow = {
  name_ar: string | null;
  name_en: string | null;
  start_date: string;
  end_date: string;
  days: number;
  working_days: number;
  is_active: boolean;
};

const publicHolidays = defineDataset<HolidayExportRow>({
  key: 'public_holidays',
  permission: 'settings.export',
  titleKey: 'nav.settings.items.publicHolidays',
  filterKeys: ['year', 'status'],
  columns: (t) => [
    { key: 'name_ar', header: t('common.nameAr'), width: 30 },
    { key: 'name_en', header: t('common.nameEn'), width: 30 },
    { key: 'start_date', header: t('common.startDate'), type: 'date' },
    { key: 'end_date', header: t('common.endDate'), type: 'date' },
    { key: 'days', header: t('leave.holidays.fields.days'), type: 'integer', width: 10 },
    { key: 'working_days', header: t('leave.holidays.fields.workingDays'), type: 'integer', width: 14 },
    { key: 'is_active', header: t('common.status'), width: 12, value: (r) => (r.is_active ? t('common.active') : t('common.inactive')) },
  ],
  describeFilters: (params, t) => {
    const year = (params.filters as Record<string, string[] | undefined>).year?.[0];
    return year ? [`${t('leave.fields.year')}: ${year}`] : [];
  },
  fetchRows: async (supabase, params) => {
    const settings = await getLeaveOrgSettings();
    const raw = Number((params.filters as Record<string, string[] | undefined>).year?.[0]);
    const year = Number.isInteger(raw) && raw >= 2000 && raw <= 2200 ? raw : settings.year;
    const { data, error } = await supabase
      .from('public_holidays')
      .select('name_ar, name_en, start_date, end_date, is_active')
      .lte('start_date', `${year}-12-31`)
      .gte('end_date', `${year}-01-01`)
      .order('start_date')
      .limit(1000);
    if (error) throw error;
    return (data ?? [])
      .filter((h) => matchesConfigFilters(params, h.is_active, `${h.name_ar ?? ''} ${h.name_en ?? ''}`))
      .map((h) => ({
        ...h,
        days: (daysBetween(h.start_date, h.end_date) ?? 0) + 1,
        working_days: businessDaysBetween(h.start_date, h.end_date, settings.workingDays),
      }));
  },
});

export const datasets: AnyExportDataset[] = [leaveRequests, leaveBalances, leaveTypes, publicHolidays];

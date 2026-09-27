import 'server-only';

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

export const datasets: AnyExportDataset[] = [leaveRequests, leaveBalances];

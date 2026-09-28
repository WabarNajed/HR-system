import { defineDataset, type AnyExportDataset } from '@/lib/export/types';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { firstFilter } from '@/lib/list-params';
import { FILTER_STATUSES, parseRequestTab, REQUEST_FILTER_KEYS, REQUEST_SORTS, requestSla, SLA_STATES } from './constants';
import { getRequestAccess, listRequestsForExport, loadRequestTypes, subtypeMap } from './queries';
import type { RequestListRow } from './types';

/**
 * Export datasets of the requests module, served by `GET /api/export/<key>` and registered in
 * `src/lib/export/registry.ts`. `requests` honours the Request Center tab, search, filters and sort.
 */
export const datasets: AnyExportDataset[] = [
  defineDataset<RequestListRow>({
    key: 'requests',
    permission: 'requests.export',
    titleKey: 'requests.export.title',
    filterKeys: REQUEST_FILTER_KEYS,
    allowedSorts: REQUEST_SORTS,
    defaultSort: 'created_at',
    defaultDir: 'desc',
    columns: (t, ctx) => {
      const locale = ctx.locale;
      const status = (s: string) => t(`statuses.request.${s}`);
      return [
        { key: 'request_number', header: t('requests.columns.number'), width: 18 },
        { key: 'employee_number', header: t('requests.export.employeeNumber'), width: 14, value: (r) => r.employee?.employee_number ?? '' },
        { key: 'employee', header: t('requests.columns.employee'), width: 28, value: (r) => (r.employee ? employeeDisplayName(r.employee, locale) : '') },
        {
          key: 'department',
          header: t('requests.filters.department'),
          width: 22,
          value: (r) => (r.employee?.department ? localized(r.employee.department, 'name', locale) : ''),
        },
        { key: 'type', header: t('requests.columns.type'), width: 24, value: (r) => (r.type ? localized(r.type, 'name', locale) : '') },
        {
          key: 'subtype',
          header: t('requests.export.subtype'),
          width: 22,
          value: (r) => {
            const o = r.type?.subtypes.find((s) => s.value === r.subtype);
            return o ? localized(o, 'label', locale) : (r.subtype ?? '');
          },
        },
        { key: 'status', header: t('requests.columns.status'), width: 22, value: (r) => status(r.status) },
        {
          key: 'step',
          header: t('requests.columns.step'),
          width: 24,
          value: (r) => (r.step ? localized({ name_ar: r.step.name_ar, name_en: r.step.name_en }, 'name', locale) : ''),
        },
        { key: 'assigned', header: t('requests.columns.assigned'), width: 22, value: (r) => r.assignee_name ?? '' },
        { key: 'created_at', header: t('requests.columns.created'), type: 'datetime' },
        { key: 'submitted_at', header: t('requests.details.submitted'), type: 'datetime' },
        { key: 'due_at', header: t('requests.export.dueAt'), type: 'datetime' },
        {
          key: 'sla',
          header: t('requests.columns.sla'),
          width: 14,
          value: (r) => {
            const s = requestSla(r);
            return s ? t(`statuses.sla.${s}`) : '';
          },
        },
        { key: 'completed_at', header: t('requests.export.completedAt'), type: 'datetime' },
      ];
    },
    fetchRows: async (supabase, params, ctx) => {
      const [access, types] = await Promise.all([getRequestAccess(supabase, ctx.session.user.id), loadRequestTypes(supabase, { withFields: false })]);
      return listRequestsForExport(supabase, params, {
        tab: parseRequestTab(firstFilter(params.filters, 'tab')),
        access,
        typeIdsByKey: new Map(types.map((x) => [x.key, x.id])),
        subtypes: subtypeMap(types),
        limit: ctx.limit,
        locale: ctx.locale,
      });
    },
    describeFilters: (params, t) => {
      const lines: string[] = [];
      const tab = parseRequestTab(firstFilter(params.filters, 'tab'));
      if (tab !== 'all') lines.push(`${t('requests.export.tab')}: ${t(`requests.tabs.${tab === 'in_progress' ? 'inProgress' : tab}`)}`);
      if (params.q) lines.push(`${t('common.search')}: ${params.q}`);
      const sep = t.locale === 'ar' ? '، ' : ', ';
      // Only known values are described (a hand-edited URL must not print raw message keys).
      const status = (params.filters.status ?? []).filter((s) => (FILTER_STATUSES as readonly string[]).includes(s));
      if (status.length) lines.push(`${t('requests.filters.status')}: ${status.map((s) => t(`statuses.request.${s}`)).join(sep)}`);
      const sla = firstFilter(params.filters, 'sla');
      if (sla && (SLA_STATES as readonly string[]).includes(sla)) lines.push(`${t('requests.filters.sla')}: ${t(`statuses.sla.${sla}`)}`);
      const from = firstFilter(params.filters, 'createdFrom');
      const to = firstFilter(params.filters, 'createdTo');
      if (from || to) lines.push(`${t('requests.filters.created')}: ${from ?? '…'} – ${to ?? '…'}`);
      return lines;
    },
  }),
];

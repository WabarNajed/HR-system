import { employeeDisplayName } from '@/lib/i18n/localized';
import { defineDataset, fetchAllPages, type AnyExportDataset } from '@/lib/export/types';
import type { LooseTranslator } from '@/lib/i18n/translator';
import type { ListParams } from '@/lib/list-params';
import { buildUsersQuery, toUserRow, USER_FILTER_KEYS, USER_SORTS, type RawUserRow } from './queries';
import type { UserRow } from './types';

/**
 * Export datasets of the users module, served by `GET /api/export/<key>` and registered in
 * `src/lib/export/registry.ts`. `users` applies the same search / role / status filters and sort
 * as Settings › Users.
 */

type UserExportRow = UserRow & { roleNames: string };

function statusLabel(t: LooseTranslator, row: UserRow): string {
  if (row.invitationPending) return t('users.status.invited');
  const key = `statuses.profile.${row.status}`;
  return t.has(key) ? t(key) : row.status;
}

const users = defineDataset<UserExportRow>({
  key: 'users',
  permission: 'users.export',
  titleKey: 'users.export.title',
  filterKeys: USER_FILTER_KEYS,
  allowedSorts: USER_SORTS,
  defaultSort: 'name',
  defaultDir: 'asc',
  columns: (t, ctx) => [
    { key: 'name', header: t('users.columns.user'), width: 28, value: (r) => r.fullName ?? '' },
    { key: 'email', header: t('users.columns.email'), width: 30, value: (r) => r.email ?? '' },
    { key: 'mobile', header: t('common.mobile'), width: 16, value: (r) => r.mobile ?? '' },
    { key: 'employee_number', header: t('users.export.employeeNumber'), width: 14, value: (r) => r.employee?.employee_number ?? '' },
    { key: 'employee_name', header: t('users.columns.employee'), width: 28, value: (r) => (r.employee ? employeeDisplayName(r.employee, ctx.locale) : '') },
    { key: 'roles', header: t('users.columns.roles'), width: 30, value: (r) => r.roleNames },
    { key: 'status', header: t('common.status'), width: 18, value: (r) => statusLabel(t, r) },
    { key: 'last_login', header: t('users.columns.lastLogin'), type: 'datetime', value: (r) => r.lastLoginAt },
    { key: 'invited_at', header: t('users.invitedAt'), type: 'datetime', value: (r) => r.invitedAt },
    { key: 'created', header: t('users.columns.created'), type: 'datetime', value: (r) => r.createdAt },
  ],
  fetchRows: async (supabase, params, ctx) => {
    const { data: roleRows } = await supabase.from('roles').select('key, name_ar, name_en');
    const names = new Map(
      (roleRows ?? []).map((r) => [r.key, (ctx.locale === 'ar' ? r.name_ar || r.name_en : r.name_en || r.name_ar) || r.key]),
    );
    const raw = await fetchAllPages<RawUserRow>(async (from, to) => {
      const built = await buildUsersQuery(supabase, params as ListParams, false);
      if (!built) return { data: [], error: null };
      const { data, error } = await built.query.range(from, to);
      return { data: (data ?? []) as unknown as RawUserRow[], error };
    }, ctx.limit);
    const sep = ctx.locale === 'ar' ? '، ' : ', ';
    return raw.map((r) => {
      const row = toUserRow(r, ctx.session.user.id);
      return { ...row, roleNames: row.roles.map((k) => names.get(k) ?? k).join(sep) };
    });
  },
  describeFilters: (params, t) => {
    const lines: string[] = [];
    if (params.q) lines.push(`${t('common.search')}: ${params.q}`);
    if (params.filters.status?.length) {
      lines.push(
        `${t('common.status')}: ${params.filters.status
          .map((s) => (s === 'invited' ? t('users.status.invited') : t.has(`statuses.profile.${s}`) ? t(`statuses.profile.${s}`) : s))
          .join(', ')}`,
      );
    }
    if (params.filters.role?.length) lines.push(`${t('users.filters.role')}: ${params.filters.role.join(', ')}`);
    return lines;
  },
});

export const datasets: AnyExportDataset[] = [users];

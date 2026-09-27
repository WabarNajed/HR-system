import 'server-only';

import { defineDataset, fetchAllPages, type AnyExportDataset } from '@/lib/export/types';
import type { LooseTranslator } from '@/lib/i18n/translator';
import type { ListParams } from '@/lib/list-params';
import {
  auditActionLabel,
  auditCategoryLabel,
  auditEntityLabel,
  isAuditCategory,
  splitAction,
  type AuditTranslator,
} from './labels';
import { applyAuditFilters, AUDIT_FILTER_KEYS, AUDIT_SORTS, type AuditListParams, type AuditRow } from './queries';

/**
 * Export datasets of the audit module, served by `GET /api/export/<key>` and registered in
 * `src/lib/export/registry.ts`. `audit` exports the audit log with the page's search, filters and
 * sorting (masked values stay masked — they are stored masked).
 */

function changedFields(changes: unknown): string {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return '';
  return Object.keys(changes as Record<string, unknown>).join(', ');
}

function describeFilters(params: ListParams, t: LooseTranslator): string[] {
  const at = t as unknown as AuditTranslator;
  const lines: string[] = [];
  const sep = t.locale === 'ar' ? '، ' : ', ';
  const f = params.filters as Partial<Record<string, string[]>>;
  const from = f.createdFrom?.[0];
  const to = f.createdTo?.[0];
  if (from || to) lines.push(`${t('audit.filters.date')}: ${from ?? '…'} – ${to ?? '…'}`);
  const categories = (f.category ?? []).filter(isAuditCategory);
  if (categories.length) lines.push(`${t('audit.filters.category')}: ${categories.map((c) => auditCategoryLabel(at, c)).join(sep)}`);
  if (f.action?.length) lines.push(`${t('audit.filters.action')}: ${f.action.map((a) => auditActionLabel(at, a)).join(sep)}`);
  if (f.entity?.length) lines.push(`${t('audit.filters.entity')}: ${f.entity.map((e) => auditEntityLabel(at, e)).join(sep)}`);
  if (f.actor?.length) lines.push(`${t('audit.filters.actor')}: ${f.actor.length}`);
  if (params.q) lines.push(`${t('common.search')}: ${params.q}`);
  return lines;
}

type AuditExportRow = AuditRow;

export const datasets: AnyExportDataset[] = [
  defineDataset<AuditExportRow>({
    key: 'audit',
    permission: 'audit.export',
    titleKey: 'audit.title',
    filterKeys: AUDIT_FILTER_KEYS,
    allowedSorts: AUDIT_SORTS,
    defaultSort: 'created_at',
    defaultDir: 'desc',
    landscape: true,
    columns: (t) => {
      const at = t as unknown as AuditTranslator;
      return [
        { key: 'id', header: t('audit.columns.id'), type: 'integer', width: 10 },
        { key: 'created_at', header: t('audit.columns.time'), type: 'datetime', width: 20 },
        { key: 'actor_email', header: t('audit.columns.actor'), width: 28, value: (r) => r.actor_email ?? t('audit.system') },
        { key: 'action_label', header: t('audit.columns.action'), width: 26, value: (r) => auditActionLabel(at, r.action) },
        { key: 'action', header: t('audit.columns.actionCode'), width: 24 },
        {
          key: 'entity_type',
          header: t('audit.columns.entity'),
          width: 20,
          value: (r) => auditEntityLabel(at, r.entity_type ?? splitAction(r.action).entity),
        },
        { key: 'entity_id', header: t('audit.details.entityId'), width: 38 },
        { key: 'summary', header: t('audit.columns.summary'), width: 44 },
        { key: 'changed_fields', header: t('audit.columns.changedFields'), width: 36, value: (r) => changedFields(r.changes) },
        { key: 'ip', header: t('audit.columns.ip'), width: 16 },
      ];
    },
    fetchRows: async (supabase, params, ctx) =>
      fetchAllPages<AuditExportRow>(
        (from, to) =>
          applyAuditFilters(
            supabase
              .from('audit_logs')
              .select('id, created_at, actor_id, actor_email, action, entity_type, entity_id, employee_id, summary, changes, ip, user_agent'),
            params as AuditListParams,
          ).range(from, to) as unknown as PromiseLike<{ data: AuditExportRow[] | null; error: unknown }>,
        ctx.limit,
      ),
    describeFilters,
  }),
];

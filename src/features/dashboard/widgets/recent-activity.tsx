import { HistoryIcon, ScrollTextIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { auditIcon, auditToneClass } from '@/features/audit/components/audit-visuals';
import { auditActionLabel, type AuditTranslator } from '@/features/audit/labels';
import { auditSummary } from '@/features/audit/summary';
import { formatRelative } from '@/lib/dates';
import { resolveLocale } from '@/lib/i18n/config';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { RowIcon, ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetRow } from '../components/widget-parts';
import { getRecentAudit } from '../queries';

/**
 * Latest business events (audit.view; sign-ins excluded). Each row deep-links to the event in the
 * audit log and reads "<localized summary> · <actor name>".
 */
export async function RecentActivityWidget() {
  const [res, t, tRoot, rawLocale] = await Promise.all([
    getRecentAudit(),
    getTranslations('dashboard.widgets.recentActivity'),
    getTranslations(),
    getLocale(),
  ]);
  const locale = resolveLocale(rawLocale);
  const ta = tRoot as unknown as AuditTranslator;
  return (
    <Widget title={t('title')} icon={HistoryIcon} actions={<ViewAllLink href="/admin/audit-logs" />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.rows.length === 0 ? (
        <WidgetEmpty icon={ScrollTextIcon} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <WidgetList>
          {res.data.rows.map((row) => {
            const Icon = auditIcon(row.action);
            const summary = auditSummary(ta, row, locale, res.data.lookups);
            const profile = row.actor_id ? res.data.actors.get(row.actor_id) : undefined;
            const actor = (profile ? employeeDisplayName(profile.employee, locale) || profile.full_name : null) || row.actor_email || t('system');
            return (
              <WidgetRow key={row.id} href={`/admin/audit-logs?event=${row.id}`}>
                <RowIcon className={auditToneClass(row.action)}>
                  <Icon />
                </RowIcon>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-medium text-foreground">{auditActionLabel(ta, row.action)}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {summary ? (
                      <>
                        <bdi>{summary}</bdi>
                        <span aria-hidden> · </span>
                      </>
                    ) : null}
                    <bdi>{actor}</bdi>
                  </div>
                </div>
                <span className="shrink-0 text-2xs text-faint-foreground">{formatRelative(row.created_at, locale)}</span>
              </WidgetRow>
            );
          })}
        </WidgetList>
      )}
    </Widget>
  );
}

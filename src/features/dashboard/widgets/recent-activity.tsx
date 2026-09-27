import { HistoryIcon, ScrollTextIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { auditIcon, auditToneClass } from '@/features/audit/components/audit-visuals';
import { auditActionLabel, type AuditTranslator } from '@/features/audit/labels';
import { formatRelative } from '@/lib/dates';
import { RowIcon, ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetRow } from '../components/widget-parts';
import { getRecentAudit } from '../queries';

/** Latest audit events (audit.view). Each row deep-links to the event in the audit log. */
export async function RecentActivityWidget() {
  const [res, t, tRoot, locale] = await Promise.all([
    getRecentAudit(),
    getTranslations('dashboard.widgets.recentActivity'),
    getTranslations(),
    getLocale(),
  ]);
  const ta = tRoot as unknown as AuditTranslator;
  return (
    <Widget title={t('title')} icon={HistoryIcon} actions={<ViewAllLink href="/admin/audit-logs" />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={ScrollTextIcon} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <WidgetList>
          {res.data.map((row) => {
            const Icon = auditIcon(row.action);
            return (
              <WidgetRow key={row.id} href={`/admin/audit-logs?event=${row.id}`}>
                <RowIcon className={auditToneClass(row.action)}>
                  <Icon />
                </RowIcon>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-medium text-foreground">{auditActionLabel(ta, row.action)}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {row.summary ? (
                      <>
                        <bdi>{row.summary}</bdi>
                        <span aria-hidden> · </span>
                      </>
                    ) : null}
                    <bdi>{row.actor_email ?? t('system')}</bdi>
                  </div>
                </div>
                <span className="shrink-0 text-[0.6875rem] text-faint-foreground">{formatRelative(row.created_at, locale)}</span>
              </WidgetRow>
            );
          })}
        </WidgetList>
      )}
    </Widget>
  );
}

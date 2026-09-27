import { CheckCheckIcon, InboxIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatInteger } from '@/lib/format';
import { RequestRow } from '../components/rows';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetListEnd, WidgetStrip } from '../components/widget-parts';
import { getDashboardStats, getHrRequestQueue, HR_QUEUE_LIMIT } from '../queries';

/** Organization request queue: open requests ordered by due date (SLA first). */
export async function RequestQueueWidget() {
  const [res, stats, t, locale] = await Promise.all([
    getHrRequestQueue(),
    getDashboardStats(),
    getTranslations('dashboard.widgets.requestQueue'),
    getLocale(),
  ]);
  const hr = stats.ok ? stats.data.hr : undefined;
  const n = (v: number) => formatInteger(v, locale);
  return (
    <Widget
      title={t('title')}
      description={
        hr
          ? t('description', {
              open: formatInteger(hr.pending_requests, locale),
              overdue: formatInteger(hr.overdue_requests, locale),
            })
          : undefined
      }
      icon={InboxIcon}
      actions={<ViewAllLink href="/requests" />}
    >
      {hr ? (
        <WidgetStrip
          items={[
            { key: 'approval', label: t('stripApproval'), value: n(Math.max(0, hr.pending_requests - hr.pending_hr_review)) },
            { key: 'hr', label: t('stripHr'), value: n(hr.pending_hr_review) },
            { key: 'dueSoon', label: t('stripDueSoon'), value: n(hr.due_soon_requests), tone: hr.due_soon_requests > 0 ? 'warning' : 'default' },
            { key: 'overdue', label: t('stripOverdue'), value: n(hr.overdue_requests), tone: hr.overdue_requests > 0 ? 'danger' : 'default' },
          ]}
        />
      ) : null}
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={CheckCheckIcon} tone="success" title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <>
          <WidgetList>
            {res.data.map((r) => (
              <RequestRow key={r.id} request={r} showEmployee trailing="sla" />
            ))}
          </WidgetList>
          {res.data.length < HR_QUEUE_LIMIT ? <WidgetListEnd icon={CheckCheckIcon} label={t('endOfQueue')} /> : null}
        </>
      )}
    </Widget>
  );
}

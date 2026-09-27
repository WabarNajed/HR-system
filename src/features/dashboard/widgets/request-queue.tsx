import { CheckCheckIcon, InboxIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatInteger } from '@/lib/format';
import { RequestRow } from '../components/rows';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList } from '../components/widget-parts';
import { getDashboardStats, getHrRequestQueue } from '../queries';

/** Organization request queue: open requests ordered by due date (SLA first). */
export async function RequestQueueWidget() {
  const [res, stats, t, locale] = await Promise.all([
    getHrRequestQueue(),
    getDashboardStats(),
    getTranslations('dashboard.widgets.requestQueue'),
    getLocale(),
  ]);
  const hr = stats.ok ? stats.data.hr : undefined;
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
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={CheckCheckIcon} tone="success" title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <WidgetList>
          {res.data.map((r) => (
            <RequestRow key={r.id} request={r} showEmployee trailing="sla" />
          ))}
        </WidgetList>
      )}
    </Widget>
  );
}

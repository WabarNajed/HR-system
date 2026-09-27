import { BellIcon, BellOffIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { NotificationRecord } from '@/components/shell/notification-visuals';
import { NotificationMiniList } from '@/features/notifications/components/notification-mini-list';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError } from '../components/widget-parts';
import { getLatestNotifications } from '../queries';

/** Latest 5 notifications; opening one marks it read and navigates to its record. */
export async function LatestNotificationsWidget({ nowIso }: { nowIso: string }) {
  const [res, t] = await Promise.all([getLatestNotifications(), getTranslations('dashboard.widgets.notifications')]);
  return (
    <Widget title={t('title')} icon={BellIcon} actions={<ViewAllLink href="/notifications" />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={BellOffIcon} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <NotificationMiniList items={res.data as NotificationRecord[]} nowIso={nowIso} />
      )}
    </Widget>
  );
}

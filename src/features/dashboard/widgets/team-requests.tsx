import { FileStackIcon, InboxIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { RequestRow } from '../components/rows';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList } from '../components/widget-parts';
import { getTeamRequests } from '../queries';

/** Latest requests of the manager's direct reports (types with a manager step — RLS). */
export async function TeamRequestsWidget({ employeeId }: { employeeId: string }) {
  const [res, t] = await Promise.all([getTeamRequests(employeeId), getTranslations('dashboard.widgets.teamRequests')]);
  return (
    <Widget title={t('title')} icon={FileStackIcon} actions={<ViewAllLink href="/requests" />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={InboxIcon} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <WidgetList>
          {res.data.map((r) => (
            <RequestRow key={r.id} request={r} showEmployee />
          ))}
        </WidgetList>
      )}
    </Widget>
  );
}

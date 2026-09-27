import { FilePlus2Icon, FileTextIcon, InboxIcon } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { RequestRow } from '../components/rows';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList } from '../components/widget-parts';
import { getMyRecentRequests } from '../queries';

/** The caller's latest requests (own or filed for them), newest activity first. */
export async function RecentRequestsWidget({ employeeId, userId }: { employeeId: string; userId: string }) {
  const [res, t] = await Promise.all([getMyRecentRequests(employeeId, userId), getTranslations('dashboard.widgets.recentRequests')]);
  return (
    <Widget title={t('title')} icon={FileTextIcon} actions={<ViewAllLink href="/requests" />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty
          icon={InboxIcon}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/requests/new">
                <FilePlus2Icon />
                {t('emptyAction')}
              </Link>
            </Button>
          }
        />
      ) : (
        <WidgetList>
          {res.data.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </WidgetList>
      )}
    </Widget>
  );
}

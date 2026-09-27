import { CheckCheckIcon, ClipboardCheckIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { RequestRow } from '../components/rows';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetListEnd } from '../components/widget-parts';
import { APPROVAL_QUEUE_LIMIT, getApprovalQueue, getDashboardStats } from '../queries';

/** Requests waiting for the caller's decision (current approver), earliest due first. */
export async function ApprovalQueueWidget({ userId }: { userId: string }) {
  const [res, stats, t] = await Promise.all([getApprovalQueue(userId), getDashboardStats(), getTranslations('dashboard.widgets.approvalQueue')]);
  const total = stats.ok ? (stats.data.manager?.pending_approvals ?? null) : null;
  return (
    <Widget
      title={t('title')}
      description={total !== null && total > 0 ? t('description', { count: total }) : undefined}
      icon={ClipboardCheckIcon}
      actions={<ViewAllLink href="/approvals" label={t('open')} />}
    >
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
          {res.data.length < APPROVAL_QUEUE_LIMIT ? <WidgetListEnd icon={CheckCheckIcon} label={t('endOfQueue')} /> : null}
        </>
      )}
    </Widget>
  );
}

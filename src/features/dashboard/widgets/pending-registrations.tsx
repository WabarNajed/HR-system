import { UserCheckIcon, UserPlusIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatRelative } from '@/lib/dates';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetRow } from '../components/widget-parts';
import { getPendingRegistrations } from '../queries';

/** Self-registrations waiting for review (pending / info requested). */
export async function PendingRegistrationsWidget() {
  const [res, t, locale] = await Promise.all([getPendingRegistrations(), getTranslations('dashboard.widgets.pendingRegistrations'), getLocale()]);
  return (
    <Widget title={t('title')} icon={UserPlusIcon} actions={<ViewAllLink href="/settings/pending-registrations" label={t('review')} />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={UserCheckIcon} tone="success" title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <WidgetList>
          {res.data.map((p) => {
            const name = p.full_name || p.email || '';
            return (
              <WidgetRow key={p.id} href="/settings/pending-registrations" className="py-2">
                <EmployeeAvatar name={name} seed={p.id} size="sm" />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[0.8125rem] font-medium text-foreground">{name}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {p.registration_employee_number ? (
                      <>
                        <bdi className="numeric">{p.registration_employee_number}</bdi>
                        <span aria-hidden> · </span>
                      </>
                    ) : null}
                    {formatRelative(p.created_at, locale)}
                  </div>
                </div>
                <StatusBadge domain="profile" status={p.status} size="sm" />
              </WidgetRow>
            );
          })}
        </WidgetList>
      )}
    </Widget>
  );
}

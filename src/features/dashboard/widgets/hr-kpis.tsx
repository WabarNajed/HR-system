import { AlarmClockIcon, ClipboardListIcon, InboxIcon, PalmtreeIcon, UsersIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatCard } from '@/components/shared/stat-card';
import { formatInteger } from '@/lib/format';
import { WidgetError } from '../components/widget-parts';
import { getDashboardStats } from '../queries';

/** HR KPI row: headcount, open requests, my HR queue, on leave today, overdue requests. */
export async function HrKpis() {
  const [stats, t, locale] = await Promise.all([getDashboardStats(), getTranslations('dashboard.kpi'), getLocale()]);
  if (!stats.ok) return <WidgetError className="rounded-lg border border-border bg-card" />;
  const s = stats.data.hr;
  if (!s) return null;
  const n = (v: number) => formatInteger(v, locale);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
      <StatCard
        label={t('totalEmployees')}
        value={n(s.total_employees)}
        icon={UsersIcon}
        tone="primary"
        href="/employees"
        hint={s.new_joiners_30d > 0 ? t('newJoiners', { count: s.new_joiners_30d }) : t('totalEmployeesHint')}
      />
      <StatCard
        label={t('pendingRequests')}
        value={n(s.pending_requests)}
        icon={InboxIcon}
        tone="info"
        href="/requests"
        hint={t('pendingHrReview', { count: s.pending_hr_review })}
      />
      <StatCard
        label={t('hrPendingApprovals')}
        value={n(s.pending_my_action)}
        icon={ClipboardListIcon}
        tone={s.pending_my_action > 0 ? 'warning' : 'success'}
        href="/approvals"
        hint={s.in_progress_requests > 0 ? t('inProgress', { count: s.in_progress_requests }) : t('hrPendingApprovalsHint')}
      />
      <StatCard
        label={t('onLeaveToday')}
        value={n(s.on_leave_today)}
        icon={PalmtreeIcon}
        tone="secondary"
        href="/leave"
        hint={t('upcomingLeave7d', { count: s.upcoming_leave_7d })}
      />
      <StatCard
        label={t('overdueRequests')}
        value={n(s.overdue_requests)}
        icon={AlarmClockIcon}
        tone={s.overdue_requests > 0 ? 'danger' : 'success'}
        href="/requests"
        hint={s.due_soon_requests > 0 ? t('dueSoon', { count: s.due_soon_requests }) : t('overdueRequestsHint')}
      />
    </div>
  );
}

import { CalendarClockIcon, ClipboardCheckIcon, PalmtreeIcon, UsersIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { formatInteger } from '@/lib/format';
import { WidgetError } from '../components/widget-parts';
import { getDashboardStats } from '../queries';

/** Manager KPI row: pending approvals, direct reports, team on leave today, upcoming team leave. */
export async function ManagerKpis() {
  const [stats, t, locale] = await Promise.all([getDashboardStats(), getTranslations('dashboard.kpi'), getLocale()]);
  if (!stats.ok) return <WidgetError className="rounded-lg border border-border bg-card" />;
  const s = stats.data.manager;
  if (!s) return null;
  const n = (v: number) => formatInteger(v, locale);
  return (
    <KpiGrid>
      <StatCard
        label={t('pendingApprovals')}
        value={n(s.pending_approvals)}
        icon={ClipboardCheckIcon}
        tone={s.pending_approvals > 0 ? 'warning' : 'success'}
        href="/approvals"
        hint={s.pending_approvals > 0 ? t('pendingApprovalsHint') : t('pendingApprovalsClear')}
      />
      <StatCard
        label={t('directReports')}
        value={n(s.direct_reports)}
        icon={UsersIcon}
        tone="primary"
        href="/employees"
        hint={t('teamOpenRequests', { count: s.team_open_requests })}
      />
      <StatCard
        label={t('teamOnLeave')}
        value={n(s.team_on_leave_today)}
        icon={PalmtreeIcon}
        tone="info"
        href="/leave"
        hint={t('teamOnLeaveHint', { count: Math.max(0, s.direct_reports - s.team_on_leave_today) })}
      />
      <StatCard
        label={t('upcomingTeamLeave')}
        value={n(s.team_upcoming_leave)}
        icon={CalendarClockIcon}
        tone="secondary"
        href="/leave"
        hint={t('upcomingTeamLeaveHint')}
      />
    </KpiGrid>
  );
}

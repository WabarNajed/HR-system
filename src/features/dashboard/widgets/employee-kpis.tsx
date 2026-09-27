import { AwardIcon, CalendarDaysIcon, FileClockIcon, FileTextIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard, StatCardSkeleton } from '@/components/shared/stat-card';
import { formatNumber } from '@/lib/format';
import { WidgetError } from '../components/widget-parts';
import { getDashboardStats, getExpiryItems } from '../queries';

/** Employee KPI row: annual leave balance, open requests, documents expiring, certificates. */
export async function EmployeeKpis({ employeeId: ctxEmployeeId }: { employeeId: string }) {
  const [stats, expiry, t, locale] = await Promise.all([
    getDashboardStats(),
    getExpiryItems(100, ctxEmployeeId),
    getTranslations('dashboard.kpi'),
    getLocale(),
  ]);
  if (!stats.ok) return <WidgetError className="rounded-lg border border-border bg-card" />;
  const s = stats.data.employee;
  if (!s) return null;
  const year = (stats.data.today ?? '').slice(0, 4);
  const annual = s.leave_balances.find((b) => b.code === 'annual') ?? null;
  const n = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 });
  // Own identity items (Iqama, passport, contract, insurance) + documents: RLS scopes the RPC to the caller.
  const ownExpiry = expiry.ok ? expiry.data : null;
  const expiringCount = ownExpiry ? ownExpiry.length : s.documents_expiring;
  const expiredCount = ownExpiry ? ownExpiry.filter((i) => i.days_left < 0).length : 0;

  return (
    <KpiGrid>
      <StatCard
        label={t('annualLeave')}
        value={annual ? n(annual.remaining) : '—'}
        icon={CalendarDaysIcon}
        tone="primary"
        href="/leave"
        hint={
          !annual
            ? t('annualLeaveNotSet')
            : annual.pending > 0
              ? t('annualLeavePending', { days: n(annual.pending) })
              : t('annualLeaveUsed', { days: n(annual.used), year })
        }
      />
      <StatCard
        label={t('openRequests')}
        value={n(s.open_requests)}
        icon={FileTextIcon}
        tone={s.returned_requests > 0 ? 'warning' : 'info'}
        href="/requests"
        hint={
          s.returned_requests > 0
            ? t('openRequestsReturned', { count: s.returned_requests })
            : s.draft_requests > 0
              ? t('openRequestsDrafts', { count: s.draft_requests })
              : t('openRequestsHint')
        }
      />
      <StatCard
        label={t('documentsExpiring')}
        value={n(expiringCount)}
        icon={FileClockIcon}
        tone={expiredCount > 0 ? 'danger' : expiringCount > 0 ? 'warning' : 'success'}
        href="/documents"
        hint={expiredCount > 0 ? t('documentsExpired', { count: expiredCount }) : t('documentsExpiringHint')}
      />
      <StatCard
        label={t('certificates')}
        value={n(s.certificates)}
        icon={AwardIcon}
        tone="secondary"
        href="/certificates"
        hint={t('certificatesHint')}
      />
    </KpiGrid>
  );
}

export function KpiRowSkeleton({ count = 4 }: { count?: 4 | 5 }) {
  return (
    <KpiGrid count={count}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </KpiGrid>
  );
}

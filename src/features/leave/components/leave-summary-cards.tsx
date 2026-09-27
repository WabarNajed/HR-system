import { CalendarCheck2Icon, CalendarClockIcon, HourglassIcon, PalmtreeIcon, UsersRoundIcon, WalletCardsIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatCard } from '@/components/shared/stat-card';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { Progress } from '@/components/ui/progress';
import { resolveLocale } from '@/lib/i18n/config';
import { formatDays, formatInteger } from '@/lib/format';
import type { LeaveSummary } from '../queries';

/** KPI row on top of /leave — real counts scoped to the viewer (organization, team or own). */
export async function LeaveSummaryCards({ summary, year }: { summary: LeaveSummary; year: number }) {
  const t = await getTranslations('leave.summary');
  const locale = resolveLocale(await getLocale());
  const n = (v: number) => formatInteger(v, locale);
  const pendingStatus = 'pending_manager_approval,pending_hr_review';

  const first =
    summary.onLeaveToday !== null ? (
      <StatCard
        label={t('onLeaveToday')}
        value={n(summary.onLeaveToday)}
        icon={PalmtreeIcon}
        tone="info"
        hint={summary.scope === 'org' ? t('onLeaveTodayHintOrg') : t('onLeaveTodayHintTeam')}
        href="/leave?tab=calendar"
      />
    ) : (
      <StatCard
        label={t('daysTaken', { year })}
        value={formatDays(summary.daysTakenThisYear ?? 0, locale)}
        icon={CalendarCheck2Icon}
        tone="info"
        hint={t('daysTakenHint')}
        href="/leave?tab=balances"
      />
    );

  const annual = summary.annual;
  const fourth = summary.hasEmployee ? (
    <StatCard
      label={t('annual')}
      value={annual ? formatDays(annual.available, locale) : '—'}
      icon={WalletCardsIcon}
      tone="primary"
      hint={
        annual
          ? t('annualHint', { total: formatDays(annual.total, locale), pending: formatDays(annual.pending, locale) })
          : t('annualNone', { year })
      }
      href="/leave?tab=balances&view=mine"
      footer={
        annual && annual.total > 0 ? (
          <Progress
            value={(Math.max(0, annual.available) / annual.total) * 100}
            aria-label={t('annual')}
            tone={annual.available / annual.total < 0.2 ? 'warning' : 'primary'}
          />
        ) : undefined
      }
    />
  ) : summary.coverage ? (
    <StatCard
      label={t('coverage', { year })}
      value={`${n(summary.coverage.withBalances)} / ${n(summary.coverage.activeEmployees)}`}
      icon={UsersRoundIcon}
      tone={summary.coverage.withBalances < summary.coverage.activeEmployees ? 'warning' : 'success'}
      hint={t('coverageHint')}
      href="/leave?tab=balances"
    />
  ) : null;

  return (
    <KpiGrid count={fourth ? 4 : 3}>
      {first}
      <StatCard
        label={t('pending')}
        value={n(summary.pending)}
        icon={HourglassIcon}
        tone={summary.pending > 0 ? 'warning' : 'neutral'}
        hint={summary.scope === 'org' ? t('pendingHintOrg') : summary.scope === 'team' ? t('pendingHintTeam') : t('pendingHintMine')}
        href={`/leave?status=${pendingStatus}`}
      />
      <StatCard
        label={t('upcoming')}
        value={n(summary.upcoming)}
        icon={CalendarClockIcon}
        tone="secondary"
        hint={t('upcomingHint', { count: summary.upcomingPending })}
        href="/leave?tab=calendar&view=list"
      />
      {fourth}
    </KpiGrid>
  );
}

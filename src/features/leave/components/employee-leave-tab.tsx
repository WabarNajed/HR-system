import { CalendarPlusIcon, CalendarRangeIcon, ChevronRightIcon, WalletCardsIcon } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/auth/session';
import { formatDateRange } from '@/lib/dates';
import { resolveLocale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { formatDays } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { getEmployeeBalances, getEmployeeRecentLeave, getLeaveAccess, getLeaveOrgSettings } from '../queries';
import { BalanceCards } from './balance-cards';
import { InitializeBalancesButton, NoBalancesState } from './balance-dialogs';
import { LeaveTypeDot } from './leave-type-dot';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8): the employee's balances for the current
 * year, recent leave requests and — for HR with organization `leave.edit` — adjust / edit / initialize
 * actions. Visibility is decided by RLS (own record, direct reports, HR).
 */
export async function EmployeeLeaveTab({ employeeId }: { employeeId: string }) {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const locale = resolveLocale(ctx.locale);
  const [t, access, settings] = await Promise.all([getTranslations('leave'), getLeaveAccess(ctx), getLeaveOrgSettings()]);
  const supabase = await createClient();
  const [balances, recent, employeeRes] = await Promise.all([
    getEmployeeBalances(employeeId, settings.year),
    getEmployeeRecentLeave(employeeId, 8),
    supabase.from('employees').select('id, name_ar, name_en').eq('id', employeeId).maybeSingle(),
  ]);
  const employee = employeeRes.data;
  const isSelf = access.employeeId === employeeId;
  const canAdjust = access.orgEdit;
  const d = (v: number) => formatDays(v, locale);

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title={t('employeeTab.balancesTitle', { year: settings.year })}
        description={t('employeeTab.balancesDescription')}
        icon={<WalletCardsIcon />}
        actions={
          canAdjust && balances.length ? (
            <InitializeBalancesButton year={settings.year} employeeId={employeeId} variant="outline" label={t('employeeTab.addMissing')} />
          ) : null
        }
        bodyClassName="pt-4"
      >
        {balances.length ? (
          <BalanceCards rows={balances} canAdjust={canAdjust} employeeName={employee ? { name_ar: employee.name_ar, name_en: employee.name_en } : null} />
        ) : (
          <NoBalancesState
            year={settings.year}
            compact
            action={canAdjust ? <InitializeBalancesButton year={settings.year} employeeId={employeeId} variant="default" /> : undefined}
          />
        )}
      </SectionCard>

      <SectionCard
        title={t('employeeTab.recentTitle')}
        icon={<CalendarRangeIcon />}
        flush
        actions={
          <>
            {isSelf && access.canRequest ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/requests/new?type=leave">
                  <CalendarPlusIcon />
                  {t('actions.requestLeave')}
                </Link>
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/leave?employee=${employeeId}${isSelf ? '' : `&scope=${access.orgView ? 'org' : 'team'}`}`}>
                {t('actions.viewAll')}
                <ChevronRightIcon className="rtl:rotate-180" />
              </Link>
            </Button>
          </>
        }
      >
        {recent.length === 0 ? (
          <EmptyState icon={CalendarRangeIcon} title={t('employeeTab.noRequestsTitle')} description={t('employeeTab.noRequestsDescription')} />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.request_id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                >
                  <LeaveTypeDot color={r.leave_type?.color} className="size-3" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{r.leave_type ? localized(r.leave_type, 'name', locale) : '—'}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="numeric">{formatDateRange(r.start_date, r.end_date, locale)}</span>
                      {r.request_number ? <bdi className="font-mono">{r.request_number}</bdi> : null}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold numeric">{d(r.days)}</span>
                  <StatusBadge domain="request" status={r.status} size="sm" className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

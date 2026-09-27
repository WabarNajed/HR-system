import { CalendarDaysIcon, CalendarPlusIcon, PalmtreeIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { localized } from '@/lib/i18n/localized';
import { LeaveRow, tintStyle } from '../components/rows';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList } from '../components/widget-parts';
import { getDashboardStats, getMyUpcomingLeave } from '../queries';

/** Own upcoming leave (approved + awaiting approval) with the balance of the main leave types. */
export async function UpcomingLeaveWidget({ employeeId, today }: { employeeId: string; today: string }) {
  const [res, stats, t, locale] = await Promise.all([
    getMyUpcomingLeave(employeeId, today),
    getDashboardStats(),
    getTranslations('dashboard.widgets.upcomingLeave'),
    getLocale(),
  ]);
  const balances = stats.ok ? (stats.data.employee?.leave_balances ?? []).filter((b) => b.remaining > 0 || b.used > 0 || b.pending > 0).slice(0, 3) : [];
  const n = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 });

  return (
    <Widget title={t('title')} icon={CalendarDaysIcon} actions={<ViewAllLink href="/leave" />}>
      {balances.length ? (
        <div
          className={cn(
            'grid gap-px border-b border-border bg-border',
            balances.length === 1 ? 'grid-cols-1' : balances.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
          )}
        >
          {balances.map((b) => (
            <div key={b.leave_type_id} className="min-w-0 bg-card px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full bg-primary" style={tintStyle(b.color) ? { backgroundColor: b.color! } : undefined} aria-hidden />
                <span className="truncate text-xs text-muted-foreground">{localized(b, 'name', locale)}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="numeric text-lg leading-6 font-semibold text-foreground">{n(b.available)}</span>
                <span className="text-xs text-muted-foreground">{t('daysAvailable')}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty
          icon={PalmtreeIcon}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/requests/new?type=leave">
                <CalendarPlusIcon />
                {t('emptyAction')}
              </Link>
            </Button>
          }
        />
      ) : (
        <WidgetList>
          {res.data.map((l) => (
            <LeaveRow key={l.id} leave={l} today={today} />
          ))}
        </WidgetList>
      )}
    </Widget>
  );
}

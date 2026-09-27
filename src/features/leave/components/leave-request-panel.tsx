import { ArrowLeftIcon, ArrowRightIcon, CalendarRangeIcon, InfoIcon, UsersRoundIcon, WalletCardsIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/auth/session';
import { formatDate, formatDateRange } from '@/lib/dates';
import { resolveLocale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { formatDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getLeavePanelData, type LeavePanelData } from '../queries';
import { LeaveTypeDot } from './leave-type-dot';

/**
 * Request-details panel for `leave` requests (extension point — ARCHITECTURE §8), mapped in
 * `features/request-panels/index.tsx`. Shows the period, working vs calendar days, the balance
 * before → after, and (for the employee's manager and HR only) colleagues on leave at the same time.
 * The leave reason is part of the request values and is not repeated here.
 */
export async function LeaveRequestPanel({ requestId }: { requestId: string }) {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const locale = resolveLocale(ctx.locale);
  const t = await getTranslations('leave');
  let data: LeavePanelData | null = null;
  try {
    data = await getLeavePanelData(requestId, ctx);
  } catch (error) {
    console.error('[leave] request panel failed:', error instanceof Error ? error.message : error);
    return (
      <SectionCard title={t('panel.title')} icon={<CalendarRangeIcon />}>
        <p className="text-meta text-muted-foreground">{t('panel.loadError')}</p>
      </SectionCard>
    );
  }
  if (!data) return null;

  const d = (v: number) => formatDays(v, locale);
  const lt = data.leaveType;
  const month = (data.startDate ?? '').slice(0, 7);
  const Arrow = locale === 'ar' ? ArrowLeftIcon : ArrowRightIcon;
  const final = ['rejected', 'cancelled'].includes(data.status);

  return (
    <SectionCard
      title={t('panel.title')}
      icon={<CalendarRangeIcon />}
      actions={
        month ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/leave?tab=calendar&month=${month}`}>{t('actions.viewInCalendar')}</Link>
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          {lt ? (
            <span className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
              <LeaveTypeDot color={lt.color} className="size-3" />
              {localized(lt, 'name', locale)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {lt ? (
            <>
              <Badge variant="outline" size="sm">
                {t(`panel.basis.${lt.day_count_basis}`)}
              </Badge>
              <Badge variant={lt.is_paid ? 'success' : 'neutral'} size="sm">
                {lt.is_paid ? t('panel.paid') : t('panel.unpaid')}
              </Badge>
            </>
          ) : null}
          {!data.submitted ? (
            <Badge variant="info" size="sm">
              {t('panel.estimate')}
            </Badge>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Item label={t('fields.period')} className="col-span-2">
            {data.startDate && data.endDate ? <span className="numeric">{formatDateRange(data.startDate, data.endDate, locale)}</span> : '—'}
          </Item>
          <Item label={t('fields.returnDate')}>{data.returnDate ? <span className="numeric">{formatDate(data.returnDate, locale)}</span> : '—'}</Item>
          <Item label={t('panel.charged')}>
            {data.days !== null ? <span className="text-base font-semibold numeric">{t('panel.daysValue', { days: d(data.days) })}</span> : '—'}
          </Item>
          <Item label={t('panel.workingDays')}>{data.workingDays !== null ? <span className="numeric">{d(data.workingDays)}</span> : '—'}</Item>
          <Item label={t('panel.calendarDays')}>{data.calendarDays !== null ? <span className="numeric">{d(data.calendarDays)}</span> : '—'}</Item>
          <Item label={t('panel.balanceEffect')} className="col-span-2">
            {lt && !lt.deducts_balance ? (
              <span className="text-meta text-muted-foreground">{t('panel.notDeducted')}</span>
            ) : (
              <StatusBadge domain="leaveBalanceEffect" status={data.balanceEffect} size="sm" />
            )}
          </Item>
        </dl>

        {data.holidaysInRange.length ? (
          <div className="flex items-start gap-2 rounded-md bg-secondary-soft/60 px-3 py-2 text-meta text-secondary-soft-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {t(lt?.day_count_basis === 'calendar' ? 'panel.holidaysCounted' : 'panel.holidaysExcluded', {
                names: data.holidaysInRange.map((h) => localized(h, 'name', locale)).join(locale === 'ar' ? '، ' : ', '),
              })}
            </span>
          </div>
        ) : null}

        {data.balance && !final ? (
          <div className="rounded-md border border-border bg-subtle px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-meta font-medium text-muted-foreground">
                <WalletCardsIcon className="size-4" aria-hidden />
                {t('panel.balanceTitle', { year: data.balance.year })}
              </span>
              <span className="inline-flex items-center gap-2.5 numeric">
                <span className="text-sm text-muted-foreground">{d(data.balance.before)}</span>
                <Arrow className="size-4 text-muted-foreground" aria-hidden />
                <span className={cn('text-lg font-semibold', data.balance.after < 0 ? 'text-danger' : 'text-foreground')}>{d(data.balance.after)}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.balanceEffect === 'used' ? t('panel.balanceUsed') : data.balance.after < 0 ? t('panel.balanceInsufficient') : t('panel.balanceHint')}
            </p>
          </div>
        ) : null}

        {data.overlaps ? (
          <div className="flex flex-col gap-2">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <UsersRoundIcon className="size-4 text-muted-foreground" aria-hidden />
              {t('panel.overlapsTitle')}
            </h3>
            {data.overlaps.length === 0 ? (
              <p className="text-meta text-muted-foreground">{t('panel.overlapsNone')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {data.overlaps.map((o, i) => (
                  <li key={`${o.employee.id}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-foreground">{employeeDisplayName(o.employee, locale)}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="numeric">{formatDateRange(o.start_date, o.end_date, locale)}</span>
                      {o.state === 'pending' ? (
                        <Badge variant="warning" size="sm">
                          {t('calendar.pending')}
                        </Badge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function Item({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}


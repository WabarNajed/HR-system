import { CalendarRangeIcon, PalmtreeIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { addDays } from '@/lib/dates';
import { formatDateRange } from '@/lib/i18n/date-format';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { avatarUrl, LeaveRow } from '../components/rows';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList } from '../components/widget-parts';
import { getTeamLeave, getWeekendDays } from '../queries';
import type { DashboardLeave } from '../types';

const DAYS = 14;
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const APPROVED = ['approved', 'in_progress', 'completed'];

type Member = { id: string; name: string; avatar: string | null; leaves: DashboardLeave[] };

/**
 * Team leave for the next 14 days: a day strip (desktop) with one lane per team member on leave —
 * approved leave solid, leave awaiting approval hatched — and a plain list on phones.
 */
export async function TeamLeaveCalendarWidget({ employeeId, today }: { employeeId: string; today: string }) {
  const end = addDays(today, DAYS - 1) ?? today;
  const [res, weekend, t, tDays, locale] = await Promise.all([
    getTeamLeave(employeeId, today, end),
    getWeekendDays(),
    getTranslations('dashboard.widgets.teamCalendar'),
    getTranslations('enums.weekdayShort'),
    getLocale(),
  ]);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i) ?? today);
  const members = new Map<string, Member>();
  if (res.ok) {
    for (const l of res.data) {
      const m = members.get(l.employee_id) ?? {
        id: l.employee_id,
        name: l.employee ? employeeDisplayName(l.employee, locale) : '',
        avatar: avatarUrl(l.employee?.avatar_path),
        leaves: [],
      };
      m.leaves.push(l);
      members.set(l.employee_id, m);
    }
  }
  const lanes = [...members.values()].sort((a, b) => (a.leaves[0]?.start_date ?? '').localeCompare(b.leaves[0]?.start_date ?? ''));
  const gridCols = { gridTemplateColumns: `minmax(8.5rem, 12rem) repeat(${DAYS}, minmax(2.25rem, 1fr))` };

  return (
    <Widget
      title={t('title')}
      description={t('description', { from: formatDateRange(today, end, locale) })}
      icon={CalendarRangeIcon}
      actions={<ViewAllLink href="/leave" />}
      footer={
        lanes.length ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm border-s-[3px] border-primary bg-primary-soft" aria-hidden />
              {t('legendApproved')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm border border-dashed border-warning bg-warning-soft" aria-hidden />
              {t('legendPending')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-muted" aria-hidden />
              {t('legendWeekend')}
            </span>
          </div>
        ) : undefined
      }
    >
      {!res.ok ? (
        <WidgetError />
      ) : lanes.length === 0 ? (
        <WidgetEmpty icon={PalmtreeIcon} tone="success" title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <>
          {/* Phones: plain list */}
          <WidgetList className="md:hidden">
            {res.data.slice(0, 6).map((l) => (
              <LeaveRow key={l.id} leave={l} today={today} showEmployee />
            ))}
          </WidgetList>

          {/* Tablet / desktop: 14-day strip */}
          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[42rem] pb-2" role="table" aria-label={t('title')}>
              <div className="grid border-b border-border" style={gridCols} role="row">
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground" role="columnheader">
                  {t('member')}
                </div>
                {days.map((d) => {
                  const date = new Date(`${d}T00:00:00Z`);
                  const isToday = d === today;
                  const isWeekend = weekend.includes(date.getUTCDay());
                  return (
                    <div
                      key={d}
                      role="columnheader"
                      className={cn('flex flex-col items-center justify-center py-1.5 text-center leading-tight', isWeekend && 'bg-muted/60')}
                    >
                      <span className="text-2xs text-muted-foreground">{tDays(WEEKDAY_KEYS[date.getUTCDay()]!)}</span>
                      <span
                        className={cn(
                          'numeric mt-0.5 flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                          isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                        )}
                        aria-current={isToday ? 'date' : undefined}
                      >
                        {date.getUTCDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
              {lanes.slice(0, 8).map((m) => (
                <div key={m.id} className="grid border-b border-border/70 last:border-b-0" style={gridCols} role="row">
                  <div className="flex min-w-0 items-center gap-2 px-4 py-2" role="rowheader" style={{ gridRow: 1, gridColumn: 1 }}>
                    <EmployeeAvatar name={m.name} seed={m.id} src={m.avatar} size="xs" />
                    <span className="truncate text-[0.8125rem] font-medium text-foreground">{m.name}</span>
                  </div>
                  {days.map((d, i) => (
                    <div
                      key={d}
                      aria-hidden
                      className={cn(weekend.includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && 'bg-muted/60', d === today && 'bg-primary-soft/50')}
                      style={{ gridRow: 1, gridColumn: i + 2 }}
                    />
                  ))}
                  {m.leaves.map((l) => {
                    const startIdx = Math.max(0, days.indexOf(l.start_date < today ? today : l.start_date));
                    const endIdx = l.end_date > end ? DAYS - 1 : days.indexOf(l.end_date);
                    if (endIdx < 0) return null;
                    const span = endIdx - startIdx + 1;
                    const approved = APPROVED.includes(l.status);
                    const typeName = l.leave_type ? localized(l.leave_type, 'name', locale) : '';
                    const color = l.leave_type?.color && /^#[0-9a-f]{3,8}$/i.test(l.leave_type.color) ? l.leave_type.color : null;
                    const label = `${typeName} · ${formatDateRange(l.start_date, l.end_date, locale)} · ${approved ? t('legendApproved') : t('legendPending')}`;
                    return (
                      <div key={l.id} className="relative z-10 flex items-center px-0.5 py-2" style={{ gridRow: 1, gridColumn: `${startIdx + 2} / span ${span}` }}>
                        <SimpleTooltip content={label}>
                          <Link
                            href={`/requests/${l.request_id}`}
                            aria-label={`${m.name} · ${label}`}
                            className={cn(
                              'flex h-6 w-full min-w-0 items-center overflow-hidden rounded-md px-1.5 text-2xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                              approved
                                ? 'border-s-[3px] border-primary bg-primary-soft text-primary-soft-foreground'
                                : 'border border-dashed border-warning bg-warning-soft text-warning-soft-foreground [background-image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,var(--warning)_14%,transparent)_5px_8px)]',
                            )}
                            style={
                              approved && color
                                ? {
                                    borderInlineStartColor: color,
                                    backgroundColor: `color-mix(in oklab, ${color} 18%, var(--card))`,
                                    color: `color-mix(in oklab, ${color} 62%, var(--foreground))`,
                                  }
                                : undefined
                            }
                          >
                            {span >= 3 ? <span className="truncate">{typeName}</span> : null}
                          </Link>
                        </SimpleTooltip>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Widget>
  );
}

'use client';

import { BuildingIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, LayoutGridIcon, ListIcon, TagIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useTransition, type CSSProperties } from 'react';
import { DataTableFacetedFilter, useUrlTableState, type FilterDef } from '@/components/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { mergeSearchParams } from '@/lib/list-params';
import { formatDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import { gridRange, holidayOn, layoutWeek, shiftMonth, weekday, type WeekSegment } from '../calendar-utils';
import type { CalendarEvent, CalendarHoliday, LeaveScope, Option } from '../types';
import { LeaveTypeDot } from './leave-type-dot';
import { UrlSegmented } from './url-controls';

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const MAX_LANES = 3;

export type LeaveCalendarProps = {
  month: string;
  view: 'month' | 'list';
  events: CalendarEvent[];
  holidays: CalendarHoliday[];
  weekendDays: number[];
  weekStart: number;
  today: string;
  scope: LeaveScope;
  scopes: LeaveScope[];
  defaultScope: LeaveScope;
  typeOptions: (Option & { color: string })[];
  departmentOptions: Option[];
  truncated: boolean;
};

function barStyle(ev: CalendarEvent): CSSProperties {
  const color = ev.leave_type?.color ?? '#5B6B70';
  if (ev.state === 'approved') {
    return {
      backgroundColor: `color-mix(in oklab, ${color} 16%, var(--card))`,
      borderInlineStartColor: color,
    };
  }
  return {
    backgroundImage: `repeating-linear-gradient(135deg, color-mix(in oklab, ${color} 14%, var(--card)) 0 5px, var(--card) 5px 10px)`,
    borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
    borderInlineStartColor: color,
  };
}

export function LeaveCalendar(props: LeaveCalendarProps) {
  const { month, view, events, holidays, weekendDays, weekStart, today, scope, scopes, defaultScope, typeOptions, departmentOptions, truncated } = props;
  const t = useTranslations('leave');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navPending, startNav] = useTransition();
  const showNames = scope !== 'mine';

  const filterDefs = useMemo<FilterDef<unknown>[]>(
    () => [
      { key: 'type', title: t('fields.leaveType'), icon: TagIcon, options: typeOptions.map((o) => ({ value: o.value, label: o.label })) },
      ...(showNames && departmentOptions.length ? [{ key: 'department', title: tc('department'), icon: BuildingIcon, options: departmentOptions }] : []),
    ],
    [t, tc, typeOptions, departmentOptions, showNames],
  );
  const table = useUrlTableState(filterDefs, {});

  const go = (patch: Record<string, string | null>) => {
    const qs = mergeSearchParams(searchParams, patch).toString();
    startNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const currentMonth = today.slice(0, 7);

  const { weeks } = useMemo(() => gridRange(month, weekStart), [month, weekStart]);
  const orderedWeekdays = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const labelFor = (ev: CalendarEvent) => (showNames ? employeeDisplayName(ev.employee, locale) : localized(ev.leave_type, 'name', locale));
  const monthEvents = events.filter((e) => e.end_date >= `${month}-01` && e.start_date <= `${month}-31`);
  const legendTypes = useMemo(() => {
    const seen = new Map<string, { name_ar: string; name_en: string; color: string }>();
    for (const e of monthEvents) if (e.leave_type && !seen.has(e.leave_type.id)) seen.set(e.leave_type.id, e.leave_type);
    return Array.from(seen.values());
  }, [monthEvents]);

  const Prev = locale === 'ar' ? ChevronRightIcon : ChevronLeftIcon;
  const Next = locale === 'ar' ? ChevronLeftIcon : ChevronRightIcon;

  const toolbar = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border border-border-strong bg-card shadow-xs dark:border-input">
          <Button variant="ghost" size="icon-sm" className="rounded-e-none" aria-label={t('calendar.previousMonth')} onClick={() => go({ month: shiftMonth(month, -1) })}>
            <Prev />
          </Button>
          <Button variant="ghost" size="icon-sm" className="rounded-s-none border-s border-border" aria-label={t('calendar.nextMonth')} onClick={() => go({ month: shiftMonth(month, 1) })}>
            <Next />
          </Button>
        </div>
        <h2 className={cn('min-w-36 text-section-title text-foreground numeric', navPending && 'opacity-60')} aria-live="polite">
          {fmt.monthYear(`${month}-01`, { month: 'long' })}
        </h2>
        <Button variant="outline" size="sm" disabled={month === currentMonth} onClick={() => go({ month: null })}>
          {tc('today')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filterDefs.map((def) =>
          def.type === 'dateRange' ? null : (
            <DataTableFacetedFilter
              key={def.key}
              def={def}
              value={table.state.filters[def.key] ?? []}
              onChange={(values) => table.setState({ filters: { [def.key]: values } })}
            />
          ),
        )}
        <UrlSegmented
          param="scope"
          defaultValue={defaultScope}
          aria-label={t('scope.label')}
          options={scopes.map((s) => ({ value: s, label: t(`scope.${s}`) }))}
        />
        <UrlSegmented
          param="view"
          defaultValue="month"
          aria-label={t('calendar.viewLabel')}
          options={[
            { value: 'month', label: t('calendar.monthView'), icon: <LayoutGridIcon /> },
            { value: 'list', label: t('calendar.listView'), icon: <ListIcon /> },
          ]}
        />
      </div>
    </div>
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {legendTypes.map((lt) => (
        <span key={lt.name_en} className="inline-flex items-center gap-1.5">
          <LeaveTypeDot color={lt.color} />
          {localized(lt, 'name', locale)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 rounded-sm border border-border-strong" style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--muted) 0 3px, var(--card) 3px 6px)' }} />
        {t('calendar.legendPending')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 rounded-sm bg-secondary-soft ring-1 ring-secondary/30" />
        {t('calendar.legendHoliday')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 rounded-sm bg-muted ring-1 ring-border" />
        {t('calendar.legendWeekend')}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4" data-pending={navPending || table.isPending || undefined}>
      {toolbar}
      {truncated ? (
        <Alert variant="warning">
          <AlertDescription>{t('calendar.truncated')}</AlertDescription>
        </Alert>
      ) : null}
      {view === 'list' ? (
        <AgendaList month={month} events={monthEvents} holidays={holidays} showNames={showNames} labelFor={labelFor} />
      ) : (
        <>
          <div
            className={cn(
              'overflow-hidden rounded-lg border border-border bg-card shadow-card transition-opacity',
              (navPending || table.isPending) && 'opacity-70',
            )}
          >
            <div className="grid grid-cols-7 border-b border-border bg-subtle">
              {orderedWeekdays.map((d) => (
                <div
                  key={d}
                  className={cn('px-2 py-2 text-center text-xs font-semibold text-muted-foreground md:text-start', weekendDays.includes(d) && 'text-faint-foreground')}
                >
                  <span className="md:hidden">{te(`weekdayShort.${WEEKDAY_KEYS[d]!}`)}</span>
                  <span className="hidden md:inline">{te(`weekday.${WEEKDAY_KEYS[d]!}`)}</span>
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <WeekRow
                key={week[0]}
                week={week}
                month={month}
                today={today}
                events={events}
                holidays={holidays}
                weekendDays={weekendDays}
                labelFor={labelFor}
                showNames={showNames}
              />
            ))}
          </div>
          {legend}
          <div className="md:hidden">
            <AgendaList month={month} events={monthEvents} holidays={holidays} showNames={showNames} labelFor={labelFor} compact />
          </div>
        </>
      )}
    </div>
  );
}

function EventBar({ seg, labelFor, showNames }: { seg: WeekSegment<CalendarEvent>; labelFor: (e: CalendarEvent) => string; showNames: boolean }) {
  const ev = seg.event;
  const label = labelFor(ev);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group/bar flex h-full min-w-0 items-center gap-1 overflow-hidden border border-transparent border-s-[3px] px-1.5 text-start text-[0.75rem] leading-none font-medium text-foreground transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none dark:hover:brightness-125',
            ev.state === 'pending' && 'border-dashed',
            seg.continuesBefore ? 'rounded-s-none border-s-0 ps-2' : 'rounded-s-md',
            seg.continuesAfter ? 'rounded-e-none' : 'rounded-e-md',
            'max-md:px-0 max-md:text-transparent',
          )}
          style={{ ...barStyle(ev), gridColumn: `${seg.col} / span ${seg.span}`, gridRow: seg.lane + 1 }}
          aria-label={label}
        >
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <EventDetails ev={ev} showNames={showNames} />
      </PopoverContent>
    </Popover>
  );
}

function EventDetails({ ev, showNames }: { ev: CalendarEvent; showNames: boolean }) {
  const t = useTranslations('leave');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  return (
    <div className="flex flex-col gap-2.5 text-sm">
      {showNames ? (
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{employeeDisplayName(ev.employee, locale)}</div>
          {ev.employee.employee_number ? <bdi className="text-xs text-muted-foreground numeric">{ev.employee.employee_number}</bdi> : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <LeaveTypeDot color={ev.leave_type?.color} />
        <span className="text-foreground">{localized(ev.leave_type, 'name', locale)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-meta">
        <span className="numeric text-muted-foreground">{fmt.range(ev.start_date, ev.end_date)}</span>
        <span className="font-medium numeric">{formatDays(ev.days, locale)} {t('fields.daysUnit')}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge domain="request" status={ev.status} size="sm" />
        <Link href={`/requests/${ev.request_id}`} className="text-meta font-medium text-primary hover:underline">
          {t('actions.openRequest')}
        </Link>
      </div>
    </div>
  );
}

function WeekRow({
  week,
  month,
  today,
  events,
  holidays,
  weekendDays,
  labelFor,
  showNames,
}: {
  week: string[];
  month: string;
  today: string;
  events: CalendarEvent[];
  holidays: CalendarHoliday[];
  weekendDays: number[];
  labelFor: (e: CalendarEvent) => string;
  showNames: boolean;
}) {
  const t = useTranslations('leave.calendar');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const segments = useMemo(() => layoutWeek(week, events), [week, events]);
  const visible = segments.filter((s) => s.lane < MAX_LANES);
  const hiddenByDay = week.map((day, i) =>
    segments.filter((s) => s.lane >= MAX_LANES && s.col <= i + 1 && s.col + s.span - 1 >= i + 1),
  );

  return (
    <div className="relative grid min-h-24 grid-cols-7 border-b border-border last:border-b-0 md:min-h-32">
      {week.map((day, i) => {
        const inMonth = day.startsWith(month);
        const weekend = weekendDays.includes(weekday(day));
        const holiday = holidayOn(day, holidays);
        const isToday = day === today;
        const dayEvents = events.filter((e) => e.start_date <= day && e.end_date >= day);
        return (
          <div
            key={day}
            className={cn(
              'relative flex min-w-0 flex-col border-e border-border px-1.5 pt-1.5 pb-1 last:border-e-0 md:px-2',
              weekend && 'bg-muted/80 dark:bg-black/25',
              holiday && 'bg-secondary-soft/70',
              !inMonth && 'bg-subtle/60',
            )}
            style={{ gridColumn: i + 1, gridRow: 1 }}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium numeric',
                  isToday ? 'bg-primary text-primary-foreground' : inMonth ? 'text-foreground' : 'text-faint-foreground',
                )}
                aria-label={fmt.date(day)}
              >
                {Number(day.slice(8, 10))}
              </span>
              {holiday ? (
                <span className="hidden min-w-0 truncate text-[0.6875rem] font-medium text-secondary-soft-foreground md:inline" title={localized(holiday, 'name', locale)}>
                  {localized(holiday, 'name', locale)}
                </span>
              ) : null}
            </div>
            {hiddenByDay[i]!.length ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="mt-auto self-start rounded-sm px-1 text-[0.6875rem] font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {t('more', { count: hiddenByDay[i]!.length })}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <div className="border-b border-border px-3 py-2 text-meta font-semibold">{fmt.date(day)}</div>
                  <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                    {dayEvents.map((ev) => (
                      <li key={ev.id} className="px-3 py-2">
                        <Link href={`/requests/${ev.request_id}`} className="flex items-center gap-2 text-sm hover:text-primary">
                          <LeaveTypeDot color={ev.leave_type?.color} />
                          <span className="min-w-0 flex-1 truncate">{labelFor(ev)}</span>
                          {ev.state === 'pending' ? <span className="text-xs text-warning">{t('pending')}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        );
      })}
      {/* Event lanes overlay (same 7-column grid; RTL mirrors automatically). */}
      <div className="pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 auto-rows-[0.5rem] gap-y-1 px-0.5 md:top-9 md:auto-rows-[1.375rem]">
        {visible.map((seg) => (
          <div key={`${seg.event.id}-${seg.col}`} className="pointer-events-auto contents">
            <EventBar seg={seg} labelFor={labelFor} showNames={showNames} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AgendaList({
  month,
  events,
  holidays,
  showNames,
  labelFor,
  compact,
}: {
  month: string;
  events: CalendarEvent[];
  holidays: CalendarHoliday[];
  showNames: boolean;
  labelFor: (e: CalendarEvent) => string;
  compact?: boolean;
}) {
  const t = useTranslations('leave');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const monthHolidays = holidays.filter((h) => h.end_date >= `${month}-01` && h.start_date <= `${month}-31`);
  type Item = { kind: 'event'; date: string; ev: CalendarEvent } | { kind: 'holiday'; date: string; h: CalendarHoliday };
  const items: Item[] = [
    ...events.map((ev) => ({ kind: 'event' as const, date: ev.start_date, ev })),
    ...monthHolidays.map((h) => ({ kind: 'holiday' as const, date: h.start_date, h })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (!items.length) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        variant={compact ? 'inline' : 'card'}
        title={t('calendar.emptyTitle')}
        description={showNames ? t('calendar.emptyScoped') : t('calendar.emptyMine')}
      />
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-card">
      {items.map((item) =>
        item.kind === 'holiday' ? (
          <li key={`h-${item.h.id}`} className="flex items-center gap-3 bg-secondary-soft/50 px-4 py-2.5">
            <DateChip iso={item.h.start_date} tone="secondary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{localized(item.h, 'name', locale)}</div>
              <div className="text-xs text-muted-foreground numeric">
                {t('calendar.publicHoliday')} · {fmt.range(item.h.start_date, item.h.end_date)}
              </div>
            </div>
          </li>
        ) : (
          <li key={item.ev.id}>
            <Link href={`/requests/${item.ev.request_id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none">
              <DateChip iso={item.ev.start_date} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <LeaveTypeDot color={item.ev.leave_type?.color} />
                  <span className="truncate text-sm font-medium text-foreground">{labelFor(item.ev)}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {showNames ? `${localized(item.ev.leave_type, 'name', locale)} · ` : ''}
                  <span className="numeric">{fmt.range(item.ev.start_date, item.ev.end_date)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold numeric">{formatDays(item.ev.days, locale)}</span>
                {!compact ? <StatusBadge domain="request" status={item.ev.status} size="sm" /> : item.ev.state === 'pending' ? <span className="text-xs text-warning">{t('calendar.pending')}</span> : null}
              </div>
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

function DateChip({ iso, tone = 'primary' }: { iso: string; tone?: 'primary' | 'secondary' }) {
  const fmt = useDateFormat();
  const dm = fmt.dayMonth(iso);
  const [day, ...rest] = dm.split(' ');
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 flex-col items-center justify-center rounded-md leading-none',
        tone === 'secondary' ? 'bg-secondary/15 text-secondary-soft-foreground' : 'bg-primary-soft text-primary-soft-foreground',
      )}
    >
      <span className="text-base font-semibold numeric">{day}</span>
      <span className="mt-0.5 text-[0.625rem] font-medium uppercase">{rest.join(' ')}</span>
    </span>
  );
}

'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { AlarmClockIcon, CalendarCheck2Icon, CalendarOffIcon, CheckIcon, GaugeIcon, SlidersHorizontalIcon, TimerIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { formatInteger, formatNumber, formatPercent } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { saveTypeSla } from '../actions';
import type { OrgCalendar, RequestTypeRow, RoleOption } from '../types';
import { categoryLabel } from './labels';
import { RequestTypeIcon, STEP_ICONS } from './type-visual';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

type Props = { rows: RequestTypeRow[]; calendar: OrgCalendar; roles: RoleOption[]; canEdit: boolean };

function onTimeRate(r: { resolved: number; resolvedOnTime: number }): number | null {
  return r.resolved ? r.resolvedOnTime / r.resolved : null;
}

/** Settings › SLA: per-type business-day targets (inline edit), step SLAs, live performance. */
export function SlaSettings({ rows, calendar, roles, canEdit }: Props) {
  const t = useTranslations('requestConfig.sla');
  const tr = useTranslations('requestConfig');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const n = (v: number) => formatInteger(v, locale);

  const active = rows.filter((r) => r.is_active);
  const withSla = active.filter((r) => r.sla_business_days !== null && r.sla_business_days > 0);
  const avg = withSla.length ? withSla.reduce((s, r) => s + (r.sla_business_days ?? 0), 0) / withSla.length : null;
  const totals = rows.reduce(
    (acc, r) => ({ resolved: acc.resolved + r.usage.resolved, resolvedOnTime: acc.resolvedOnTime + r.usage.resolvedOnTime, overdue: acc.overdue + r.usage.overdueOpen, open: acc.open + r.usage.open }),
    { resolved: 0, resolvedOnTime: 0, overdue: 0, open: 0 },
  );
  const overallRate = onTimeRate(totals);

  const columns = useMemo<ColumnDef<RequestTypeRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => localized(r, 'name', locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={tr('types.columns.type')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex max-w-64 min-w-40 items-center gap-2.5 whitespace-normal">
              <RequestTypeIcon icon={r.icon} color={r.color} />
              <div className="min-w-0 leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{localized(r, 'name', locale)}</span>
                  {!r.is_active ? (
                    <Badge variant="neutral" size="sm">
                      {tRoot('common.inactive')}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{categoryLabel(tRoot, r.category)}</div>
              </div>
            </div>
          );
        },
        meta: { label: tr('types.columns.type') },
      },
      {
        id: 'sla',
        accessorFn: (r) => r.sla_business_days ?? -1,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.target')} />,
        cell: ({ row }) => <SlaEditor row={row.original} canEdit={canEdit} />,
        meta: { label: t('columns.target'), width: '12rem' },
      },
      {
        id: 'steps',
        enableSorting: false,
        header: () => t('columns.steps'),
        cell: ({ row }) => {
          const steps = row.original.steps;
          if (!steps.length) return <span className="text-faint-foreground">—</span>;
          return (
            <div className="flex flex-nowrap gap-1 whitespace-nowrap">
              {steps.map((s) => {
                const Icon = STEP_ICONS[s.step_type];
                const role = s.step_type === 'role' ? roles.find((x) => x.key === s.approver_role_key) : null;
                return (
                  <SimpleTooltip key={s.id ?? s.step_order} content={role ? localized(role, 'name', locale) : tr(`stepShort.${s.step_type}`)}>
                    <span tabIndex={0} className="inline-flex items-center gap-1 rounded-md border border-border bg-subtle px-1.5 py-0.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <Icon className="size-3 text-muted-foreground" aria-label={role ? localized(role, 'name', locale) : tr(`stepShort.${s.step_type}`)} />
                      <span className={cn('numeric', s.sla_business_days === null ? 'text-faint-foreground' : 'font-medium')}>
                        {s.sla_business_days === null ? '—' : t('daysShort', { count: s.sla_business_days })}
                      </span>
                    </span>
                  </SimpleTooltip>
                );
              })}
            </div>
          );
        },
        meta: { label: t('columns.steps') },
      },
      {
        id: 'open',
        accessorFn: (r) => r.usage.open,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.open')} />,
        cell: ({ row }) => <span className="numeric text-foreground">{n(row.original.usage.open)}</span>,
        meta: { label: t('columns.open'), align: 'end', width: '5.5rem' },
      },
      {
        id: 'overdue',
        accessorFn: (r) => r.usage.overdueOpen,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.overdue')} />,
        cell: ({ row }) =>
          row.original.usage.overdueOpen ? (
            <Badge variant="danger" size="sm">
              {n(row.original.usage.overdueOpen)}
            </Badge>
          ) : (
            <span className="numeric text-muted-foreground">0</span>
          ),
        meta: { label: t('columns.overdue'), align: 'end', width: '5.5rem' },
      },
      {
        id: 'onTime',
        accessorFn: (r) => onTimeRate(r.usage) ?? -1,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.onTime')} />,
        cell: ({ row }) => {
          const u = row.original.usage;
          const rate = onTimeRate(u);
          if (rate === null) return <span className="text-xs text-faint-foreground">{t('noData')}</span>;
          const tone = rate >= 0.9 ? 'success' : rate >= 0.7 ? 'warning' : 'danger';
          return (
            <div className="flex items-center gap-2">
              <Progress value={rate * 100} tone={tone} className="h-1.5 w-14" aria-label={t('columns.onTime')} />
              <span className="numeric text-sm font-medium text-foreground" title={t('ofResolved', { count: u.resolved })}>
                {formatPercent(rate, locale)}
              </span>
            </div>
          );
        },
        meta: { label: t('columns.onTime') },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, canEdit, roles],
  );

  const weekday = (d: number) => tRoot(`enums.weekday.${WEEKDAYS[d] ?? 'sunday'}`);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader compact title={t('title')} description={t('description')} />
      <KpiGrid>
        <StatCard label={t('kpi.coverage')} value={`${n(withSla.length)} / ${n(active.length)}`} icon={TimerIcon} tone="primary" hint={t('kpi.coverageHint')} />
        <StatCard
          label={t('kpi.average')}
          value={avg !== null ? formatNumber(avg, locale, { maximumFractionDigits: 1 }) : '—'}
          icon={SlidersHorizontalIcon}
          tone="secondary"
          hint={t('kpi.averageHint')}
        />
        <StatCard
          label={t('kpi.onTime')}
          value={overallRate !== null ? formatPercent(overallRate, locale) : '—'}
          icon={GaugeIcon}
          tone={overallRate === null ? 'neutral' : overallRate >= 0.9 ? 'success' : overallRate >= 0.7 ? 'warning' : 'danger'}
          hint={totals.resolved ? t('kpi.onTimeHint', { count: totals.resolved }) : t('kpi.onTimeEmpty')}
        />
        <StatCard
          label={t('kpi.overdue')}
          value={n(totals.overdue)}
          icon={AlarmClockIcon}
          tone={totals.overdue ? 'danger' : 'success'}
          hint={t('kpi.overdueHint', { count: totals.open })}
        />
      </KpiGrid>

      <SectionCard dense title={t('howTitle')} icon={<CalendarCheck2Icon />} description={t('howDescription', { time: calendar.workEnd?.slice(0, 5) ?? '—' })}>
        <div className="grid gap-3 pb-1 md:grid-cols-3">
          <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">{t('workingDays')}</span>
            <span className="flex flex-wrap gap-1">
              {calendar.workingDays.length ? (
                calendar.workingDays.map((d) => (
                  <Badge key={d} variant="success" size="sm">
                    {weekday(d)}
                  </Badge>
                ))
              ) : (
                <span className="text-meta text-muted-foreground">—</span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">{t('weekend')}</span>
            <span className="flex flex-wrap gap-1">
              {calendar.weekendDays.length ? (
                calendar.weekendDays.map((d) => (
                  <Badge key={d} variant="neutral" size="sm">
                    {weekday(d)}
                  </Badge>
                ))
              ) : (
                <span className="text-meta text-muted-foreground">—</span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarOffIcon className="size-3.5" aria-hidden />
              {t('holidays')}
            </span>
            <span className="text-sm text-foreground">{t('holidaysValue', { year: calendar.holidaysThisYear, upcoming: calendar.upcomingHolidays })}</span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-1 text-meta">
          <span className="text-muted-foreground">{t('resubmitNote')}</span>
          <Link href="/settings/organization" className="font-medium text-primary hover:underline">
            {t('linkOrganization')}
          </Link>
          <Link href="/settings/public-holidays" className="font-medium text-primary hover:underline">
            {t('linkHolidays')}
          </Link>
        </div>
      </SectionCard>

      <DataTable
        tableId="settings-sla"
        mode="client"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchable
        searchPlaceholder={tr('types.searchPlaceholder')}
        searchText={(r) => [r.name_ar, r.name_en, r.key].join(' ')}
        filters={[
          {
            key: 'state',
            title: t('filters.state'),
            options: [
              { value: 'overdue', label: t('filters.hasOverdue') },
              { value: 'noSla', label: t('filters.noSla') },
              { value: 'inactive', label: tRoot('common.inactive') },
            ],
            accessor: (r) => [
              ...(r.usage.overdueOpen ? ['overdue'] : []),
              ...(r.sla_business_days === null || r.sla_business_days === 0 ? ['noSla'] : []),
              ...(!r.is_active ? ['inactive'] : []),
            ],
          },
        ]}
        pagination={false}
        maxHeight="none"
        emptyState={{ icon: TimerIcon, title: tr('types.emptyTitle'), description: tr('types.emptyDescription') }}
        renderMobileCard={(r) => {
          const rate = onTimeRate(r.usage);
          return (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <RequestTypeIcon icon={r.icon} color={r.color} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{localized(r, 'name', locale)}</span>
                {r.usage.overdueOpen ? (
                  <Badge variant="danger" size="sm">
                    <TriangleAlertIcon className="size-3" aria-hidden />
                    {n(r.usage.overdueOpen)}
                  </Badge>
                ) : null}
              </div>
              <SlaEditor row={r} canEdit={canEdit} />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{t('mobileOpen', { count: r.usage.open })}</span>
                <span>{rate === null ? t('noData') : `${t('columns.onTime')}: ${formatPercent(rate, locale)}`}</span>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

/** Inline editor for a type's SLA (business days); Enter saves, Escape resets. */
function SlaEditor({ row, canEdit }: { row: RequestTypeRow; canEdit: boolean }) {
  const t = useTranslations('requestConfig');
  const locale = useLocale() as Locale;
  const tc = useTranslations('common');
  const router = useRouter();
  const resolve = useErrorMessage();
  const initial = row.sla_business_days === null ? '' : String(row.sla_business_days);
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = value !== initial;
  const parsed = value.trim() === '' ? null : Number(value);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 0 || parsed > 365);

  if (!canEdit) {
    return row.sla_business_days !== null ? (
      <span className="numeric text-foreground">{t('businessDays', { count: row.sla_business_days })}</span>
    ) : (
      <span className="text-faint-foreground">{t('sla.notSet')}</span>
    );
  }

  const save = () => {
    if (!dirty || invalid) return;
    startTransition(async () => {
      const result = await saveTypeSla({ id: row.id, days: parsed });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={365}
        dir="ltr"
        value={value}
        disabled={pending}
        aria-label={t('sla.inputLabel', { name: localized(row, 'name', locale) })}
        aria-invalid={invalid || undefined}
        placeholder="—"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') setValue(initial);
        }}
        className="numeric h-8 w-16 text-center"
      />
      <span className="text-xs whitespace-nowrap text-muted-foreground">{t('sla.daysUnit')}</span>
      {dirty ? (
        <span className="flex items-center">
          <Button type="button" size="icon-xs" variant="ghost" className="text-success" onClick={save} loading={pending} disabled={invalid} aria-label={tc('save')}>
            <CheckIcon />
          </Button>
          <Button type="button" size="icon-xs" variant="ghost" onClick={() => setValue(initial)} disabled={pending} aria-label={tc('cancel')}>
            <XIcon />
          </Button>
        </span>
      ) : null}
    </div>
  );
}

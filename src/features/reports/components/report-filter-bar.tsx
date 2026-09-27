'use client';

import {
  ActivityIcon,
  AwardIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarIcon,
  CircleDotIcon,
  EarthIcon,
  InboxIcon,
  MapPinIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  TimerIcon,
  UserIcon,
  UserRoundCogIcon,
  CalendarRangeIcon,
  type LucideIcon,
} from 'lucide-react';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { DateRangePicker } from '@/components/shared/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatDateRange } from '@/lib/i18n/date-format';
import type { Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { searchReportEmployees } from '../actions';
import { AUDIT_CATEGORIES, CERTIFICATE_TYPES, EXPIRY_BUCKETS, type ReportDefinition, type ReportFilterKey } from '../definitions';
import { activeFilterCount, DATE_FROM_KEY, DATE_TO_KEY, PERIOD_KEY, type ReportFilterState } from '../filters';
import type { FilterOption } from '../queries';
import { FacetFilter, type FacetOption } from './facet-filter';
import { tOr, useReportT, type LooseT } from './format';

const FILTER_ICONS: Record<ReportFilterKey, LucideIcon> = {
  employee: UserIcon,
  department: Building2Icon,
  manager: UserRoundCogIcon,
  location: MapPinIcon,
  nationality: EarthIcon,
  jobTitle: BriefcaseIcon,
  requestType: InboxIcon,
  leaveType: CalendarRangeIcon,
  status: CircleDotIcon,
  bucket: TimerIcon,
  category: ActivityIcon,
  certificateType: AwardIcon,
  year: CalendarIcon,
};

export type FilterPatch = Record<string, string | string[] | null>;

type Props = {
  def: ReportDefinition;
  state: ReportFilterState;
  options: Partial<Record<ReportFilterKey, FilterOption[]>>;
  employeeOptions: FacetOption[];
  onChange: (patch: FilterPatch) => void;
  pending?: boolean;
};

async function searchEmployees(query: string): Promise<FacetOption[]> {
  const result = await searchReportEmployees({ query });
  if (!result.ok) throw new Error(result.error);
  return result.data ?? [];
}

function staticOptions(def: ReportDefinition, key: ReportFilterKey, options: Props['options'], t: LooseT): FacetOption[] {
  switch (key) {
    case 'status':
      if (!def.status) return [];
      return def.status.values.map((v) => ({
        value: v,
        label:
          def.status!.kind === 'status' ? tOr(t, `statuses.${def.status!.domain}.${v}`, v) : tOr(t, `enums.${(def.status as { enumKey: string }).enumKey}.${v}`, v),
      }));
    case 'bucket':
      return EXPIRY_BUCKETS.map((v) => ({ value: v, label: tOr(t, `reports.buckets.${v}`, v) }));
    case 'category':
      return AUDIT_CATEGORIES.map((v) => ({ value: v, label: tOr(t, `reports.categories.${v}`, v) }));
    case 'certificateType':
      return CERTIFICATE_TYPES.map((v) => ({ value: v, label: tOr(t, `enums.certificateType.${v}`, v) }));
    default:
      return (options[key] ?? []).map((o) => ({
        value: o.value,
        label: o.inactive ? `${o.label} · ${t('reports.filters.inactive')}` : o.label,
        description: o.description,
        muted: o.inactive,
      }));
  }
}

/** Filter controls for one report (only the filters it supports), bound to the URL. */
export function ReportFilterBar({ def, state, options, employeeOptions, onChange, pending }: Props) {
  const t = useReportT();
  const locale = useLocale() as Locale;
  const [sheetOpen, setSheetOpen] = useState(false);
  const count = activeFilterCount(state);

  const setDate = (range: { from?: string | null; to?: string | null } | null) => {
    if (!range || (!range.from && !range.to)) {
      onChange({ [DATE_FROM_KEY]: null, [DATE_TO_KEY]: null, [PERIOD_KEY]: def.dateRange?.defaultPreset ? 'all' : null });
    } else {
      onChange({ [DATE_FROM_KEY]: range.from ?? null, [DATE_TO_KEY]: range.to ?? range.from ?? null, [PERIOD_KEY]: null });
    }
  };

  const reset = () => {
    const patch: FilterPatch = { [DATE_FROM_KEY]: null, [DATE_TO_KEY]: null, [PERIOD_KEY]: null };
    for (const key of def.filters) patch[key] = null;
    onChange(patch);
  };

  const controls = (block: boolean) => (
    <>
      {def.dateRange ? (
        <div className={cn('flex items-center', block && 'w-full')}>
          <DateRangePicker
            value={state.dateFrom || state.dateTo ? { from: state.dateFrom, to: state.dateTo } : null}
            onChange={setDate}
            variant="filter"
            size="sm"
            placeholder={`${t(`reports.filters.dateKinds.${def.dateRange.kind}`)}${state.allTime ? ` · ${t('reports.filters.allTime')}` : ''}`}
            className={cn(block && 'w-full [&>button]:w-full')}
            clearable
          />
        </div>
      ) : null}
      {def.filters.map((key) => (
        <FacetFilter
          key={key}
          title={t(`reports.filters.${key}`)}
          icon={FILTER_ICONS[key]}
          options={key === 'employee' ? employeeOptions : staticOptions(def, key, options, t)}
          value={state.values[key] ?? []}
          multiple={key !== 'year'}
          search={key === 'employee' ? searchEmployees : undefined}
          searchPlaceholder={key === 'employee' ? t('reports.filters.employeePlaceholder') : undefined}
          onChange={(v) => onChange({ [key]: v.length ? v : null })}
          block={block}
        />
      ))}
    </>
  );

  const dateSummary =
    def.dateRange && (state.dateFrom || state.dateTo)
      ? `${t(`reports.filters.dateKinds.${def.dateRange.kind}`)}: ${formatDateRange(state.dateFrom, state.dateTo, locale)}`
      : null;

  return (
    <div
      className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-card print:border-0 print:p-0 print:shadow-none"
      data-slot="report-filter-bar"
      aria-busy={pending || undefined}
    >
      {/* Desktop / tablet */}
      <div className="hidden flex-wrap items-center gap-2 md:flex print:hidden">
        <span className="me-1 inline-flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
          <SlidersHorizontalIcon className="size-3.5" />
          {t('reports.filters.title')}
        </span>
        {controls(false)}
        {count > 0 ? (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
            <RotateCcwIcon />
            {t('reports.filters.reset')}
          </Button>
        ) : null}
      </div>

      {/* Phone: summary + sheet */}
      <div className="flex items-center gap-2 md:hidden print:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <SlidersHorizontalIcon />
              {t('reports.filters.show')}
              {count > 0 ? (
                <Badge variant="default" size="sm" className="rounded-sm px-1.5">
                  {count}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh]">
            <SheetHeader>
              <SheetTitle>{t('reports.filters.title')}</SheetTitle>
              <SheetDescription>{t('reports.filters.description')}</SheetDescription>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-2.5">{controls(true)}</SheetBody>
            <SheetFooter className="flex-row gap-2">
              {count > 0 ? (
                <Button variant="outline" className="flex-1" onClick={reset}>
                  <RotateCcwIcon />
                  {t('reports.filters.reset')}
                </Button>
              ) : null}
              <Button className="flex-1" onClick={() => setSheetOpen(false)}>
                {t('reports.filters.done')}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <p className="min-w-0 truncate text-meta text-muted-foreground numeric">
          {dateSummary ?? (count ? t('reports.view.filtersApplied', { count }) : t('reports.filters.description'))}
        </p>
      </div>

      {/* Print: plain summary of what the report shows */}
      <p className="hidden text-meta text-muted-foreground print:block">
        {[dateSummary, count ? t('reports.view.filtersApplied', { count }) : null].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

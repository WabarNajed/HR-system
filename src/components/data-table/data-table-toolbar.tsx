'use client';

import { SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { DateRangePicker } from '@/components/shared/date-picker';
import { SearchInput } from '@/components/shared/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { DataTableFacetedFilter, FilterSearchStatus, useFilterSearch } from './data-table-faceted-filter';
import type { FilterDef, FilterOption, SelectFilterDef, TableQueryPatch, TableQueryState } from './types';

type AnyFilterDef = FilterDef<never> | FilterDef<unknown>;

export type DataTableToolbarProps = {
  state: TableQueryState;
  setState: (patch: TableQueryPatch) => void;
  isPending: boolean;
  searchable: boolean;
  searchPlaceholder?: string;
  filters: AnyFilterDef[];
  moreFilters: AnyFilterDef[];
  moreFiltersSlot?: ReactNode;
  /** Right-side controls (actions, columns, export). */
  end?: ReactNode;
  /** Replaces the chip row (e.g. bulk-selection bar). */
  selectionBar?: ReactNode;
};

function rangeValue(state: TableQueryState, key: string) {
  return { from: state.filters[`${key}From`]?.[0] ?? null, to: state.filters[`${key}To`]?.[0] ?? null };
}

function rangePatch(key: string, value: { from?: string | null; to?: string | null } | null) {
  return {
    [`${key}From`]: value?.from ? [value.from] : null,
    [`${key}To`]: value?.to ? [value.to] : null,
  };
}

/** Search + filters + actions row, with active-filter chips below. */
export function DataTableToolbar({
  state,
  setState,
  isPending,
  searchable,
  searchPlaceholder,
  filters,
  moreFilters,
  moreFiltersSlot,
  end,
  selectionBar,
}: DataTableToolbarProps) {
  const t = useTranslations('common');
  const fmt = useDateFormat();
  const locale = useLocale();
  const listSeparator = locale === 'ar' ? '، ' : ', ';
  const allFilters = [...filters, ...moreFilters];

  const chips: { key: string; label: ReactNode; clear: () => void }[] = [];
  for (const def of allFilters) {
    if (def.type === 'dateRange') {
      const { from, to } = rangeValue(state, def.key);
      if (!from && !to) continue;
      const text = fmt.range(from, to);
      chips.push({ key: def.key, label: <>{def.title}: <bdi className="numeric">{text}</bdi></>, clear: () => setState({ filters: rangePatch(def.key, null) }) });
    } else {
      const values = state.filters[def.key];
      if (!values?.length) continue;
      const labels = values.map((v) => def.options.find((o) => o.value === v)?.label ?? v);
      chips.push({
        key: def.key,
        label: (
          <>
            {def.title}: <span className="font-normal">{labels.slice(0, 3).join(listSeparator)}{labels.length > 3 ? ` +${labels.length - 3}` : ''}</span>
          </>
        ),
        clear: () => setState({ filters: { [def.key]: null } }),
      });
    }
  }

  const clearAll = () => {
    const patch: Record<string, null> = {};
    for (const def of allFilters) {
      if (def.type === 'dateRange') {
        patch[`${def.key}From`] = null;
        patch[`${def.key}To`] = null;
      } else patch[def.key] = null;
    }
    setState({ filters: patch, q: '' });
  };

  const moreActiveCount = moreFilters.filter((d) =>
    d.type === 'dateRange' ? rangeValue(state, d.key).from || rangeValue(state, d.key).to : state.filters[d.key]?.length,
  ).length;

  return (
    <div className="flex flex-col gap-2.5" data-slot="data-table-toolbar">
      <div className="flex flex-wrap items-center gap-2">
        {searchable ? (
          <SearchInput
            value={state.q}
            onSearch={(q) => setState({ q })}
            loading={isPending}
            placeholder={searchPlaceholder ?? t('table.searchPlaceholder')}
            wrapperClassName="w-full sm:w-64 lg:w-72"
            className="h-8"
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((def) =>
            def.type === 'dateRange' ? (
              <DateRangePicker
                key={def.key}
                size="sm"
                variant="filter"
                value={rangeValue(state, def.key)}
                onChange={(v) => setState({ filters: rangePatch(def.key, v) })}
                placeholder={def.title}
                className="w-auto"
              />
            ) : (
              <DataTableFacetedFilter
                key={def.key}
                def={def}
                value={state.filters[def.key] ?? []}
                onChange={(values) => setState({ filters: { [def.key]: values } })}
              />
            ),
          )}
          {moreFilters.length || moreFiltersSlot ? (
            <MoreFiltersSheet
              state={state}
              setState={setState}
              defs={moreFilters}
              slot={moreFiltersSlot}
              activeCount={moreActiveCount}
            />
          ) : null}
        </div>
        {end ? <div className="ms-auto flex items-center gap-2">{end}</div> : null}
      </div>

      {selectionBar ??
        (chips.length ? (
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t('table.activeFilters')}>
            {chips.map((chip) => (
              <Badge key={chip.key} variant="outline" size="lg" className="gap-1 bg-card pe-1 font-medium">
                <span className="max-w-72 truncate">{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.clear}
                  aria-label={t('clear')}
                  className="inline-flex size-5 items-center justify-center rounded-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
            <Button variant="link" size="sm" className="ms-1 text-meta" onClick={clearAll}>
              {t('clearFilters')}
            </Button>
          </div>
        ) : null)}
    </div>
  );
}

function MoreFiltersSheet({
  state,
  setState,
  defs,
  slot,
  activeCount,
}: {
  state: TableQueryState;
  setState: (patch: TableQueryPatch) => void;
  defs: AnyFilterDef[];
  slot?: ReactNode;
  activeCount: number;
}) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<Record<string, string[]>>({});

  const openSheet = (o: boolean) => {
    if (o) setStaged({ ...state.filters });
    setOpen(o);
  };

  const keys = defs.flatMap((d) => (d.type === 'dateRange' ? [`${d.key}From`, `${d.key}To`] : [d.key]));

  const apply = () => {
    const patch: Record<string, string[] | null> = {};
    for (const k of keys) patch[k] = staged[k]?.length ? staged[k]! : null;
    setState({ filters: patch });
    setOpen(false);
  };

  const reset = () => {
    const next = { ...staged };
    for (const k of keys) delete next[k];
    setStaged(next);
  };

  return (
    <Sheet open={open} onOpenChange={openSheet}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={cn('active:scale-100', activeCount > 0 && 'border-primary/35 bg-primary-soft/40')}>
          <SlidersHorizontalIcon className="text-muted-foreground" />
          {t('moreFilters')}
          {activeCount > 0 ? (
            <Badge variant="solid" size="sm" className="min-w-5 rounded-full px-1">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="end" className="sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{t('moreFilters')}</SheetTitle>
          <SheetDescription>{t('table.moreFiltersDescription')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-6">
          {defs.map((def) =>
            def.type === 'dateRange' ? (
              <div key={def.key} className="space-y-2">
                <Label>{def.title}</Label>
                <DateRangePicker
                  value={{ from: staged[`${def.key}From`]?.[0] ?? null, to: staged[`${def.key}To`]?.[0] ?? null }}
                  onChange={(v) =>
                    setStaged((s) => ({
                      ...s,
                      [`${def.key}From`]: v?.from ? [v.from] : [],
                      [`${def.key}To`]: v?.to ? [v.to] : [],
                    }))
                  }
                  numberOfMonths={1}
                  presets={[]}
                />
              </div>
            ) : (
              <SelectFilterFieldset
                key={def.key}
                def={def}
                value={staged[def.key] ?? []}
                onChange={(values) => setStaged((s) => ({ ...s, [def.key]: values }))}
              />
            ),
          )}
          {slot}
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={reset} className="me-auto">
            {t('reset')}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={apply}>{t('apply')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** One select filter in the "More filters" sheet: checkboxes, with a server search box when `def.search` is set. */
function SelectFilterFieldset({ def, value, onChange }: { def: SelectFilterDef<never> | SelectFilterDef<unknown>; value: string[]; onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState('');
  // SearchInput already debounces typing.
  const search = useFilterSearch(def, def.search ? query : '', 0);
  const selected = new Set(value);
  const options: FilterOption[] = def.search
    ? [...value.map(search.optionFor), ...(search.query ? search.results : def.options).filter((o) => !selected.has(o.value))]
    : def.options;

  const toggle = (optionValue: string, on: boolean) => {
    const current = new Set(value);
    if (def.multiple === false) current.clear();
    if (on) current.add(optionValue);
    else current.delete(optionValue);
    onChange(Array.from(current));
  };

  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2 text-meta font-medium text-foreground">{def.title}</legend>
      {def.search ? <SearchInput value={query} onSearch={setQuery} loading={search.loading} aria-label={def.title} className="h-8" /> : null}
      <div className="grid gap-2">
        {options.map((o) => {
          const id = `mf-${def.key}-${o.value}`;
          return (
            <div key={o.value} className="flex items-center gap-2.5">
              <Checkbox id={id} checked={selected.has(o.value)} onCheckedChange={(v) => toggle(o.value, v === true)} />
              <Label htmlFor={id} className="flex-1 font-normal">
                {o.label}
              </Label>
              {typeof o.count === 'number' ? <span className="text-xs text-muted-foreground numeric">{o.count}</span> : null}
            </div>
          );
        })}
      </div>
      {def.search ? <FilterSearchStatus search={search} className="rounded-md bg-muted/40" /> : null}
    </fieldset>
  );
}

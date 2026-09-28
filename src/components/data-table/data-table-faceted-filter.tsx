'use client';

import { CheckIcon, Loader2Icon, PlusCircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { FilterOption, SelectFilterDef } from './types';

export type DataTableFacetedFilterProps = {
  def: SelectFilterDef<never> | SelectFilterDef<unknown>;
  value: string[];
  onChange: (value: string[]) => void;
};

type FilterSearch = NonNullable<SelectFilterDef['search']>;

export type FilterSearchState = {
  /** Trimmed query the state refers to ('' = not searching). */
  query: string;
  results: FilterOption[];
  /** Waiting for the debounce or the server for the current query. */
  loading: boolean;
  failed: boolean;
  /** The option for a value: from the def's options, earlier search results, or the raw value. */
  optionFor: (value: string) => FilterOption;
};

/**
 * Debounced server search for a select filter (`def.search`). Results that belong to an older query
 * are never shown; every option seen is remembered so selected values keep their labels.
 */
export function useFilterSearch(def: SelectFilterDef<never> | SelectFilterDef<unknown>, rawQuery: string, debounceMs = 300): FilterSearchState {
  const query = rawQuery.trim();
  const [result, setResult] = useState<{ query: string; results: FilterOption[]; failed: boolean }>({ query: '', results: [], failed: false });
  const [known, setKnown] = useState<ReadonlyMap<string, FilterOption>>(() => new Map());
  // Latest search function in a ref: callers pass inline functions, which must not restart the search.
  const searchRef = useRef<FilterSearch | undefined>(def.search);
  useEffect(() => {
    searchRef.current = def.search;
  });

  useEffect(() => {
    const search = searchRef.current;
    if (!search || !query) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const results = await search(query);
        if (cancelled) return;
        setResult({ query, results, failed: false });
        setKnown((prev) => {
          const next = new Map(prev);
          for (const o of results) next.set(o.value, o);
          return next;
        });
      } catch {
        if (!cancelled) setResult({ query, results: [], failed: true });
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, debounceMs]);

  const current = Boolean(query) && result.query === query;
  return {
    query,
    results: current ? result.results : [],
    loading: Boolean(query) && !current,
    failed: current && result.failed,
    optionFor: (value) => def.options.find((o) => o.value === value) ?? known.get(value) ?? { value, label: value },
  };
}

/** Toolbar filter button with a searchable option list (single or multi select, optional counts). */
export function DataTableFacetedFilter({ def, value, onChange }: DataTableFacetedFilterProps) {
  const t = useTranslations('common');
  const multiple = def.multiple ?? true;
  const selected = new Set(value);
  const Icon = def.icon ?? PlusCircleIcon;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useFilterSearch(def, def.search && open ? query : '');

  // Server search: the selected options first, then the matches (or the def's options before typing).
  const listed: FilterOption[] = def.search
    ? [
        ...value.map(search.optionFor),
        ...(search.query ? search.results : def.options).filter((o) => !selected.has(o.value)),
      ]
    : def.options;
  const selectedLabels = value.map((v) => search.optionFor(v).label);

  const toggle = (optionValue: string) => {
    const isSelected = selected.has(optionValue);
    if (multiple) {
      const next = new Set(selected);
      if (isSelected) next.delete(optionValue);
      else next.add(optionValue);
      onChange(Array.from(next));
    } else {
      onChange(isSelected ? [] : [optionValue]);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('border-dashed active:scale-100', selected.size > 0 && 'border-solid border-primary/35 bg-primary-soft/40')}
        >
          <Icon className="text-muted-foreground" />
          {def.title}
          {selected.size > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 !h-4" />
              <Badge variant="default" size="sm" className="rounded-sm px-1 font-normal lg:hidden">
                {selected.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selected.size > 2 ? (
                  <Badge variant="default" size="sm" className="rounded-sm px-1.5 font-normal">
                    {t('table.selectedFilters', { count: selected.size })}
                  </Badge>
                ) : (
                  selectedLabels.map((label, i) => (
                    <Badge key={value[i]} variant="default" size="sm" className="max-w-28 rounded-sm px-1.5 font-normal">
                      <span className="truncate">{label}</span>
                    </Badge>
                  ))
                )}
              </div>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-0', def.search ? 'w-80' : 'w-60')} align="start">
        <Command shouldFilter={!def.search}>
          {def.search ? (
            <CommandInput value={query} onValueChange={setQuery} placeholder={t('combobox.searchPlaceholder')} aria-label={def.title} />
          ) : def.options.length > 7 ? (
            <CommandInput placeholder={def.title} />
          ) : null}
          <CommandList>
            {def.search ? (
              <FilterSearchStatus search={search} />
            ) : (
              <CommandEmpty>{t('table.noFilterOptions')}</CommandEmpty>
            )}
            {listed.length ? (
              <CommandGroup>
                {listed.map((option) => {
                  const isSelected = selected.has(option.value);
                  const OptIcon = option.icon;
                  return (
                    <CommandItem key={option.value} value={option.value} keywords={[option.label]} onSelect={() => toggle(option.value)}>
                      <span
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center border',
                          multiple ? 'rounded-xs' : 'rounded-full',
                          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                        )}
                      >
                        {isSelected ? <CheckIcon className="size-3 !text-primary-foreground" strokeWidth={3} /> : null}
                      </span>
                      {OptIcon ? <OptIcon className="size-4" /> : null}
                      <span className="truncate">{option.label}</span>
                      {typeof option.count === 'number' ? (
                        <span className="ms-auto text-xs text-muted-foreground numeric">{option.count}</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
            {selected.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    {t('clearFilters')}
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Loading / error / "type to search" / no-matches line for a server-searched filter. */
export function FilterSearchStatus({ search, className }: { search: FilterSearchState; className?: string }) {
  const t = useTranslations('common');
  const base = cn('px-2 py-3 text-center text-meta', className);
  if (search.loading) {
    return (
      <div role="status" className={cn(base, 'flex items-center justify-center gap-2 text-muted-foreground')}>
        <Loader2Icon className="size-4 animate-spin" />
        {t('combobox.loading')}
      </div>
    );
  }
  if (search.failed) {
    return (
      <div role="alert" className={cn(base, 'text-danger')}>
        {t('states.errorTitle')}
      </div>
    );
  }
  if (!search.query) return <div className={cn(base, 'text-muted-foreground')}>{t('combobox.typeToSearch', { count: 1 })}</div>;
  if (!search.results.length) return <div className={cn(base, 'text-muted-foreground')}>{t('combobox.empty')}</div>;
  return null;
}

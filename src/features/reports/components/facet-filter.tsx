'use client';

import { CheckIcon, Loader2Icon, PlusCircleIcon, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type FacetOption = { value: string; label: string; description?: string; muted?: boolean };

export type FacetFilterProps = {
  title: string;
  icon?: LucideIcon;
  options: FacetOption[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  /** Server-side search (employee lookup). Receives the query; must resolve within ~10 s. */
  search?: (query: string) => Promise<FacetOption[]>;
  searchPlaceholder?: string;
  /** Full-width trigger (mobile filter sheet). */
  block?: boolean;
  disabled?: boolean;
};

/**
 * Toolbar filter button (dashed until a value is set, then solid with the selected labels) with a
 * searchable option list — the report filter bar's building block, matching the DataTable filters.
 */
export function FacetFilter({
  title,
  icon: Icon = PlusCircleIcon,
  options,
  value,
  onChange,
  multiple = true,
  search,
  searchPlaceholder,
  block,
  disabled,
}: FacetFilterProps) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<FacetOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    if (!open || !search) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const result = await Promise.race([
          search(query),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 10_000)),
        ]);
        if (!cancelled) setRemote(result);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, search]);

  const known = useMemo(() => {
    const map = new Map<string, FacetOption>();
    for (const o of [...options, ...(remote ?? [])]) map.set(o.value, o);
    return map;
  }, [options, remote]);

  const list = search ? (remote ?? []) : options;
  const selectedLabels = value.map((v) => known.get(v)?.label ?? v);

  const toggle = (v: string) => {
    if (!multiple) {
      onChange(selected.has(v) ? [] : [v]);
      setOpen(false);
      return;
    }
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  };

  // Keep picked options visible at the top while searching remotely.
  const pinned = search ? value.map((v) => known.get(v)).filter((o): o is FacetOption => Boolean(o)) : [];
  const rest = search ? list.filter((o) => !selected.has(o.value)) : list;

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
          disabled={disabled}
          className={cn(
            'border-dashed active:scale-100',
            selected.size > 0 && 'border-solid border-primary/35 bg-primary-soft/40',
            block && 'w-full justify-start',
          )}
        >
          <Icon className="text-muted-foreground" />
          <span className={cn(block && 'me-auto')}>{title}</span>
          {selected.size > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-0.5 !h-4" />
              {selected.size > 2 || (!block && selectedLabels.join('').length > 34) ? (
                <Badge variant="default" size="sm" className="rounded-sm px-1.5 font-normal">
                  {t('table.selectedFilters', { count: selected.size })}
                </Badge>
              ) : (
                <span className="flex min-w-0 gap-1">
                  {selectedLabels.map((label, i) => (
                    <Badge key={i} variant="default" size="sm" className="max-w-36 rounded-sm px-1.5 font-normal">
                      <span className="truncate">{label}</span>
                    </Badge>
                  ))}
                </span>
              )}
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={!search}>
          {search || options.length > 7 ? (
            <CommandInput placeholder={searchPlaceholder ?? title} value={query} onValueChange={setQuery} />
          ) : null}
          <CommandList>
            {loading && !list.length ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {t('combobox.loading')}
              </div>
            ) : failed ? (
              <div className="py-6 text-center text-sm text-danger">{t('states.errorTitle')}</div>
            ) : (
              <CommandEmpty>{t('table.noFilterOptions')}</CommandEmpty>
            )}
            {pinned.length ? (
              <CommandGroup>
                {pinned.map((option) => (
                  <FacetItem key={`p-${option.value}`} option={option} checked multiple={multiple} onSelect={() => toggle(option.value)} />
                ))}
              </CommandGroup>
            ) : null}
            {!failed ? (
              <CommandGroup>
                {rest.map((option) => (
                  <FacetItem
                    key={option.value}
                    option={option}
                    checked={selected.has(option.value)}
                    multiple={multiple}
                    onSelect={() => toggle(option.value)}
                  />
                ))}
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

function FacetItem({ option, checked, multiple, onSelect }: { option: FacetOption; checked: boolean; multiple: boolean; onSelect: () => void }) {
  return (
    <CommandItem value={`${option.label} ${option.description ?? ''} ${option.value}`} onSelect={onSelect} className="gap-2.5">
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center border',
          multiple ? 'rounded-xs' : 'rounded-full',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
        )}
      >
        {checked ? <CheckIcon className="size-3 !text-primary-foreground" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate', option.muted && 'text-muted-foreground')}>{option.label}</div>
        {option.description ? <div className="truncate text-xs text-muted-foreground numeric">{option.description}</div> : null}
      </div>
    </CommandItem>
  );
}

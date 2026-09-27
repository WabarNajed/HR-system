'use client';

import { CheckIcon, ChevronsUpDownIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary text (e.g. employee number, department). Also searchable. */
  description?: string;
  /** Leading visual (avatar, icon, color dot). */
  icon?: ReactNode;
  disabled?: boolean;
  /** Extra search terms (e.g. the other-language name). */
  keywords?: string[];
};

type BaseProps = {
  /** Static options (client-side filtering). */
  options?: ComboboxOption[];
  /**
   * Async loader (server-side search). Called with the query after `debounce` ms. Must resolve
   * within `timeout` ms or the list shows an error state. Filtering is then done by the loader.
   */
  loadOptions?: (query: string, signal: AbortSignal) => Promise<ComboboxOption[]>;
  /** Labels for already-selected values that may not be in the current option list (async mode). */
  selectedOptions?: ComboboxOption[];
  minChars?: number;
  debounce?: number;
  timeout?: number;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
  contentClassName?: string;
  size?: 'sm' | 'md';
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

export type ComboboxProps =
  | (BaseProps & { multiple?: false; value: string | null | undefined; onChange: (value: string | null, option: ComboboxOption | null) => void })
  | (BaseProps & { multiple: true; value: string[] | null | undefined; onChange: (value: string[], options: ComboboxOption[]) => void });

/** Searchable select (single or multi) with optional async loading. */
export function Combobox(props: ComboboxProps) {
  const {
    options: staticOptions,
    loadOptions,
    selectedOptions,
    minChars = 0,
    debounce = 250,
    timeout = 10000,
    placeholder,
    searchPlaceholder,
    emptyText,
    disabled,
    clearable = true,
    id,
    className,
    contentClassName,
    size = 'md',
  } = props;
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [asyncOptions, setAsyncOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Options the user picked (keeps labels for selected values across async searches). */
  const [remembered, setRemembered] = useState<ComboboxOption[]>([]);

  const selectedValues = useMemo<string[]>(() => {
    if (props.multiple) return props.value ?? [];
    return props.value ? [props.value] : [];
  }, [props.multiple, props.value]);

  const known = useMemo(() => {
    const map = new Map<string, ComboboxOption>();
    for (const o of [...remembered, ...(selectedOptions ?? []), ...(staticOptions ?? []), ...asyncOptions]) map.set(o.value, o);
    return map;
  }, [remembered, selectedOptions, staticOptions, asyncOptions]);

  const belowMinChars = Boolean(loadOptions) && query.length < minChars;
  const options = loadOptions ? (belowMinChars ? [] : asyncOptions) : (staticOptions ?? []);

  // Latest loader in a ref: callers often pass an inline function, which must not restart the
  // search (or loop) on every parent render.
  const loadRef = useRef(loadOptions);
  useEffect(() => {
    loadRef.current = loadOptions;
  });
  const hasLoader = Boolean(loadOptions);

  useEffect(() => {
    const load = loadRef.current;
    if (!open || !load || query.length < minChars) return;
    const controller = new AbortController();
    let timeoutId: number | undefined;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      timeoutId = window.setTimeout(() => controller.abort(), timeout);
      try {
        const result = await load(query, controller.signal);
        if (!controller.signal.aborted) setAsyncOptions(result);
      } catch {
        setFailed(true);
      } finally {
        window.clearTimeout(timeoutId);
        setLoading(false);
      }
    }, debounce);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [open, query, hasLoader, minChars, debounce, timeout]);

  const remember = (option: ComboboxOption | undefined) => {
    if (option) setRemembered((r) => [...r.filter((x) => x.value !== option.value), option]);
  };

  const select = (value: string) => {
    remember(known.get(value));
    if (props.multiple) {
      const current = props.value ?? [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      props.onChange(next, next.map((v) => known.get(v)).filter(Boolean) as ComboboxOption[]);
    } else {
      const next = props.value === value ? null : value;
      props.onChange(next, next ? (known.get(next) ?? null) : null);
      setOpen(false);
    }
  };

  const clear = () => {
    if (props.multiple) props.onChange([], []);
    else props.onChange(null, null);
  };

  const selectedLabels = selectedValues.map((v) => known.get(v)?.label ?? v);

  let triggerContent: ReactNode;
  if (!selectedValues.length) {
    triggerContent = <span className="truncate text-faint-foreground">{placeholder ?? t('combobox.placeholder')}</span>;
  } else if (props.multiple) {
    triggerContent =
      selectedValues.length <= 2 ? (
        <span className="flex min-w-0 gap-1">
          {selectedLabels.map((l, i) => (
            <Badge key={i} variant="neutral" size="sm" className="max-w-32 truncate">
              <span className="truncate">{l}</span>
            </Badge>
          ))}
        </span>
      ) : (
        <span className="truncate">{t('combobox.selectedCount', { count: selectedValues.length })}</span>
      );
  } else {
    const opt = known.get(selectedValues[0]!);
    triggerContent = (
      <span className="flex min-w-0 items-center gap-2">
        {opt?.icon}
        <span className="truncate">{selectedLabels[0]}</span>
      </span>
    );
  }

  const showClear = clearable && selectedValues.length > 0 && !disabled;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <div className={cn('relative w-full', className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={props['aria-invalid']}
            aria-describedby={props['aria-describedby']}
            disabled={disabled}
            className={cn(
              'w-full justify-between gap-2 border-input px-3 font-normal text-foreground hover:border-border-strong hover:bg-card active:scale-100 dark:bg-input/20',
              size === 'sm' ? 'h-8 text-meta' : 'h-9',
              'aria-invalid:border-danger',
            )}
          >
            <span className={cn('flex min-w-0 flex-1 items-center', showClear && 'pe-6')}>{triggerContent}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        {showClear ? (
          <button
            type="button"
            aria-label={t('combobox.clear')}
            onClick={clear}
            className="absolute end-8 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent
        className={cn('w-(--radix-popover-trigger-width) min-w-60 p-0', contentClassName)}
        align="start"
      >
        <Command shouldFilter={!loadOptions}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder ?? t('combobox.searchPlaceholder')}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {t('combobox.loading')}
              </div>
            ) : failed ? (
              <div className="py-6 text-center text-sm text-danger">{t('states.errorTitle')}</div>
            ) : belowMinChars ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('combobox.typeToSearch', { count: minChars })}</div>
            ) : (
              <CommandEmpty>{emptyText ?? t('combobox.empty')}</CommandEmpty>
            )}
            {!loading && !failed ? (
              <CommandGroup>
                {options.map((option) => {
                  const checked = selectedValues.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      keywords={[option.label, option.description ?? '', ...(option.keywords ?? [])]}
                      disabled={option.disabled}
                      onSelect={() => select(option.value)}
                      className="gap-2.5"
                    >
                      {props.multiple ? (
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded-xs border',
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                          )}
                        >
                          {checked ? <CheckIcon className="size-3 !text-primary-foreground" strokeWidth={3} /> : null}
                        </span>
                      ) : null}
                      {option.icon}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{option.label}</div>
                        {option.description ? <div className="truncate text-xs text-muted-foreground">{option.description}</div> : null}
                      </div>
                      {!props.multiple && checked ? <CheckIcon className="size-4 !text-primary" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

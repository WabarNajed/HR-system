'use client';

import {
  addDays,
  endOfMonth,
  endOfYear,
  format as formatDate,
  isValid,
  parseISO,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore, type ComponentProps } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';

/* ─── ISO helpers (date-only, no time zone shifts) ────────────────────────── */

/** `yyyy-MM-dd` → local Date (midnight), or undefined. */
export function isoToDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = parseISO(value.slice(0, 10));
  return isValid(d) ? d : undefined;
}

/** Local Date → `yyyy-MM-dd`. */
export function dateToIso(date: Date | null | undefined): string | null {
  return date && isValid(date) ? formatDate(date, 'yyyy-MM-dd') : null;
}

const triggerClass = cn(
  'h-9 w-full justify-start gap-2 border-input px-3 font-normal text-foreground hover:border-border-strong hover:bg-card dark:bg-input/20',
  'data-[empty=true]:text-faint-foreground aria-invalid:border-danger',
);

export type DatePickerProps = {
  /** ISO date `yyyy-MM-dd` or null. */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Earliest/latest selectable ISO dates. */
  min?: string;
  max?: string;
  /** Show a clear (×) button when a value is set (default true). */
  clearable?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** Year/month dropdowns in the caption (useful for birth dates). */
  captionLayout?: ComponentProps<typeof Calendar>['captionLayout'];
  align?: 'start' | 'center' | 'end';
};

/** Single date picker (Popover + Calendar), locale-aware display, ISO string value. */
export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  min,
  max,
  clearable = true,
  id,
  name,
  className,
  captionLayout = 'label',
  align = 'start',
  ...aria
}: DatePickerProps) {
  const t = useTranslations('common.datePicker');
  const fmt = useDateFormat();
  const [open, setOpen] = useState(false);
  const selected = isoToDate(value);
  const minDate = isoToDate(min);
  const maxDate = isoToDate(max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative w-full', className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            data-empty={!selected}
            aria-invalid={aria['aria-invalid']}
            aria-describedby={aria['aria-describedby']}
            className={cn(triggerClass, clearable && selected && 'pe-9', 'active:scale-100')}
          >
            <CalendarIcon className="text-muted-foreground" />
            <span className="truncate numeric">{selected ? fmt.date(dateToIso(selected)) : (placeholder ?? t('placeholder'))}</span>
          </Button>
        </PopoverTrigger>
        {clearable && selected && !disabled ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('clear')}
            className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
        {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}
      </div>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate ?? undefined}
          captionLayout={captionLayout}
          startMonth={captionLayout !== 'label' ? (minDate ?? new Date(1940, 0)) : undefined}
          endMonth={captionLayout !== 'label' ? (maxDate ?? new Date(new Date().getFullYear() + 10, 11)) : undefined}
          disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
          onSelect={(d) => {
            onChange(dateToIso(d));
            setOpen(false);
          }}
          autoFocus
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(dateToIso(new Date()));
              setOpen(false);
            }}
          >
            {t('today')}
          </Button>
          {clearable && selected ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              {t('clear')}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Range ───────────────────────────────────────────────────────────────── */

const SM_QUERY = '(min-width: 640px)';
function subscribeSm(cb: () => void) {
  const mql = window.matchMedia(SM_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
/** True from the `sm` breakpoint up (false during SSR). */
function useIsSmUp() {
  return useSyncExternalStore(
    subscribeSm,
    () => window.matchMedia(SM_QUERY).matches,
    () => false,
  );
}

export type IsoDateRange = { from?: string | null; to?: string | null };

type PresetKey = 'last7Days' | 'last30Days' | 'last90Days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'next30Days' | 'next90Days';

function presetRange(key: PresetKey): IsoDateRange {
  const today = new Date();
  switch (key) {
    case 'last7Days':
      return { from: dateToIso(subDays(today, 6)), to: dateToIso(today) };
    case 'last30Days':
      return { from: dateToIso(subDays(today, 29)), to: dateToIso(today) };
    case 'last90Days':
      return { from: dateToIso(subDays(today, 89)), to: dateToIso(today) };
    case 'thisMonth':
      return { from: dateToIso(startOfMonth(today)), to: dateToIso(endOfMonth(today)) };
    case 'lastMonth': {
      const m = subMonths(today, 1);
      return { from: dateToIso(startOfMonth(m)), to: dateToIso(endOfMonth(m)) };
    }
    case 'thisYear':
      return { from: dateToIso(startOfYear(today)), to: dateToIso(endOfYear(today)) };
    case 'next30Days':
      return { from: dateToIso(today), to: dateToIso(addDays(today, 29)) };
    case 'next90Days':
      return { from: dateToIso(today), to: dateToIso(addDays(today, 89)) };
  }
}

export type DateRangePickerProps = {
  value: IsoDateRange | null | undefined;
  onChange: (value: IsoDateRange | null) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  clearable?: boolean;
  /** Quick ranges in the side panel. Pass `[]` to hide. */
  presets?: PresetKey[];
  numberOfMonths?: 1 | 2;
  id?: string;
  className?: string;
  /** Smaller trigger for toolbars. */
  size?: 'sm' | 'md';
  /** `filter` = toolbar look (dashed outline, label-style placeholder) used by DataTable. */
  variant?: 'field' | 'filter';
  align?: 'start' | 'center' | 'end';
  'aria-invalid'?: boolean;
};

/** Date range picker with quick presets; ISO `{from, to}` value. */
export function DateRangePicker({
  value,
  onChange,
  placeholder,
  disabled,
  min,
  max,
  clearable = true,
  presets = ['last7Days', 'last30Days', 'last90Days', 'thisMonth', 'lastMonth', 'thisYear'],
  numberOfMonths = 2,
  id,
  className,
  size = 'md',
  variant = 'field',
  align = 'start',
  ...aria
}: DateRangePickerProps) {
  const t = useTranslations('common.datePicker');
  const fmt = useDateFormat();
  const [open, setOpen] = useState(false);
  const smUp = useIsSmUp();
  const months = smUp ? numberOfMonths : 1;
  const from = isoToDate(value?.from);
  const to = isoToDate(value?.to);
  const hasValue = Boolean(from || to);
  const minDate = isoToDate(min);
  const maxDate = isoToDate(max);

  const label = hasValue ? fmt.range(dateToIso(from), dateToIso(to)) : (placeholder ?? t('rangePlaceholder'));

  const selected: DayPickerRange | undefined = from ? { from, to } : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size={size}
            disabled={disabled}
            data-empty={!hasValue}
            aria-invalid={aria['aria-invalid']}
            className={cn(
              triggerClass,
              size === 'sm' && 'h-8 text-meta',
              variant === 'filter' &&
                'w-auto border-dashed font-medium data-[empty=true]:text-foreground data-[empty=false]:border-solid data-[empty=false]:border-primary/35 data-[empty=false]:bg-primary-soft/40',
              clearable && hasValue && 'pe-9',
              'active:scale-100',
            )}
          >
            <CalendarIcon className="text-muted-foreground" />
            <span className="truncate numeric">{label}</span>
          </Button>
        </PopoverTrigger>
        {clearable && hasValue && !disabled ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('clear')}
            className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align={align}>
        <div className="flex flex-col sm:flex-row">
          {presets.length ? (
            <div className="flex gap-1 overflow-x-auto border-b border-border p-2 sm:w-40 sm:flex-col sm:border-e sm:border-b-0">
              <p className="hidden px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground sm:block">{t('presets')}</p>
              {presets.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 justify-start font-normal"
                  onClick={() => {
                    onChange(presetRange(key));
                    setOpen(false);
                  }}
                >
                  {t(key)}
                </Button>
              ))}
            </div>
          ) : null}
          <Calendar
            mode="range"
            selected={selected}
            defaultMonth={from ?? subMonths(new Date(), months === 2 ? 1 : 0)}
            numberOfMonths={months}
            disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
            onSelect={(r) => onChange(r ? { from: dateToIso(r.from), to: dateToIso(r.to) } : null)}
            className="[&_.rdp-months]:flex-nowrap"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

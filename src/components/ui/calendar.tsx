'use client';

import { arSA, enUS } from 'date-fns/locale';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import { DayPicker, getDefaultClassNames, type DayButton, type Labels } from 'react-day-picker';
import { Button, buttonVariants } from '@/components/ui/button';
import { dir as directionOf } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

/** date-fns locales used by the calendar (Arabic month/weekday names, Latin digits). */
export const dateFnsLocales = { ar: arSA, en: enUS } as const;

export type CalendarProps = ComponentProps<typeof DayPicker> & {
  buttonVariant?: ComponentProps<typeof Button>['variant'];
};

/**
 * react-day-picker v9 calendar, locale + direction aware (Arabic → RTL, week starts Sunday).
 * All other DayPicker props pass through (mode, selected, onSelect, disabled, numberOfMonths…).
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  labels,
  ...props
}: CalendarProps) {
  const locale = useLocale();
  const t = useTranslations('common.calendar');
  const defaultClassNames = getDefaultClassNames();
  /* Accessible names — react-day-picker only ships English ones for the date-fns locales. */
  const translatedLabels = useMemo<Partial<Labels>>(
    () => ({
      labelNav: () => t('navigation'),
      labelPrevious: () => t('previousMonth'),
      labelNext: () => t('nextMonth'),
      labelMonthDropdown: () => t('chooseMonth'),
      labelYearDropdown: () => t('chooseYear'),
      labelWeekNumber: (week) => t('weekNumber', { week }),
      labelWeekNumberHeader: () => t('weekNumberHeader'),
      labelDayButton: (date, modifiers, _options, dateLib) => {
        let label = dateLib ? dateLib.format(date, 'PPPP') : date.toDateString();
        if (modifiers.today) label = t('todayDay', { date: label });
        if (modifiers.selected) label = t('selectedDay', { date: label });
        return label;
      },
      labelGridcell: (date, modifiers, _options, dateLib) => {
        const label = dateLib ? dateLib.format(date, 'PPPP') : date.toDateString();
        return modifiers?.today ? t('todayDay', { date: label }) : label;
      },
    }),
    [t],
  );

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={dateFnsLocales[locale]}
      dir={directionOf(locale)}
      weekStartsOn={0}
      numerals="latn"
      labels={{ ...translatedLabels, ...labels }}
      className={cn(
        'group/calendar bg-transparent p-3 [--cell-size:--spacing(9)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent',
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant, size: 'icon-sm' }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-40',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant, size: 'icon-sm' }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-40',
          defaultClassNames.button_next,
        ),
        month_caption: cn('flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)', defaultClassNames.month_caption),
        dropdowns: cn('flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium', defaultClassNames.dropdowns),
        dropdown_root: cn(
          'relative rounded-md border border-input shadow-xs has-focus:border-primary has-focus:ring-[3px] has-focus:ring-ring/30',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn('absolute inset-0 bg-popover opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'font-semibold select-none',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex h-8 items-center gap-1 rounded-md ps-2 pe-1 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        table: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn('flex-1 rounded-md text-[0.75rem] font-medium text-muted-foreground select-none', defaultClassNames.weekday),
        week: cn('mt-1.5 flex w-full', defaultClassNames.week),
        week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
        week_number: cn('text-[0.75rem] text-muted-foreground select-none', defaultClassNames.week_number),
        day: cn(
          'group/day relative aspect-square h-full w-full p-0 text-center select-none',
          '[&:first-child[data-selected=true]_button]:rounded-s-md [&:last-child[data-selected=true]_button]:rounded-e-md',
          defaultClassNames.day,
        ),
        range_start: cn('rounded-s-md bg-primary-soft', defaultClassNames.range_start),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn('rounded-e-md bg-primary-soft', defaultClassNames.range_end),
        today: cn(
          'rounded-md font-semibold text-primary data-[selected=true]:rounded-none [&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:size-1 [&>button]:after:rounded-full [&>button]:after:bg-primary',
          defaultClassNames.today,
        ),
        outside: cn('text-faint-foreground/70 aria-selected:text-faint-foreground', defaultClassNames.outside),
        disabled: cn('text-muted-foreground opacity-40', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...rootProps }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...rootProps} />
        ),
        Chevron: ({ className, orientation, ...chevronProps }) => {
          if (orientation === 'left') {
            return <ChevronLeftIcon className={cn('size-4 rtl:rotate-180', className)} {...chevronProps} />;
          }
          if (orientation === 'right') {
            return <ChevronRightIcon className={cn('size-4 rtl:rotate-180', className)} {...chevronProps} />;
          }
          return <ChevronDownIcon className={cn('size-4', className)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...weekProps }) => (
          <td {...weekProps}>
            <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
          </td>
        ),
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toISOString().slice(0, 10)}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'relative flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 rounded-md leading-none font-normal active:scale-100 numeric',
        'data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:after:bg-primary-foreground',
        'data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-primary-soft data-[range-middle=true]:text-primary-soft-foreground',
        'data-[range-start=true]:rounded-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground',
        'data-[range-end=true]:rounded-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground',
        'group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/40',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };

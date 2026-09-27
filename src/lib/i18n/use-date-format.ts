import { useLocale, useTimeZone } from 'next-intl';
import { useMemo } from 'react';
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatDayMonth,
  formatHijriDate,
  formatMonthYear,
  formatTime,
  type DateFormatOptions,
  type DateInput,
} from './date-format';

/**
 * Locale/time-zone bound date formatters for components (server or client):
 *   const fmt = useDateFormat(); fmt.date(row.joining_date) → "27 Sep 2026"
 */
export function useDateFormat() {
  const locale = useLocale();
  const timeZone = useTimeZone();
  return useMemo(() => {
    const o = (opts?: DateFormatOptions): DateFormatOptions => ({ timeZone, ...opts });
    return {
      date: (v: DateInput, opts?: DateFormatOptions) => formatDate(v, locale, o(opts)),
      dayMonth: (v: DateInput, opts?: DateFormatOptions) => formatDayMonth(v, locale, o(opts)),
      time: (v: DateInput) => formatTime(v, locale, { timeZone }),
      dateTime: (v: DateInput, opts?: DateFormatOptions) => formatDateTime(v, locale, o(opts)),
      range: (from: DateInput, to: DateInput, opts?: DateFormatOptions) => formatDateRange(from, to, locale, o(opts)),
      monthYear: (v: DateInput, opts?: DateFormatOptions) => formatMonthYear(v, locale, o(opts)),
      hijri: (v: DateInput) => formatHijriDate(v, locale, { timeZone }),
    };
  }, [locale, timeZone]);
}

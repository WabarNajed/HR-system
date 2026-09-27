import type { Formats } from 'next-intl';

/**
 * Named formats for next-intl (`format.number(n, 'integer')`, `{value, number, integer}` in messages).
 * Every format pins Latin digits so Arabic output stays readable.
 */
export const formats = {
  dateTime: {
    /**
     * Calendar dates: DO NOT use next-intl date formats — they follow the bare locale ('en' →
     * "Sep 27, 2026"). Use `useDateFormat()` / `formatDate()` from `@/lib/i18n` which render the
     * contract format `dd MMM yyyy` identically on server and client.
     */
    /** 14:05 */
    time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', numberingSystem: 'latn' },
    /** Sunday */
    weekday: { weekday: 'long' },
  },
  number: {
    integer: { maximumFractionDigits: 0, numberingSystem: 'latn' },
    decimal: { maximumFractionDigits: 2, numberingSystem: 'latn' },
    /** Leave days etc. — up to one decimal (e.g. 2.5). */
    days: { maximumFractionDigits: 1, numberingSystem: 'latn' },
    percent: { style: 'percent', maximumFractionDigits: 1, numberingSystem: 'latn' },
    currency: { style: 'currency', currency: 'SAR', maximumFractionDigits: 2, numberingSystem: 'latn' },
    compact: { notation: 'compact', maximumFractionDigits: 1, numberingSystem: 'latn' },
  },
} satisfies Formats;

export type AppFormats = typeof formats;

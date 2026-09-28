'use client';

import { useLocale, useNow } from 'next-intl';
import { formatRelative } from '@/lib/dates';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';

/** "5 minutes ago" with the absolute date/time as tooltip (server/client clock drift tolerated). */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const now = useNow({ updateInterval: 60_000 });
  return (
    <time dateTime={value} title={fmt.dateTime(value)} className={cn('numeric', className)} suppressHydrationWarning>
      {formatRelative(value, locale, now)}
    </time>
  );
}

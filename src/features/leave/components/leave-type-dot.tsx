import { useLocale } from 'next-intl';
import { localized } from '@/lib/i18n/localized';
import type { Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import type { LeaveTypeRef } from '../types';

/** Leave type color swatch (the type's configured color). */
export function LeaveTypeDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/5 dark:ring-white/10', className)}
      style={{ backgroundColor: color ?? 'var(--muted-foreground)' }}
    />
  );
}

/** Dot + localized leave type name. */
export function LeaveTypeLabel({
  type,
  className,
  muted,
}: {
  type: Pick<LeaveTypeRef, 'name_ar' | 'name_en' | 'color'> | null | undefined;
  className?: string;
  muted?: boolean;
}) {
  const locale = useLocale() as Locale;
  if (!type) return <span className="text-faint-foreground">—</span>;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <LeaveTypeDot color={type.color} />
      <span className={cn('truncate', muted ? 'text-muted-foreground' : 'text-foreground')}>{localized(type, 'name', locale)}</span>
    </span>
  );
}

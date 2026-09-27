'use client';

import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';
import {
  NOTIFICATION_TONE_CLASS,
  notificationVisual,
  useNotificationText,
  type NotificationRecord,
} from '@/components/shell/notification-text';
import { formatRelative } from '@/lib/dates';
import { formatDateTime } from '@/lib/i18n/date-format';
import { cn } from '@/lib/utils';

export type NotificationItemProps = {
  notification: NotificationRecord;
  onOpen: (n: NotificationRecord) => void;
  /** Reference time for relative labels (pass a stable value to avoid hydration drift). */
  now?: Date;
  density?: 'compact' | 'comfortable';
  /** Trailing controls (e.g. mark read) — rendered outside the clickable area. */
  trailing?: ReactNode;
  className?: string;
};

/**
 * One notification: tone icon, title, body, optional quoted comment, relative time and unread
 * marker. The main area is a button (keyboard accessible) that opens the linked record.
 */
export function NotificationItem({ notification: n, onOpen, now, density = 'comfortable', trailing, className }: NotificationItemProps) {
  const locale = useLocale();
  const render = useNotificationText();
  const { title, body, comment } = render(n);
  const visual = notificationVisual(n);
  const Icon = visual.icon;
  const unread = !n.read_at;
  const compact = density === 'compact';

  return (
    <div
      className={cn(
        'group/notif relative flex items-start gap-3 transition-colors hover:bg-accent/60 focus-within:bg-accent/60',
        compact ? 'px-4 py-2.5' : 'px-4 py-3 sm:px-5',
        unread && 'bg-primary-soft/35',
        className,
      )}
    >
      {unread ? <span aria-hidden className={cn('absolute start-1.5 size-1.5 rounded-full bg-primary', compact ? 'top-4' : 'top-[1.125rem]')} /> : null}
      <button
        type="button"
        onClick={() => onOpen(n)}
        className="flex min-w-0 flex-1 items-start gap-3 text-start outline-none after:absolute after:inset-0 focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
      >
        <span className={cn('mt-0.5 flex shrink-0 items-center justify-center rounded-full', compact ? 'size-8' : 'size-9', NOTIFICATION_TONE_CLASS[visual.tone])}>
          <Icon className={compact ? 'size-4' : 'size-[1.125rem]'} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block leading-5', compact ? 'text-[0.8125rem]' : 'text-sm', unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
            {title}
          </span>
          {body ? <span className={cn('mt-0.5 block text-muted-foreground', compact ? 'line-clamp-2 text-xs leading-5' : 'text-meta leading-5')}>{body}</span> : null}
          {comment && !compact ? (
            <span className="mt-1.5 block border-s-2 border-border-strong ps-2.5 text-meta leading-5 text-foreground/80 italic line-clamp-3">{comment}</span>
          ) : null}
          <span className="mt-1 block text-[0.6875rem] text-faint-foreground" title={formatDateTime(n.created_at, locale)}>
            {formatRelative(n.created_at, locale, now)}
          </span>
        </span>
      </button>
      {trailing ? <div className="relative z-10 flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  );
}

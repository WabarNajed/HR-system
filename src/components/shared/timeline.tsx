'use client';

import { CircleIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';

export type TimelineTone = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type TimelineItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Who did it (already localized name). */
  actor?: ReactNode;
  /** Date/ISO string (formatted with the `dateTime` format) or a pre-rendered node. */
  time?: Date | string | null;
  timeLabel?: ReactNode;
  icon?: LucideIcon;
  tone?: TimelineTone;
  /** Extra block (comment body, changes) under the description. */
  content?: ReactNode;
};

const toneClass: Record<TimelineTone, string> = {
  primary: 'bg-primary-soft text-primary ring-primary/15',
  secondary: 'bg-secondary-soft text-secondary-soft-foreground ring-secondary/20',
  success: 'bg-success-soft text-success ring-success/15',
  warning: 'bg-warning-soft text-warning ring-warning/15',
  danger: 'bg-danger-soft text-danger ring-danger/15',
  info: 'bg-info-soft text-info ring-info/15',
  neutral: 'bg-muted text-muted-foreground ring-border',
};

export type TimelineProps = {
  items: TimelineItem[];
  className?: string;
  /** Compact spacing for side panels. */
  dense?: boolean;
};

/** Vertical activity timeline (request history, audit trail). Newest first is the caller's choice. */
export function Timeline({ items, className, dense }: TimelineProps) {
  const fmt = useDateFormat();
  return (
    <ol className={cn('relative', className)} data-slot="timeline">
      {items.map((item, index) => {
        const Icon = item.icon ?? CircleIcon;
        const last = index === items.length - 1;
        const time =
          item.timeLabel ??
          (item.time ? (
            <time dateTime={typeof item.time === 'string' ? item.time : item.time.toISOString()}>
              {fmt.dateTime(item.time)}
            </time>
          ) : null);
        return (
          <li key={item.id} className={cn('relative flex gap-3', !last && (dense ? 'pb-4' : 'pb-5'))}>
            {!last ? <span aria-hidden className="absolute start-[0.9375rem] top-8 bottom-0 w-px bg-border" /> : null}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                toneClass[item.tone ?? 'neutral'],
              )}
            >
              <Icon className={cn(item.icon ? 'size-4' : 'size-2 fill-current')} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {time ? <span className="text-xs text-muted-foreground numeric">{time}</span> : null}
              </div>
              {item.actor ? <p className="text-xs text-muted-foreground">{item.actor}</p> : null}
              {item.description ? <p className="mt-1 text-meta text-muted-foreground">{item.description}</p> : null}
              {item.content ? <div className="mt-2">{item.content}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

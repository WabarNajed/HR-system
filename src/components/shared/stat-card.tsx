import { ArrowDownRightIcon, ArrowUpRightIcon, ChevronRightIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneIcon: Record<StatTone, string> = {
  primary: 'bg-primary-soft text-primary',
  secondary: 'bg-secondary-soft text-secondary-soft-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
};

const toneBar: Record<StatTone, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-border-strong',
};

export type StatDelta = {
  /** Already formatted value, e.g. "+12%" or "3". */
  value: ReactNode;
  direction: 'up' | 'down' | 'flat';
  /** Whether this change is good (green) or bad (red). Defaults to up = good. */
  positive?: boolean;
  /** Context, e.g. "vs last month". */
  label?: ReactNode;
};

export type StatCardProps = {
  label: ReactNode;
  /** Pre-formatted value (use next-intl `format.number`). */
  value: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  delta?: StatDelta;
  /** Secondary line under the value (e.g. "12 expiring within 30 days"). */
  hint?: ReactNode;
  /** Makes the whole card a link (drill-down). */
  href?: string;
  loading?: boolean;
  /** Optional visual (sparkline, mini progress) at the bottom. */
  footer?: ReactNode;
  className?: string;
};

/** KPI tile for dashboard/report KPI rows. */
export function StatCard({ label, value, icon: Icon, tone = 'primary', delta, hint, href, loading, footer, className }: StatCardProps) {
  if (loading) return <StatCardSkeleton className={className} />;

  const deltaGood = delta ? (delta.positive ?? delta.direction === 'up') : false;
  const body = (
    <>
      <span aria-hidden className={cn('absolute inset-y-3 start-0 w-[3px] rounded-e-full opacity-80', toneBar[tone])} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-meta font-medium text-muted-foreground">{label}</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[1.5rem] leading-8 font-semibold numeric tracking-tight text-foreground sm:text-stat">{value}</span>
            {delta ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-sm px-1 text-xs font-medium numeric',
                  delta.direction === 'flat'
                    ? 'bg-muted text-muted-foreground'
                    : deltaGood
                      ? 'bg-success-soft text-success-soft-foreground'
                      : 'bg-danger-soft text-danger-soft-foreground',
                )}
              >
                {delta.direction === 'up' ? <ArrowUpRightIcon className="size-3 rtl:-scale-x-100" /> : null}
                {delta.direction === 'down' ? <ArrowDownRightIcon className="size-3 rtl:-scale-x-100" /> : null}
                <bdi>{delta.value}</bdi>
              </span>
            ) : null}
          </div>
        </div>
        {Icon ? (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-10', toneIcon[tone])}>
            <Icon className="size-4 sm:size-5" strokeWidth={1.8} aria-hidden />
          </span>
        ) : null}
      </div>
      {hint || delta?.label ? (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{hint ?? delta?.label}</span>
          {href ? (
            <ChevronRightIcon className="ms-auto size-3.5 shrink-0 text-faint-foreground transition-transform group-hover/stat:translate-x-0.5 rtl:rotate-180 rtl:group-hover/stat:-translate-x-0.5" />
          ) : null}
        </div>
      ) : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </>
  );

  const base = cn(
    'group/stat relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card px-3.5 py-3 text-card-foreground shadow-card sm:px-4 sm:py-3.5',
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'transition-[border-color,box-shadow,transform] hover:border-border-strong hover:shadow-raised active:scale-[0.99] focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card px-4 py-3.5 shadow-card', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
        <Skeleton className="size-10 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}

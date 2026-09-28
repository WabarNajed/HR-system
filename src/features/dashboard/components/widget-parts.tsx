import { ChevronRightIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { WidgetRetry } from './widget-retry';

/**
 * Building blocks shared by the dashboard widgets (server-safe: no client hooks).
 * Widgets are SectionCards with a compact header, an optional "View all" link, and a body that is
 * either a divided list, a chart, or a compact empty state.
 */

export function ViewAllLink({ href, label }: { href: string; label?: string }) {
  const t = useTranslations('dashboard.actions');
  return (
    <Button asChild variant="ghost" size="sm" className="-me-2 h-7 gap-0.5 px-2 text-primary hover:text-primary">
      <Link href={href}>
        {label ?? t('viewAll')}
        <ChevronRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
      </Link>
    </Button>
  );
}

export type WidgetProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Body runs edge to edge (lists). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * Standard dashboard card. Cards size to their content (dashboard rows use `items-start`), so a
 * sparse list or an empty state stays compact instead of stretching to a taller neighbour.
 */
export function Widget({ title, description, icon: Icon, actions, footer, flush = true, className, bodyClassName, children }: WidgetProps) {
  return (
    <SectionCard
      title={title}
      description={description}
      icon={Icon ? <Icon aria-hidden /> : undefined}
      actions={actions}
      footer={footer}
      flush={flush}
      dense
      className={className}
      bodyClassName={cn('flex flex-col', bodyClassName)}
    >
      {children}
    </SectionCard>
  );
}

/** Divided list inside a flush widget. */
export function WidgetList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-border', className)}>{children}</ul>;
}

/** A clickable list row (whole row is the link target). */
export function WidgetRow({ href, children, className }: { href?: string | null; children: ReactNode; className?: string }) {
  const inner = cn('flex min-w-0 items-center gap-3 px-4 py-2.5', className);
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            inner,
            'outline-none transition-colors hover:bg-accent/70 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
          )}
        >
          {children}
        </Link>
      ) : (
        <div className={inner}>{children}</div>
      )}
    </li>
  );
}

/** Quiet closing note under a short list — "end of queue", or a follow-up action on personal lists. */
export function WidgetListEnd({ icon: Icon, label, action }: { icon: LucideIcon; label: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-12 flex-col items-center justify-center gap-2 border-t border-border/60 px-4 py-3 text-center text-xs text-faint-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
      {action}
    </div>
  );
}

/** Row of small counters at the top of a widget (label under a number); cells with `href` are links. */
export function WidgetStrip({
  items,
}: {
  items: { key: string; label: ReactNode; value: ReactNode; tone?: 'danger' | 'warning' | 'default'; href?: string }[];
}) {
  return (
    <div
      className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-[repeat(var(--strip-n),minmax(0,1fr))]"
      style={{ '--strip-n': items.length } as CSSProperties}
    >
      {items.map((item) => {
        const body = (
          <>
            <div
              className={cn(
                'numeric text-lg leading-6 font-semibold',
                item.tone === 'danger' ? 'text-danger' : item.tone === 'warning' ? 'text-warning' : 'text-foreground',
              )}
            >
              {item.value}
            </div>
            <div className="truncate text-[0.6875rem] text-muted-foreground group-hover/strip:text-foreground">{item.label}</div>
          </>
        );
        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            className="group/strip block min-w-0 bg-card px-4 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent"
          >
            {body}
          </Link>
        ) : (
          <div key={item.key} className="min-w-0 bg-card px-4 py-2.5">
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Compact empty state for a widget body (fixed ~176px, never stretched). */
export function WidgetEmpty({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'success' | 'primary';
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-44 flex-col items-center justify-center px-6 py-6 text-center', className)}>
      <span
        className={cn(
          'mb-2.5 flex size-9 items-center justify-center rounded-lg',
          tone === 'success' && 'bg-success-soft text-success',
          tone === 'primary' && 'bg-primary-soft text-primary',
          tone === 'neutral' && 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-[1.125rem]" strokeWidth={1.8} aria-hidden />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-0.5 max-w-72 text-meta text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Widget-level load failure (retry re-renders the route). */
export function WidgetError({ className }: { className?: string }) {
  const t = useTranslations('dashboard.states');
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2.5 px-6 py-7 text-center', className)} role="alert">
      <p className="text-meta text-muted-foreground">{t('widgetError')}</p>
      <WidgetRetry />
    </div>
  );
}

/** Suspense fallback: a card with a header and N skeleton rows. */
export function WidgetSkeleton({ rows = 4, className, chart = false }: { rows?: number; className?: string; chart?: boolean }) {
  return (
    <div className={cn('flex min-h-48 flex-col rounded-lg border border-border bg-card shadow-card', className)} aria-hidden>
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="ms-auto h-4 w-14" />
      </div>
      {chart ? (
        <div className="flex flex-1 flex-col justify-end gap-2.5 px-4 py-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3" style={{ width: `${80 - i * 12}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-8 shrink-0 rounded-md" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-md" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Heading that separates role sections on multi-role dashboards. */
export function DashboardSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.9} aria-hidden /> : null}
          <h2 className="truncate text-[0.9375rem] font-semibold text-foreground">{title}</h2>
          {description ? <span className="hidden truncate text-meta text-muted-foreground sm:inline">· {description}</span> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Tinted icon tile used at the start of list rows. */
export function RowIcon({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn('flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4', className)}
      style={style}
    >
      {children}
    </span>
  );
}

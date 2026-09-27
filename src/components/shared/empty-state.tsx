import { InboxIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type EmptyStateProps = {
  /** Lucide icon component (default: Inbox). */
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Primary/secondary actions (buttons or links). */
  action?: ReactNode;
  /**
   * - `inline`: no chrome, for use inside an existing card/table (≈180px).
   * - `card`: bordered surface of its own (≈220px).
   * - `page`: roomier variant for whole-page empty states (≈260px).
   */
  variant?: 'inline' | 'card' | 'page';
  /** Icon tone. */
  tone?: 'primary' | 'neutral' | 'danger' | 'warning';
  className?: string;
  children?: ReactNode;
};

const toneClass = {
  primary: 'bg-primary-soft text-primary',
  neutral: 'bg-muted text-muted-foreground',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
} as const;

/** Compact empty state: icon, title, description, action. Never leaves a giant blank region. */
export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  variant = 'inline',
  tone = 'primary',
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        variant === 'inline' && 'min-h-44 py-8',
        variant === 'card' && 'min-h-56 rounded-lg border border-dashed border-border-strong bg-card py-10',
        variant === 'page' && 'min-h-64 rounded-lg border border-border bg-card py-12 shadow-card',
        className,
      )}
    >
      <div className="relative mb-3.5">
        <div aria-hidden className={cn('absolute -inset-2 rounded-2xl opacity-40 blur-md', toneClass[tone])} />
        <div
          className={cn(
            'relative flex size-11 items-center justify-center rounded-xl ring-1 ring-inset ring-current/10',
            toneClass[tone],
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-meta text-muted-foreground">{description}</p> : null}
      {children}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Header actions at the logical end (buttons, links, menus). */
  actions?: ReactNode;
  /** Leading icon in the header. */
  icon?: ReactNode;
  /** Remove body padding (tables, lists that run edge to edge). */
  flush?: boolean;
  /** Tighter paddings (16px). */
  dense?: boolean;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
  id?: string;
};

/** Titled content card used throughout dashboards, profiles and settings. */
export function SectionCard({
  title,
  description,
  actions,
  icon,
  flush = false,
  dense = false,
  footer,
  className,
  bodyClassName,
  children,
  id,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      id={id}
      data-slot="section-card"
      className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-card text-card-foreground shadow-card', className)}
    >
      {hasHeader ? (
        <div
          className={cn(
            'flex items-start justify-between gap-3',
            dense ? 'px-4 pt-3.5' : 'px-5 pt-4',
            flush ? (dense ? 'pb-3' : 'pb-3.5') + ' border-b border-border' : 'pb-1',
          )}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            {icon ? (
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:size-4">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {title ? <h2 className="text-card-title text-foreground">{title}</h2> : null}
              {description ? <p className="mt-0.5 text-meta text-muted-foreground">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={cn(
          'min-w-0 flex-1',
          !flush && (dense ? 'px-4 pt-2 pb-4' : 'px-5 pt-3 pb-5'),
          !flush && !hasHeader && (dense ? 'pt-4' : 'pt-5'),
          bodyClassName,
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className={cn('flex items-center gap-2 border-t border-border', dense ? 'px-4 py-2.5' : 'px-5 py-3')}>{footer}</div>
      ) : null}
    </section>
  );
}

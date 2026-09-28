import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

export type BreadcrumbEntry = { label: ReactNode; href?: string };

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Array of crumbs (last one = current page) or a custom node. */
  breadcrumbs?: BreadcrumbEntry[] | ReactNode;
  /** Right-aligned (logical end) actions: buttons, menus. Wraps under the title on mobile. */
  actions?: ReactNode;
  /** Content between title and actions, e.g. status badge next to the title. */
  titleAddon?: ReactNode;
  /** Leading visual (avatar/icon) before the title block. */
  leading?: ReactNode;
  /** Optional tab strip rendered flush at the bottom (use LinkTabs). */
  tabs?: ReactNode;
  /** Tighter spacing and the 22px compact title (detail, form, editor and settings pages). */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
};

/** Page title block: breadcrumbs · title + description · actions · optional tabs. */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  titleAddon,
  leading,
  tabs,
  compact = false,
  className,
  children,
}: PageHeaderProps) {
  const t = useTranslations('common.a11y');
  const crumbs = Array.isArray(breadcrumbs) ? (breadcrumbs as BreadcrumbEntry[]) : null;

  return (
    <header data-slot="page-header" className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3', className)}>
      {crumbs ? (
        <Breadcrumb aria-label={t('breadcrumb')}>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <Fragment key={index}>
                  <BreadcrumbItem>
                    {last || !crumb.href ? (
                      <BreadcrumbPage className={cn(!last && 'font-normal text-muted-foreground')}>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last ? <BreadcrumbSeparator /> : null}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      ) : (
        (breadcrumbs as ReactNode) ?? null
      )}

      {/* Actions wrap under the title when both no longer fit (long titles, many actions, narrow panes). */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-x-6">
        <div className="flex min-w-[min(100%,16rem)] flex-1 items-start gap-3.5">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1
                className={cn(
                  'min-w-0 truncate text-foreground',
                  compact ? 'text-page-title-compact' : 'text-page-title',
                )}
              >
                {title}
              </h1>
              {titleAddon}
            </div>
            {description ? (
              <div className={cn('mt-1 max-w-3xl text-muted-foreground', compact ? 'text-meta' : 'text-sm')}>{description}</div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
      </div>

      {children}
      {tabs ? <div className="-mb-px">{tabs}</div> : null}
    </header>
  );
}

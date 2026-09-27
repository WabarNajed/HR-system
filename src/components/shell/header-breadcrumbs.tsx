'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import { useBreadcrumbLabels } from './breadcrumb-context';
import { ROUTE_LABELS, SEGMENT_LABELS } from './nav-config';

type Crumb = { href: string; label: string };

/** Header breadcrumbs derived from the pathname (nav labels + page-registered dynamic labels). */
export function HeaderBreadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const dynamicLabels = useBreadcrumbLabels();
  const t = useTranslations();
  const ta = useTranslations('common.a11y');
  // Dynamic keys from a static table: guarded by `has` and rendered raw when missing.
  const tt = t as unknown as { has: (k: string) => boolean; (k: string): string };
  const label = (key: string) => (tt.has(key) ? tt(key) : key);

  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let path = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    path += `/${segment}`;
    if (dynamicLabels[path]) {
      crumbs.push({ href: path, label: dynamicLabels[path]! });
    } else if (ROUTE_LABELS[path]) {
      crumbs.push({ href: path, label: label(ROUTE_LABELS[path]!) });
    } else if (i > 0 && SEGMENT_LABELS[segment] && crumbs.length) {
      crumbs.push({ href: path, label: label(SEGMENT_LABELS[segment]!) });
    } else if (i > 0) {
      crumbs.push({ href: path, label: label('common.details') });
    }
  }
  if (!crumbs.length) return null;

  return (
    <Breadcrumb aria-label={ta('breadcrumb')} className={cn('min-w-0', className)}>
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              <BreadcrumbItem className={cn('min-w-0', !last && 'hidden md:inline-flex')}>
                {last ? (
                  <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href} className="truncate">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last ? <BreadcrumbSeparator className="hidden md:inline-flex" /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

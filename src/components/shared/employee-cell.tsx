'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';
import { EmployeeAvatar, type AvatarSize } from '@/components/shared/employee-avatar';
import { employeeDisplayName, type EmployeeNameFields } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';

export type EmployeeCellProps = {
  employee: EmployeeNameFields & { id?: string | null; avatarUrl?: string | null };
  /** Secondary line (employee number · job title …). */
  subtitle?: ReactNode;
  /** Makes the name a link (e.g. `/employees/<id>`). Row-click tables can omit it. */
  href?: string;
  size?: AvatarSize;
  className?: string;
  /** Trailing element (badge). */
  addon?: ReactNode;
};

/** Avatar + localized name + subtitle — the standard "Employee" column cell. */
export function EmployeeCell({ employee, subtitle, href, size = 'md', className, addon }: EmployeeCellProps) {
  const locale = useLocale();
  const name = employeeDisplayName(employee, locale);
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)} data-slot="employee-cell">
      <EmployeeAvatar name={name} seed={employee.id ?? name} src={employee.avatarUrl} size={size} />
      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          {href ? (
            <Link
              href={href}
              className="truncate font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-4 focus-visible:underline focus-visible:outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              {name}
            </Link>
          ) : (
            <span className="truncate font-medium text-foreground">{name}</span>
          )}
          {addon}
        </div>
        {subtitle ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
    </div>
  );
}

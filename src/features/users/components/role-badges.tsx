'use client';

import { CrownIcon } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RoleOption } from '../types';

export type RoleLookup = (key: string) => string;

/** Localized role names by key (falls back to the key for roles that no longer exist). */
export function useRoleLookup(roles: readonly Pick<RoleOption, 'key' | 'nameAr' | 'nameEn'>[]): RoleLookup {
  const locale = useLocale();
  return useMemo(() => {
    const map = new Map(roles.map((r) => [r.key, (locale === 'ar' ? r.nameAr || r.nameEn : r.nameEn || r.nameAr) || r.key]));
    return (key: string) => map.get(key) ?? key;
  }, [roles, locale]);
}

const ORDER = ['super_admin', 'hr_admin', 'hr_officer', 'manager', 'employee'];

function sortRoles(keys: readonly string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib) || a.localeCompare(b);
  });
}

/** Role badges (super admin highlighted), collapsing to "+N" after `max`. */
export function RoleBadges({
  roles,
  label,
  max = 3,
  emptyLabel,
  className,
}: {
  roles: readonly string[];
  label: RoleLookup;
  max?: number;
  emptyLabel?: string;
  className?: string;
}) {
  const locale = useLocale();
  if (!roles.length) {
    return emptyLabel ? <span className="text-meta text-faint-foreground">{emptyLabel}</span> : null;
  }
  const sorted = sortRoles(roles);
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((key) => (
        <Badge key={key} variant={key === 'super_admin' ? 'secondary' : key === 'employee' ? 'neutral' : 'default'} size="sm">
          {key === 'super_admin' ? <CrownIcon className="size-3" aria-hidden /> : null}
          {label(key)}
        </Badge>
      ))}
      {rest.length ? (
        <SimpleTooltip content={rest.map(label).join(locale === 'ar' ? '، ' : ', ')}>
          <Badge variant="outline" size="sm" className="numeric">
            +{rest.length}
          </Badge>
        </SimpleTooltip>
      ) : null}
    </div>
  );
}

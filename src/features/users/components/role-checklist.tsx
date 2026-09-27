'use client';

import { CrownIcon, LockIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import type { RoleOption } from '../types';

type RoleChecklistProps = {
  roles: readonly RoleOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** Only super admins may grant or revoke `super_admin`. */
  isSuperAdmin: boolean;
  disabled?: boolean;
  className?: string;
};

/** Selectable role rows (checkbox · name · description · data scope). */
export function RoleChecklist({ roles, value, onChange, isSuperAdmin, disabled, className }: RoleChecklistProps) {
  const t = useTranslations('users.roles');
  const tScope = useTranslations('roles.scope');
  const locale = useLocale() as 'ar' | 'en';

  const toggle = (key: string, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(Array.from(next));
  };

  return (
    <ul className={cn('flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card', className)}>
      {roles.map((role) => {
        const locked = role.key === 'super_admin' && !isSuperAdmin;
        const checked = value.includes(role.key);
        const id = `role-${role.key}`;
        const description = localized({ description_ar: role.descriptionAr, description_en: role.descriptionEn }, 'description', locale);
        const row = (
          <label
            htmlFor={id}
            className={cn(
              'flex cursor-pointer items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-subtle',
              checked && 'bg-primary-soft/40 hover:bg-primary-soft/60',
              (locked || disabled) && 'cursor-not-allowed opacity-70 hover:bg-transparent',
            )}
          >
            <Checkbox id={id} checked={checked} disabled={locked || disabled} onCheckedChange={(v) => toggle(role.key, v === true)} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                {role.key === 'super_admin' ? <CrownIcon className="size-3.5 text-secondary" aria-hidden /> : null}
                <span className="text-sm font-medium text-foreground">{localized({ name_ar: role.nameAr, name_en: role.nameEn }, 'name', locale)}</span>
                <Badge variant={role.dataScope === 'organization' ? 'info' : 'neutral'} size="sm">
                  {tScope(role.dataScope)}
                </Badge>
                {!role.isSystem ? (
                  <Badge variant="outline" size="sm">
                    {t('custom')}
                  </Badge>
                ) : null}
                {locked ? <LockIcon className="size-3.5 text-faint-foreground" aria-hidden /> : null}
              </span>
              {description ? <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span> : null}
            </span>
          </label>
        );
        return <li key={role.key}>{locked ? <SimpleTooltip content={t('superAdminLocked')}>{row}</SimpleTooltip> : row}</li>;
      })}
    </ul>
  );
}

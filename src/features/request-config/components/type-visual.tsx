'use client';

import { ArrowRightIcon, BriefcaseBusinessIcon, ShieldCheckIcon, UserCheckIcon, UserRoundCogIcon, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { DynamicIcon } from '@/components/shared/icon-picker';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import type { RoleOption, StepType, WorkflowStep } from '../types';

export const STEP_ICONS: Record<StepType, LucideIcon> = {
  manager: UserCheckIcon,
  hr: BriefcaseBusinessIcon,
  role: ShieldCheckIcon,
  user: UserRoundCogIcon,
};

/** Tinted tile with the request type's icon (color from the type, primary otherwise). */
export function RequestTypeIcon({ icon, color, size = 'md', className }: { icon: string; color: string | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'size-7 rounded-md' : size === 'lg' ? 'size-10 rounded-lg' : 'size-8 rounded-md';
  const glyph = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4';
  return (
    <span
      aria-hidden
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden', box, !color && 'bg-primary-soft text-primary', className)}
      style={color ? { color } : undefined}
    >
      {color ? <span className="absolute inset-0 opacity-[0.13]" style={{ backgroundColor: color }} /> : null}
      <DynamicIcon name={icon} className={cn('relative', glyph)} />
    </span>
  );
}

/** Compact approval path: "Manager → HR" chips. */
export function ApprovalPathChips({
  steps,
  roles,
  className,
}: {
  steps: Pick<WorkflowStep, 'id' | 'step_type' | 'approver_role_key'>[];
  roles?: RoleOption[];
  className?: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('requestConfig');
  if (!steps.length) return <span className="text-meta text-muted-foreground">{t('workflows.noSteps')}</span>;
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {steps.map((s, i) => {
        const Icon = STEP_ICONS[s.step_type];
        const role = s.step_type === 'role' ? roles?.find((r) => r.key === s.approver_role_key) : undefined;
        const label = role ? localized(role, 'name', locale) : t(`stepShort.${s.step_type}`);
        return (
          <Fragment key={s.id ?? i}>
            {i > 0 ? <ArrowRightIcon aria-hidden className="size-3 shrink-0 text-faint-foreground flip-rtl" /> : null}
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-subtle px-1.5 py-0.5 text-xs text-foreground">
              <Icon className="size-3 text-muted-foreground" aria-hidden />
              {label}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}

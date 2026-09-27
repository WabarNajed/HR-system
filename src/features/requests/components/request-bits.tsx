'use client';

import { useLocale, useTranslations } from 'next-intl';
import { DynamicIcon } from '@/components/shared/icon-picker';
import { SlaBadge } from '@/components/shared/sla-badge';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { daysUntilDue, requestSla } from '../constants';
import { subtypeLabel } from '../labels';
import type { RequestListRow } from '../types';

/** Tinted square with the request type's icon (color from the type, primary by default). */
export function TypeIcon({ icon, color, size = 'md', className }: { icon: string | null | undefined; color: string | null | undefined; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const c = color || 'var(--primary)';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md',
        size === 'sm' && 'size-7 [&_svg]:size-3.5',
        size === 'md' && 'size-8 [&_svg]:size-4',
        size === 'lg' && 'size-11 rounded-lg [&_svg]:size-5',
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${c} 13%, var(--card))`, color: `color-mix(in oklab, ${c} 85%, var(--foreground))` }}
    >
      <DynamicIcon name={icon ?? undefined} strokeWidth={1.9} />
    </span>
  );
}

/** Type icon + name (+ subtype) — the "Type" column cell. */
export function TypeCell({ row, showSubtype = true, className }: { row: Pick<RequestListRow, 'subtype' | 'type' | 'title'>; showSubtype?: boolean; className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('requests');
  const name = row.type ? localized(row.type, 'name', locale) : t('unknownType');
  const sub = showSubtype ? subtypeLabel(row, locale) : null;
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <TypeIcon icon={row.type?.icon} color={row.type?.color} size="sm" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        {sub ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}

/** SLA badge for a request row (state derived from due_at and status). */
export function RequestSlaBadge({
  row,
  size = 'sm',
  compact = false,
}: {
  row: Pick<RequestListRow, 'status' | 'due_at' | 'completed_at' | 'cancelled_at' | 'updated_at'>;
  size?: 'sm' | 'md';
  /** State only (days remaining in the tooltip) for dense tables. */
  compact?: boolean;
}) {
  const fmt = useDateFormat();
  const state = requestSla(row);
  if (!state) return <span className="text-meta text-faint-foreground">—</span>;
  const open = !['completed', 'rejected'].includes(row.status);
  return (
    <SlaBadge
      state={state}
      size={size}
      daysRemaining={open && !compact ? daysUntilDue(row.due_at) : null}
      dueLabel={row.due_at ? fmt.dateTime(row.due_at) : undefined}
    />
  );
}

/** Current workflow step label (step name, else the step type). */
export function StepLabel({ row, className }: { row: Pick<RequestListRow, 'status' | 'current_step_type' | 'step' | 'approver_name'>; className?: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('enums.stepType');
  const tr = useTranslations('requests.step');
  if (row.status === 'draft') return <span className="text-meta text-faint-foreground">{tr('notSubmitted')}</span>;
  if (row.status === 'returned') return <span className="text-meta text-muted-foreground">{tr('withRequester')}</span>;
  if (row.status === 'approved' || row.status === 'in_progress') return <span className="text-meta text-muted-foreground">{tr('fulfilment')}</span>;
  if (!row.current_step_type) return <span className="text-meta text-faint-foreground">—</span>;
  const name = row.step ? localized({ name_ar: row.step.name_ar, name_en: row.step.name_en }, 'name', locale) : '';
  const typeLabel = t.has(row.current_step_type as never) ? t(row.current_step_type as never) : row.current_step_type;
  return (
    <div className={cn('min-w-0 leading-tight', className)}>
      <div className="truncate text-sm text-foreground">{name || typeLabel}</div>
      {row.approver_name ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.approver_name}</div> : null}
    </div>
  );
}

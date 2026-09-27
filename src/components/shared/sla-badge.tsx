import { AlarmClockIcon, CheckCircle2Icon, ClockIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type SlaState = 'on_track' | 'due_soon' | 'overdue';

export type SlaBadgeProps = {
  state: SlaState | null | undefined;
  /** Business days remaining (negative = overdue). Rendered as "3 days left" / "2 days overdue". */
  daysRemaining?: number | null;
  /** Pre-formatted due date for the tooltip. */
  dueLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
};

const variantFor = { on_track: 'success', due_soon: 'warning', overdue: 'danger' } as const;
const iconFor = { on_track: CheckCircle2Icon, due_soon: ClockIcon, overdue: AlarmClockIcon } as const;

/** SLA indicator: On track / Due soon / Overdue (+ optional days remaining). */
export function SlaBadge({ state, daysRemaining, dueLabel, size = 'md', className }: SlaBadgeProps) {
  const t = useTranslations('statuses.sla');
  const tc = useTranslations('common');
  if (!state) {
    return <span className="text-meta text-faint-foreground">{tc('sla.noSla')}</span>;
  }
  const Icon = iconFor[state];
  const detail =
    typeof daysRemaining === 'number'
      ? daysRemaining < 0
        ? tc('time.daysOverdue', { count: Math.abs(daysRemaining) })
        : tc('time.daysLeft', { count: daysRemaining })
      : null;
  const badge = (
    <Badge variant={variantFor[state]} size={size} className={cn('gap-1', className)}>
      <Icon className="size-3.5" aria-hidden />
      {t(state)}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </Badge>
  );
  return dueLabel ? <SimpleTooltip content={tc('sla.dueOn', { date: dueLabel })}>{badge}</SimpleTooltip> : badge;
}

import { useTranslations } from 'next-intl';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Status domains with translations under `statuses.<domain>.<status>`. */
export type StatusDomain =
  | 'request'
  | 'profile'
  | 'employment'
  | 'document'
  | 'certificate'
  | 'import'
  | 'importRow'
  | 'email'
  | 'approval'
  | 'sla'
  | 'leaveBalanceEffect'
  | 'insurance'
  | 'template'
  | 'record';

const TONES: Record<StatusDomain, Record<string, BadgeVariant>> = {
  request: {
    draft: 'neutral',
    submitted: 'info',
    pending_manager_approval: 'warning',
    pending_hr_review: 'warning',
    returned: 'secondary',
    approved: 'success',
    rejected: 'danger',
    in_progress: 'default',
    completed: 'success',
    cancelled: 'neutral',
  },
  profile: { pending: 'warning', info_requested: 'secondary', active: 'success', rejected: 'danger', disabled: 'neutral' },
  employment: {
    active: 'success',
    probation: 'info',
    on_leave: 'secondary',
    suspended: 'warning',
    resigned: 'neutral',
    terminated: 'danger',
  },
  document: { valid: 'success', expired: 'danger', pending_review: 'warning', rejected: 'danger', archived: 'neutral' },
  certificate: { valid: 'success', revoked: 'danger' },
  import: { uploaded: 'neutral', validated: 'info', importing: 'default', completed: 'success', failed: 'danger', cancelled: 'neutral' },
  importRow: { valid: 'success', warning: 'warning', error: 'danger', imported: 'success', skipped: 'neutral' },
  email: { sent: 'success', failed: 'danger', skipped: 'neutral' },
  approval: { pending: 'warning', approved: 'success', rejected: 'danger', returned: 'secondary', reassigned: 'info', skipped: 'neutral' },
  sla: { on_track: 'success', due_soon: 'warning', overdue: 'danger' },
  leaveBalanceEffect: { none: 'neutral', pending: 'warning', used: 'info', reversed: 'neutral' },
  insurance: { active: 'success', expired: 'danger', pending: 'warning', cancelled: 'neutral' },
  template: { draft: 'neutral', published: 'success', inactive: 'neutral' },
  record: { active: 'success', inactive: 'neutral', archived: 'neutral' },
};

/** Badge tone for a status (neutral when unknown). Reuse for charts/legends to stay consistent. */
export function statusTone(domain: StatusDomain, status: string | null | undefined): BadgeVariant {
  if (!status) return 'neutral';
  return TONES[domain][status] ?? 'neutral';
}

export type StatusBadgeProps = {
  domain: StatusDomain;
  status: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  /** Show the leading dot (default true). */
  dot?: boolean;
  className?: string;
};

/** Translated, color-coded status pill: `<StatusBadge domain="request" status={row.status} />`. */
export function StatusBadge({ domain, status, size = 'md', dot = true, className }: StatusBadgeProps) {
  const t = useTranslations('statuses');
  if (!status) return null;
  const key = `${domain}.${status}`;
  // Dynamic key: `has` guards unknown DB values (rendered raw rather than crashing).
  const tt = t as unknown as { has: (k: string) => boolean; (k: string): string };
  const label = tt.has(key) ? tt(key) : status;
  return (
    <Badge variant={statusTone(domain, status)} size={size} dot={dot} className={cn(className)}>
      {label}
    </Badge>
  );
}

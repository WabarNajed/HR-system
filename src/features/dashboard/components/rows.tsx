import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { DynamicIcon } from '@/components/shared/icon-picker';
import { SlaBadge } from '@/components/shared/sla-badge';
import { statusTone } from '@/components/shared/status-badge';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { daysBetween, formatRelative, slaStatus } from '@/lib/dates';
import { intlLocale } from '@/lib/i18n/config';
import { formatDate, formatDateRange } from '@/lib/i18n/date-format';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { fileRouteUrl } from '@/lib/storage';
import type { DashboardLeave, DashboardRequest } from '../types';
import { RowIcon, WidgetRow } from './widget-parts';

/** Soft tint from a stored hex color (request/leave type), falling back to the primary tint. */
export function tintStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color || !/^#[0-9a-f]{3,8}$/i.test(color)) return undefined;
  return {
    backgroundColor: `color-mix(in oklab, ${color} 14%, var(--card))`,
    color: `color-mix(in oklab, ${color} 80%, var(--foreground))`,
  };
}

export function avatarUrl(path: string | null | undefined): string | null {
  return path ? fileRouteUrl('employee-documents', path) : null;
}

const DOT: Record<BadgeVariant, string> = {
  default: 'bg-primary',
  solid: 'bg-primary',
  secondary: 'bg-secondary',
  outline: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-border-strong',
};

/** Compact status (colored dot + label) for dense rows — never squeezes the row title. */
export function StatusText({ status }: { status: string }) {
  const t = useTranslations('statuses.request');
  const tt = t as unknown as { has: (k: string) => boolean; (k: string): string };
  return (
    <span className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground/80">
      <span className={`size-1.5 shrink-0 rounded-full ${DOT[statusTone('request', status)]}`} aria-hidden />
      {tt.has(status) ? tt(status) : status}
    </span>
  );
}

type RequestRowProps = {
  request: DashboardRequest;
  /** Show the employee's name (queues, team lists). */
  showEmployee?: boolean;
  /** `status` (default) or the SLA state (queues). */
  trailing?: 'status' | 'sla';
};

export function RequestRow({ request: r, showEmployee = false, trailing = 'status' }: RequestRowProps) {
  const locale = useLocale();
  const t = useTranslations('dashboard.rows');
  const typeName = r.request_type ? localized(r.request_type, 'name', locale) : '';
  const employee = r.employee ? employeeDisplayName(r.employee, locale) : '';
  const when = r.submitted_at ?? r.updated_at ?? r.created_at;
  const sla = trailing === 'sla' ? slaStatus(r.due_at, r.status) : null;
  const tint = tintStyle(r.request_type?.color);

  return (
    <WidgetRow href={`/requests/${r.id}`}>
      <RowIcon className={tint ? undefined : 'bg-primary-soft text-primary'} style={tint}>
        <DynamicIcon name={r.request_type?.icon ?? undefined} />
      </RowIcon>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-foreground">{typeName || r.title || t('untitledRequest')}</span>
          <span className="numeric shrink-0 text-xs text-faint-foreground" dir="ltr">
            {r.request_number ?? t('draft')}
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {trailing === 'status' ? <StatusText status={r.status} /> : null}
          <span className="min-w-0 truncate">
            {showEmployee && employee ? (
              <>
                <span className="text-foreground/80">{employee}</span>
                <span aria-hidden> · </span>
              </>
            ) : null}
            {formatRelative(when, locale)}
          </span>
        </div>
      </div>
      {trailing === 'sla' ? (
        <div className="shrink-0">
          {sla ? <SlaBadge state={sla} size="sm" dueLabel={formatDate(r.due_at, locale)} /> : <StatusText status={r.status} />}
        </div>
      ) : null}
    </WidgetRow>
  );
}

/** "tomorrow" / "in 12 days" / "in 3 months" until a leave starts (never repeats the absolute date). */
function startsInLabel(start: string, today: string, locale: string): string {
  const days = daysBetween(today, start) ?? 0;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  return days < 60 ? rtf.format(days, 'day') : rtf.format(Math.round(days / 30), 'month');
}

type LeaveRowProps = {
  leave: DashboardLeave;
  today: string;
  showEmployee?: boolean;
};

export function LeaveRow({ leave: l, today, showEmployee = false }: LeaveRowProps) {
  const locale = useLocale();
  const t = useTranslations('dashboard.rows');
  const typeName = l.leave_type ? localized(l.leave_type, 'name', locale) : '';
  const employee = l.employee ? employeeDisplayName(l.employee, locale) : '';
  const pending = !['approved', 'in_progress', 'completed'].includes(l.status);
  const ongoing = l.start_date <= today && l.end_date >= today;
  const tint = tintStyle(l.leave_type?.color);

  return (
    <WidgetRow href={`/requests/${l.request_id}`}>
      {showEmployee && l.employee ? (
        <EmployeeAvatar name={employee} seed={l.employee.id} src={avatarUrl(l.employee.avatar_path)} size="sm" />
      ) : (
        <RowIcon className={tint ? undefined : 'bg-primary-soft text-primary'} style={tint}>
          <DynamicIcon name="calendar-days" />
        </RowIcon>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-foreground">{showEmployee ? employee : typeName}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {showEmployee && typeName ? (
            <>
              {typeName}
              <span aria-hidden> · </span>
            </>
          ) : null}
          <span className="numeric">{formatDateRange(l.start_date, l.end_date, locale)}</span>
          <span aria-hidden> · </span>
          {t('days', { count: l.days })}
        </div>
      </div>
      <div className="shrink-0">
        {pending ? (
          <Badge variant="warning" size="sm" dot>
            {t('awaitingApproval')}
          </Badge>
        ) : ongoing ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info-soft-foreground">
            <span className="size-1.5 rounded-full bg-info" aria-hidden />
            {t('onLeaveNow')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{startsInLabel(l.start_date, today, locale)}</span>
        )}
      </div>
    </WidgetRow>
  );
}

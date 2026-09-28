'use client';

import { AlertTriangleIcon, CalendarCheck2Icon, CalendarRangeIcon, InfoIcon, PaperclipIcon, WalletIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorMessage } from '@/components/ui/form';
import { formatDays } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import { previewLeave, type LeavePreview } from '../actions';
import type { LeaveTypeOption } from '../types';

export type LeaveInsightState = {
  preview: LeavePreview | null;
  /** Reasons the request would certainly be refused (shown and used to block Submit). */
  blocking: ('insufficientBalance' | 'overlappingLeave' | 'leaveMaxDaysExceeded' | 'invalidDateRange')[];
};

/**
 * Live leave summary for the wizard / returned editor: working or calendar days (count_leave_days),
 * the balance now and after the request, and overlap / max-days warnings — the same checks the
 * database applies at submission.
 */
export function LeaveInsight({
  employeeId,
  leaveTypeId,
  start,
  end,
  requestId,
  leaveTypes,
  onChange,
  className,
}: {
  employeeId: string | null;
  leaveTypeId: string | null;
  start: string | null;
  end: string | null;
  requestId?: string | null;
  leaveTypes: LeaveTypeOption[];
  onChange?: (state: LeaveInsightState) => void;
  className?: string;
}) {
  const t = useTranslations('requests.leave');
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const resolveError = useErrorMessage();
  const requestKey = employeeId && leaveTypeId ? `${employeeId}|${leaveTypeId}|${start ?? ''}|${end ?? ''}|${requestId ?? ''}` : null;
  const [result, setResult] = useState<{ key: string; preview: LeavePreview | null; failed: string | null } | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const leaveType = leaveTypes.find((lt) => lt.id === leaveTypeId) ?? null;

  useEffect(() => {
    if (!requestKey || !employeeId || !leaveTypeId) {
      onChangeRef.current?.({ preview: null, blocking: [] });
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const res = await previewLeave({ employeeId, leaveTypeId, start: start || null, end: end || null, requestId: requestId ?? null }).catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok || !res.data) {
        setResult({ key: requestKey, preview: null, failed: res && !res.ok ? res.error : 'errors.generic' });
        onChangeRef.current?.({ preview: null, blocking: [] });
        return;
      }
      setResult({ key: requestKey, preview: res.data, failed: null });
      onChangeRef.current?.({ preview: res.data, blocking: blockingOf(res.data) });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [requestKey, employeeId, leaveTypeId, start, end, requestId]);

  // Keep showing the last result (dimmed) while the next one loads.
  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const preview = result?.preview ?? null;
  const failed = loading ? null : (result?.failed ?? null);

  if (!leaveTypeId) {
    return (
      <div className={cn('flex items-start gap-3 rounded-lg border border-dashed border-border-strong bg-subtle p-4', className)}>
        <CalendarRangeIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-meta text-muted-foreground">{t('pickType')}</p>
      </div>
    );
  }

  const days = preview?.days ?? null;
  const basisLabel = (count: number) => (preview?.basis === 'calendar' ? t('calendarDaysUnit', { count }) : t('workingDaysUnit', { count }));
  const after = preview?.balance && days !== null ? preview.balance.available - days : null;
  const pct = preview?.balance && preview.balance.entitlement > 0 ? Math.min(100, Math.max(0, ((preview.balance.used + preview.balance.pending) / preview.balance.entitlement) * 100)) : 0;

  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card', className)} aria-live="polite">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 items-center justify-center rounded-md"
          style={{ backgroundColor: `color-mix(in oklab, ${leaveType?.color ?? 'var(--primary)'} 14%, var(--card))`, color: leaveType?.color ?? 'var(--primary)' }}
        >
          <CalendarCheck2Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t('title')}</p>
          <p className="truncate text-sm font-semibold text-foreground">{leaveType ? localized(leaveType, 'name', locale) : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('requested')} loading={loading && !preview}>
          {days !== null && start && end ? (
            <>
              <span className="text-xl font-semibold numeric text-foreground">{formatDays(days, locale)}</span>
              <span className="ms-1 text-xs text-muted-foreground">{basisLabel(days)}</span>
            </>
          ) : (
            <span className="text-meta text-muted-foreground">{t('pickDates')}</span>
          )}
        </Metric>
        {preview?.balance ? (
          <Metric label={t('afterRequest')} loading={loading && !preview} tone={after !== null && after < 0 ? 'danger' : undefined}>
            <span className={cn('text-xl font-semibold numeric', after !== null && after < 0 ? 'text-danger' : 'text-foreground')}>
              {after !== null ? formatDays(after, locale) : formatDays(preview.balance.available, locale)}
            </span>
            <span className="ms-1 text-xs text-muted-foreground">{t('daysUnit', { count: Math.abs(after ?? preview.balance.available) })}</span>
          </Metric>
        ) : (
          <Metric label={t('balance')} loading={loading && !preview}>
            <span className="text-meta text-muted-foreground">{preview ? t('noDeduction') : '—'}</span>
          </Metric>
        )}
      </div>

      {preview?.balance ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <WalletIcon className="size-3.5" aria-hidden />
              {t('availableNow', { days: Number(preview.balance.available) })}
            </span>
            <span className="numeric">
              {t('usedOf', { used: formatDays(preview.balance.used + preview.balance.pending, locale), total: formatDays(preview.balance.entitlement, locale) })}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
          {preview.balance.pending > 0 ? <p className="text-xs text-muted-foreground">{t('pendingHold', { days: Number(preview.balance.pending) })}</p> : null}
        </div>
      ) : null}

      {failed ? <Notice tone="danger">{resolveError(failed)}</Notice> : null}
      {preview?.rangeError ? <Notice tone="danger">{resolveError(preview.rangeError)}</Notice> : null}
      {preview && start && end && days === 0 && !preview.rangeError ? <Notice tone="danger">{t('noWorkingDays')}</Notice> : null}
      {after !== null && after < 0 ? (
        <Notice tone="danger">{t('insufficient', { available: formatDays(preview!.balance!.available, locale), requested: formatDays(days ?? 0, locale) })}</Notice>
      ) : null}
      {preview?.maxDays && days !== null && days > preview.maxDays ? (
        <Notice tone="danger">{t('maxDays', { max: Number(preview.maxDays) })}</Notice>
      ) : null}
      {preview?.overlaps.length ? (
        <Notice tone="warning">
          <span>{t('overlap')}</span>
          <span className="mt-1 flex flex-col gap-1">
            {preview.overlaps.map((o) => (
              <Link key={o.requestId} href={`/requests/${o.requestId}`} className="inline-flex flex-wrap items-center gap-1.5 font-medium underline-offset-4 hover:underline">
                <bdi className="numeric">{o.number ?? '—'}</bdi>
                <span className="numeric font-normal">{fmt.range(o.start, o.end)}</span>
                <StatusBadge domain="request" status={o.status} size="sm" />
              </Link>
            ))}
          </span>
        </Notice>
      ) : null}
      {preview?.requiresAttachment ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <PaperclipIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('attachmentRequired')}
        </p>
      ) : null}
      {preview && !preview.deducts ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('noDeductionHint')}
        </p>
      ) : null}
    </div>
  );
}

function blockingOf(p: LeavePreview): LeaveInsightState['blocking'] {
  const out: LeaveInsightState['blocking'] = [];
  if (p.rangeError || p.days === 0) out.push('invalidDateRange');
  if (p.balance && p.days !== null && p.balance.available - p.days < 0) out.push('insufficientBalance');
  if (p.maxDays && p.days !== null && p.days > p.maxDays) out.push('leaveMaxDaysExceeded');
  if (p.overlaps.length) out.push('overlappingLeave');
  return out;
}

function Metric({ label, loading, tone, children }: { label: string; loading?: boolean; tone?: 'danger'; children: ReactNode }) {
  return (
    <div className={cn('rounded-md border border-border bg-subtle px-3 py-2', tone === 'danger' && 'border-danger/30 bg-danger-soft/40')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex min-h-7 items-baseline">{loading ? <Skeleton className="h-6 w-14" /> : children}</div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'danger' | 'warning'; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-meta',
        tone === 'danger' ? 'border-danger/25 bg-danger-soft text-danger-soft-foreground' : 'border-warning/25 bg-warning-soft text-warning-soft-foreground',
      )}
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
}

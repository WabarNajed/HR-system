'use client';

import { ArrowLeftIcon, ArrowRightIcon, CalendarPlus2Icon, HistoryIcon, MinusIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { formatDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import { adjustLeaveBalance, fetchBalanceHistory, initializeLeaveBalances, setLeaveBalance } from '../actions';
import type { BalanceHistory, BalanceRow } from '../types';
import { LeaveTypeDot } from './leave-type-dot';

/** Target of a balance action (row of the HR table or a card of the employee tab). */
export type BalanceTarget = BalanceRow & {
  employeeName?: { name_ar: string | null; name_en: string | null } | null;
};

function useDays() {
  const locale = useLocale() as Locale;
  return (v: number) => formatDays(v, locale);
}

/** `18 → 20` with a direction-aware arrow. */
function OldNew({ from, to, className }: { from: string; to: string; className?: string }) {
  const locale = useLocale();
  const Arrow = locale === 'ar' ? ArrowLeftIcon : ArrowRightIcon;
  return (
    <span className={cn('inline-flex items-center gap-2 numeric', className)}>
      <span className="text-muted-foreground line-through decoration-muted-foreground/40">{from}</span>
      <Arrow className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-semibold text-foreground">{to}</span>
    </span>
  );
}

function TargetLine({ target }: { target: BalanceTarget }) {
  const locale = useLocale() as Locale;
  const name = target.employeeName ? employeeDisplayName(target.employeeName, locale) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {name ? <span className="font-medium text-foreground">{name}</span> : null}
      {name ? <span aria-hidden className="text-faint-foreground">·</span> : null}
      <span className="inline-flex items-center gap-1.5">
        <LeaveTypeDot color={target.leave_type.color} />
        {localized(target.leave_type, 'name', locale)}
      </span>
      <span aria-hidden className="text-faint-foreground">·</span>
      <span className="numeric">{target.year}</span>
    </span>
  );
}

function StatStrip({ items }: { items: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
      {items.map((it) => (
        <div key={it.label} className="bg-subtle px-3 py-2">
          <dt className="truncate text-xs text-muted-foreground">{it.label}</dt>
          <dd className={cn('mt-0.5 text-sm numeric', it.strong ? 'font-semibold text-foreground' : 'text-foreground')}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ─── Adjust ─────────────────────────────────────────────────────────────── */

export function AdjustBalanceDialog({
  target,
  open,
  onOpenChange,
}: {
  target: BalanceTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('leave');
  const tc = useTranslations('common');
  const resolveError = useErrorMessage();
  const d = useDays();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const amountId = useId();
  const reasonId = useId();

  // Reset the form whenever a new target opens (derived-state pattern).
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = open && target ? target.id : null;
  if (key !== prevKey) {
    setPrevKey(key);
    setDirection('add');
    setAmount('');
    setReason('');
    setErrors({});
  }

  if (!target) return null;
  const parsed = Number(amount.replace(',', '.'));
  const valid = amount.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
  const signed = valid ? (direction === 'add' ? parsed : -parsed) : 0;
  const newRemaining = target.remaining + signed;

  const submit = () => {
    const next: typeof errors = {};
    if (!valid) next.amount = 'leave.adjust.amountNonZero';
    else if (Math.round(parsed * 2) !== parsed * 2) next.amount = 'leave.adjust.amountStep';
    else if (parsed > 365) next.amount = 'validation.max|{"max":365}';
    if (reason.trim().length < 3) next.reason = 'leave.adjust.reasonRequired';
    setErrors(next);
    if (Object.keys(next).length) return;
    startTransition(async () => {
      const result = await adjustLeaveBalance({
        employeeId: target.employee_id,
        leaveTypeId: target.leave_type_id,
        year: target.year,
        amount: signed,
        reason: reason.trim(),
      });
      if (result.ok) {
        toast.success(t('adjust.toast'), {
          description: t('adjust.toastDescription', { from: d(target.remaining), to: d(newRemaining) }),
        });
        onOpenChange(false);
        router.refresh();
      } else {
        const fe = result.fieldErrors ?? {};
        setErrors({ amount: fe.amount, reason: fe.reason });
        toast.error(resolveError(result.error));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('adjust.title')}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <TargetLine target={target} />
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-4">
          <StatStrip
            items={[
              { label: t('fields.remaining'), value: d(target.remaining), strong: true },
              { label: t('fields.pending'), value: d(target.pending) },
              { label: t('fields.available'), value: d(target.available) },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <div className="grid gap-1.5">
              <Label>{t('adjust.direction')}</Label>
              <SegmentedTabs
                aria-label={t('adjust.direction')}
                value={direction}
                onValueChange={(v) => setDirection(v as 'add' | 'deduct')}
                items={[
                  { value: 'add', label: t('adjust.add'), icon: <PlusIcon /> },
                  { value: 'deduct', label: t('adjust.deduct'), icon: <MinusIcon /> },
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={amountId}>
                {t('adjust.amount')}
                <span aria-hidden className="text-danger">
                  *
                </span>
              </Label>
              <Input
                id={amountId}
                inputMode="decimal"
                type="number"
                min={0.5}
                step={0.5}
                max={365}
                dir="ltr"
                value={amount}
                onChange={(e) => {
                  // A typed minus sign means "deduct": flip the direction and keep the magnitude.
                  const raw = e.target.value;
                  if (raw.trim().startsWith('-')) {
                    setDirection('deduct');
                    setAmount(raw.trim().slice(1));
                  } else {
                    setAmount(raw);
                  }
                }}
                aria-invalid={Boolean(errors.amount) || undefined}
                placeholder="0"
                className="numeric"
                autoFocus
              />
              {errors.amount ? <p className="text-xs font-medium text-danger">{resolveError(errors.amount)}</p> : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={reasonId}>
              {tc('reason')}
              <span aria-hidden className="text-danger">
                *
              </span>
            </Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('adjust.reasonPlaceholder')}
              aria-invalid={Boolean(errors.reason) || undefined}
            />
            {errors.reason ? (
              <p className="text-xs font-medium text-danger">{resolveError(errors.reason)}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('adjust.reasonHint')}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border-strong px-3 py-2.5">
            <span className="text-meta text-muted-foreground">{t('adjust.preview')}</span>
            <OldNew from={d(target.remaining)} to={d(newRemaining)} className={cn(newRemaining < 0 && '[&>span:last-child]:text-danger')} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} loading={pending}>
            {t('adjust.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit opening balance / entitlement ─────────────────────────────────── */

export function EditBalanceDialog({
  target,
  open,
  onOpenChange,
}: {
  target: BalanceTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('leave');
  const tc = useTranslations('common');
  const resolveError = useErrorMessage();
  const d = useDays();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState('0');
  const [entitlement, setEntitlement] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const openingId = useId();
  const entitlementId = useId();

  const [prevKey, setPrevKey] = useState<string | null>(null);
  const key = open && target ? target.id : null;
  if (key !== prevKey) {
    setPrevKey(key);
    setOpening(target ? String(target.opening_balance) : '0');
    setEntitlement(target ? String(target.entitlement) : '0');
    setError(null);
  }

  if (!target) return null;
  const o = Number(opening);
  const e = Number(entitlement);
  const valid = opening.trim() !== '' && entitlement.trim() !== '' && Number.isFinite(o) && Number.isFinite(e) && e >= 0 && Math.abs(o) <= 365 && e <= 365;
  const newRemaining = valid ? o + e + target.adjustment - target.used : target.remaining;

  const submit = () => {
    if (!valid) {
      setError('errors.validation');
      return;
    }
    startTransition(async () => {
      const result = await setLeaveBalance({
        employeeId: target.employee_id,
        leaveTypeId: target.leave_type_id,
        year: target.year,
        openingBalance: o,
        entitlement: e,
      });
      if (result.ok) {
        toast.success(t('editBalance.toast'));
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.error);
        toast.error(resolveError(result.error));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('editBalance.title')}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <TargetLine target={target} />
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={openingId}>{t('fields.opening')}</Label>
              <Input id={openingId} type="number" step={0.5} dir="ltr" className="numeric" value={opening} onChange={(ev) => setOpening(ev.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={entitlementId}>{t('fields.entitlement')}</Label>
              <Input id={entitlementId} type="number" min={0} step={0.5} dir="ltr" className="numeric" value={entitlement} onChange={(ev) => setEntitlement(ev.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('editBalance.hint')}</p>
          {error ? <p className="text-xs font-medium text-danger">{resolveError(error)}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border-strong px-3 py-2.5">
            <span className="text-meta text-muted-foreground">{t('fields.remaining')}</span>
            <OldNew from={d(target.remaining)} to={d(newRemaining)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} loading={pending} disabled={!valid}>
            {tc('saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── History ────────────────────────────────────────────────────────────── */

export function BalanceHistorySheet({
  target,
  open,
  onOpenChange,
}: {
  target: BalanceTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('leave');
  const d = useDays();
  const fmt = useDateFormat();
  const resolveError = useErrorMessage();
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data?: BalanceHistory; error?: string }>({ status: 'idle' });

  const load = useCallback(async (balanceId: string) => {
    setState({ status: 'loading' });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
    const result = await Promise.race([fetchBalanceHistory({ balanceId }), timeout]);
    if (!result) setState({ status: 'error', error: 'errors.timeout' });
    else if (result.ok) setState({ status: 'ready', data: result.data });
    else setState({ status: 'error', error: result.error });
  }, []);

  const balanceId = open && target ? target.id : null;
  useEffect(() => {
    if (!balanceId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open; the loader sets its own states.
    void load(balanceId);
  }, [balanceId, load]);

  // Prefer the figures fetched with the history (fresh even if the list behind is still refreshing).
  const figures = state.status === 'ready' && state.data ? state.data.balance : target;

  let body: ReactNode;
  if (!target || state.status === 'loading' || state.status === 'idle') {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  } else if (state.status === 'error') {
    body = <ErrorState description={resolveError(state.error)} onRetry={() => load(target.id)} />;
  } else {
    const { adjustments, movements } = state.data!;
    body = (
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold text-foreground">{t('history.adjustments')}</h3>
          {adjustments.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-meta text-muted-foreground">{t('history.noAdjustments')}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
              {adjustments.map((a) => (
                <li key={a.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={a.amount > 0 ? 'success' : 'danger'} className="numeric">
                      <bdi dir="ltr">{a.amount > 0 ? `+${d(a.amount)}` : `−${d(Math.abs(a.amount))}`}</bdi>
                    </Badge>
                    {a.old_remaining !== null && a.new_remaining !== null ? (
                      <OldNew from={d(a.old_remaining)} to={d(a.new_remaining)} className="text-meta" />
                    ) : null}
                  </div>
                  <p className="text-sm break-words text-foreground">{a.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('history.by', { name: a.changed_by_name ?? '—', date: fmt.dateTime(a.changed_at) })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold text-foreground">{t('history.requests')}</h3>
          {movements.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-meta text-muted-foreground">{t('history.noRequests')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {movements.map((m) => (
                <li key={m.request_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/requests/${m.request_id}`} className="text-sm font-medium text-foreground hover:text-primary hover:underline">
                      <span className="numeric">{fmt.range(m.start_date, m.end_date)}</span>
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {m.request_number ? <bdi className="font-mono">{m.request_number}</bdi> : null}
                      <StatusBadge domain="request" status={m.status} size="sm" dot={false} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold numeric">{d(m.days)}</span>
                    <StatusBadge domain="leaveBalanceEffect" status={m.balance_effect} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('history.title')}
          </SheetTitle>
          {target ? (
            <SheetDescription asChild>
              <div>
                <TargetLine target={target} />
              </div>
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          {figures ? (
            <StatStrip
              items={[
                { label: t('fields.opening'), value: d(figures.opening_balance) },
                { label: t('fields.entitlement'), value: d(figures.entitlement) },
                { label: t('fields.adjustment'), value: d(figures.adjustment) },
                { label: t('fields.used'), value: d(figures.used) },
                { label: t('fields.pending'), value: d(figures.pending) },
                { label: t('fields.remaining'), value: d(figures.remaining), strong: true },
              ]}
            />
          ) : null}
          {body}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Initialize ─────────────────────────────────────────────────────────── */

export function InitializeBalancesButton({
  year,
  employeeId,
  variant = 'outline',
  size = 'sm',
  label,
}: {
  year: number;
  employeeId?: string;
  variant?: 'outline' | 'default' | 'soft';
  size?: 'sm' | 'md';
  label?: string;
}) {
  const t = useTranslations('leave.initialize');
  const resolveError = useErrorMessage();
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant={variant} size={size}>
          <SparklesIcon />
          {label ?? t('button', { year })}
        </Button>
      }
      title={employeeId ? t('titleEmployee', { year }) : t('title', { year })}
      description={employeeId ? t('descriptionEmployee') : t('description')}
      confirmLabel={t('confirm')}
      onConfirm={async () => {
        const result = await initializeLeaveBalances({ year, employeeId: employeeId ?? null });
        if (!result.ok) {
          toast.error(resolveError(result.error));
          return false;
        }
        const created = result.data?.created ?? 0;
        if (created > 0) toast.success(t('toastCreated', { count: created, year }));
        else toast.info(t('toastNone', { year }));
        router.refresh();
      }}
    >
      <ul className="flex flex-col gap-1.5 text-meta text-muted-foreground">
        <li className="flex gap-2">
          <CalendarPlus2Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t('pointEntitlement')}
        </li>
        <li className="flex gap-2">
          <CalendarPlus2Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t('pointExisting')}
        </li>
      </ul>
    </ConfirmDialog>
  );
}

/** Compact empty state used when an employee has no balances for the year. */
export function NoBalancesState({ year, action, compact }: { year: number; action?: ReactNode; compact?: boolean }) {
  const t = useTranslations('leave.balances');
  return (
    <EmptyState
      icon={HistoryIcon}
      variant={compact ? 'inline' : 'card'}
      title={t('noneTitle', { year })}
      description={t('noneDescription')}
      action={action}
    />
  );
}

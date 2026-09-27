'use client';

import { HistoryIcon, MoreHorizontalIcon, PencilLineIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { formatDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BalanceRow } from '../types';
import { AdjustBalanceDialog, BalanceHistorySheet, EditBalanceDialog, type BalanceTarget } from './balance-dialogs';
import { LeaveTypeDot } from './leave-type-dot';

/** Stacked bar: used · pending · available (of opening + entitlement + adjustment). */
export function BalanceBar({ row, className }: { row: BalanceRow; className?: string }) {
  const t = useTranslations('leave.fields');
  const total = row.opening_balance + row.entitlement + row.adjustment;
  if (total <= 0) return <div className={cn('h-2 rounded-full bg-muted', className)} />;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  return (
    <div
      className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={`${t('used')} ${row.used} · ${t('pending')} ${row.pending} · ${t('available')} ${row.available}`}
    >
      <span className="h-full" style={{ width: pct(row.used), backgroundColor: row.leave_type.color }} />
      <span
        className="h-full"
        style={{
          width: pct(row.pending),
          backgroundImage: `repeating-linear-gradient(135deg, ${row.leave_type.color} 0 3px, transparent 3px 6px)`,
          opacity: 0.75,
        }}
      />
    </div>
  );
}

function BalanceCard({
  row,
  canAdjust,
  onAction,
}: {
  row: BalanceRow;
  canAdjust: boolean;
  onAction: (kind: 'adjust' | 'edit' | 'history', row: BalanceRow) => void;
}) {
  const t = useTranslations('leave');
  const locale = useLocale() as Locale;
  const d = (v: number) => formatDays(v, locale);
  const total = row.opening_balance + row.entitlement + row.adjustment;
  const low = total > 0 && row.available / total < 0.2;

  const stats: { key: string; label: string; value: number; tone?: string }[] = [
    { key: 'opening', label: t('fields.opening'), value: row.opening_balance },
    { key: 'entitlement', label: t('fields.entitlement'), value: row.entitlement },
    { key: 'adjustment', label: t('fields.adjustment'), value: row.adjustment },
    { key: 'used', label: t('fields.used'), value: row.used },
    { key: 'pending', label: t('fields.pending'), value: row.pending, tone: row.pending > 0 ? 'text-warning' : undefined },
    { key: 'remaining', label: t('fields.remaining'), value: row.remaining },
  ];

  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4 shadow-card" data-slot="balance-card">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-card-title text-foreground">
          <LeaveTypeDot color={row.leave_type.color} className="size-3" />
          <span className="truncate">{localized(row.leave_type, 'name', locale)}</span>
        </h3>
        {canAdjust ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('balances.actions')} className="-me-1.5">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => onAction('adjust', row)}>
                <SlidersHorizontalIcon />
                {t('adjust.title')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('edit', row)}>
                <PencilLineIcon />
                {t('editBalance.title')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('history', row)}>
                <HistoryIcon />
                {t('history.title')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SimpleTooltip content={t('history.title')}>
            <Button variant="ghost" size="icon-sm" aria-label={t('history.title')} className="-me-1.5" onClick={() => onAction('history', row)}>
              <HistoryIcon />
            </Button>
          </SimpleTooltip>
        )}
      </header>

      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn('text-[1.75rem] leading-9 font-semibold tracking-tight numeric', low ? 'text-warning' : 'text-foreground')}>{d(row.available)}</span>
        <span className="text-meta text-muted-foreground">{t('balances.availableOf', { total: d(total) })}</span>
      </div>
      <BalanceBar row={row} className="mt-2.5" />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: row.leave_type.color }} />
          {t('fields.used')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full opacity-75"
            style={{ backgroundImage: `repeating-linear-gradient(135deg, ${row.leave_type.color} 0 2px, transparent 2px 4px)` }}
          />
          {t('fields.pending')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-muted ring-1 ring-border" />
          {t('fields.available')}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3 border-t border-border pt-3.5">
        {stats.map((s) => (
          <div key={s.key} className="min-w-0">
            <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
            <dd className={cn('mt-0.5 text-sm font-medium numeric', s.tone ?? 'text-foreground', s.key === 'remaining' && 'font-semibold')}>
              <bdi dir="ltr">
                {s.key === 'adjustment' && s.value > 0 ? '+' : ''}
                {d(s.value)}
              </bdi>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/**
 * Balance cards for one employee (own balances on /leave, the employee profile Leave tab).
 * `canAdjust` (HR with org `leave.edit`) adds Adjust / Edit actions; history is always available.
 */
export function BalanceCards({
  rows,
  canAdjust = false,
  employeeName,
  className,
}: {
  rows: BalanceRow[];
  canAdjust?: boolean;
  employeeName?: { name_ar: string | null; name_en: string | null } | null;
  className?: string;
}) {
  const [target, setTarget] = useState<BalanceTarget | null>(null);
  const [dialog, setDialog] = useState<'adjust' | 'edit' | 'history' | null>(null);
  const onAction = (kind: 'adjust' | 'edit' | 'history', row: BalanceRow) => {
    setTarget({ ...row, employeeName: employeeName ?? null });
    setDialog(kind);
  };
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };
  return (
    <>
      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>
        {rows.map((row) => (
          <BalanceCard key={row.id} row={row} canAdjust={canAdjust} onAction={onAction} />
        ))}
      </div>
      <AdjustBalanceDialog target={target} open={dialog === 'adjust'} onOpenChange={close} />
      <EditBalanceDialog target={target} open={dialog === 'edit'} onOpenChange={close} />
      <BalanceHistorySheet target={target} open={dialog === 'history'} onOpenChange={close} />
    </>
  );
}

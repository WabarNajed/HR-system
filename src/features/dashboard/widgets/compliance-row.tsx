import { FileSignatureIcon, HeartPulseIcon, IdCardIcon, PlaneIcon, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WidgetError } from '../components/widget-parts';
import { getDashboardStats } from '../queries';
import type { ExpiryCounts } from '../types';

const KINDS: { key: 'iqama' | 'passport' | 'contract' | 'insurance'; icon: LucideIcon }[] = [
  { key: 'iqama', icon: IdCardIcon },
  { key: 'passport', icon: PlaneIcon },
  { key: 'contract', icon: FileSignatureIcon },
  { key: 'insurance', icon: HeartPulseIcon },
];

function sum30(c: ExpiryCounts) {
  return c.within7 + c.within14 + c.within30;
}
function sum90(c: ExpiryCounts) {
  return sum30(c) + c.within60 + c.within90;
}

/**
 * Compliance row: for Iqama, passport, contract and medical insurance — expired, expiring within
 * 30 days and within 90 days (cumulative), each linking to the documents expiry view.
 */
export async function ComplianceRow() {
  const [stats, t, locale] = await Promise.all([getDashboardStats(), getTranslations('dashboard.widgets.compliance'), getLocale()]);
  if (!stats.ok) return <WidgetError className="rounded-lg border border-border bg-card" />;
  const expiring = stats.data.hr?.expiring;
  if (!expiring) return null;
  const n = (v: number) => formatInteger(v, locale);

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      {KINDS.map(({ key, icon: Icon }) => {
        const c = expiring[key];
        const expired = c?.expired ?? 0;
        const d30 = c ? sum30(c) : 0;
        const d90 = c ? sum90(c) : 0;
        const clear = expired === 0 && d90 === 0;
        const base = `/documents?tab=expiry&kind=${key}`;
        const cells = [
          { label: t('expired'), value: expired, href: `${base}&window=expired`, tone: expired > 0 ? 'text-danger' : 'text-foreground' },
          { label: t('within30'), value: d30, href: `${base}&window=30`, tone: d30 > 0 ? 'text-warning' : 'text-foreground' },
          { label: t('within90'), value: d90, href: `${base}&window=90`, tone: 'text-foreground' },
        ];
        return (
          <section key={key} className="flex min-w-0 flex-col rounded-lg border border-border bg-card shadow-card" aria-label={t(`kinds.${key}`)}>
            <div className="flex items-center gap-2 px-3 pt-3 pb-2 sm:gap-2.5 sm:px-4 sm:pt-3.5">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md',
                  expired > 0 ? 'bg-danger-soft text-danger' : d30 > 0 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success',
                )}
              >
                <Icon className="size-4" strokeWidth={1.9} aria-hidden />
              </span>
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{t(`kinds.${key}`)}</h3>
              {clear ? <span className="hidden text-xs font-medium text-success sm:inline">{t('allClear')}</span> : null}
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
              {cells.map((cell) => (
                <Link
                  key={cell.label}
                  href={cell.href}
                  className="group/cell flex min-w-0 flex-col px-2 py-2.5 outline-none sm:px-3 transition-colors hover:bg-accent/60 focus-visible:bg-accent"
                >
                  <span className={cn('numeric text-lg leading-6 font-semibold', cell.tone)}>{n(cell.value)}</span>
                  <span className="truncate text-[0.6875rem] text-muted-foreground group-hover/cell:text-foreground">{cell.label}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

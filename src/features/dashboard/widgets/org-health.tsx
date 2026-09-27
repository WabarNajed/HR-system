import { AlertTriangleIcon, CheckCircle2Icon, ChevronRightIcon, HeartPulseIcon, WandSparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Widget, WidgetError } from '../components/widget-parts';
import { getOrgHealth } from '../queries';

/**
 * Organization health: configuration checklist computed from live data (org profile, branding,
 * master data, workforce, leave balances, holidays, workflows, HR admin, e-mail delivery) with a
 * completion meter and links to fix each issue; setup wizard shortcut.
 */
export async function OrgHealthWidget({ year, canSetup }: { year: number; canSetup: boolean }) {
  const [res, t, locale] = await Promise.all([getOrgHealth(year), getTranslations('dashboard.widgets.orgHealth'), getLocale()]);
  if (!res.ok) {
    return (
      <Widget title={t('title')} icon={HeartPulseIcon}>
        <WidgetError />
      </Widget>
    );
  }
  const { checks, setupCompleted } = res.data;
  const passed = checks.filter((c) => c.ok).length;
  const pct = Math.round((passed / checks.length) * 100);
  // Issues first, then passed checks.
  const ordered = [...checks.filter((c) => !c.ok), ...checks.filter((c) => c.ok)];

  return (
    <Widget
      title={t('title')}
      icon={HeartPulseIcon}
      actions={
        canSetup ? (
          <Button asChild size="sm" variant={setupCompleted ? 'ghost' : 'soft'} className="-me-1 h-7">
            <Link href="/setup">
              <WandSparklesIcon />
              {t('openSetup')}
            </Link>
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex items-baseline gap-2">
          <span className="numeric text-2xl leading-8 font-semibold text-foreground">{formatInteger(pct, locale)}%</span>
          <span className="text-meta text-muted-foreground">{t('progress', { passed, total: checks.length })}</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={checks.length}
            aria-valuenow={passed}
            aria-label={t('progress', { passed, total: checks.length })}
          >
            <div className={cn('h-full rounded-full', pct === 100 ? 'bg-success' : pct >= 60 ? 'bg-primary' : 'bg-warning')} style={{ width: `${pct}%` }} />
          </div>
          <Badge variant={setupCompleted ? 'success' : 'warning'} size="sm" dot>
            {setupCompleted ? t('setupCompleted') : t('setupPending')}
          </Badge>
        </div>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2">
        {ordered.map((c) => (
          <li key={c.key} className="border-b border-border md:odd:border-e [&:nth-last-child(-n+2)]:md:border-b-0 last:border-b-0">
            <Link
              href={c.href}
              className="group/check flex min-w-0 items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent"
            >
              {c.ok ? (
                <CheckCircle2Icon className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertTriangleIcon className="size-4 shrink-0 text-warning" aria-hidden />
              )}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[0.8125rem] font-medium text-foreground">{t(`checks.${c.key}.label`)}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {c.ok ? t(`checks.${c.key}.ok`, { count: c.count ?? 0 }) : t(`checks.${c.key}.issue`, { count: c.count ?? 0 })}
                </span>
              </span>
              <span className="sr-only">{c.ok ? t('statusOk') : t('statusIssue')}</span>
              <ChevronRightIcon className="size-3.5 shrink-0 text-faint-foreground opacity-0 transition-opacity group-hover/check:opacity-100 rtl:rotate-180" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

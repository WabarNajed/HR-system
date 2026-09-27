'use client';

import { ArrowUpRightIcon, HistoryIcon, SearchXIcon, WandSparklesIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { SearchInput } from '@/components/shared/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/config';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getReportDefinition, REPORT_GROUP_ICONS, REPORT_GROUPS, type ReportDefinition, type ReportGroup } from '../definitions';
import { useReportT, type LooseT } from './format';
import { clearRecentReports, useRecentReports } from './recent-reports';

export type ReportCatalogProps = {
  /** Report keys the viewer may open (catalog order). */
  keys: string[];
  /** `report_catalog_stats()` values (RLS scoped). */
  stats: Record<string, number>;
  canBuild: boolean;
};

function normalize(text: string) {
  return text
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ]/g, '') // Arabic diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

function searchable(def: ReportDefinition, t: LooseT) {
  return normalize(
    [t(`reports.items.${def.i18n}.title`), t(`reports.items.${def.i18n}.description`), t(`reports.groups.${def.group}`), def.key.replace(/-/g, ' ')].join(' '),
  );
}

function ReportCard({ def, stats }: { def: ReportDefinition; stats: Record<string, number> }) {
  const t = useReportT();
  const locale = useLocale() as Locale;
  const Icon = def.icon;
  const value = def.preview ? stats[def.preview.stat] : undefined;
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const alert = hasValue && value > 0 && def.preview?.tone;
  return (
    <Link
      href={`/reports/${def.key}`}
      className="group/report relative flex min-h-[9.5rem] flex-col rounded-lg border border-border bg-card p-4 shadow-card transition-[border-color,box-shadow,transform] outline-none hover:border-border-strong hover:shadow-raised focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.995]"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="size-[1.125rem]" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-card-title leading-snug text-foreground">{t(`reports.items.${def.i18n}.title`)}</h3>
          <p className="mt-1 line-clamp-2 text-meta text-muted-foreground">{t(`reports.items.${def.i18n}.description`)}</p>
        </div>
        <ArrowUpRightIcon
          aria-hidden
          className="size-4 shrink-0 text-faint-foreground transition-transform group-hover/report:-translate-y-0.5 group-hover/report:translate-x-0.5 group-hover/report:text-primary rtl:-scale-x-100 rtl:group-hover/report:-translate-x-0.5"
        />
      </div>
      {def.preview ? (
        <div className="mt-auto flex items-baseline gap-2 border-t border-dashed border-border pt-3">
          <span
            className={cn(
              'text-[1.375rem] leading-7 font-semibold tracking-tight numeric',
              alert ? (def.preview.tone === 'danger' ? 'text-danger' : 'text-warning') : 'text-foreground',
            )}
          >
            {hasValue ? formatNumber(value, locale, { maximumFractionDigits: 0 }) : t('reports.catalog.metricUnavailable')}
          </span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{t(def.preview.labelKey)}</span>
        </div>
      ) : null}
    </Link>
  );
}

/** Report Center: search, group switcher, recently viewed, grouped report cards and the builder entry. */
export function ReportCatalog({ keys, stats, canBuild }: ReportCatalogProps) {
  const t = useReportT();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'all' | ReportGroup>('all');
  const recentKeys = useRecentReports();

  const defs = useMemo(() => keys.map((k) => getReportDefinition(k)).filter((d): d is ReportDefinition => Boolean(d)), [keys]);
  const index = useMemo(() => new Map(defs.map((d) => [d.key, searchable(d, t)])), [defs, t]);
  const groups = REPORT_GROUPS.filter((g) => defs.some((d) => d.group === g));

  const q = normalize(query.trim());
  const visible = defs.filter((d) => (group === 'all' || d.group === group) && (!q || q.split(/\s+/).every((w) => index.get(d.key)?.includes(w))));
  const recent = recentKeys.map((k) => defs.find((d) => d.key === k)).filter((d): d is ReportDefinition => Boolean(d));

  if (!defs.length) {
    return <EmptyState variant="page" icon={SearchXIcon} title={t('reports.catalog.emptyTitle')} description={t('reports.catalog.emptyDescription')} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          value={query}
          onSearch={setQuery}
          debounce={120}
          placeholder={t('reports.catalog.searchPlaceholder')}
          wrapperClassName="lg:max-w-sm"
          aria-label={t('reports.catalog.searchPlaceholder')}
        />
        <SegmentedTabs
          className="lg:ms-auto"
          aria-label={t('reports.title')}
          value={group}
          onValueChange={(v) => setGroup(v as 'all' | ReportGroup)}
          items={[
            { value: 'all', label: t('common.all'), count: defs.length },
            ...groups.map((g) => ({ value: g, label: t(`reports.groups.${g}`), count: defs.filter((d) => d.group === g).length })),
          ]}
        />
      </div>

      {recent.length && !q && group === 'all' ? (
        <section aria-labelledby="recent-reports" className="flex flex-wrap items-center gap-2">
          <h2 id="recent-reports" className="me-1 inline-flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
            <HistoryIcon className="size-3.5" />
            {t('reports.catalog.recent')}
          </h2>
          {recent.map((d) => {
            const Icon = d.icon;
            return (
              <Link
                key={d.key}
                href={`/reports/${d.key}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-meta font-medium text-foreground shadow-xs transition-colors hover:border-border-strong hover:bg-subtle focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <Icon className="size-3.5 text-primary" aria-hidden />
                {t(`reports.items.${d.i18n}.title`)}
              </Link>
            );
          })}
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearRecentReports}>
            <XIcon />
            {t('reports.catalog.clearRecent')}
          </Button>
        </section>
      ) : null}

      {!visible.length ? (
        <EmptyState
          variant="card"
          tone="neutral"
          icon={SearchXIcon}
          title={t('reports.catalog.noResultsTitle')}
          description={t('reports.catalog.noResultsDescription')}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('');
                setGroup('all');
              }}
            >
              {t('common.clearFilters')}
            </Button>
          }
        />
      ) : (
        groups
          .filter((g) => visible.some((d) => d.group === g))
          .map((g) => {
            const GroupIcon = REPORT_GROUP_ICONS[g];
            const items = visible.filter((d) => d.group === g);
            return (
              <section key={g} aria-labelledby={`group-${g}`} className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-md bg-secondary-soft text-secondary-soft-foreground">
                    <GroupIcon className="size-4" aria-hidden />
                  </span>
                  <h2 id={`group-${g}`} className="text-section-title text-foreground">
                    {t(`reports.groups.${g}`)}
                  </h2>
                  <Badge variant="neutral" size="sm" className="numeric">
                    {items.length}
                  </Badge>
                  <p className="hidden min-w-0 truncate text-meta text-muted-foreground sm:block">{t(`reports.groupDescriptions.${g}`)}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {items.map((d) => (
                    <ReportCard key={d.key} def={d} stats={stats} />
                  ))}
                </div>
              </section>
            );
          })
      )}

      {canBuild ? (
        <section className="relative overflow-hidden rounded-lg border border-primary/20 bg-primary-soft/50 p-5 shadow-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <WandSparklesIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-card-title text-foreground">{t('reports.catalog.builderTitle')}</h2>
              <p className="mt-0.5 text-meta text-muted-foreground">{t('reports.catalog.builderDescription')}</p>
            </div>
            <Button asChild className="shrink-0">
              <Link href="/reports/builder">
                <WandSparklesIcon />
                {t('reports.catalog.builderAction')}
              </Link>
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

'use client';

import { ChevronRightIcon, HistoryIcon, SearchXIcon, WandSparklesIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
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
    [
      t(`reports.items.${def.i18n}.title`),
      t(`reports.items.${def.i18n}.description`),
      t(`reports.groups.${def.group}`),
      def.key.replace(/-/g, ' '),
    ].join(' '),
  );
}

function ReportRow({ def, stats }: { def: ReportDefinition; stats: Record<string, number> }) {
  const t = useReportT();
  const locale = useLocale() as Locale;
  const Icon = def.icon;
  const value = def.preview ? stats[def.preview.stat] : undefined;
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const alert = hasValue && value > 0 && def.preview?.tone;
  return (
    <li>
      <Link
        href={`/reports/${def.key}`}
        className="group/report flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-subtle focus-visible:bg-subtle focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary transition-colors group-hover/report:bg-primary group-hover/report:text-primary-foreground">
          <Icon className="size-[1.125rem]" strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{t(`reports.items.${def.i18n}.title`)}</span>
          <span className="mt-0.5 line-clamp-2 text-meta text-muted-foreground">{t(`reports.items.${def.i18n}.description`)}</span>
        </span>
        {def.preview ? (
          <span className="hidden w-40 shrink-0 flex-col items-end text-end sm:flex">
            <span
              className={cn(
                'text-lg leading-6 font-semibold tracking-tight numeric',
                alert ? (def.preview.tone === 'danger' ? 'text-danger' : 'text-warning') : 'text-foreground',
              )}
            >
              {hasValue ? formatNumber(value, locale, { maximumFractionDigits: 1 }) : t('reports.catalog.metricUnavailable')}
            </span>
            <span className="w-full truncate text-xs text-muted-foreground">{t(def.preview.labelKey)}</span>
          </span>
        ) : null}
        {def.preview && hasValue ? (
          <span
            className={cn(
              'shrink-0 text-base font-semibold numeric sm:hidden',
              alert ? (def.preview.tone === 'danger' ? 'text-danger' : 'text-warning') : 'text-foreground',
            )}
          >
            {formatNumber(value, locale, { maximumFractionDigits: 1 })}
          </span>
        ) : null}
        <ChevronRightIcon
          aria-hidden
          className="size-4 shrink-0 text-faint-foreground transition-transform group-hover/report:translate-x-0.5 group-hover/report:text-primary rtl:rotate-180 rtl:group-hover/report:-translate-x-0.5"
        />
      </Link>
    </li>
  );
}

function GroupPanel({ group, items, stats }: { group: ReportGroup; items: ReportDefinition[]; stats: Record<string, number> }) {
  const t = useReportT();
  const GroupIcon = REPORT_GROUP_ICONS[group];
  return (
    <section aria-labelledby={`group-${group}`} className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <header className="flex items-center gap-2.5 border-b border-border bg-subtle/60 px-4 py-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-secondary-soft-foreground">
          <GroupIcon className="size-4" aria-hidden />
        </span>
        <h2 id={`group-${group}`} className="text-card-title text-foreground">
          {t(`reports.groups.${group}`)}
        </h2>
        <Badge variant="neutral" size="sm" className="numeric">
          {items.length}
        </Badge>
        <p className="ms-auto hidden min-w-0 truncate text-xs text-muted-foreground md:block">{t(`reports.groupDescriptions.${group}`)}</p>
      </header>
      <ul className="divide-y divide-border">
        {items.map((d) => (
          <ReportRow key={d.key} def={d} stats={stats} />
        ))}
      </ul>
    </section>
  );
}

function BuilderPanel() {
  const t = useReportT();
  return (
    <section className="rounded-lg border border-primary/20 bg-primary-soft/50 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
          <WandSparklesIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-card-title text-foreground">{t('reports.catalog.builderTitle')}</h2>
          <p className="mt-0.5 text-meta text-muted-foreground">{t('reports.catalog.builderDescription')}</p>
          <Button asChild size="sm" variant="outline" className="mt-3 bg-card">
            <Link href="/reports/builder">
              {t('reports.catalog.builderAction')}
              <ChevronRightIcon className="rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
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
  const visible = defs.filter(
    (d) => (group === 'all' || d.group === group) && (!q || q.split(/\s+/).every((w) => index.get(d.key)?.includes(w))),
  );
  const recent = recentKeys.map((k) => defs.find((d) => d.key === k)).filter((d): d is ReportDefinition => Boolean(d));

  if (!defs.length) {
    return (
      <EmptyState
        variant="page"
        icon={SearchXIcon}
        title={t('reports.catalog.emptyTitle')}
        description={t('reports.catalog.emptyDescription')}
      />
    );
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
            ...groups.map((g) => ({
              value: g,
              label: t(`reports.groups.${g}`),
              count: defs.filter((d) => d.group === g).length,
            })),
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
        <GroupColumns
          groups={groups.filter((g) => visible.some((d) => d.group === g))}
          visible={visible}
          stats={stats}
          canBuild={canBuild && !q && group === 'all'}
        />
      )}
    </div>
  );
}

/**
 * Group panels in two balanced columns on large screens (greedy by row count, order preserved
 * within each column) — no half-empty grid rows. Rendered once: below `lg` the column wrappers use
 * `display: contents` and each panel's `order` restores the natural single-column sequence.
 */
function GroupColumns({
  groups,
  visible,
  stats,
  canBuild,
}: {
  groups: ReportGroup[];
  visible: ReportDefinition[];
  stats: Record<string, number>;
  canBuild: boolean;
}) {
  const panels = groups.map((g) => ({
    key: g as string,
    weight: visible.filter((d) => d.group === g).length + 1.2,
    node: <GroupPanel group={g} items={visible.filter((d) => d.group === g)} stats={stats} />,
  }));
  if (canBuild) panels.push({ key: 'builder', weight: 2.2, node: <BuilderPanel /> });
  if (panels.length < 2)
    return (
      <div className="flex flex-col gap-4">
        {panels.map((p) => (
          <Fragment key={p.key}>{p.node}</Fragment>
        ))}
      </div>
    );
  const cols: { weight: number; items: { key: string; order: number; node: ReactNode }[] }[] = [
    { weight: 0, items: [] },
    { weight: 0, items: [] },
  ];
  panels.forEach((p, order) => {
    const target = cols[0]!.weight <= cols[1]!.weight ? cols[0]! : cols[1]!;
    target.weight += p.weight;
    target.items.push({ key: p.key, order, node: p.node });
  });
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
      {cols.map((c, i) => (
        <div key={i} className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {c.items.map((item) => (
            <div key={item.key} className="min-w-0" style={{ order: item.order }}>
              {item.node}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

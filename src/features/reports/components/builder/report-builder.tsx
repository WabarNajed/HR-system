'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowDownWideNarrowIcon,
  ChevronDownIcon,
  Columns3Icon,
  DatabaseIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FilterIcon,
  LinkIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchXIcon,
  SheetIcon,
  TableIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { DateRangePicker } from '@/components/shared/date-picker';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { previewReportBuilder, type BuilderPreview } from '../../actions';
import {
  BUILDER_LIMITS,
  defaultBuilderConfig,
  encodeBuilderConfig,
  getBuilderSource,
  type BuilderConfig,
  type BuilderField,
  type BuilderSourceDef,
  type BuilderSourceKey,
  type ReferenceList,
} from '../../builder/sources';
import type { FacetOption } from '../facet-filter';
import { tOr, useReportT } from '../format';
import { BuilderColumns } from './builder-columns';
import { BuilderFilters, isFilterComplete } from './builder-filters';

type SubjectFields = Record<BuilderSourceKey, { visible: string[]; restricted: number }>;

export type ReportBuilderProps = {
  /** Sources the viewer may use, in display order. */
  sources: BuilderSourceKey[];
  /** Field keys visible per source (permission-filtered on the server). */
  fields: SubjectFields;
  initialConfig: BuilderConfig | null;
  references: Partial<Record<ReferenceList, FacetOption[]>>;
  canExport: boolean;
};

const NONE = '__none__';

function visibleDefs(source: BuilderSourceDef, fields: SubjectFields): BuilderField[] {
  const allowed = new Set(fields[source.key]?.visible ?? []);
  return source.fields.filter((f) => allowed.has(f.key));
}

function initialFor(source: BuilderSourceDef, fields: SubjectFields): BuilderConfig {
  const allowed = new Set(fields[source.key]?.visible ?? []);
  const base = defaultBuilderConfig({ permissions: new Set(), isSuperAdmin: true }, source);
  return { ...base, columns: base.columns.filter((c) => allowed.has(c)) };
}

function StepTitle({ n, icon: Icon, children }: { n: number; icon: typeof DatabaseIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-semibold text-primary-foreground numeric">{n}</span>
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      {children}
    </span>
  );
}

/** Custom report builder: source → columns → filters → sort/date → preview → export. */
export function ReportBuilder({ sources, fields, initialConfig, references, canExport }: ReportBuilderProps) {
  const t = useReportT();
  const locale = useLocale() as Locale;
  const fmt = useDateFormat();
  const firstSource = getBuilderSource(initialConfig?.source ?? sources[0] ?? '') ?? getBuilderSource(sources[0] ?? '');
  const [config, setConfig] = useState<BuilderConfig | null>(() => initialConfig ?? (firstSource ? initialFor(firstSource, fields) : null));
  const [preview, setPreview] = useState<(BuilderPreview & { config: string; source: BuilderSourceKey; columns: string[] }) | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [isPending, startTransition] = useTransition();
  const autoRan = useRef(false);

  const source = config ? getBuilderSource(config.source) : null;
  const sourceFields = useMemo(() => (source ? visibleDefs(source, fields) : []), [source, fields]);
  const encoded = config ? encodeBuilderConfig(config) : '';
  const incomplete = Boolean(config?.filters.some((f) => !isFilterComplete(f)));
  const noColumns = !config?.columns.length;
  const blockReason = noColumns ? t('reports.builder.noColumns') : incomplete ? t('reports.builder.invalidFilters') : null;
  const stale = Boolean(preview && preview.config !== encoded);

  // Keep the URL shareable (no navigation / server round trip).
  useEffect(() => {
    if (!encoded) return;
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('cfg', encoded);
      window.history.replaceState(window.history.state, '', url.toString());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [encoded]);

  const run = (cfg: BuilderConfig | null = config) => {
    if (!cfg) return;
    if (!cfg.columns.length || cfg.filters.some((f) => !isFilterComplete(f))) {
      setShowErrors(true);
      toast.error(t(!cfg.columns.length ? 'reports.builder.noColumns' : 'reports.builder.invalidFilters'));
      return;
    }
    const key = encodeBuilderConfig(cfg);
    startTransition(async () => {
      const result = await previewReportBuilder({ config: cfg });
      if (!result.ok) {
        toast.error(t(result.error));
        return;
      }
      setPreview({ ...(result.data as BuilderPreview), config: key, source: cfg.source, columns: cfg.columns });
    });
  };

  // Shared links (?cfg=…) open with their preview already run.
  useEffect(() => {
    if (autoRan.current || !initialConfig) return;
    autoRan.current = true;
    run(initialConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config || !source) {
    return <EmptyState variant="page" icon={DatabaseIcon} tone="neutral" title={t('reports.builder.noSources')} />;
  }

  const set = (patch: Partial<BuilderConfig>) => setConfig((c) => (c ? { ...c, ...patch } : c));
  const chooseSource = (key: BuilderSourceKey) => {
    const next = getBuilderSource(key);
    if (!next || key === config.source) return;
    setConfig(initialFor(next, fields));
    setPreview(null);
    setShowErrors(false);
  };

  const sortable = sourceFields.filter((f) => f.sortable);
  const dateFields = sourceFields.filter((f) => f.dateRange);
  const exportHref = (format: string) => `/api/export/report-builder?format=${format}&cfg=${encoded}`;

  const copyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('cfg', encoded);
      await navigator.clipboard.writeText(url.toString());
      toast.success(t('reports.builder.linkCopied'));
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const previewSource = preview ? getBuilderSource(preview.source) : null;
  const previewFields = preview && previewSource
    ? preview.columns.map((k) => previewSource.fields.find((f) => f.key === k)).filter((f): f is BuilderField => Boolean(f))
    : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* 1 · Source */}
        <SectionCard dense className="xl:col-span-3" title={<StepTitle n={1} icon={DatabaseIcon}>{t('reports.builder.steps.source')}</StepTitle>}>
          <div role="radiogroup" aria-label={t('reports.builder.steps.source')} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-1">
            {sources.map((key) => {
              const s = getBuilderSource(key)!;
              const Icon = s.icon;
              const active = key === config.source;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseSource(key)}
                  className={cn(
                    'flex min-w-0 items-center gap-2.5 rounded-md border px-2.5 py-2 text-start transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    active ? 'border-primary/40 bg-primary-soft/60 text-foreground' : 'border-transparent hover:bg-accent',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t(`reports.builder.sources.${key}.title`)}</span>
                    <span className="hidden truncate text-xs text-muted-foreground xl:block">{t(`reports.builder.sources.${key}.description`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* 2 · Columns */}
        <SectionCard
          dense
          className="xl:col-span-5"
          title={<StepTitle n={2} icon={Columns3Icon}>{t('reports.builder.steps.columns')}</StepTitle>}
          actions={
            <Badge variant="neutral" size="sm" className="numeric">
              {t('reports.builder.selectedCount', { count: config.columns.length })}
            </Badge>
          }
        >
          <BuilderColumns
            fields={sourceFields}
            restrictedCount={fields[config.source]?.restricted ?? 0}
            value={config.columns}
            onChange={(columns) => set({ columns })}
          />
        </SectionCard>

        {/* 3 · Filters + 4 · Sort & date */}
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-4">
          <SectionCard dense title={<StepTitle n={3} icon={FilterIcon}>{t('reports.builder.steps.filters')}</StepTitle>}>
            <BuilderFilters fields={sourceFields} value={config.filters} onChange={(filters) => set({ filters })} references={references} showErrors={showErrors} />
          </SectionCard>
          <SectionCard dense title={<StepTitle n={4} icon={ArrowDownWideNarrowIcon}>{t('reports.builder.steps.sort')}</StepTitle>}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-meta text-muted-foreground">{t('reports.builder.sortBy')}</Label>
                <div className="flex gap-2">
                  <Select
                    value={config.sort?.field ?? NONE}
                    onValueChange={(v) => set({ sort: v === NONE ? null : { field: v, dir: config.sort?.dir ?? 'asc' } })}
                  >
                    <SelectTrigger size="sm" className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('reports.builder.sortDefault')}</SelectItem>
                      {sortable.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {t(`reports.builder.fields.${f.labelId}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={config.sort?.dir ?? 'asc'}
                    disabled={!config.sort}
                    onValueChange={(v) => config.sort && set({ sort: { ...config.sort, dir: v as 'asc' | 'desc' } })}
                  >
                    <SelectTrigger size="sm" className="w-32 shrink-0" aria-label={t('reports.builder.sortBy')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">{t('reports.builder.ascending')}</SelectItem>
                      <SelectItem value="desc">{t('reports.builder.descending')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-meta text-muted-foreground">{t('reports.builder.dateRange')}</Label>
                <div className="flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
                  <Select
                    value={config.dateField ?? NONE}
                    onValueChange={(v) => set({ dateField: v === NONE ? null : v, ...(v === NONE ? { dateFrom: null, dateTo: null } : {}) })}
                  >
                    <SelectTrigger size="sm" className="w-full min-w-0 sm:w-40 xl:w-full 2xl:w-40" aria-label={t('reports.builder.dateColumn')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('reports.builder.noDateColumn')}</SelectItem>
                      {dateFields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {t(`reports.builder.fields.${f.labelId}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DateRangePicker
                    size="sm"
                    className="min-w-0 flex-1"
                    disabled={!config.dateField}
                    value={config.dateFrom || config.dateTo ? { from: config.dateFrom, to: config.dateTo } : null}
                    onChange={(r) => set({ dateFrom: r?.from ?? null, dateTo: r?.to ?? r?.from ?? null })}
                    align="end"
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* 5 · Preview */}
      <SectionCard
        flush
        title={<StepTitle n={5} icon={TableIcon}>{t('reports.builder.steps.preview')}</StepTitle>}
        description={
          preview ? (
            <span className="numeric">
              {t('reports.builder.previewHint', {
                shown: formatNumber(preview.rows.length, locale),
                total: formatNumber(preview.total, locale),
              })}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {stale ? (
              <span className="hidden items-center gap-1.5 text-meta text-warning md:inline-flex">
                <TriangleAlertIcon className="size-3.5" />
                {t('reports.builder.stale')}
              </span>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => { setConfig(initialFor(source, fields)); setPreview(null); setShowErrors(false); }}>
              <RotateCcwIcon />
              <span className="max-sm:sr-only">{t('reports.builder.reset')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={copyLink}>
              <LinkIcon />
              <span className="max-sm:sr-only">{t('reports.builder.copyLink')}</span>
            </Button>
            <BuilderExport canExport={canExport} blockReason={blockReason} href={exportHref} />
            <Button size="sm" onClick={() => run()} loading={isPending}>
              {preview ? <RefreshCwIcon /> : <PlayIcon />}
              {preview ? t('reports.builder.refreshPreview') : t('reports.builder.runPreview')}
            </Button>
          </div>
        }
      >
        <div className={cn('p-4 transition-opacity', isPending && 'opacity-60')}>
          {preview ? (
            preview.rows.length ? (
              <PreviewTable fields={previewFields} rows={preview.rows} fmtDate={fmt.date} fmtDateTime={fmt.dateTime} locale={locale} />
            ) : (
              <EmptyState icon={SearchXIcon} tone="neutral" title={t('reports.builder.noRowsTitle')} description={t('reports.builder.noRowsDescription')} />
            )
          ) : (
            <EmptyState
              icon={PlayIcon}
              title={t('reports.builder.previewEmptyTitle')}
              description={t('reports.builder.previewEmptyDescription')}
              action={
                <Button onClick={() => run()} loading={isPending}>
                  <PlayIcon />
                  {t('reports.builder.runPreview')}
                </Button>
              }
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function BuilderExport({ canExport, blockReason, href }: { canExport: boolean; blockReason: string | null; href: (format: string) => string }) {
  const t = useReportT();
  const reason = !canExport ? t('reports.view.exportDisabled') : blockReason;
  if (reason) {
    return (
      <SimpleTooltip content={reason}>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
          <Button variant="outline" size="sm" disabled>
            <DownloadIcon />
            {t('reports.view.export')}
          </Button>
        </span>
      </SimpleTooltip>
    );
  }
  const items = [
    { format: 'xlsx', label: t('common.table.exportExcel'), icon: FileSpreadsheetIcon },
    { format: 'csv', label: t('common.table.exportCsv'), icon: SheetIcon },
    { format: 'pdf', label: t('common.table.exportPdf'), icon: FileTextIcon },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <DownloadIcon />
          {t('reports.view.export')}
          <ChevronDownIcon className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal text-muted-foreground">{t('reports.builder.exportHint')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ format, label, icon: Icon }) => (
          <DropdownMenuItem key={format} asChild>
            <a href={href(format)} download>
              <Icon />
              {label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Row = Record<string, unknown>;

function PreviewTable({
  fields,
  rows,
  fmtDate,
  fmtDateTime,
  locale,
}: {
  fields: BuilderField[];
  rows: Row[];
  fmtDate: (v: string) => string;
  fmtDateTime: (v: string) => string;
  locale: Locale;
}) {
  const t = useReportT();
  const columns = useMemo<ColumnDef<Row>[]>(
    () =>
      fields.map((f) => {
        const label = t(`reports.builder.fields.${f.labelId}`);
        const numeric = f.type === 'number';
        return {
          id: f.key,
          accessorFn: (row: Row) => (row[f.key] ?? null) as never,
          header: ({ column }) => <DataTableColumnHeader column={column} title={label} />,
          cell: ({ row }) => {
            const v = row.original[f.key];
            if (v === null || v === undefined || v === '') return <span className="text-faint-foreground">—</span>;
            switch (f.type) {
              case 'number':
                return formatNumber(Number(v), locale, { maximumFractionDigits: 2 });
              case 'date':
                return <span className="whitespace-nowrap">{fmtDate(String(v))}</span>;
              case 'datetime':
                return <span className="whitespace-nowrap">{fmtDateTime(String(v))}</span>;
              case 'boolean':
                return v ? t('common.yes') : t('common.no');
              case 'status':
                return <StatusBadge domain={f.statusDomain!} status={String(v)} size="sm" />;
              case 'enum':
                return tOr(t, `enums.${f.enumKey}.${v}`, v);
              default:
                return <span className="block max-w-72 truncate">{String(v)}</span>;
            }
          },
          sortUndefined: 'last',
          meta: { label, align: numeric ? 'end' : 'start', cellClassName: numeric ? 'numeric' : undefined },
        } satisfies ColumnDef<Row>;
      }),
    [fields, t, locale, fmtDate, fmtDateTime],
  );
  return (
    <DataTable<Row>
      tableId="report-builder-preview"
      mode="client"
      columns={columns}
      data={rows}
      getRowId={(row, i) => String(row.__id ?? i)}
      toolbar={false}
      pagination={false}
      density="compact"
      defaultPageSize={BUILDER_LIMITS.previewRows}
      maxHeight="32rem"
    />
  );
}

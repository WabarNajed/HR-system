'use client';

import { BarChart3Icon } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useMemo, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { EmptyState } from '@/components/shared/empty-state';
import { chartAxisProps, CHART_CHROME, CHART_STATUS, seriesColor } from '@/lib/chart-colors';
import { dir, type Locale } from '@/lib/i18n/config';
import { formatDayMonth, formatMonthYear } from '@/lib/i18n/date-format';
import { cn } from '@/lib/utils';
import type { ChartDef, ChartSeries } from '../definitions';
import { formatValue, pickLocalized, tOr, useNumberFormat, useReportT, type LooseT } from './format';

/**
 * Report chart (recharts, shared palette). Direction-aware: in Arabic the category axis runs
 * right→left, the value axis sits on the right and horizontal bars grow leftwards. Thin marks
 * (≤ 24px, 4px rounded data end), hairline grid, legend only for 2+ series, hover tooltip.
 */

type Point = Record<string, unknown> & { key: string };
type Datum = Record<string, number | string | null> & { __label: string; __key: string };

const BUCKET_COLORS: Record<string, string> = {
  expired: CHART_STATUS.danger,
  within30: CHART_STATUS.warning,
  within60: 'var(--chart-2)',
  within90: CHART_STATUS.info,
  valid: CHART_STATUS.success,
  missing: CHART_STATUS.neutral,
};

const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function seriesColorOf(series: ChartSeries, index: number): string {
  if (typeof series.color === 'number') return seriesColor(series.color);
  if (series.color) return CHART_STATUS[series.color];
  return seriesColor(index);
}

function categoryLabel(def: ChartDef, point: Point, locale: Locale, t: LooseT): string {
  const key = point.key;
  switch (def.category) {
    case 'month':
      return formatMonthYear(key, locale);
    case 'day':
      return formatDayMonth(key, locale);
    case 'localized':
      return pickLocalized(point, 'label', locale) ?? (key ? key : t('reports.view.notSet'));
    case 'status':
      return tOr(t, `statuses.${def.statusDomain}.${key}`, key) || t('reports.view.notSet');
    case 'enum':
      return tOr(t, `enums.${def.enumKey}.${key}`, key) || t('reports.view.notSet');
    case 'bucket':
      return tOr(t, `reports.buckets.${key}`, key);
    case 'category':
      return tOr(t, `reports.categories.${key}`, key);
    default:
      return key;
  }
}

/** Builds chart rows; folds categories beyond `top` into "Other" (sums; percentages are just cut). */
function toData(def: ChartDef, points: Point[], locale: Locale, t: LooseT): Datum[] {
  const rows: Datum[] = points.map((p) => {
    const d: Datum = { __key: String(p.key ?? ''), __label: categoryLabel(def, p, locale, t) };
    for (const s of def.series) {
      const v = p[s.key];
      d[s.key] = v === null || v === undefined ? null : Number(v);
    }
    return d;
  });
  if (def.top && rows.length > def.top) {
    const head = rows.slice(0, def.top);
    if (def.format === 'percent') return head;
    const rest = rows.slice(def.top);
    const other: Datum = { __key: '__other', __label: t('reports.view.other') };
    for (const s of def.series) other[s.key] = rest.reduce((sum, r) => sum + (Number(r[s.key]) || 0), 0);
    return [...head, other];
  }
  return rows;
}

function ChartTooltip({
  active,
  payload,
  label,
  def,
  t,
  locale,
}: Partial<TooltipContentProps<number, string>> & { def: ChartDef; t: LooseT; locale: Locale }) {
  if (!active || !payload?.length) return null;
  const title = (payload[0]?.payload as Datum | undefined)?.__label ?? String(label ?? '');
  return (
    <div className="min-w-40 rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-overlay" dir={dir(locale)}>
      <div className="mb-1.5 text-meta font-semibold">{title}</div>
      <div className="space-y-1">
        {payload.map((item) => {
          const series = def.series.find((s) => s.key === item.dataKey);
          return (
            <div key={String(item.dataKey)} className="flex items-center gap-2 text-meta">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.color ?? (item.payload as { fill?: string })?.fill }} />
              <span className="text-muted-foreground">{series ? t(series.labelKey) : String(item.name)}</span>
              <span className="ms-auto ps-3 font-semibold numeric">{formatValue(item.value, def.format, locale, t)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ def, t }: { def: ChartDef; t: LooseT }) {
  if (def.series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted-foreground">
      {def.series.map((s, i) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: seriesColorOf(s, i) }} />
          {t(s.labelKey)}
        </li>
      ))}
    </ul>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type ReportChartProps = {
  def: ChartDef;
  points: Point[];
  className?: string;
  /** Extra header content (e.g. chart view switcher) rendered next to the legend. */
  toolbar?: ReactNode;
};

export function ReportChart({ def, points, className }: ReportChartProps) {
  const t = useReportT();
  const locale = useLocale() as Locale;
  const nf = useNumberFormat();
  const mounted = useMounted();
  const rtl = dir(locale) === 'rtl';

  const data = useMemo(() => toData(def, points, locale, t), [def, points, locale, t]);
  const hasValues = data.some((d) => def.series.some((s) => Number(d[s.key]) > 0));

  if (!data.length || !hasValues) {
    return (
      <EmptyState
        icon={BarChart3Icon}
        tone="neutral"
        title={t('reports.charts.empty')}
        className={cn('min-h-40 py-6 [&_h3]:text-sm [&_h3]:font-medium', className)}
      />
    );
  }

  const tickFormat = (v: number) => (def.format === 'percent' ? nf.percent(v) : Math.abs(v) >= 10000 ? nf.compact(v) : nf.decimal(v));
  const horizontal = def.type === 'bar' || def.type === 'stackedBar';
  const stacked = def.type === 'stacked' || def.type === 'stackedBar';
  const height = horizontal ? Math.max(180, data.length * 34 + 36) : 260;
  const tooltip = (
    <Tooltip
      cursor={{ fill: CHART_CHROME.cursor, opacity: 0.6 }}
      content={(props) => <ChartTooltip {...(props as Partial<TooltipContentProps<number, string>>)} def={def} t={t} locale={locale} />}
      isAnimationActive={false}
    />
  );
  const valueDomain: [number, number | 'auto'] | undefined = def.format === 'percent' ? [0, 1] : undefined;
  const labelWidth = Math.min(170, Math.max(72, Math.max(...data.map((d) => Math.min(d.__label.length, 24))) * 7 + 12));

  let chart: ReactNode;
  if (horizontal) {
    // Rounded data end: right in LTR, left in RTL (the value axis is reversed).
    const endRadius: [number, number, number, number] = rtl ? [4, 0, 0, 4] : [0, 4, 4, 0];
    chart = (
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={CHART_CHROME.grid} />
        <XAxis type="number" reversed={rtl} tickFormatter={tickFormat} domain={valueDomain} allowDecimals={def.format !== 'integer'} {...chartAxisProps} />
        <YAxis
          type="category"
          dataKey="__label"
          orientation={rtl ? 'right' : 'left'}
          width={labelWidth}
          interval={0}
          {...chartAxisProps}
          tick={{ ...chartAxisProps.tick, fill: CHART_CHROME.text }}
          tickFormatter={(v: string) => truncate(v, 24)}
        />
        {tooltip}
        {def.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? 'stack' : undefined}
            fill={seriesColorOf(s, i)}
            maxBarSize={22}
            radius={!stacked || i === def.series.length - 1 ? endRadius : 0}
            isAnimationActive={false}
            stroke={stacked ? 'var(--card)' : undefined}
            strokeWidth={stacked ? 1 : 0}
          >
            {def.colorByCategory ? data.map((d) => <Cell key={d.__key} fill={BUCKET_COLORS[d.__key] ?? seriesColor(0)} />) : null}
          </Bar>
        ))}
      </BarChart>
    );
  } else if (def.type === 'line' || def.type === 'area') {
    const s = def.series[0]!;
    const color = seriesColorOf(s, 0);
    const Chart = def.type === 'area' ? AreaChart : LineChart;
    chart = (
      <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={`fill-${def.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} />
        <XAxis dataKey="__label" reversed={rtl} interval="preserveStartEnd" minTickGap={16} {...chartAxisProps} />
        <YAxis orientation={rtl ? 'right' : 'left'} width={44} tickFormatter={tickFormat} allowDecimals={false} domain={valueDomain} {...chartAxisProps} />
        {tooltip}
        {def.type === 'area' ? (
          <Area
            type="monotone"
            dataKey={s.key}
            stroke={color}
            strokeWidth={2}
            fill={`url(#fill-${def.key})`}
            dot={{ r: 3.5, fill: color, stroke: 'var(--card)', strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ) : (
          <Line
            type="monotone"
            dataKey={s.key}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3.5, fill: color, stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        )}
      </Chart>
    );
  } else {
    chart = (
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap={data.length > 18 ? '18%' : '30%'} barGap={2}>
        <CartesianGrid vertical={false} stroke={CHART_CHROME.grid} />
        <XAxis dataKey="__label" reversed={rtl} interval="preserveStartEnd" minTickGap={8} {...chartAxisProps} />
        <YAxis orientation={rtl ? 'right' : 'left'} width={44} tickFormatter={tickFormat} allowDecimals={def.format !== 'integer'} domain={valueDomain} {...chartAxisProps} />
        {tooltip}
        {def.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? 'stack' : undefined}
            fill={seriesColorOf(s, i)}
            maxBarSize={24}
            radius={!stacked || i === def.series.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
            stroke={stacked ? 'var(--card)' : undefined}
            strokeWidth={stacked ? 1 : 0}
          >
            {def.colorByCategory ? data.map((d) => <Cell key={d.__key} fill={BUCKET_COLORS[d.__key] ?? seriesColor(0)} />) : null}
          </Bar>
        ))}
      </BarChart>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <Legend def={def} t={t} />
      <div className="w-full" style={{ height }} role="img" aria-label={t(def.titleKey)} dir="ltr">
        {mounted ? (
          <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
            {chart as ReactElement}
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}

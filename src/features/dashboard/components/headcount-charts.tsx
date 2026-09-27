'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { CHART_CHROME, CHART_SERIES, CHART_STATUS, chartAxisProps } from '@/lib/chart-colors';
import { dir } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

/**
 * Headcount charts for the HR dashboard (recharts + the shared validated palette).
 *  - DepartmentBarChart: magnitude by department → one sequential hue (chart-1), direct value labels.
 *  - NationalityMix: part-to-whole → one 100% stacked bar in fixed categorical order (top 5 + Other),
 *    with a legend that repeats every value (identity is never carried by color alone).
 * Both are RTL-aware (reversed value axis, category axis on the right).
 */

export type ChartDatum = { key: string; label: string; value: number };

const nf = (locale: string) => new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US');

function ChartTooltip({ active, payload, locale, total }: Partial<TooltipContentProps<number, string>> & { locale: string; total: number }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]!;
  const datum = item.payload as ChartDatum | undefined;
  const value = Number(item.value ?? 0);
  const label = datum?.label ?? String(item.name ?? '');
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-raised" dir={dir(locale)}>
      <div className="font-medium text-foreground">{label}</div>
      <div className="numeric mt-0.5 text-muted-foreground">
        {nf(locale).format(value)}
        {total > 0 ? ` · ${Math.round((value / total) * 100)}%` : ''}
      </div>
    </div>
  );
}

export function DepartmentBarChart({ data, total }: { data: ChartDatum[]; total: number }) {
  const locale = useLocale();
  const rtl = dir(locale) === 'rtl';
  const t = useTranslations('dashboard.widgets.overview');
  const height = Math.max(72, data.length * 34 + 6);
  const f = nf(locale);
  return (
    // SVG text anchors flip under an RTL base direction; the plot runs LTR with a reversed axis instead.
    <div style={{ height }} dir="ltr" role="img" aria-label={t('byDepartmentAria', { count: data.length })}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, bottom: 0, left: rtl ? 28 : 4, right: rtl ? 4 : 28 }} barCategoryGap={8}>
          <XAxis type="number" hide reversed={rtl} domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="label"
            orientation={rtl ? 'right' : 'left'}
            width={124}
            {...chartAxisProps}
            tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
            tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: CHART_CHROME.cursor }}
            content={(props) => <ChartTooltip {...(props as Partial<TooltipContentProps<number, string>>)} locale={locale} total={total} />}
          />
          <Bar dataKey="value" fill={CHART_SERIES[0]} radius={rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList
              dataKey="value"
              content={(props) => {
                // Place the value just past the bar's visual end — with a reversed (RTL) axis the
                // bar grows leftwards and recharts reports a negative width, so compute the edges.
                const x = Number(props.x ?? 0);
                const w = Number(props.width ?? 0);
                const y = Number(props.y ?? 0);
                const h = Number(props.height ?? 0);
                const left = Math.min(x, x + w);
                const right = Math.max(x, x + w);
                return (
                  <text
                    x={rtl ? left - 6 : right + 6}
                    y={y + h / 2}
                    dominantBaseline="central"
                    textAnchor={rtl ? 'end' : 'start'}
                    fill={CHART_CHROME.text}
                    fontSize={12}
                    fontWeight={600}
                  >
                    {f.format(Number(props.value ?? 0))}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NationalityMix({ data, total, otherLabel }: { data: ChartDatum[]; total: number; otherLabel: string }) {
  const locale = useLocale();
  const rtl = dir(locale) === 'rtl';
  const t = useTranslations('dashboard.widgets.overview');
  const f = nf(locale);

  // Fixed categorical order by rank; beyond 5 series the tail folds into "Other" (neutral).
  const series = useMemo(() => {
    const top = data.slice(0, 5).map((d, i) => ({ ...d, color: CHART_SERIES[i]! }));
    const rest = data.slice(5).reduce((sum, d) => sum + d.value, 0);
    return rest > 0 ? [...top, { key: '__other', label: otherLabel, value: rest, color: CHART_STATUS.neutral }] : top;
  }, [data, otherLabel]);
  const row = useMemo(() => [Object.fromEntries([['name', 'mix'], ...series.map((s) => [s.key, s.value])])], [series]);

  return (
    <div className="flex flex-col gap-4">
 <div style={{ height: 28 }} dir="ltr" role="img" aria-label={t('byNationalityAria', { count: series.length })}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={row} layout="vertical" margin={{ top: 0, bottom: 0, left: 0, right: 0 }} barCategoryGap={0}>
            <XAxis type="number" hide reversed={rtl} domain={[0, total || 1]} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              cursor={false}
              shared={false}
              content={(props) => {
                const p = props as Partial<TooltipContentProps<number, string>>;
                const item = p.payload?.[0];
                if (!p.active || !item) return null;
                const s = series.find((x) => x.key === item.dataKey);
                return (
                  <ChartTooltip
                    active
                    payload={[{ ...item, payload: { key: s?.key ?? '', label: s?.label ?? '', value: Number(item.value ?? 0) } }] as never}
                    locale={locale}
                    total={total}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="mix"
                fill={s.color}
                stroke={CHART_CHROME.surface}
                strokeWidth={2}
                isAnimationActive={false}
                radius={
                  series.length === 1
                    ? 6
                    : i === 0
                      ? rtl
                        ? [0, 6, 6, 0]
                        : [6, 0, 0, 6]
                      : i === series.length - 1
                        ? rtl
                          ? [6, 0, 0, 6]
                          : [0, 6, 6, 0]
                        : 0
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {series.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            <span className={cn('min-w-0 flex-1 truncate', s.key === '__other' ? 'text-muted-foreground' : 'text-foreground')}>{s.label}</span>
            <span className="numeric shrink-0 font-semibold text-foreground">{f.format(s.value)}</span>
            <span className="numeric w-10 shrink-0 text-end text-xs text-muted-foreground">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Shared chart palette (recharts). Colors are CSS variables so charts follow light/dark mode
 * automatically — pass them straight to `fill` / `stroke`.
 *
 * Categorical order is fixed and validated (dataviz validator, both modes: lightness band,
 * chroma floor, adjacent-pair CVD ΔE ≥ 8, normal-vision ΔE ≥ 15, ≥ 3:1 on the card surface).
 * Assign by entity in this order — never cycle past 8; fold extra series into "Other".
 * Status meanings (success/warning/danger) use the status tokens, never a categorical slot.
 */

export const CHART_SERIES = [
  'var(--chart-1)', // teal (brand)
  'var(--chart-2)', // gold (brand accent)
  'var(--chart-3)', // blue
  'var(--chart-4)', // magenta
  'var(--chart-5)', // olive
  'var(--chart-6)', // violet
  'var(--chart-7)', // orange
  'var(--chart-8)', // green-teal
] as const;

/** Raw values for non-CSS consumers (PDF/Excel exports). */
export const CHART_SERIES_HEX = {
  light: ['#008c9e', '#b7821f', '#2a6fd6', '#d55181', '#7e9a12', '#5b46c2', '#e0662f', '#0b8f74'],
  dark: ['#1c9dae', '#ba862a', '#4a88e6', '#d8658f', '#84a022', '#8e7cf0', '#e06c3e', '#1e9e82'],
} as const;

export const CHART_STATUS = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
  neutral: 'var(--muted-foreground)',
} as const;

export const CHART_CHROME = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  tick: 'var(--muted-foreground)',
  text: 'var(--foreground)',
  surface: 'var(--card)',
  cursor: 'var(--accent)',
} as const;

/** Color for the n-th series (0-based). Beyond 8 series, returns the neutral "Other" color. */
export function seriesColor(index: number): string {
  return CHART_SERIES[index] ?? CHART_STATUS.neutral;
}

/**
 * Stable color per entity key (e.g. department id) given the ordered list of keys shown.
 * Keeps colors attached to entities, not ranks, when filters change the visible set.
 */
export function colorByKey(keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k, i) => [k, seriesColor(i)]));
}

/** Common recharts axis/tick props — tabular numerals, muted ink, hairline axis. */
export const chartAxisProps = {
  stroke: CHART_CHROME.axis,
  tickLine: false,
  axisLine: false,
  tick: { fill: CHART_CHROME.tick, fontSize: 12 },
} as const;

/** In RTL, category axes should run right→left: pass `reversed` to XAxis and orient Y on the right. */
export function rtlAxisConfig(dir: 'rtl' | 'ltr') {
  return dir === 'rtl'
    ? { xReversed: true, yOrientation: 'right' as const }
    : { xReversed: false, yOrientation: 'left' as const };
}

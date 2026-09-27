import { brandCssVariables, contrastRatio, DEFAULT_BRAND_COLORS, normalizeHex, readableForeground } from '@/lib/utils';

/**
 * Branding colour helpers (isomorphic): scoped CSS for the live preview, contrast checks and the
 * curated theme presets shown on Settings › Branding.
 */

/** Hand-tuned Oasis palette (globals.css) used when the defaults are selected. */
const OASIS = {
  primary: '#0f5e6b',
  primaryFg: '#ffffff',
  primaryDark: '#38a3b1',
  primaryDarkFg: '#04171b',
  secondary: '#b8862f',
  secondaryFg: '#ffffff',
  secondaryDark: '#d4a553',
  secondaryDarkFg: '#1d1405',
  sidebar: '#0b2a31',
};

export type ThemePreset = { key: 'oasis' | 'royal' | 'emerald' | 'indigo' | 'burgundy' | 'slate'; primary: string; secondary: string };

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'oasis', primary: '#0f5e6b', secondary: '#b8862f' },
  { key: 'royal', primary: '#1e3a8a', secondary: '#c39a3d' },
  { key: 'emerald', primary: '#0b6e4f', secondary: '#c0843a' },
  { key: 'indigo', primary: '#3949ab', secondary: '#d08a1c' },
  { key: 'burgundy', primary: '#7a1f3d', secondary: '#b8862f' },
  { key: 'slate', primary: '#334155', secondary: '#0e7490' },
];

type Resolved = { p: string; pFg: string; pDark: string; pDarkFg: string; s: string; sFg: string; sDark: string; sDarkFg: string; sidebar: string };

function resolve(primary: string | null, secondary: string | null): Resolved {
  const vars = brandCssVariables({ primary, secondary });
  const p = normalizeHex(primary);
  const customP = Boolean(vars['--brand-primary']);
  const customS = Boolean(vars['--brand-secondary']);
  return {
    p: customP ? vars['--brand-primary']! : (p === DEFAULT_BRAND_COLORS.primary || !p ? OASIS.primary : p),
    pFg: customP ? vars['--brand-primary-foreground']! : OASIS.primaryFg,
    pDark: customP ? vars['--brand-primary-dark']! : OASIS.primaryDark,
    pDarkFg: customP ? vars['--brand-primary-dark-foreground']! : OASIS.primaryDarkFg,
    s: customS ? vars['--brand-secondary']! : OASIS.secondary,
    sFg: customS ? vars['--brand-secondary-foreground']! : OASIS.secondaryFg,
    sDark: customS ? vars['--brand-secondary-dark']! : OASIS.secondaryDark,
    sDarkFg: customS ? vars['--brand-secondary-dark-foreground']! : OASIS.secondaryDarkFg,
    sidebar: customP ? vars['--brand-sidebar']! : OASIS.sidebar,
  };
}

/**
 * Scoped CSS that re-declares the brand tokens inside `[data-brand-preview]` (light + dark),
 * so the preview renders with the colours being edited while the page keeps the saved ones.
 * Only validated hex values are interpolated — safe to inline.
 */
export function previewCss(primary: string | null, secondary: string | null): string {
  const r = resolve(primary, secondary);
  const light = [
    `--primary:${r.p}`,
    `--primary-foreground:${r.pFg}`,
    `--primary-hover:color-mix(in oklab,${r.p} 88%,black)`,
    `--primary-soft:color-mix(in oklab,${r.p} 9%,white)`,
    `--primary-soft-foreground:color-mix(in oklab,${r.p} 92%,black)`,
    `--secondary:${r.s}`,
    `--secondary-foreground:${r.sFg}`,
    `--secondary-soft:color-mix(in oklab,${r.s} 12%,white)`,
    `--secondary-soft-foreground:color-mix(in oklab,${r.s} 70%,black)`,
    `--ring:color-mix(in oklab,${r.p} 60%,transparent)`,
    `--sidebar:${r.sidebar}`,
    `--sidebar-indicator:${r.s}`,
  ].join(';');
  const dark = [
    `--primary:${r.pDark}`,
    `--primary-foreground:${r.pDarkFg}`,
    `--primary-hover:color-mix(in oklab,${r.pDark} 88%,white)`,
    `--primary-soft:color-mix(in oklab,${r.pDark} 16%,#101b1f)`,
    `--primary-soft-foreground:color-mix(in oklab,${r.pDark} 78%,white)`,
    `--secondary:${r.sDark}`,
    `--secondary-foreground:${r.sDarkFg}`,
    `--secondary-soft:color-mix(in oklab,${r.sDark} 15%,#101b1f)`,
    `--secondary-soft-foreground:color-mix(in oklab,${r.sDark} 82%,white)`,
    `--ring:color-mix(in oklab,${r.pDark} 65%,transparent)`,
    `--sidebar:#0c171b`,
    `--sidebar-primary:color-mix(in oklab,${r.pDark} 16%,transparent)`,
    `--sidebar-indicator:${r.sDark}`,
  ].join(';');
  return `[data-brand-preview]{${light}}.dark [data-brand-preview]{${dark}}[data-brand-preview] [data-paper]{--primary:${r.p};--secondary:${r.s}}`;
}

export type ContrastCheck = {
  /** Contrast of the colour on a white surface (text, icons, links). */
  onSurface: number;
  /** Contrast of the automatic text colour placed on the colour (buttons, badges). */
  onColor: number;
  /** Text colour chosen automatically for filled surfaces. */
  foreground: string;
  level: 'good' | 'fair' | 'poor';
};

export function checkContrast(hex: string | null, kind: 'primary' | 'secondary'): ContrastCheck | null {
  const color = normalizeHex(hex);
  if (!color) return null;
  const foreground = readableForeground(color);
  const onSurface = contrastRatio(color, '#ffffff');
  const onColor = contrastRatio(color, foreground);
  // Primary carries text/links/buttons (AA 4.5:1); secondary is an accent (3:1 for UI graphics).
  const target = kind === 'primary' ? 4.5 : 3;
  const level = onSurface >= target && onColor >= 4.5 ? 'good' : onSurface >= target * 0.66 ? 'fair' : 'poor';
  return { onSurface, onColor, foreground, level };
}

/** True when the two brand colours are hard to tell apart. */
export function colorsTooSimilar(a: string | null, b: string | null): boolean {
  const x = normalizeHex(a);
  const y = normalizeHex(b);
  if (!x || !y) return false;
  return contrastRatio(x, y) < 1.25;
}

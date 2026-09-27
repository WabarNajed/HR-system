import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** tailwind-merge aware of the custom Oasis font-size scale (so `text-meta` isn't read as a color). */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['meta', 'card-title', 'section-title', 'page-title', 'stat'] }],
      shadow: [{ shadow: ['xs', 'card', 'raised', 'overlay'] }],
    },
  },
});

/** Merge class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ─── Colors ─────────────────────────────────────────────────────────────── */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

/** Normalizes `#abc` / `ABCDEF` → `#aabbcc` (lowercase); returns null when invalid. */
export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim().toLowerCase();
  if (!v.startsWith('#')) v = `#${v}`;
  if (!HEX_RE.test(v)) return null;
  if (v.length === 4) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

function channelToLinear(c: number) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channelToLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Picks white or a near-black ink for text placed on `bg`, whichever contrasts more. */
export function readableForeground(bg: string, dark = '#0b1a1e', light = '#ffffff'): string {
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

/** Linear mix in sRGB: weight 0 → a, 1 → b. */
export function mixHex(a: string, b: string, weight: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => ra[i]! + (rb[i]! - ra[i]!) * weight) as Rgb);
}

/** Lightens `hex` towards white until it reaches at least `minContrast` on `surface`. */
function liftForDarkSurface(hex: string, surface = '#101b1f', minContrast = 4.5): string {
  let out = hex;
  for (let w = 0; w <= 0.9 && contrastRatio(out, surface) < minContrast; w += 0.05) {
    out = mixHex(hex, '#ffffff', w);
  }
  return out;
}

export type BrandColors = { primary?: string | null; secondary?: string | null };

/**
 * CSS custom properties for runtime branding (Settings › Branding). Inject the result on
 * <html style> or a `:root{}` rule in the root layout. Only valid hex colors are emitted, so
 * missing/invalid values fall back to the Oasis defaults in globals.css.
 *
 * Emits light + dark variants and readable foregrounds, plus a deep sidebar tone derived from
 * the primary color.
 */
export function brandCssVariables({ primary, secondary }: BrandColors): Record<string, string> {
  const vars: Record<string, string> = {};
  const p = normalizeHex(primary);
  const s = normalizeHex(secondary);
  if (p) {
    const pDark = liftForDarkSurface(p);
    vars['--brand-primary'] = p;
    vars['--brand-primary-foreground'] = readableForeground(p);
    vars['--brand-primary-dark'] = pDark;
    vars['--brand-primary-dark-foreground'] = readableForeground(pDark);
    vars['--brand-sidebar'] = mixHex(p, '#051216', 0.72);
  }
  if (s) {
    const sDark = liftForDarkSurface(s, '#101b1f', 5);
    vars['--brand-secondary'] = s;
    vars['--brand-secondary-foreground'] = readableForeground(s);
    vars['--brand-secondary-dark'] = sDark;
    vars['--brand-secondary-dark-foreground'] = readableForeground(sDark);
  }
  return vars;
}

/** Serializes `brandCssVariables()` into a `:root{…}` rule (safe: values are validated hex). */
export function brandCssText(colors: BrandColors): string {
  const entries = Object.entries(brandCssVariables(colors));
  if (!entries.length) return '';
  return `:root{${entries.map(([k, v]) => `${k}:${v}`).join(';')}}`;
}

/* ─── Strings ────────────────────────────────────────────────────────────── */

/** Stable 32-bit hash (FNV-1a) — for deterministic avatar tints etc. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Initials for avatars: first letters of the first and last name parts, skipping connectors
 * such as "بن" / "bin" and a leading "ال" article.
 */
export function getInitials(name: string | null | undefined, max = 2): string {
  if (!name) return '';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p && !['بن', 'ابن', 'bin', 'bint', 'al', 'el'].includes(p.toLowerCase()));
  if (!parts.length) return '';
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  const letters = [first, last].filter(Boolean).map((p) => {
    const clean = p.replace(/^(ال)/, '');
    return (clean || p).charAt(0);
  });
  const picked = letters.slice(0, max);
  // Arabic letters would join cursively into a pseudo-word; a zero-width non-joiner keeps them apart.
  const arabic = picked.some((l) => /[\u0600-\u06FF]/.test(l));
  return picked.join(arabic ? '\u200C' : '').toUpperCase();
}

/** Human file size using locale digits (Latin); returns a value + unit key for i18n. */
export function fileSizeParts(bytes: number): { size: string; unit: 'bytes' | 'kb' | 'mb' } {
  if (bytes < 1024) return { size: String(bytes), unit: 'bytes' };
  if (bytes < 1024 * 1024) return { size: (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0), unit: 'kb' };
  return { size: (bytes / (1024 * 1024)).toFixed(1), unit: 'mb' };
}

/** Empty-ish check used by display helpers ("—" for null/blank). */
export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

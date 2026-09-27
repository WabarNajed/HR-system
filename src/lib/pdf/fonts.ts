import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Embedded fonts for HTML → PDF (ARCHITECTURE §2): IBM Plex Sans Arabic (Arabic + Latin subsets,
 * weights 400/500/700) as base64 `@font-face` rules, so Chromium shapes Arabic correctly without
 * network or system fonts. Files ship with `@fontsource/ibm-plex-sans-arabic` and are included in
 * the serverless bundle via `outputFileTracingIncludes` (next.config.ts).
 */

export const PDF_FONT_FAMILY = 'IBM Plex Sans Arabic';

const WEIGHTS = [400, 500, 700] as const;
const SUBSETS = [
  // Arabic subset first so Arabic glyphs come from it; Latin from the second face.
  {
    name: 'arabic',
    range: 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC',
  },
  {
    name: 'latin',
    range:
      'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  },
] as const;

function fontDir(): string {
  return path.join(process.cwd(), 'node_modules', '@fontsource', 'ibm-plex-sans-arabic', 'files');
}

let cachedCss: string | null = null;

/** `@font-face` CSS with base64-embedded woff2 files (cached per server process). */
export function pdfFontFaceCss(): string {
  if (cachedCss) return cachedCss;
  const dir = fontDir();
  const rules: string[] = [];
  for (const subset of SUBSETS) {
    for (const weight of WEIGHTS) {
      const file = path.join(dir, `ibm-plex-sans-arabic-${subset.name}-${weight}-normal.woff2`);
      try {
        const data = readFileSync(file).toString('base64');
        rules.push(
          `@font-face{font-family:'${PDF_FONT_FAMILY}';font-style:normal;font-weight:${weight};font-display:block;` +
            `src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${subset.range};}`,
        );
      } catch (error) {
        console.error('[pdf] font file missing:', file, error instanceof Error ? error.message : error);
      }
    }
  }
  cachedCss = rules.join('\n');
  return cachedCss;
}

/** Base document CSS for PDFs: embedded fonts + sane print defaults. */
export function pdfBaseCss(): string {
  return `${pdfFontFaceCss()}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{font-family:'${PDF_FONT_FAMILY}',sans-serif;font-size:11pt;line-height:1.6;color:#0f1b1f;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
[dir=rtl]{text-align:right;} [dir=ltr]{text-align:left;}
.num,.ltr{direction:ltr;unicode-bidi:isolate;}
table{border-collapse:collapse;width:100%;}
thead{display:table-header-group;} tr{page-break-inside:avoid;break-inside:avoid;}
img{max-width:100%;}`;
}

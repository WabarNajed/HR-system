import localFont from 'next/font/local';

/**
 * IBM Plex Sans Arabic, self-hosted from @fontsource (no network at build or runtime).
 * Two faces of the same family: the Arabic subset first, the Latin subset second, so each
 * script is served by the smallest file that covers it. `--font-sans` (globals.css) chains them.
 */
const plexArabic = localFont({
  src: [
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-arabic',
  display: 'swap',
  preload: true,
  // No metric fallback here: a generic fallback face would also match Latin glyphs and shadow
  // the Latin face that follows in the stack.
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FEFC' }],
});

const plexLatin = localFont({
  src: [
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-latin',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
});

/** Class names that define the font CSS variables; apply on <html>. */
export const fontVariables = `${plexArabic.variable} ${plexLatin.variable}`;

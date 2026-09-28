/**
 * Turbopack loader for the BROWSER bundle (wired in next.config.ts): removes zod's
 * `export * as locales from "../locales/index.js";` from `zod/v4/core/index.js` and
 * `zod/v4/{classic,mini}/external.js`. Turbopack keeps namespace re-exports whole, so otherwise all
 * 48 translated error-message packs (~190 KB minified) ship with every form page. The app never
 * reads `z.locales` / `core.locales` (validation messages are i18n keys; English stays the default).
 */
module.exports = function stripZodLocales(source) {
  return source.replace(/^export \* as locales from ["']\.\.\/locales\/index\.js["'];?[ \t]*$/m, '');
};

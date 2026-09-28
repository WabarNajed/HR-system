/**
 * zod v4 "classic" API for the BROWSER bundle — `zod/v4/classic/external.js` without its
 * `export * as locales` (48 translated error-message packs, ~340 KB, never used here: validation
 * messages are i18n keys). Turbopack keeps a namespace re-export whole, so `import { z } from 'zod'`
 * shipped every locale to each form page.
 *
 * Wired up in next.config.ts (`turbopack.resolveAlias.zod.browser` → `./browser.ts`); server code
 * and TypeScript still use the real `zod` entry. Keep in sync with zod's `v4/classic/external.js`
 * when upgrading (a missing export fails loudly in the browser build).
 */
/* eslint-disable import/no-relative-packages */
export * as core from 'zod/v4/core';
export * from '../../../node_modules/zod/v4/classic/schemas.js';
export * from '../../../node_modules/zod/v4/classic/checks.js';
export * from '../../../node_modules/zod/v4/classic/errors.js';
export * from '../../../node_modules/zod/v4/classic/parse.js';
export * from '../../../node_modules/zod/v4/classic/compat.js';
export {
  globalRegistry,
  registry,
  config,
  memoizer,
  $output,
  $input,
  $brand,
  clone,
  regexes,
  treeifyError,
  prettifyError,
  formatError,
  flattenError,
  TimePrecision,
  util,
  NEVER,
  INVALID,
  toZod,
  compile,
  withParser,
  ZodCompileAsyncError,
  ZodCompileUnsupportedError,
  getDiscriminatedOption,
} from 'zod/v4/core';
export { toJSONSchema } from '../../../node_modules/zod/v4/core/json-schema-processors.js';
export { fromJSONSchema } from '../../../node_modules/zod/v4/classic/from-json-schema.js';
export { deepPartial } from '../../../node_modules/zod/v4/classic/deep-partial.js';
export { input, output } from '../../../node_modules/zod/v4/classic/in-out.js';
export { ZodISODateTime, ZodISODate, ZodISOTime, ZodISODuration } from '../../../node_modules/zod/v4/classic/iso.js';
export * as iso from '../../../node_modules/zod/v4/classic/iso.js';
export * as coerce from '../../../node_modules/zod/v4/classic/coerce.js';

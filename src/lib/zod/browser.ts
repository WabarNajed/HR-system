/**
 * Browser entry for `zod` (next.config.ts → `turbopack.resolveAlias.zod.browser`): the regular
 * v4 classic API (`z`, named exports; locale packs stripped by `./strip-locales-loader.cjs`) with
 * zod in `jitless` mode, so it never probes `new Function` — the production Content-Security-Policy
 * has no `'unsafe-eval'` and the swallowed probe would still be reported as a CSP violation.
 * Server code and TypeScript use the real `zod` entry.
 */
import { config } from 'zod/v4/core';

config({ jitless: true });

export * from 'zod/v4';
export { default } from 'zod/v4';

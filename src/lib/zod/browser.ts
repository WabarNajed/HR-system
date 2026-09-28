/**
 * Browser replacement for the `zod` package entry (see `./classic.ts` and next.config.ts):
 * same `z` / named exports, minus the unused locale packs. Also switches zod to `jitless` mode so
 * it never probes `new Function` (the portal's Content-Security-Policy has no `'unsafe-eval'` in
 * production; the caught probe would still be reported as a CSP violation).
 */
import { config } from 'zod/v4/core';
import * as z from './classic';

config({ jitless: true });

export * from './classic';
export { z, z as default };

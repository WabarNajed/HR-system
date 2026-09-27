import type { AnyExportDataset } from '@/lib/export/types';

/**
 * Export datasets of the leave module, served by `GET /api/export/<key>` and registered in
 * `src/lib/export/registry.ts`. Stub — the leave module fills this list (see `@/lib/export/types`).
 */
export const datasets: AnyExportDataset[] = [];

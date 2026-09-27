import type { AnyExportDataset } from '@/lib/export/types';

/**
 * Export datasets of the audit module, served by `GET /api/export/<key>` and registered in
 * `src/lib/export/registry.ts`. Stub — the audit module fills this list (see `@/lib/export/types`).
 */
export const datasets: AnyExportDataset[] = [];

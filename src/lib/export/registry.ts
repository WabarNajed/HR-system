import 'server-only';

import { datasets as auditDatasets } from '@/features/audit/export-datasets';
import { datasets as certificatesDatasets } from '@/features/certificates/export-datasets';
import { datasets as dataManagementDatasets } from '@/features/data-management/export-datasets';
import { datasets as documentsDatasets } from '@/features/documents/export-datasets';
import { datasets as employeesDatasets } from '@/features/employees/export-datasets';
import { datasets as leaveDatasets } from '@/features/leave/export-datasets';
import { datasets as masterDataDatasets } from '@/features/master-data/export-datasets';
import { datasets as reportsDatasets } from '@/features/reports/export-datasets';
import { datasets as requestsDatasets } from '@/features/requests/export-datasets';
import { datasets as usersDatasets } from '@/features/users/export-datasets';
import type { AnyExportDataset } from './types';

/**
 * Export dataset registry — every module's `export-datasets.ts` is listed here once. Modules add
 * datasets in their own file; this registry never needs editing for new datasets.
 */
const ALL: AnyExportDataset[] = [
  ...employeesDatasets,
  ...requestsDatasets,
  ...leaveDatasets,
  ...documentsDatasets,
  ...certificatesDatasets,
  ...usersDatasets,
  ...reportsDatasets,
  ...auditDatasets,
  ...masterDataDatasets,
  ...dataManagementDatasets,
];

const byKey = new Map<string, AnyExportDataset>();
for (const dataset of ALL) {
  if (byKey.has(dataset.key)) {
    console.error(`[export] duplicate dataset key "${dataset.key}" — the first registration wins`);
    continue;
  }
  byKey.set(dataset.key, dataset);
}

export function getExportDataset(key: string): AnyExportDataset | null {
  return byKey.get(key) ?? null;
}

export function listExportDatasets(): AnyExportDataset[] {
  return Array.from(byKey.values());
}

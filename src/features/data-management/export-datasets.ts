import 'server-only';

import { defineDataset, fetchAllPages, type AnyExportDataset } from '@/lib/export/types';
import { isImportType } from './lib/types';
import { HISTORY_FILTERS, HISTORY_SORTS, IMPORT_STATUSES } from './server/queries';

type ImportExportRow = {
  file_name: string;
  import_type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  imported_rows: number;
  created_by: string | null;
};

/** Import history (Administration › Data management). */
export const datasets: AnyExportDataset[] = [
  defineDataset<ImportExportRow & { by: string | null }>({
    key: 'imports',
    permission: 'employees.create',
    titleKey: 'dataManagement.history.title',
    filterKeys: HISTORY_FILTERS,
    allowedSorts: HISTORY_SORTS,
    defaultSort: 'created_at',
    defaultDir: 'desc',
    columns: (t) => [
      { key: 'file_name', header: t('dataManagement.history.columns.file'), width: 34 },
      { key: 'import_type', header: t('dataManagement.history.columns.type'), width: 22, value: (r) => (isImportType(r.import_type) ? t(`dataManagement.types.${r.import_type}.title`) : r.import_type) },
      { key: 'by', header: t('dataManagement.history.columns.by'), width: 26 },
      { key: 'created_at', header: t('dataManagement.history.columns.at'), type: 'datetime' },
      { key: 'completed_at', header: t('dataManagement.history.details.completed'), type: 'datetime' },
      { key: 'total_rows', header: t('dataManagement.report.total'), type: 'integer' },
      { key: 'valid_rows', header: t('dataManagement.report.valid'), type: 'integer' },
      { key: 'warning_rows', header: t('dataManagement.report.warnings'), type: 'integer' },
      { key: 'error_rows', header: t('dataManagement.report.errors'), type: 'integer' },
      { key: 'imported_rows', header: t('dataManagement.report.imported'), type: 'integer' },
      { key: 'status', header: t('dataManagement.history.columns.status'), width: 16, value: (r) => (t.has(`statuses.import.${r.status}`) ? t(`statuses.import.${r.status}`) : r.status) },
    ],
    fetchRows: async (supabase, params, { limit }) => {
      const rows = await fetchAllPages<ImportExportRow>((from, to) => {
        let q = supabase
          .from('imports')
          .select('file_name, import_type, status, created_at, completed_at, total_rows, valid_rows, warning_rows, error_rows, imported_rows, created_by');
        const types = (params.filters.type ?? []).filter(isImportType);
        if (types.length) q = q.in('import_type', types);
        const statuses = (params.filters.status ?? []).filter((s) => (IMPORT_STATUSES as readonly string[]).includes(s));
        if (statuses.length) q = q.in('status', statuses);
        if (params.filters.errors?.includes('1')) q = q.gt('error_rows', 0);
        if (params.q) q = q.ilike('file_name', `%${params.q.replace(/[,()"'*%\\]/g, ' ').trim()}%`);
        return q.order(params.sort ?? 'created_at', { ascending: params.dir === 'asc' }).range(from, to);
      }, limit);
      const ids = Array.from(new Set(rows.map((r) => r.created_by).filter((x): x is string => Boolean(x))));
      const names = new Map<string, string>();
      if (ids.length) {
        const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
        for (const p of data ?? []) names.set(p.id, p.full_name || p.email || '');
      }
      return rows.map((r) => ({ ...r, by: r.created_by ? (names.get(r.created_by) ?? null) : null }));
    },
  }),
];

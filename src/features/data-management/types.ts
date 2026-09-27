import type { ImportSummary } from './lib/store';
import type { ColumnMapping, ImportOptions, ImportType, Issue, JsonCell, MappingSuggestion, RowAction, RowStatus, ValidationTotals } from './lib/types';

/** Sheet & header detection result sent to the wizard. */
export type SheetInspection = {
  sheets: Array<{ index: number; name: string; rows: number; hidden: boolean; score: number }>;
  sheetIndex: number;
  /** 0-based header row. */
  headerRow: number;
  headerRows: 1 | 2;
  /** First rows of the sheet as display strings (row 0 = Excel row 1). */
  preview: string[][];
  records: number;
  skipped: { blank: number; repeated: number; summary: number };
  columns: Array<MappingSuggestion & { letter: string; samples: string[]; filled: number }>;
};

export type ImportStatus = 'uploaded' | 'validated' | 'importing' | 'completed' | 'failed' | 'cancelled';

export type ImportView = {
  id: string;
  type: ImportType;
  fileName: string;
  status: ImportStatus;
  createdAt: string;
  completedAt: string | null;
  createdBy: { name: string | null; email: string | null } | null;
  totals: { total: number; valid: number; warning: number; error: number; imported: number };
  summary: ImportSummary;
  options: ImportOptions | null;
  mapping: { sheet_index: number; header_row: number; header_rows: number; columns: ColumnMapping[] } | null;
};

export type ValidationView = {
  totals: ValidationTotals;
  /** Rows the "Skipped" tab shows (existing records in skip mode, template example rows). */
  skipped: number;
};

export type RowFilter = 'all' | 'valid' | 'warning' | 'error' | 'skipped' | 'imported';

export type ImportRowView = {
  id: string;
  rowNumber: number;
  status: RowStatus;
  action: RowAction;
  title: string;
  subtitle: string | null;
  errors: Issue[];
  warnings: Issue[];
  raw: Record<string, JsonCell>;
  values: Record<string, unknown>;
  extra: Record<string, JsonCell>;
  entityId: string | null;
};

export type ImportRowsPage = { rows: ImportRowView[]; total: number; page: number; pageSize: number };

export type BatchResult = {
  processed: number;
  pending: number;
  imported: number;
  skipped: number;
  failed: number;
  done: boolean;
  status: ImportStatus;
  result: ImportSummary['result'] | null;
};

export type HubStats = {
  imports30: number;
  importsTotal: number;
  records30: number;
  errors30: number;
  last: { type: ImportType; fileName: string; status: ImportStatus; createdAt: string } | null;
};

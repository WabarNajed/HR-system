/**
 * Shared types of the import core (pure TypeScript — used by the server actions, the route
 * handlers and the `pnpm analyze:workbook` / `pnpm import:employees` CLIs).
 */

export const IMPORT_TYPES = [
  'employees',
  'departments',
  'job_titles',
  'locations',
  'cost_centers',
  'leave_balances',
  'dependents',
  'insurance',
  'documents',
  'public_holidays',
] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];

export const MASTER_DATA_TYPES: readonly ImportType[] = ['departments', 'job_titles', 'locations', 'cost_centers', 'public_holidays'];
export const EMPLOYEE_RECORD_TYPES: readonly ImportType[] = ['leave_balances', 'dependents', 'insurance', 'documents'];

export function isImportType(value: unknown): value is ImportType {
  return typeof value === 'string' && (IMPORT_TYPES as readonly string[]).includes(value);
}

/**
 * A JSON-safe cell value. Date cells are stored as ISO strings (`yyyy-MM-dd`, or a full ISO
 * timestamp when the cell carries a time) so parsed workbooks can be persisted as `jsonb`.
 */
export type JsonCell = string | number | boolean | null;

export type ParsedSheet = {
  name: string;
  /** Row-major grid (0-based; Excel row = index + 1). Merged slave cells are null. */
  rows: JsonCell[][];
  /** Merged ranges as 0-based inclusive boxes. */
  merges: Array<{ top: number; left: number; bottom: number; right: number }>;
  /** Hidden sheets are listed but never auto-selected. */
  hidden?: boolean;
};

export type ParsedWorkbook = {
  kind: 'xlsx' | 'csv';
  sheets: ParsedSheet[];
  /** CSV only: detected text encoding. */
  encoding?: string;
};

export type TableColumn = {
  /** 0-based column index in the sheet. */
  index: number;
  /** Header label as shown in the file (or `Column F` when the header cell is empty). */
  label: string;
  /** True when the header cell was empty. */
  generated: boolean;
};

export type TableRow = {
  /** Excel row number (1-based) — what the user sees in the spreadsheet. */
  rowNumber: number;
  cells: JsonCell[];
};

export type ExtractedTable = {
  headerRow: number;
  /** Two-row headers (merged group header + sub header) combined into one label. */
  headerRows: number;
  columns: TableColumn[];
  rows: TableRow[];
  /** Rows skipped because they were blank or repeated the header. */
  skippedBlank: number;
  skippedRepeatedHeader: number;
  /** Footer rows such as "Total / الإجمالي". */
  skippedSummary: number;
};

/** Special mapping targets. */
export const IGNORE = '__ignore' as const;
/** Unmapped column kept verbatim in `employees.extra_data` (employees only). */
export const EXTRA = '__extra' as const;

export type MappingTarget = string | typeof IGNORE | typeof EXTRA;

export type ColumnMapping = {
  index: number;
  label: string;
  target: MappingTarget;
};

export type MappingSuggestion = ColumnMapping & {
  /** 0..1 — 1 = exact header match. 0 when nothing matched. */
  confidence: number;
  /** How the suggestion was made. */
  method: 'exact' | 'synonym' | 'partial' | 'values' | 'none';
};

export type ImportOptions = {
  /** Existing records (matched by employee number / Iqama, code, …): update them or leave them untouched. */
  existing: 'update' | 'skip';
  /** Create departments / job titles / locations / cost centers referenced by name that don't exist yet. */
  createMissingMasterData: boolean;
  /** Employees: create/assign a job title from the Iqama profession when no job title column is mapped. */
  professionAsJobTitle: boolean;
  /** Employees: status for new employees when the file has no status column. */
  defaultEmploymentStatus: 'active' | 'probation' | 'on_leave' | 'suspended' | 'resigned' | 'terminated';
  /**
   * Employees' "Leave balance" column: `available` = the balance the employee has now (opening = value,
   * entitlement = 0); `carryover` = carried-over days (opening = value, entitlement = leave type default).
   */
  leaveBalanceMode: 'available' | 'carryover';
  /** Leave balance year (defaults to the current year). */
  leaveYear: number;
};

export function defaultImportOptions(year: number = new Date().getFullYear()): ImportOptions {
  return {
    existing: 'skip',
    createMissingMasterData: true,
    professionAsJobTitle: false,
    defaultEmploymentStatus: 'active',
    leaveBalanceMode: 'available',
    leaveYear: year,
  };
}

export type IssueLevel = 'error' | 'warning' | 'info';

/**
 * A validation message. `code` is translated with `dataManagement.issues.<code>` and `params`
 * (field labels are resolved from `field`).
 */
export type Issue = {
  level: IssueLevel;
  code: string;
  field?: string;
  /** Header label of the source column. */
  column?: string;
  value?: string;
  params?: Record<string, string | number>;
};

export type RowAction = 'create' | 'update' | 'skip';

export type RowStatus = 'valid' | 'warning' | 'error' | 'imported' | 'skipped';

export type RowResult = {
  rowNumber: number;
  /** Header label → original cell value. */
  raw: Record<string, JsonCell>;
  /** Normalized values keyed by field + resolution metadata (`__action`, `__match_id`, …). */
  mapped: Record<string, unknown>;
  status: RowStatus;
  action: RowAction;
  errors: Issue[];
  warnings: Issue[];
};

export type ValidationTotals = {
  total: number;
  valid: number;
  warning: number;
  error: number;
  create: number;
  update: number;
  skip: number;
};

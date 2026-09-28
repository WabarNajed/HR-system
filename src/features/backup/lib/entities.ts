/**
 * Tables included in the backup package, grouped for the UI. Each table is exported as
 * `json/<table>.json` and `xlsx/<table>.xlsx` with its raw column names (restorable), plus a
 * `manifest.json` with counts. Compensation and bank accounts are only included for a super admin.
 */
export type BackupGroup = 'organization' | 'people' | 'structure' | 'leave' | 'requests' | 'certificates' | 'configuration';

export type BackupTable = {
  table: string;
  /** Relation to read from when it differs from `table` (e.g. the column-masked `employee_records` view). */
  source?: string;
  group: BackupGroup;
  /** Stable order column for paging. */
  order: string;
  /** Salary and bank data: super admin only. */
  sensitive?: boolean;
};

export const BACKUP_TABLES: readonly BackupTable[] = [
  { table: 'organizations', group: 'organization', order: 'id' },
  { table: 'organization_settings', group: 'organization', order: 'id' },
  { table: 'system_settings', group: 'organization', order: 'key' },

  { table: 'employees', source: 'employee_records', group: 'people', order: 'id' },
  { table: 'employee_compensation', group: 'people', order: 'employee_id', sensitive: true },
  { table: 'employee_bank_accounts', group: 'people', order: 'id', sensitive: true },
  { table: 'employee_dependents', group: 'people', order: 'id' },
  { table: 'employee_insurance', group: 'people', order: 'id' },
  { table: 'employee_documents', group: 'people', order: 'id' },

  { table: 'departments', group: 'structure', order: 'id' },
  { table: 'job_titles', group: 'structure', order: 'id' },
  { table: 'locations', group: 'structure', order: 'id' },
  { table: 'cost_centers', group: 'structure', order: 'id' },
  { table: 'public_holidays', group: 'structure', order: 'id' },

  { table: 'leave_types', group: 'leave', order: 'id' },
  { table: 'leave_balances', group: 'leave', order: 'id' },
  { table: 'leave_adjustments', group: 'leave', order: 'id' },
  { table: 'leave_requests', group: 'leave', order: 'id' },

  { table: 'hr_requests', group: 'requests', order: 'id' },
  { table: 'hr_request_values', group: 'requests', order: 'id' },
  { table: 'request_history', group: 'requests', order: 'id' },
  { table: 'request_comments', group: 'requests', order: 'id' },
  { table: 'request_approvals', group: 'requests', order: 'id' },
  { table: 'request_attachments', group: 'requests', order: 'id' },

  { table: 'certificates', group: 'certificates', order: 'id' },
  { table: 'certificate_templates', group: 'certificates', order: 'id' },
  { table: 'certificate_template_versions', group: 'certificates', order: 'id' },

  { table: 'request_types', group: 'configuration', order: 'id' },
  { table: 'request_fields', group: 'configuration', order: 'id' },
  { table: 'request_workflows', group: 'configuration', order: 'id' },
  { table: 'request_workflow_steps', group: 'configuration', order: 'id' },
  { table: 'email_templates', group: 'configuration', order: 'id' },
  { table: 'notification_settings', group: 'configuration', order: 'id' },
  { table: 'roles', group: 'configuration', order: 'id' },
  { table: 'role_permissions', group: 'configuration', order: 'id' },
  // Portal accounts (which user is linked to which employee, status, language) — no passwords.
  { table: 'profiles', group: 'configuration', order: 'id' },
  { table: 'user_roles', group: 'configuration', order: 'id' },
];

export const BACKUP_GROUPS: readonly BackupGroup[] = ['organization', 'people', 'structure', 'leave', 'requests', 'certificates', 'configuration'];

export const BACKUP_FORMAT = 'hr-portal-backup';
export const BACKUP_VERSION = 1;

export function backupTablesFor(includeSensitive: boolean): BackupTable[] {
  return BACKUP_TABLES.filter((t) => includeSensitive || !t.sensitive);
}

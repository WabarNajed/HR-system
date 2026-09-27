/**
 * Audit action vocabulary (isomorphic): categories, tones, translated labels and entity links.
 *
 * Actions are dot-namespaced `<entity>.<verb>` (docs/DATABASE.md §12): row triggers write
 * `<entity>.create|update|delete|archive|restore`, RPCs and the app write `request.approve`,
 * `auth.login`, `export.<dataset>`, `import.*`, `backup.*` … New actions keep working: labels fall
 * back to "<entity> <verb>" and finally to the raw code.
 */

export const AUDIT_CATEGORIES = ['access', 'employees', 'requests', 'leave', 'documents', 'configuration', 'data'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Action prefixes (`<prefix>.`) per category — used for grouping and the server-side filter. */
export const AUDIT_CATEGORY_PREFIXES: Record<AuditCategory, readonly string[]> = {
  access: ['auth', 'user', 'user_role', 'role', 'role_permission', 'profile', 'registration'],
  employees: ['employee', 'employee_compensation', 'employee_bank_account', 'employee_insurance', 'employee_dependent'],
  requests: ['request', 'hr_request'],
  leave: ['leave_balance', 'leave_adjustment', 'leave_request'],
  documents: ['employee_document', 'document', 'certificate'],
  configuration: [
    'organization',
    'organization_settings',
    'system_setting',
    'department',
    'job_title',
    'location',
    'cost_center',
    'leave_type',
    'public_holiday',
    'request_type',
    'request_field',
    'request_workflow',
    'request_workflow_step',
    'certificate_template',
    'email_template',
    'notification_setting',
  ],
  data: ['export', 'import', 'backup'],
};

export function isAuditCategory(value: unknown): value is AuditCategory {
  return typeof value === 'string' && (AUDIT_CATEGORIES as readonly string[]).includes(value);
}

export function splitAction(action: string): { entity: string; verb: string } {
  const i = action.indexOf('.');
  if (i < 0) return { entity: action, verb: '' };
  return { entity: action.slice(0, i), verb: action.slice(i + 1) };
}

export function auditCategory(action: string): AuditCategory | null {
  if (action === 'organization.reset') return 'data';
  const { entity } = splitAction(action);
  for (const category of AUDIT_CATEGORIES) {
    if (AUDIT_CATEGORY_PREFIXES[category].includes(entity)) return category;
  }
  return null;
}

export type AuditTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'secondary';

const VERB_TONES: Record<string, AuditTone> = {
  create: 'success',
  approve: 'success',
  enable: 'success',
  complete: 'success',
  restore: 'info',
  update: 'info',
  roles_update: 'info',
  start: 'info',
  submit: 'primary',
  resubmit: 'primary',
  invite: 'primary',
  initialize: 'primary',
  login: 'neutral',
  logout: 'neutral',
  password_changed: 'neutral',
  comment: 'neutral',
  reassign: 'secondary',
  return: 'warning',
  request_info: 'warning',
  archive: 'warning',
  cancel: 'neutral',
  delete: 'danger',
  reject: 'danger',
  disable: 'danger',
  revoke: 'danger',
  reset: 'danger',
};

export function auditTone(action: string): AuditTone {
  const { entity, verb } = splitAction(action);
  if (entity === 'export') return 'secondary';
  if (entity === 'import' || entity === 'backup') return 'primary';
  return VERB_TONES[verb] ?? 'neutral';
}

/** Minimal translator shape (next-intl `t` or `LooseTranslator`), rooted at the message root. */
export type AuditTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has: (key: string) => boolean;
};

export function auditEntityLabel(t: AuditTranslator, entity: string | null | undefined): string {
  if (!entity) return '';
  const key = `audit.entities.${entity}`;
  return t.has(key) ? t(key) : entity;
}

/** Human label for an action: explicit override → "<entity> <verb>" pattern → raw code. */
export function auditActionLabel(t: AuditTranslator, action: string): string {
  const { entity, verb } = splitAction(action);
  const exact = `audit.actionLabels.${entity}.${verb}`;
  if (verb && t.has(exact)) return t(exact);
  const entityWide = `audit.actionLabels.${entity}.any`;
  if (t.has(entityWide)) return t(entityWide);
  const verbKey = `audit.verbs.${verb}`;
  const entityKey = `audit.entities.${entity}`;
  if (verb && t.has(verbKey) && t.has(entityKey)) {
    return t('audit.actionPattern', { entity: t(entityKey), verb: t(verbKey) });
  }
  return action;
}

export function auditCategoryLabel(t: AuditTranslator, category: AuditCategory): string {
  return t(`audit.categories.${category}`);
}

/** Minimal row shape needed to link an audit event to its record. */
export type AuditLinkRow = {
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  employee_id: string | null;
  summary: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SETTINGS_ROUTES: Record<string, string> = {
  organization: '/settings/organization',
  organization_settings: '/settings/organization',
  system_setting: '/settings/security',
  department: '/settings/departments',
  job_title: '/settings/job-titles',
  location: '/settings/locations',
  cost_center: '/settings/cost-centers',
  leave_type: '/settings/leave-types',
  public_holiday: '/settings/public-holidays',
  request_type: '/settings/request-types',
  request_field: '/settings/form-builder',
  request_workflow: '/settings/workflows',
  request_workflow_step: '/settings/workflows',
  certificate_template: '/settings/certificate-templates',
  email_template: '/settings/email-templates',
  notification_setting: '/settings/notifications',
  role: '/settings/roles',
  role_permission: '/settings/roles',
  user_role: '/settings/users',
  import: '/admin/data-management',
  backup: '/admin/backup',
};

const EMPLOYEE_SUB_TABS: Record<string, string> = {
  employee_document: 'documents',
  employee_dependent: 'dependents',
  employee_insurance: 'insurance',
  employee_compensation: 'compensation',
  employee_bank_account: 'bank',
  leave_adjustment: 'leave',
  leave_balance: 'leave',
};

/**
 * Route of the record an event concerns (or null). The caller must still check the viewer's
 * access to the route (`checkAccess(ctx, ROUTE_ACCESS[path])`) before rendering a link.
 */
export function auditEntityHref(row: AuditLinkRow): string | null {
  const type = row.entity_type ?? splitAction(row.action).entity;
  const id = row.entity_id ?? '';
  if (type === 'hr_request' && UUID_RE.test(id)) return `/requests/${id}`;
  if (type === 'employee' && UUID_RE.test(id)) return `/employees/${id}`;
  if (type && EMPLOYEE_SUB_TABS[type] && row.employee_id) return `/employees/${row.employee_id}?tab=${EMPLOYEE_SUB_TABS[type]}`;
  if (type === 'certificate' && row.summary) return `/certificates?q=${encodeURIComponent(row.summary)}`;
  if (type === 'profile' || type === 'user') {
    if (row.action.startsWith('registration.')) return '/settings/pending-registrations';
    return row.summary && row.summary.includes('@') ? `/settings/users?q=${encodeURIComponent(row.summary)}` : '/settings/users';
  }
  if (type && SETTINGS_ROUTES[type]) return SETTINGS_ROUTES[type];
  if (row.employee_id) return `/employees/${row.employee_id}`;
  return null;
}

/** Path part of an href (for ROUTE_ACCESS lookups). Dynamic segments map to their `[id]` pattern. */
export function routePattern(href: string): string {
  const path = href.split('?')[0]!;
  return path.replace(/^\/(employees|requests)\/[0-9a-f-]{36}$/i, '/$1/[id]');
}

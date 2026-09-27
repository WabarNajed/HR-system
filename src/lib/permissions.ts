/**
 * Permission model (ARCHITECTURE §6 "Identity & access"). Shared by server and client code.
 *
 *   permission = `<module>.<action>` e.g. `employees.view`, `requests.approve`
 *
 * Authorization is enforced by RLS + security-definer RPCs in the database AND by
 * `requirePermission()` on the server. Client checks (`usePermissions`, `PermissionGate`) are
 * cosmetic only.
 */

export const MODULES = [
  'employees',
  'personal_data',
  'bank',
  'insurance',
  'documents',
  'requests',
  'approvals',
  'leave',
  'certificates',
  'reports',
  'settings',
  'audit',
  'users',
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'approve', 'export', 'administer'] as const;
export type Action = (typeof ACTIONS)[number];

export type Permission = `${Module}.${Action}`;

/** System roles (custom roles may exist too — their keys are plain strings). */
export const ROLE_KEYS = ['super_admin', 'hr_admin', 'hr_officer', 'manager', 'employee'] as const;
export type SystemRoleKey = (typeof ROLE_KEYS)[number];
export type RoleKey = SystemRoleKey | (string & {});

/** Roles that make a user "HR" (mirrors `private.is_hr()`). */
export const HR_ROLE_KEYS: readonly SystemRoleKey[] = ['super_admin', 'hr_admin', 'hr_officer'];

/** Display priority used to pick the user's primary role (lower index = higher priority). */
const ROLE_PRIORITY: readonly string[] = ['super_admin', 'hr_admin', 'hr_officer', 'manager', 'employee'];

export const ALL_PERMISSIONS: readonly Permission[] = MODULES.flatMap((m) => ACTIONS.map((a) => `${m}.${a}` as Permission));

export function isModule(value: unknown): value is Module {
  return typeof value === 'string' && (MODULES as readonly string[]).includes(value);
}

export function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

export function isPermission(value: unknown): value is Permission {
  if (typeof value !== 'string') return false;
  const [m, a, extra] = value.split('.');
  return extra === undefined && isModule(m) && isAction(a);
}

export function toPermission(module: Module, action: Action): Permission {
  return `${module}.${action}`;
}

export function parsePermission(value: string): { module: Module; action: Action } | null {
  if (!isPermission(value)) return null;
  const [module, action] = value.split('.') as [Module, Action];
  return { module, action };
}

export function isSystemRole(value: unknown): value is SystemRoleKey {
  return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}

/** Picks the most significant role for display (super_admin > hr_admin > hr_officer > manager > employee > custom). */
export function pickPrimaryRole<R extends string>(roles: readonly R[]): R | null {
  if (!roles.length) return null;
  const sorted = [...roles].sort((a, b) => {
    const ia = ROLE_PRIORITY.indexOf(a);
    const ib = ROLE_PRIORITY.indexOf(b);
    return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib) || a.localeCompare(b);
  });
  return sorted[0] ?? null;
}

/** Minimal shape needed for checks — satisfied by `SessionContext` and the client permissions context. */
export type PermissionSubject = {
  permissions: ReadonlySet<string>;
  isSuperAdmin: boolean;
  roles?: readonly string[];
  isManager?: boolean;
  isHR?: boolean;
};

/** `can(ctx, 'employees.view')` — super admins can do everything. */
export function can(subject: PermissionSubject | null | undefined, permission: Permission): boolean {
  if (!subject) return false;
  return subject.isSuperAdmin || subject.permissions.has(permission);
}

/** True when ANY of the permissions is granted. Empty list → true. */
export function hasAny(subject: PermissionSubject | null | undefined, permissions: readonly Permission[]): boolean {
  if (!subject) return false;
  if (!permissions.length) return true;
  return permissions.some((p) => can(subject, p));
}

/** True when ALL of the permissions are granted. */
export function hasAll(subject: PermissionSubject | null | undefined, permissions: readonly Permission[]): boolean {
  if (!subject) return false;
  return permissions.every((p) => can(subject, p));
}

/** True when the user has ANY of the roles (super admins pass every role check). */
export function hasRole(subject: PermissionSubject | null | undefined, ...roles: RoleKey[]): boolean {
  if (!subject) return false;
  if (subject.isSuperAdmin) return true;
  return roles.some((r) => subject.roles?.includes(r));
}

/**
 * Declarative access rule used by the navigation config, page guards and settings console.
 * Semantics: allowed when the user is a super admin, OR matches ANY of the listed criteria.
 * An empty rule (`{}`) means "any active user".
 */
export type AccessRule = {
  /** Allowed with ANY of these permissions. */
  anyOf?: readonly Permission[];
  /** Allowed with ANY of these roles. */
  roles?: readonly RoleKey[];
  /** Allowed for managers (manager role or has direct reports). */
  managers?: boolean;
  /** Allowed for HR users (super_admin / hr_admin / hr_officer). */
  hr?: boolean;
  /** Only super admins (overrides everything else). */
  superAdminOnly?: boolean;
};

export function checkAccess(subject: PermissionSubject | null | undefined, rule: AccessRule | undefined): boolean {
  if (!subject) return false;
  if (!rule) return true;
  if (subject.isSuperAdmin) return true;
  if (rule.superAdminOnly) return false;
  const hasCriteria = Boolean(rule.anyOf?.length || rule.roles?.length || rule.managers || rule.hr);
  if (!hasCriteria) return true;
  if (rule.anyOf?.length && hasAny(subject, rule.anyOf)) return true;
  if (rule.roles?.length && rule.roles.some((r) => subject.roles?.includes(r))) return true;
  if (rule.managers && subject.isManager) return true;
  if (rule.hr && subject.isHR) return true;
  return false;
}

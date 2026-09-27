'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Client-side permission context (cosmetic only — authorization is enforced by RLS and
 * `requirePermission()` on the server). The authenticated layout provides the current user's
 * permissions once:
 *
 *   <PermissionsProvider permissions={['employees.view', 'requests.approve']} roles={['hr_admin']}>
 *
 * Permission strings are `<module>.<action>` (see ARCHITECTURE §6: modules × actions).
 */
export type PermissionKey = `${string}.${string}`;

type PermissionsContextValue = {
  permissions: ReadonlySet<string>;
  roles: readonly string[];
  isSuperAdmin: boolean;
  can: (permission: PermissionKey) => boolean;
  hasRole: (role: string) => boolean;
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export type PermissionsProviderProps = {
  permissions: readonly string[];
  roles?: readonly string[];
  children: ReactNode;
};

export function PermissionsProvider({ permissions, roles = [], children }: PermissionsProviderProps) {
  const value = useMemo<PermissionsContextValue>(() => {
    const set = new Set(permissions);
    const isSuperAdmin = roles.includes('super_admin');
    return {
      permissions: set,
      roles,
      isSuperAdmin,
      can: (permission) => isSuperAdmin || set.has(permission),
      hasRole: (role) => roles.includes(role),
    };
  }, [permissions, roles]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/** Access the current user's permissions. Outside a provider everything is denied. */
export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (ctx) return ctx;
  return {
    permissions: new Set(),
    roles: [],
    isSuperAdmin: false,
    can: () => false,
    hasRole: () => false,
  };
}

export type PermissionGateProps = {
  /** Required permission, e.g. `employees.edit`. */
  permission?: PermissionKey;
  /** Passes when ANY of these permissions is granted. */
  anyOf?: PermissionKey[];
  /** Passes when the user has ANY of these roles. */
  roles?: string[];
  /** Rendered when not allowed (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
};

/** Renders children only when the current user is allowed. */
export function PermissionGate({ permission, anyOf, roles, fallback = null, children }: PermissionGateProps) {
  const { can, hasRole, isSuperAdmin } = usePermissions();
  let allowed = true;
  if (permission) allowed = allowed && can(permission);
  if (anyOf?.length) allowed = allowed && anyOf.some((p) => can(p));
  if (roles?.length) allowed = allowed && (isSuperAdmin || roles.some((r) => hasRole(r)));
  return <>{allowed ? children : fallback}</>;
}

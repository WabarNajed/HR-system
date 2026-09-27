/**
 * Who may import what (isomorphic — used by pages, actions, route handlers and client UI).
 * Mirrors the database: `imports` rows need org `employees.create` or `settings.edit`
 * (private.can_import), and each target table has its own RLS write rule.
 */
import { can, hasAny, type Permission, type PermissionSubject } from '@/lib/permissions';
import { IMPORT_TYPES, type ImportType } from './lib/types';

export const IMPORT_ACCESS: readonly Permission[] = ['employees.create', 'settings.edit'];

export const IMPORT_TYPE_PERMISSIONS: Record<ImportType, { create: readonly Permission[]; update: readonly Permission[] }> = {
  employees: { create: ['employees.create'], update: ['employees.edit'] },
  departments: { create: ['settings.edit'], update: ['settings.edit'] },
  job_titles: { create: ['settings.edit'], update: ['settings.edit'] },
  locations: { create: ['settings.edit'], update: ['settings.edit'] },
  cost_centers: { create: ['settings.edit'], update: ['settings.edit'] },
  public_holidays: { create: ['settings.edit'], update: ['settings.edit'] },
  leave_balances: { create: ['leave.edit'], update: ['leave.edit'] },
  dependents: { create: ['personal_data.create', 'personal_data.edit'], update: ['personal_data.edit'] },
  insurance: { create: ['insurance.create', 'insurance.edit'], update: ['insurance.edit'] },
  documents: { create: ['documents.create'], update: ['documents.edit'] },
};

export function canUseImports(subject: PermissionSubject | null | undefined): boolean {
  return hasAny(subject, IMPORT_ACCESS);
}

export function canImportType(subject: PermissionSubject | null | undefined, type: ImportType): boolean {
  return canUseImports(subject) && hasAny(subject, IMPORT_TYPE_PERMISSIONS[type].create);
}

export function canUpdateExisting(subject: PermissionSubject | null | undefined, type: ImportType): boolean {
  return hasAny(subject, IMPORT_TYPE_PERMISSIONS[type].update);
}

export function allowedImportTypes(subject: PermissionSubject | null | undefined): ImportType[] {
  return IMPORT_TYPES.filter((t) => canImportType(subject, t));
}

/** Capabilities that change validation/options for the actor. */
export function importCapabilities(subject: PermissionSubject | null | undefined) {
  return {
    settingsEdit: can(subject, 'settings.edit'),
    leaveEdit: can(subject, 'leave.edit'),
    personalDataEdit: can(subject, 'personal_data.edit'),
  };
}

export type ImportCapabilities = ReturnType<typeof importCapabilities>;

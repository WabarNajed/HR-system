import 'server-only';

import { cache } from 'react';
import type { SessionContext } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { DocumentAccess } from './types';

const NONE = { view: false, create: false, edit: false, approve: false, export: false } as const;

/**
 * Org-scope document permissions of the caller — mirrors `private.has_org_permission('documents', …)`:
 * only roles with `data_scope = 'organization'` reach every employee's documents (an employee's own
 * `documents.view` is self-service only). Memoized per request.
 */
export const getDocumentAccess = cache(async (ctx: SessionContext): Promise<DocumentAccess> => {
  const ownEmployeeId = ctx.profile.employeeId ?? ctx.employee?.id ?? null;
  if (ctx.profile.status !== 'active') return { ...NONE, ownEmployeeId: null };
  if (ctx.isSuperAdmin) return { view: true, create: true, edit: true, approve: true, export: true, ownEmployeeId };

  const orgRoles = ctx.roleDetails.filter((r) => r.dataScope === 'organization').map((r) => r.key);
  if (!orgRoles.length) return { ...NONE, ownEmployeeId };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('role_permissions')
    .select('action, roles!inner(key)')
    .eq('module', 'documents')
    .in('roles.key', orgRoles);
  if (error) {
    console.error('[documents] access lookup failed:', error.code, error.message);
    return { ...NONE, ownEmployeeId };
  }
  const actions = new Set((data ?? []).map((row) => (row as { action: string }).action));
  return {
    view: actions.has('view'),
    create: actions.has('create'),
    edit: actions.has('edit'),
    approve: actions.has('approve') || actions.has('edit'),
    export: actions.has('export') && ctx.permissions.has('documents.export'),
    ownEmployeeId,
  };
});

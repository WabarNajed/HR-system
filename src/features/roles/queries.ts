import 'server-only';

import { listRoles } from '@/features/users/queries';
import type { RoleOption } from '@/features/users/types';
import { isPermission, type Permission } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export type RoleWithPermissions = RoleOption & { permissions: Permission[] };

/** Every role with its permission set (small: roles × 78 rows at most). RLS: any active user may read. */
export async function listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const supabase = await createClient();
  const [roles, perms] = await Promise.all([listRoles(supabase), supabase.from('role_permissions').select('role_id, module, action')]);
  if (perms.error) throw perms.error;
  const byRole = new Map<string, Permission[]>();
  for (const p of perms.data ?? []) {
    const key = `${p.module}.${p.action}`;
    if (!isPermission(key)) continue;
    const list = byRole.get(p.role_id) ?? [];
    list.push(key);
    byRole.set(p.role_id, list);
  }
  return roles.map((r) => ({ ...r, permissions: byRole.get(r.id) ?? [] }));
}

/** A few members of a role for the preview list. */
export async function listRoleMembers(roleId: string, limit = 6): Promise<{ id: string; fullName: string | null; email: string | null; status: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user:profiles!user_id(id, full_name, email, status)')
    .eq('role_id', roleId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .map((r) => r.user as unknown as { id: string; full_name: string | null; email: string | null; status: string } | null)
    .filter((u): u is { id: string; full_name: string | null; email: string | null; status: string } => Boolean(u))
    .map((u) => ({ id: u.id, fullName: u.full_name, email: u.email, status: u.status }));
}

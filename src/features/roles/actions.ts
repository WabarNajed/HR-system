'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { parsePermission, type Permission } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { createRoleSchema, deleteRoleSchema, savePermissionsSchema, updateRoleSchema } from './schemas';

/**
 * Roles & permissions Server Actions (`users.administer`). Writes go through the caller's RLS client:
 * the database also protects the super_admin role's permissions, system role keys, data-scope
 * changes (super admin only) and deletion of roles that still have members.
 */

function revalidateRoles() {
  revalidatePath('/settings/roles');
  revalidatePath('/settings/users');
}

/** `Payroll Specialist` → `payroll_specialist`; non-Latin names fall back to `custom_role`. */
function slugifyKey(nameEn: string): string {
  const base = nameEn
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const withLetter = /^[a-z]/.test(base) ? base : base ? `role_${base}` : 'custom_role';
  return withLetter.length >= 2 ? withLetter : `${withLetter}_role`;
}

export const createRoleAction = withAction(
  createRoleSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'users.administer');
    if (input.dataScope === 'organization' && !ctx.isSuperAdmin) throw new ActionError('roles.errors.organizationScope');
    const supabase = await createClient();

    const base = slugifyKey(input.nameEn || '');
    const { data: existing, error: existingError } = await supabase.from('roles').select('key').like('key', `${base}%`);
    if (existingError) throw existingError;
    const taken = new Set((existing ?? []).map((r) => r.key));
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

    const { data: maxRank } = await supabase.from('roles').select('rank').eq('is_system', false).order('rank', { ascending: false }).limit(1).maybeSingle();
    const { data: role, error } = await supabase
      .from('roles')
      .insert({
        key,
        name_ar: input.nameAr || input.nameEn,
        name_en: input.nameEn || input.nameAr,
        description_ar: input.descriptionAr ?? null,
        description_en: input.descriptionEn ?? null,
        data_scope: input.dataScope,
        rank: Math.min(((maxRank as { rank?: number } | null)?.rank ?? 10) + 1, 39),
      })
      .select('id, key')
      .single();
    if (error) throw error;

    if (input.copyFromRoleId) {
      const { data: source, error: sourceError } = await supabase.from('role_permissions').select('module, action').eq('role_id', input.copyFromRoleId);
      if (sourceError) throw sourceError;
      if (source?.length) {
        const { error: copyError } = await supabase.from('role_permissions').insert(source.map((p) => ({ role_id: role.id, module: p.module, action: p.action })));
        if (copyError) throw copyError;
      }
    }
    revalidateRoles();
    return ok({ key: role.key }, 'roles.toast.created');
  },
  { scope: 'roles.create' },
);

export const updateRoleAction = withAction(
  updateRoleSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'users.administer');
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase.from('roles').select('key, data_scope').eq('id', input.roleId).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new ActionError('errors.notFound');
    if (current.key === 'super_admin' && !ctx.isSuperAdmin) throw new ActionError('roles.errors.superAdminLocked');
    if (current.data_scope !== input.dataScope && !ctx.isSuperAdmin) throw new ActionError('roles.errors.organizationScope');
    const { error } = await supabase
      .from('roles')
      .update({
        name_ar: input.nameAr || input.nameEn,
        name_en: input.nameEn || input.nameAr,
        description_ar: input.descriptionAr ?? null,
        description_en: input.descriptionEn ?? null,
        data_scope: input.dataScope,
      })
      .eq('id', input.roleId);
    if (error) throw error;
    revalidateRoles();
    return ok(undefined, 'roles.toast.updated');
  },
  { scope: 'roles.update' },
);

export const deleteRoleAction = withAction(
  deleteRoleSchema,
  async ({ roleId }, { ctx }) => {
    requirePermissionIn(ctx, 'users.administer');
    const supabase = await createClient();
    const { data: role, error: readError } = await supabase.from('roles').select('key, is_system, user_roles(count)').eq('id', roleId).maybeSingle();
    if (readError) throw readError;
    if (!role) throw new ActionError('errors.notFound');
    if (role.is_system) throw new ActionError('errors.systemRecord');
    const members = (role as unknown as { user_roles: { count: number }[] | null }).user_roles?.[0]?.count ?? 0;
    if (members > 0) throw new ActionError('roles.errors.inUse');
    const { error } = await supabase.from('roles').delete().eq('id', roleId);
    if (error) throw error;
    revalidateRoles();
    return ok(undefined, 'roles.toast.deleted');
  },
  { scope: 'roles.delete' },
);

/** Replaces a role's permission set (diffed: only added rows are inserted, removed rows deleted). */
export const saveRolePermissionsAction = withAction(
  savePermissionsSchema,
  async ({ roleId, permissions }, { ctx }) => {
    requirePermissionIn(ctx, 'users.administer');
    const supabase = await createClient();
    const { data: role, error: roleError } = await supabase.from('roles').select('key, name_en').eq('id', roleId).maybeSingle();
    if (roleError) throw roleError;
    if (!role) throw new ActionError('errors.notFound');
    if (role.key === 'super_admin') throw new ActionError('roles.errors.superAdminLocked');

    const { data: currentRows, error: currentError } = await supabase.from('role_permissions').select('id, module, action').eq('role_id', roleId);
    if (currentError) throw currentError;
    const current = new Map((currentRows ?? []).map((r) => [`${r.module}.${r.action}`, r.id]));
    const wanted = new Set(permissions as Permission[]);
    const added = [...wanted].filter((p) => !current.has(p));
    const removed = [...current.keys()].filter((p) => !wanted.has(p as Permission));

    if (removed.length) {
      const { error } = await supabase
        .from('role_permissions')
        .delete()
        .in(
          'id',
          removed.map((p) => current.get(p)!),
        );
      if (error) throw error;
    }
    if (added.length) {
      const rows = added.map((p) => {
        const parsed = parsePermission(p)!;
        return { role_id: roleId, module: parsed.module, action: parsed.action };
      });
      const { error } = await supabase.from('role_permissions').insert(rows);
      if (error) throw error;
    }
    if (added.length || removed.length) {
      await logAuditEvent(
        { action: 'role.permissions_update', entityType: 'role', entityId: roleId, summary: role.key, changes: { added, removed } },
        supabase,
      );
    }
    revalidateRoles();
    return ok({ added: added.length, removed: removed.length }, 'roles.toast.permissionsSaved');
  },
  { scope: 'roles.savePermissions' },
);

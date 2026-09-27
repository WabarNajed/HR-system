'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { toIlikePattern } from '@/lib/list-params';
import { hasAny } from '@/lib/permissions';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import { MASTER_ENTITY_CONFIG, type MasterEntity } from './config';
import { employeeSearchSchema, masterDataIdSchema, saveMasterDataSchema, setActiveSchema } from './schemas';

/**
 * Master data mutations (departments, job titles, locations, cost centers). Writes need
 * `settings.edit` (checked here and by RLS). Row changes are audited by the DB triggers.
 */

/** Loosely-typed table handle: the four tables share the columns written here. */
function table(supabase: ServerSupabaseClient, entity: MasterEntity) {
  return supabase.from(entity as 'job_titles');
}

/** `ilike` pattern for an exact, case-insensitive match (escapes `%`, `_` and `\`). */
function exactPattern(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function blankToNull(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v ? v : null;
}

function revalidate(entity: MasterEntity) {
  revalidatePath(MASTER_ENTITY_CONFIG[entity].route);
  revalidatePath('/settings');
}

async function assertUnique(
  supabase: ServerSupabaseClient,
  entity: MasterEntity,
  id: string | null,
  field: 'code' | 'name_ar' | 'name_en',
  value: string | null,
): Promise<boolean> {
  if (!value) return true;
  let query = table(supabase, entity).select('id').ilike(field, exactPattern(value)).limit(1);
  if (id) query = query.neq('id', id);
  const { data, error } = await query;
  if (error) throw error;
  return !data?.length;
}

export const saveMasterData = withAction(
  saveMasterDataSchema,
  async ({ entity, id, values }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const config = MASTER_ENTITY_CONFIG[entity];
    const supabase = await createClient();

    const code = blankToNull(values.code);
    const nameAr = blankToNull(values.nameAr);
    const nameEn = blankToNull(values.nameEn);

    const fieldErrors: Record<string, string> = {};
    const [codeFree, arFree, enFree] = await Promise.all([
      assertUnique(supabase, entity, id, 'code', code),
      assertUnique(supabase, entity, id, 'name_ar', nameAr),
      assertUnique(supabase, entity, id, 'name_en', nameEn),
    ]);
    if (!codeFree) fieldErrors.code = 'validation.codeTaken';
    if (!arFree) fieldErrors.nameAr = 'masterData.errors.nameTaken';
    if (!enFree) fieldErrors.nameEn = 'masterData.errors.nameTaken';
    if (config.hasHierarchy && id && values.parentId === id) fieldErrors.parentId = 'masterData.errors.parentCycle';
    if (Object.keys(fieldErrors).length) throw new ActionError('errors.validation', fieldErrors);

    const payload: Record<string, unknown> = {
      code,
      name_ar: nameAr,
      name_en: nameEn,
      description_ar: blankToNull(values.descriptionAr),
      description_en: blankToNull(values.descriptionEn),
      is_active: values.isActive,
    };
    if (config.hasPlace) {
      payload.city = blankToNull(values.city);
      payload.country = blankToNull(values.country);
    }
    if (config.hasHierarchy) {
      payload.parent_id = values.parentId;
      payload.head_employee_id = values.headEmployeeId;
    }

    const typed = payload as { name_ar: string | null };
    const result = id
      ? await table(supabase, entity).update(typed).eq('id', id).select('id')
      : await table(supabase, entity).insert(typed).select('id');

    if (result.error) {
      const code23505 = (result.error as { code?: string }).code === '23505';
      if (code23505) throw new ActionError('errors.validation', { code: 'validation.codeTaken' });
      const message = String((result.error as { message?: string }).message ?? '');
      if (message.includes('masterData.errors.parentCycle')) {
        throw new ActionError('errors.validation', { parentId: 'masterData.errors.parentCycle' });
      }
      throw result.error;
    }
    // RLS filters silently: no row back means the caller may not write it.
    if (!result.data?.length) throw new ActionError(id ? 'errors.notFound' : 'errors.forbidden');

    revalidate(entity);
    return ok({ id: result.data[0]!.id }, id ? 'masterData.toast.updated' : 'masterData.toast.created');
  },
  { scope: 'masterData.save' },
);

export const setMasterDataActive = withAction(
  setActiveSchema,
  async ({ entity, ids, active }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await table(supabase, entity).update({ is_active: active }).in('id', ids).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidate(entity);
    return ok({ count: data.length }, active ? 'masterData.toast.activated' : 'masterData.toast.deactivated');
  },
  { scope: 'masterData.setActive' },
);

export const deleteMasterData = withAction(
  masterDataIdSchema,
  async ({ entity, id }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    // The DB guard refuses rows still referenced by employees / sub-departments (hr:errors.inUse).
    const { data, error } = await table(supabase, entity).delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidate(entity);
    return ok(undefined, 'masterData.toast.deleted');
  },
  { scope: 'masterData.delete' },
);

export type EmployeeOption = { value: string; label: string; description: string | null };

/** Employee picker for "department head" (RLS-scoped, non-archived, max 20). */
export const searchEmployeeOptions = withAction(
  employeeSearchSchema,
  async ({ query }, { ctx }) => {
    if (!hasAny(ctx, ['settings.edit', 'employees.view'])) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    let q = supabase
      .from('employees')
      .select('id, employee_number, name_ar, name_en')
      .is('archived_at', null)
      .order('name_ar', { ascending: true, nullsFirst: false })
      .limit(20);
    if (query) q = q.ilike('search_text', toIlikePattern(query.toLowerCase()));
    const { data, error } = await q;
    if (error) throw error;
    const options: EmployeeOption[] = (data ?? []).map((e) => ({
      value: e.id,
      label: employeeDisplayName(e, ctx.locale) || e.employee_number || '—',
      description: e.employee_number,
    }));
    return ok(options);
  },
  { scope: 'masterData.searchEmployees' },
);

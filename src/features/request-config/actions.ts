'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { toIlikePattern } from '@/lib/list-params';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';
import {
  duplicateRequestTypeSchema,
  saveFieldsSchema,
  saveRequestTypeSchema,
  saveSlaSchema,
  saveWorkflowSchema,
  searchUsersSchema,
  setTypeActiveSchema,
  typeIdSchema,
} from './schemas';
import type { UserOption } from './types';

/**
 * Settings › Requests mutations. Every write needs `settings.edit` (checked here and again by the
 * security-definer RPCs / RLS). Row changes are audited by the database triggers.
 */

function revalidateRequestConfig() {
  for (const path of ['/settings/request-types', '/settings/form-builder', '/settings/workflows', '/settings/sla', '/settings', '/requests/new', '/requests']) {
    revalidatePath(path);
  }
}

export const saveRequestType = withAction(
  saveRequestTypeSchema,
  async ({ id, values: v }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    if (!v.requiresManagerApproval && !v.requiresHrApproval && !id) {
      throw new ActionError('errors.validation', { requiresHrApproval: 'requestConfig.validation.approvalRequired' });
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('save_request_type', {
      // null creates a new type (the generated Args type does not model nullable uuids).
      p_id: (id ?? null) as unknown as string,
      p_values: {
        key: v.key,
        category: v.category,
        name_ar: v.nameAr,
        name_en: v.nameEn,
        description_ar: v.descriptionAr,
        description_en: v.descriptionEn,
        icon: v.icon,
        color: v.color,
        sla_business_days: v.slaBusinessDays,
        sort_order: v.sortOrder,
        requires_manager_approval: v.requiresManagerApproval,
        requires_hr_approval: v.requiresHrApproval,
        allow_attachments: v.allowAttachments,
        is_active: v.isActive,
      },
    });
    if (error) {
      if (error.message?.includes('errors.duplicate')) throw new ActionError('errors.validation', { key: 'requestConfig.validation.keyTaken' });
      throw error;
    }
    revalidateRequestConfig();
    return ok({ id: data as string }, id ? 'requestConfig.types.toast.saved' : 'requestConfig.types.toast.created');
  },
  { scope: 'requestConfig.saveType' },
);

export const duplicateRequestType = withAction(
  duplicateRequestTypeSchema,
  async ({ sourceId, key, nameAr, nameEn }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('duplicate_request_type', { p_source_id: sourceId, p_key: key, p_name_ar: nameAr, p_name_en: nameEn });
    if (error) {
      if (error.message?.includes('errors.duplicate')) throw new ActionError('errors.validation', { key: 'requestConfig.validation.keyTaken' });
      throw error;
    }
    revalidateRequestConfig();
    return ok({ id: data as string, key }, 'requestConfig.types.toast.duplicated');
  },
  { scope: 'requestConfig.duplicateType' },
);

export const setRequestTypeActive = withAction(
  setTypeActiveSchema,
  async ({ id, active }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase.from('request_types').update({ is_active: active }).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidateRequestConfig();
    return ok(undefined, active ? 'requestConfig.types.toast.activated' : 'requestConfig.types.toast.deactivated');
  },
  { scope: 'requestConfig.setTypeActive' },
);

export const deleteRequestType = withAction(
  typeIdSchema,
  async ({ id }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data: type, error: readError } = await supabase.from('request_types').select('id, is_system').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!type) throw new ActionError('errors.notFound');
    if (type.is_system) throw new ActionError('errors.systemRecord');
    // hr_requests.request_type_id is ON DELETE RESTRICT: a type with any request (drafts included) fails with 23503 → errors.inUse.
    const { data, error } = await supabase.from('request_types').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidateRequestConfig();
    return ok(undefined, 'requestConfig.types.toast.deleted');
  },
  { scope: 'requestConfig.deleteType' },
);

export const saveRequestFields = withAction(
  saveFieldsSchema,
  async ({ typeId, fields }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const payload = fields.map((f) => ({
      id: f.id,
      key: f.key,
      field_type: f.field_type,
      label_ar: f.label_ar,
      label_en: f.label_en,
      help_ar: f.help_ar,
      help_en: f.help_en,
      placeholder_ar: f.placeholder_ar,
      placeholder_en: f.placeholder_en,
      required: f.required,
      is_active: f.is_active,
      options: f.field_type === 'dropdown' || f.field_type === 'multi_select' ? f.options : [],
      visibility: f.visibility ?? null,
      validation: f.validation,
    }));
    const { data, error } = await supabase.rpc('save_request_fields', { p_request_type_id: typeId, p_fields: payload as unknown as Json });
    if (error) throw error;
    revalidateRequestConfig();
    return ok(data as { inserted: number; updated: number; deleted: number }, 'requestConfig.builder.toast.saved');
  },
  { scope: 'requestConfig.saveFields' },
);

export const saveRequestWorkflow = withAction(
  saveWorkflowSchema,
  async ({ typeId, steps }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const payload = steps.map((s) => ({
      id: s.id,
      step_type: s.step_type,
      name_ar: s.name_ar,
      name_en: s.name_en,
      approver_role_key: s.step_type === 'role' ? s.approver_role_key : null,
      approver_user_id: s.step_type === 'user' ? s.approver_user_id : null,
      sla_business_days: s.sla_business_days,
      can_return: s.can_return,
      can_reassign: s.can_reassign,
    }));
    const { error } = await supabase.rpc('save_request_workflow', { p_request_type_id: typeId, p_steps: payload as unknown as Json });
    if (error) {
      // A "specific user" step whose user is no longer an active portal user.
      if (error.message?.includes('errors.invalidAssignee')) throw new ActionError('requestConfig.validation.userInactive');
      throw error;
    }
    revalidateRequestConfig();
    return ok(undefined, 'requestConfig.workflows.toast.saved');
  },
  { scope: 'requestConfig.saveWorkflow' },
);

export const saveTypeSla = withAction(
  saveSlaSchema,
  async ({ id, days }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase.from('request_types').update({ sla_business_days: days }).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidateRequestConfig();
    return ok(undefined, 'requestConfig.sla.toast.saved');
  },
  { scope: 'requestConfig.saveSla' },
);

/** Active portal users for "Specific user" workflow steps (name or e-mail search). */
export const searchApproverUsers = withAction(
  searchUsersSchema,
  async ({ query }, { ctx }): Promise<ReturnType<typeof ok<UserOption[]>>> => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient({ timeoutMs: 8000 });
    let q = supabase.from('profiles').select('id, full_name, email').eq('status', 'active').order('full_name').limit(20);
    if (query) {
      const pattern = toIlikePattern(query);
      q = q.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return ok((data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || p.id, email: p.email })));
  },
  { scope: 'requestConfig.searchUsers' },
);

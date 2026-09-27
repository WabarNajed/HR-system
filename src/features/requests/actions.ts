'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { mapError } from '@/lib/errors';
import { deliverEmailsForNotifications } from '@/lib/notifications';
import { BUCKETS, removeFiles, validateFile } from '@/lib/storage';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import { loadFormLookups } from './queries';
import {
  actOnRequestSchema,
  addCommentSchema,
  attachmentIdSchema,
  lookupsSchema,
  previewLeaveSchema,
  registerAttachmentSchema,
  requestIdSchema,
  saveDraftSchema,
  searchAssigneesSchema,
  searchSchema,
} from './schemas';
import type { RequestActionKind } from './schemas';
import type { EmployeeOption, FormLookups } from './types';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

type RpcError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/** Maps an RPC error to an ActionError, attaching a field error when DETAIL names a form field. */
function rpcFailure(error: RpcError): never {
  const key = mapError(error);
  const detail = typeof error.details === 'string' ? error.details.trim() : '';
  const fieldErrors: Record<string, string> = {};
  if (/^[a-z][a-z0-9_]{0,62}$/.test(detail)) {
    if (key === 'errors.requiredFieldMissing') fieldErrors[detail] = detail === 'attachment' ? 'validation.fileRequired' : 'validation.required';
    else if (key === 'errors.validation') fieldErrors[detail] = 'validation.invalidValue';
    else if (key === 'errors.attachmentRequired') fieldErrors[detail] = 'validation.fileRequired';
    else if (key === 'errors.invalidDateRange' && detail === 'end_date') fieldErrors.end_date = 'validation.endBeforeStart';
    else if (key === 'errors.leaveGenderRestricted') fieldErrors[detail] = 'errors.leaveGenderRestricted';
  }
  throw new ActionError(key, Object.keys(fieldErrors).length ? fieldErrors : undefined);
}

function notificationIds(data: unknown): string[] {
  const ids = (data as { notification_ids?: unknown } | null)?.notification_ids;
  return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : [];
}

function sendEmailsLater(ids: string[]) {
  if (!ids.length) return;
  after(async () => {
    await deliverEmailsForNotifications(ids);
  });
}

function revalidateRequest(id?: string | null) {
  revalidatePath('/requests');
  revalidatePath('/approvals');
  revalidatePath('/dashboard');
  if (id) revalidatePath(`/requests/${id}`);
}

/*
 * Server-side permission gates (defence in depth). Only where the database itself decides by
 * permission: creating/submitting (requests.create, leave.create for leave), fulfilment
 * (start/complete: org requests.edit or requests.approve) and attachments. Approve / reject /
 * return / reassign / cancel / comment depend on the ROW (current approver, designated user or
 * role step, requester) — any active user may hold that position — so the RPCs alone decide there.
 */
const CREATE_PERMS = ['requests.create', 'leave.create'] as const;
const FULFIL_PERMS = ['requests.edit', 'requests.approve'] as const;
const FULFIL_ACTIONS: readonly RequestActionKind[] = ['start', 'complete'];

async function requestNumber(supabase: ServerSupabaseClient, id: string): Promise<string | null> {
  const { data } = await supabase.from('hr_requests').select('request_number').eq('id', id).maybeSingle();
  return data?.request_number ?? null;
}

/* ─── Drafts & submission ─────────────────────────────────────────────────── */

/** Creates the draft (first save) or replaces its values (update_request_draft). */
export const saveRequestDraft = withAction(
  saveDraftSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, ...CREATE_PERMS);
    const supabase = await createClient();
    if (input.requestId) {
      const { error } = await supabase.rpc('update_request_draft', {
        p_request_id: input.requestId,
        p_values: input.values as never,
        p_subtype: input.subtype ?? undefined,
      });
      if (error) rpcFailure(error);
      revalidateRequest(input.requestId);
      return ok({ id: input.requestId }, 'requests.toast.draftSaved');
    }
    const { data, error } = await supabase.rpc('create_request_draft', {
      p_request_type_id: input.typeId,
      p_values: input.values as never,
      p_subtype: input.subtype ?? undefined,
      p_employee_id: input.employeeId ?? undefined,
    });
    if (error || !data) rpcFailure(error ?? {});
    revalidateRequest();
    return ok({ id: data as string }, 'requests.toast.draftSaved');
  },
  { scope: 'requests.saveDraft' },
);

/** Submits (or resubmits a returned) request, then e-mails the notified people after the response. */
export const submitRequest = withAction(
  requestIdSchema,
  async ({ requestId }, { ctx }) => {
    requirePermissionIn(ctx, ...CREATE_PERMS);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('submit_request', { p_request_id: requestId });
    if (error) rpcFailure(error);
    sendEmailsLater(notificationIds(data));
    revalidateRequest(requestId);
    const status = (data as { status?: string } | null)?.status ?? 'submitted';
    return ok({ id: requestId, status, number: await requestNumber(supabase, requestId) }, 'requests.toast.submitted');
  },
  { scope: 'requests.submit' },
);

/** Deletes a draft (requester only, RLS) and its stored files. */
export const deleteDraft = withAction(
  requestIdSchema,
  async ({ requestId }, { ctx }) => {
    const supabase = await createClient();
    const { data: req } = await supabase.from('hr_requests').select('id, status, requester_id').eq('id', requestId).maybeSingle();
    if (!req) throw new ActionError('errors.notFound');
    if (req.requester_id !== ctx.user.id) throw new ActionError('errors.forbidden');
    if (req.status !== 'draft') throw new ActionError('errors.requestNotEditable');
    const { data: files } = await supabase.from('request_attachments').select('storage_path').eq('request_id', requestId);
    const paths = (files ?? []).map((f) => f.storage_path);
    if (paths.length) await removeFiles(supabase, BUCKETS.requestAttachments, paths);
    const { error, count } = await supabase.from('hr_requests').delete({ count: 'exact' }).eq('id', requestId).eq('status', 'draft');
    if (error) throw error;
    if (!count) throw new ActionError('errors.forbidden');
    revalidateRequest();
    return ok(undefined, 'requests.toast.draftDeleted');
  },
  { scope: 'requests.deleteDraft' },
);

/* ─── Workflow actions ────────────────────────────────────────────────────── */

export const actOnRequest = withAction(
  actOnRequestSchema,
  async ({ requestId, action, comment, targetUserId }, { ctx }) => {
    if (FULFIL_ACTIONS.includes(action)) requirePermissionIn(ctx, ...FULFIL_PERMS);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('act_on_request', {
      p_request_id: requestId,
      p_action: action,
      p_comment: comment?.trim() || undefined,
      p_target_user: targetUserId ?? undefined,
    });
    if (error) rpcFailure(error);
    sendEmailsLater(notificationIds(data));
    revalidateRequest(requestId);
    const status = (data as { status?: string } | null)?.status ?? null;
    return ok({ status }, `requests.toast.${action}`);
  },
  { scope: 'requests.act' },
);

export const addRequestComment = withAction(
  addCommentSchema,
  async ({ requestId, body, internal }, { ctx }) => {
    // Internal notes are HR-only (org requests.view); the RPC re-checks.
    if (internal) requirePermissionIn(ctx, 'requests.view');
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('add_request_comment', { p_request_id: requestId, p_body: body, p_is_internal: internal });
    if (error) rpcFailure(error);
    revalidatePath(`/requests/${requestId}`);
    return ok({ id: data as string }, internal ? 'requests.toast.internalNoteAdded' : 'requests.toast.commentAdded');
  },
  { scope: 'requests.comment' },
);

/* ─── Attachments (files are uploaded by the browser; rows are registered here) ─ */

export const registerAttachment = withAction(
  registerAttachmentSchema,
  async ({ requestId, fieldKey, path, fileName, size, mime }, { ctx }) => {
    requirePermissionIn(ctx, ...CREATE_PERMS, 'requests.edit');
    if (!path.startsWith(`requests/${requestId}/`) || path.includes('..')) throw new ActionError('errors.validation');
    const invalid = validateFile({ name: fileName, size, type: mime ?? '' }, 'attachment');
    if (invalid) throw new ActionError(invalid);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('request_attachments')
      .insert({ request_id: requestId, field_key: fieldKey ?? null, storage_path: path, file_name: fileName, file_size: size, mime_type: mime ?? null })
      .select('id, created_at')
      .single();
    if (error) {
      await removeFiles(supabase, BUCKETS.requestAttachments, [path]);
      throw error;
    }
    revalidatePath(`/requests/${requestId}`);
    return ok({ id: data.id, createdAt: data.created_at }, 'requests.toast.attachmentAdded');
  },
  { scope: 'requests.registerAttachment' },
);

export const deleteAttachment = withAction(
  attachmentIdSchema,
  async ({ attachmentId }, { ctx }) => {
    requirePermissionIn(ctx, ...CREATE_PERMS, 'requests.edit');
    const supabase = await createClient();
    const { data: row } = await supabase.from('request_attachments').select('id, request_id, storage_path').eq('id', attachmentId).maybeSingle();
    if (!row) throw new ActionError('errors.notFound');
    const { error, count } = await supabase.from('request_attachments').delete({ count: 'exact' }).eq('id', attachmentId);
    if (error) throw error;
    if (!count) throw new ActionError('errors.forbidden');
    await removeFiles(supabase, BUCKETS.requestAttachments, [row.storage_path]);
    revalidatePath(`/requests/${row.request_id}`);
    return ok(undefined, 'requests.toast.attachmentRemoved');
  },
  { scope: 'requests.deleteAttachment' },
);

/* ─── Lookups for the dynamic form ────────────────────────────────────────── */

export type LookupsResult = FormLookups & { manager: { name_ar: string | null; name_en: string | null } | null };

export const loadRequestLookups = withAction(
  lookupsSchema,
  async ({ employeeId }, { ctx }) => {
    requirePermissionIn(ctx, ...CREATE_PERMS, 'requests.view');
    const supabase = await createClient();
    const [lookups, managerRes] = await Promise.all([
      loadFormLookups(supabase, employeeId ?? null),
      employeeId ? supabase.rpc('get_employee_manager', { p_employee_id: employeeId }) : Promise.resolve({ data: null }),
    ]);
    const m = managerRes.data as { name_ar?: string | null; name_en?: string | null } | null;
    return ok<LookupsResult>({ ...lookups, manager: m ? { name_ar: m.name_ar ?? null, name_en: m.name_en ?? null } : null });
  },
  { scope: 'requests.lookups' },
);

export const searchEmployees = withAction(
  searchSchema,
  async ({ q }, { ctx }) => {
    requirePermissionIn(ctx, ...CREATE_PERMS, 'requests.view');
    const supabase = await createClient();
    let query = supabase
      .from('employees')
      .select('id, employee_number, name_ar, name_en, department:departments!department_id(name_ar, name_en)')
      .is('archived_at', null)
      .order('name_en')
      .limit(20);
    if (q) query = query.ilike('search_text', `%${q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    const { data, error } = await query;
    if (error) throw error;
    return ok((data ?? []) as unknown as EmployeeOption[]);
  },
  { scope: 'requests.searchEmployees' },
);

export type AssigneeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  job_title_ar: string | null;
  job_title_en: string | null;
};

export const searchAssignees = withAction(
  searchAssigneesSchema,
  async ({ requestId, q }) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('list_request_assignees', { p_request_id: requestId, p_query: q || undefined, p_limit: 20 });
    if (error) rpcFailure(error);
    return ok((data ?? []) as AssigneeOption[]);
  },
  { scope: 'requests.searchAssignees' },
);

/* ─── Leave preview (live day count, balance, overlaps) ───────────────────── */

export type LeavePreview = {
  days: number | null;
  basis: string;
  deducts: boolean;
  maxDays: number | null;
  requiresAttachment: boolean;
  balance: { available: number; remaining: number; pending: number; used: number; entitlement: number; exists: boolean } | null;
  overlaps: { requestId: string; number: string | null; start: string; end: string; status: string }[];
  rangeError: string | null;
};

export const previewLeave = withAction(
  previewLeaveSchema,
  async ({ employeeId, leaveTypeId, start, end, requestId }, { ctx }) => {
    requirePermissionIn(ctx, ...CREATE_PERMS, 'leave.view');
    const supabase = await createClient();
    const year = Number((start ?? new Date().toISOString()).slice(0, 4));
    const hasRange = Boolean(start && end && end >= start);
    const [typeRes, daysRes, balanceRes, overlapRes] = await Promise.all([
      supabase
        .from('leave_types')
        .select('deducts_balance, max_days_per_request, requires_attachment, day_count_basis, default_entitlement')
        .eq('id', leaveTypeId)
        .maybeSingle(),
      hasRange ? supabase.rpc('count_leave_days', { p_leave_type_id: leaveTypeId, p_start: start!, p_end: end! }) : Promise.resolve({ data: null, error: null }),
      supabase
        .from('leave_balances')
        .select('entitlement, opening_balance, adjustment, used, pending, remaining')
        .eq('employee_id', employeeId)
        .eq('leave_type_id', leaveTypeId)
        .eq('year', year)
        .maybeSingle(),
      hasRange
        ? supabase
            .from('leave_requests')
            .select('request_id, start_date, end_date, balance_effect, request:hr_requests!inner(request_number, status)')
            .eq('employee_id', employeeId)
            .lte('start_date', end!)
            .gte('end_date', start!)
            .neq('balance_effect', 'reversed')
            .not('request.status', 'in', '(draft,rejected,cancelled)')
            .limit(5)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const type = typeRes.data as {
      deducts_balance: boolean;
      max_days_per_request: number | null;
      requires_attachment: boolean;
      day_count_basis: string;
      default_entitlement: number | null;
    } | null;
    if (!type) throw new ActionError('errors.notFound');
    const bal = balanceRes.data as { entitlement: number; opening_balance: number; adjustment: number; used: number; pending: number; remaining: number } | null;
    const balance = type.deducts_balance
      ? bal
        ? {
            available: Number(bal.remaining) - Number(bal.pending),
            remaining: Number(bal.remaining),
            pending: Number(bal.pending),
            used: Number(bal.used),
            entitlement: Number(bal.opening_balance) + Number(bal.entitlement) + Number(bal.adjustment),
            exists: true,
          }
        : {
            available: Number(type.default_entitlement ?? 0),
            remaining: Number(type.default_entitlement ?? 0),
            pending: 0,
            used: 0,
            entitlement: Number(type.default_entitlement ?? 0),
            exists: false,
          }
      : null;
    const overlaps = ((overlapRes.data ?? []) as { request_id: string; start_date: string; end_date: string; request: { request_number: string | null; status: string } | null }[])
      .filter((o) => o.request_id !== requestId)
      .map((o) => ({ requestId: o.request_id, number: o.request?.request_number ?? null, start: o.start_date, end: o.end_date, status: o.request?.status ?? '' }));
    return ok<LeavePreview>({
      days: daysRes.error || daysRes.data === null || daysRes.data === undefined ? null : Number(daysRes.data as unknown),
      basis: type.day_count_basis,
      deducts: type.deducts_balance,
      maxDays: type.max_days_per_request,
      requiresAttachment: type.requires_attachment,
      balance,
      overlaps,
      rangeError: daysRes.error ? mapError(daysRes.error) : start && end && end < start ? 'validation.endBeforeStart' : null,
    });
  },
  { scope: 'requests.previewLeave' },
);

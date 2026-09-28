'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { ActionError, ok, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { deliverEmailsForNotifications } from '@/lib/notifications';
import type { SessionContext } from '@/lib/auth/session';
import { todayIso } from '@/lib/dates';
import { toIlikePattern } from '@/lib/list-params';
import { BUCKETS, removeFiles, sanitizeFileName, storagePaths, validateFile } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { getDocumentAccess } from './access';
import {
  commitReplaceSchema,
  createUploadSchema,
  documentIdSchema,
  employeeSearchSchema,
  prepareReplaceSchema,
  reviewDocumentSchema,
  updateDocumentSchema,
  uploadContextSchema,
} from './schemas';
import type { UploadContext } from './types';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type DocRow = {
  id: string;
  employee_id: string;
  document_type: string;
  status: string;
  storage_path: string | null;
  file_name: string | null;
  uploaded_by: string | null;
  expiry_date: string | null;
};

const DOC_SELECT = 'id, employee_id, document_type, status, storage_path, file_name, uploaded_by, expiry_date';

function revalidateDocuments(employeeId?: string | null) {
  revalidatePath('/documents');
  revalidatePath('/dashboard');
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
}

/** Document visible to the caller (RLS) or `errors.notFound`. */
async function loadDocument(supabase: ServerClient, documentId: string): Promise<DocRow> {
  const { data, error } = await supabase.from('employee_documents').select(DOC_SELECT).eq('id', documentId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ActionError('errors.notFound');
  return data as DocRow;
}

async function requireOrg(ctx: SessionContext, action: 'create' | 'edit' | 'approve') {
  const access = await getDocumentAccess(ctx);
  if (!access[action]) throw new ActionError('errors.forbidden');
  return access;
}

/** Status for an HR-managed document from its expiry date. */
function statusForExpiry(expiryDate: string | null): 'valid' | 'expired' {
  return expiryDate && expiryDate < todayIso() ? 'expired' : 'valid';
}

function uniquePath(employeeId: string, documentId: string, fileName: string, current: string | null): string {
  const path = storagePaths.employeeDocument(employeeId, documentId, fileName);
  if (path !== current) return path;
  const stamp = Date.now().toString(36);
  return `${employeeId}/${documentId}/${stamp}-${sanitizeFileName(fileName)}`;
}

async function objectExists(supabase: ServerClient, path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(BUCKETS.employeeDocuments).exists(path);
  if (error) return false;
  return Boolean(data);
}

/* ─── Upload dialog context & employee search ─────────────────────────────── */

export const getUploadContext = withAction(
  uploadContextSchema,
  async ({ employeeId }, { ctx }): Promise<ReturnType<typeof ok<UploadContext>>> => {
    const access = await getDocumentAccess(ctx);
    const supabase = await createClient();
    const loadEmployee = async (id: string) => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, employee_number, name_ar, name_en')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    if (employeeId) {
      if (access.create) {
        const employee = await loadEmployee(employeeId);
        if (!employee) throw new ActionError('errors.notFound');
        return ok<UploadContext>({ mode: 'hr', employee });
      }
      if (employeeId === access.ownEmployeeId) {
        return ok<UploadContext>({ mode: 'self', employee: await loadEmployee(employeeId) });
      }
      return ok<UploadContext>({ mode: 'none', reason: 'forbidden' });
    }
    if (access.create) return ok<UploadContext>({ mode: 'hr', employee: null });
    if (access.ownEmployeeId) return ok<UploadContext>({ mode: 'self', employee: await loadEmployee(access.ownEmployeeId) });
    return ok<UploadContext>({ mode: 'none', reason: 'notLinked' });
  },
  { scope: 'documents.uploadContext' },
);

export type EmployeeOption = { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null };

export const searchUploadEmployees = withAction(
  employeeSearchSchema,
  async ({ query }, { ctx }) => {
    await requireOrg(ctx, 'create');
    const supabase = await createClient();
    let q = supabase
      .from('employees')
      .select('id, employee_number, name_ar, name_en')
      .is('archived_at', null)
      .order(ctx.locale === 'en' ? 'name_en' : 'name_ar', { nullsFirst: false })
      .limit(20);
    if (query) q = q.ilike('search_text', toIlikePattern(query.toLowerCase()));
    const { data, error } = await q;
    if (error) throw error;
    return ok<EmployeeOption[]>((data ?? []) as EmployeeOption[]);
  },
  { scope: 'documents.searchEmployees' },
);

/* ─── Upload: create row → (browser uploads to Storage) → finalize | abort ── */

export const createDocumentUpload = withAction(
  createUploadSchema,
  async (input, { ctx }) => {
    const access = await getDocumentAccess(ctx);
    const targetId = input.employeeId ?? access.ownEmployeeId;
    if (!targetId) throw new ActionError(access.create ? 'documents.validation.employeeRequired' : 'errors.employeeNotLinked');

    // HR (org documents.create) files documents directly; everyone else only for themselves, into review.
    const asHr = access.create;
    if (!asHr && targetId !== access.ownEmployeeId) throw new ActionError('errors.forbidden');

    const fileError = validateFile({ name: input.fileName, size: input.fileSize, type: input.mimeType }, 'document');
    if (fileError) throw new ActionError(fileError, { file: fileError });

    const supabase = await createClient();
    const documentId = globalThis.crypto.randomUUID();
    const path = storagePaths.employeeDocument(targetId, documentId, input.fileName);
    const { error } = await supabase.from('employee_documents').insert({
      id: documentId,
      employee_id: targetId,
      document_type: input.documentType,
      document_number: input.documentNumber,
      issue_date: input.issueDate,
      expiry_date: input.expiryDate,
      status: asHr ? statusForExpiry(input.expiryDate) : 'pending_review',
      storage_path: path,
      file_name: input.fileName.slice(0, 255),
      file_size: input.fileSize,
      mime_type: input.mimeType || null,
      notes: input.notes,
      is_confidential: asHr ? input.isConfidential : false,
      uploaded_by: ctx.user.id,
    });
    if (error) throw error;
    return ok({ documentId, path, bucket: BUCKETS.employeeDocuments, review: !asHr });
  },
  { scope: 'documents.createUpload' },
);

export const finalizeDocumentUpload = withAction(
  documentIdSchema,
  async ({ documentId }, { ctx }) => {
    const supabase = await createClient();
    const doc = await loadDocument(supabase, documentId);
    if (!doc.storage_path || !(await objectExists(supabase, doc.storage_path))) throw new ActionError('errors.uploadFailed');
    if (doc.uploaded_by !== ctx.user.id) throw new ActionError('errors.forbidden');
    await logAuditEvent(
      {
        action: 'document.upload',
        entityType: 'employee_document',
        entityId: doc.id,
        summary: `${doc.document_type} · ${doc.file_name ?? ''}`.trim(),
        changes: { document_type: doc.document_type, status: doc.status, file_name: doc.file_name, self_service: doc.status === 'pending_review' && doc.uploaded_by === ctx.user.id },
      },
      supabase,
    );
    revalidateDocuments(doc.employee_id);
    return ok(undefined, doc.status === 'pending_review' ? 'documents.toast.submittedForReview' : 'documents.toast.uploaded');
  },
  { scope: 'documents.finalizeUpload' },
);

export const abortDocumentUpload = withAction(
  documentIdSchema,
  async ({ documentId }, { ctx }) => {
    const supabase = await createClient();
    const { data } = await supabase.from('employee_documents').select(DOC_SELECT).eq('id', documentId).maybeSingle();
    const doc = data as DocRow | null;
    if (!doc || doc.uploaded_by !== ctx.user.id) return ok();
    if (doc.storage_path && (await objectExists(supabase, doc.storage_path))) return ok();
    const { error } = await supabase.from('employee_documents').delete().eq('id', documentId);
    if (error) console.error('[documents] abort cleanup failed:', error.code, error.message);
    return ok();
  },
  { scope: 'documents.abortUpload' },
);

/* ─── Edit / replace / review / archive / delete ──────────────────────────── */

export const updateDocument = withAction(
  updateDocumentSchema,
  async (input, { ctx }) => {
    await requireOrg(ctx, 'edit');
    const supabase = await createClient();
    const doc = await loadDocument(supabase, input.documentId);
    if (doc.status === 'archived') throw new ActionError('documents.errors.archived');
    const status =
      doc.status === 'valid' || doc.status === 'expired'
        ? (input.status ?? statusForExpiry(input.expiryDate))
        : doc.status; // pending_review / rejected keep their review state
    const { error } = await supabase
      .from('employee_documents')
      .update({
        document_type: input.documentType,
        document_number: input.documentNumber,
        issue_date: input.issueDate,
        expiry_date: input.expiryDate,
        is_confidential: input.isConfidential,
        notes: input.notes,
        status,
      })
      .eq('id', input.documentId);
    if (error) throw error;
    revalidateDocuments(doc.employee_id);
    return ok(undefined, 'documents.toast.updated');
  },
  { scope: 'documents.update' },
);

export const prepareReplaceFile = withAction(
  prepareReplaceSchema,
  async (input, { ctx }) => {
    await requireOrg(ctx, 'edit');
    const fileError = validateFile({ name: input.fileName, size: input.fileSize, type: input.mimeType }, 'document');
    if (fileError) throw new ActionError(fileError, { file: fileError });
    const supabase = await createClient();
    const doc = await loadDocument(supabase, input.documentId);
    if (doc.status === 'archived') throw new ActionError('documents.errors.archived');
    return ok({ path: uniquePath(doc.employee_id, doc.id, input.fileName, doc.storage_path), bucket: BUCKETS.employeeDocuments });
  },
  { scope: 'documents.prepareReplace' },
);

export const commitReplaceFile = withAction(
  commitReplaceSchema,
  async (input, { ctx }) => {
    await requireOrg(ctx, 'edit');
    const supabase = await createClient();
    const doc = await loadDocument(supabase, input.documentId);
    const prefix = `${doc.employee_id}/${doc.id}/`;
    if (!input.path.startsWith(prefix) || input.path.includes('..') || input.path === doc.storage_path) {
      throw new ActionError('errors.validation');
    }
    if (!(await objectExists(supabase, input.path))) throw new ActionError('errors.uploadFailed');
    const { error } = await supabase
      .from('employee_documents')
      .update({
        storage_path: input.path,
        file_name: input.fileName.slice(0, 255),
        file_size: input.fileSize,
        mime_type: input.mimeType || null,
      })
      .eq('id', doc.id);
    if (error) {
      await removeFiles(supabase, BUCKETS.employeeDocuments, [input.path]);
      throw error;
    }
    if (doc.storage_path) await removeFiles(supabase, BUCKETS.employeeDocuments, [doc.storage_path]);
    await logAuditEvent(
      {
        action: 'document.replace_file',
        entityType: 'employee_document',
        entityId: doc.id,
        summary: `${doc.document_type} · ${input.fileName}`,
        changes: { file_name: { old: doc.file_name, new: input.fileName } },
      },
      supabase,
    );
    revalidateDocuments(doc.employee_id);
    return ok(undefined, 'documents.toast.fileReplaced');
  },
  { scope: 'documents.commitReplace' },
);

/** Discards an uploaded replacement that was never committed (dialog closed / commit failed). */
export const discardReplaceFile = withAction(
  z.object({ documentId: z.uuid(), path: z.string().min(1).max(500) }),
  async ({ documentId, path }, { ctx }) => {
    await requireOrg(ctx, 'edit');
    const supabase = await createClient();
    const doc = await loadDocument(supabase, documentId);
    if (path.startsWith(`${doc.employee_id}/${doc.id}/`) && path !== doc.storage_path && !path.includes('..')) {
      await removeFiles(supabase, BUCKETS.employeeDocuments, [path]);
    }
    return ok();
  },
  { scope: 'documents.discardReplace' },
);

export const reviewDocument = withAction(
  reviewDocumentSchema,
  async ({ documentId, decision, note }, { ctx }) => {
    await requireOrg(ctx, 'approve');
    const supabase = await createClient();
    const doc = await loadDocument(supabase, documentId);
    const { data, error } = await supabase.rpc('review_employee_document', {
      p_document_id: documentId,
      p_decision: decision,
      p_note: note ?? undefined,
    });
    if (error) throw error;
    await logAuditEvent(
      {
        action: decision === 'approve' ? 'document.approve' : 'document.reject',
        entityType: 'employee_document',
        entityId: documentId,
        summary: doc.document_type,
        changes: { status: { old: doc.status, new: data }, note: note ?? null },
      },
      supabase,
    );
    revalidateDocuments(doc.employee_id);
    return ok(undefined, decision === 'approve' ? 'documents.toast.approved' : 'documents.toast.rejected');
  },
  { scope: 'documents.review' },
);

export const archiveDocument = withAction(
  documentIdSchema,
  async ({ documentId }, { ctx }) => {
    await requireOrg(ctx, 'edit');
    const supabase = await createClient();
    const doc = await loadDocument(supabase, documentId);
    if (doc.status === 'archived') return ok(undefined, 'documents.toast.archived');
    // Restoring brings a document back as valid/expired, so a pending or rejected upload may never take
    // the archive → restore detour around the review.
    if (doc.status === 'pending_review' || doc.status === 'rejected') throw new ActionError('documents.errors.reviewState');
    const { error } = await supabase.from('employee_documents').update({ status: 'archived' }).eq('id', documentId);
    if (error) throw error;
    revalidateDocuments(doc.employee_id);
    return ok(undefined, 'documents.toast.archived');
  },
  { scope: 'documents.archive' },
);

export const restoreDocument = withAction(
  documentIdSchema,
  async ({ documentId }, { ctx }) => {
    await requireOrg(ctx, 'edit');
    const supabase = await createClient();
    const doc = await loadDocument(supabase, documentId);
    if (doc.status !== 'archived') return ok(undefined, 'documents.toast.restored');
    const { error } = await supabase.from('employee_documents').update({ status: statusForExpiry(doc.expiry_date) }).eq('id', documentId);
    if (error) throw error;
    revalidateDocuments(doc.employee_id);
    return ok(undefined, 'documents.toast.restored');
  },
  { scope: 'documents.restore' },
);

export const deleteDocument = withAction(
  documentIdSchema,
  async ({ documentId }, { ctx }) => {
    const access = await getDocumentAccess(ctx);
    const supabase = await createClient();
    const doc = await loadDocument(supabase, documentId);
    const ownPending =
      doc.employee_id === access.ownEmployeeId && doc.uploaded_by === ctx.user.id && doc.status === 'pending_review';
    if (!access.edit && !ownPending) throw new ActionError('errors.forbidden');
    if (access.edit) {
      // HR: row first (the file is only removed once the record is gone), then the file.
      const { error } = await supabase.from('employee_documents').delete().eq('id', documentId);
      if (error) throw error;
      if (doc.storage_path) await removeFiles(supabase, BUCKETS.employeeDocuments, [doc.storage_path]);
    } else {
      // Owner withdrawal: the storage policy authorizes the delete through the pending row, so the
      // file goes first while the row still exists.
      if (doc.storage_path) await removeFiles(supabase, BUCKETS.employeeDocuments, [doc.storage_path]);
      const { error } = await supabase.from('employee_documents').delete().eq('id', documentId);
      if (error) throw error;
    }
    await logAuditEvent(
      {
        action: ownPending && !access.edit ? 'document.withdraw' : 'document.delete',
        entityType: 'employee_document',
        entityId: documentId,
        summary: `${doc.document_type} · ${doc.file_name ?? ''}`.trim(),
      },
      supabase,
    );
    revalidateDocuments(doc.employee_id);
    return ok(undefined, ownPending && !access.edit ? 'documents.toast.withdrawn' : 'documents.toast.deleted');
  },
  { scope: 'documents.delete' },
);

/* ─── Expiry check ("Run expiry check now") ───────────────────────────────── */

export const runExpiryCheck = withAction(
  z.object({}),
  async (_input, { ctx }) => {
    await requireOrg(ctx, 'edit');
    const supabase = await createClient({ timeoutMs: 30_000 });
    const { data, error } = await supabase.rpc('run_expiry_alerts', { p_source: 'manual' });
    if (error) throw error;
    const result = (data ?? {}) as { items?: number; notifications?: number; notification_ids?: string[] };
    const ids = result.notification_ids ?? [];
    // E-mails are sent after the response (same pipeline as the cron: claim → template → send → log).
    if (ids.length) {
      after(async () => {
        await deliverEmailsForNotifications(ids);
      });
    }
    await logAuditEvent(
      { action: 'document.expiry_check', entityType: 'expiry_alert_run', summary: `${result.items ?? 0} · ${result.notifications ?? 0}`, changes: { items: result.items ?? 0, notifications: result.notifications ?? 0 } },
      supabase,
    );
    revalidatePath('/documents');
    return ok({ items: result.items ?? 0, notifications: result.notifications ?? 0 });
  },
  { scope: 'documents.runExpiryCheck' },
);

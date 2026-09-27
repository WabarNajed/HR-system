'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { correlationId } from '@/lib/errors';
import { employeeAlternateName, employeeDisplayName } from '@/lib/i18n/localized';
import { getTranslator } from '@/lib/i18n/translator';
import { PdfRenderError } from '@/lib/pdf/render';
import { createClient } from '@/lib/supabase/server';
import { BUCKETS, fileRouteUrl, removeFiles, storagePaths } from '@/lib/storage';
import { escapeHtml, sanitizeTemplateHtml } from './html';
import {
  createTemplateSchema,
  employeeSearchSchema,
  previewCertificateSchema,
  previewTemplateSchema,
  requestIdSchema,
  issueCertificateSchema,
  restoreVersionSchema,
  revokeCertificateSchema,
  saveTemplateSchema,
  templateActiveSchema,
  templateIdSchema,
} from './schemas';
import {
  buildCertificateDocument,
  loadEmployeeContext,
  loadOrganizationContext,
  previewCertificateNumber,
  renderCertificatePdf,
  type IssuingContext,
  type TemplateContent,
} from './server/document';
import { ISSUABLE_STATUSES, loadCertificateRequest, loadPublishedTemplate } from './server/queries';
import type { TemplateDraft } from './types';
import { templateSupportsLanguage, type CertificateLanguage } from './variables';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const TEMPLATE_PATHS = ['/settings/document-templates', '/settings/certificate-templates', '/certificates'];

function revalidateTemplates(id?: string) {
  for (const p of TEMPLATE_PATHS) revalidatePath(p);
  if (id) revalidatePath(`/settings/document-templates/${id}`);
}

function cleanDraft(draft: TemplateDraft): TemplateDraft {
  return {
    ...draft,
    content_ar: sanitizeTemplateHtml(draft.content_ar),
    content_en: sanitizeTemplateHtml(draft.content_en),
    header_html: sanitizeTemplateHtml(draft.header_html),
    footer_html: sanitizeTemplateHtml(draft.footer_html),
  };
}

function draftToContent(draft: TemplateDraft): TemplateContent {
  return { ...draft };
}

function toPdfError(error: unknown): never {
  if (error instanceof PdfRenderError) {
    console.error(`[certificates] pdf render failed (${correlationId()}):`, error.message, error.cause instanceof Error ? error.cause.message : '');
    throw new ActionError('errors.pdfFailed');
  }
  throw error;
}

function starterContent(lang: 'ar' | 'en', title: string): string {
  const t = getTranslator(lang);
  const s = (k: string) => escapeHtml(t(`templates.starter.${k}`));
  return [
    `<p style="text-align: end">${s('number')} {{certificate_number}}<br>${s('date')} {{current_date}}</p>`,
    `<h2 style="text-align: center">${escapeHtml(title)}</h2>`,
    `<p data-if="addressed_to"><strong>${s('to')} {{addressed_to}}</strong></p>`,
    `<p data-if-not="addressed_to"><strong>${s('toWhom')}</strong></p>`,
    `<p>${s('greeting')}</p>`,
    `<p>${t('templates.starter.body', {
      name: `<strong>{{employee_name_${lang}}}</strong>`,
      id: '<strong>{{employee_id}}</strong>',
      title: `<strong>{{job_title_${lang}}}</strong>`,
      department: `<strong>{{department_${lang}}}</strong>`,
      date: '<strong>{{joining_date}}</strong>',
      company: `<strong>{{company_name_${lang}}}</strong>`,
    })}</p>`,
    `<p>${s('closing')}</p>`,
  ].join('');
}

/* ─── Templates ───────────────────────────────────────────────────────────── */

/** Creates a template from scratch (starter wording + organization letterhead) or duplicates one. */
export const createTemplate = withAction(
  createTemplateSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const t = getTranslator(ctx.locale);
    let data: Record<string, unknown>;
    let notes: string;
    if (input.sourceId) {
      const { data: source, error } = await supabase
        .from('certificate_templates')
        .select('content_ar, content_en, header_html, footer_html, show_logo, show_stamp, show_signature, show_qr, name_ar, name_en')
        .eq('id', input.sourceId)
        .maybeSingle();
      if (error) throw error;
      if (!source) throw new ActionError('errors.notFound');
      data = { ...source };
      notes = t('templates.versions.duplicatedFrom', { name: ctx.locale === 'ar' ? source.name_ar : source.name_en });
    } else {
      const { data: letterhead } = await supabase
        .from('certificate_templates')
        .select('header_html, footer_html')
        .not('header_html', 'is', null)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = {
        content_ar: starterContent('ar', input.name_ar),
        content_en: starterContent('en', input.name_en),
        header_html: letterhead?.header_html ?? null,
        footer_html: letterhead?.footer_html ?? null,
      };
      notes = t('templates.versions.created');
    }
    Object.assign(data, {
      name_ar: input.name_ar,
      name_en: input.name_en,
      certificate_type: input.certificate_type,
      variant: input.variant,
      language: input.language,
    });
    const { data: id, error } = await supabase.rpc('create_certificate_template', { p_data: data as never, p_change_notes: notes });
    if (error) throw error;
    revalidateTemplates();
    return ok({ id: id as string }, input.sourceId ? 'templates.toast.duplicated' : 'templates.toast.created');
  },
  { scope: 'certificates.createTemplate' },
);

export const saveTemplate = withAction(
  saveTemplateSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const draft = cleanDraft(input.draft);
    const { data: version, error } = await supabase.rpc('save_certificate_template', {
      p_template_id: input.id,
      p_data: draft as never,
      p_change_notes: input.changeNotes,
      p_expected_version: input.expectedVersion,
    });
    if (error) throw error;
    revalidateTemplates(input.id);
    return ok({ version: version as number }, 'templates.toast.saved');
  },
  { scope: 'certificates.saveTemplate' },
);

export const publishTemplate = withAction(
  templateIdSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data: version, error } = await supabase.rpc('publish_certificate_template_draft', { p_template_id: input.id });
    if (error) throw error;
    revalidateTemplates(input.id);
    return ok({ version: version as number }, 'templates.toast.published');
  },
  { scope: 'certificates.publishTemplate' },
);

export const restoreTemplateVersion = withAction(
  restoreVersionSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const notes = getTranslator(ctx.locale)('templates.versions.restoredFrom', { version: input.version });
    const { data: version, error } = await supabase.rpc('restore_certificate_template_draft', {
      p_template_id: input.id,
      p_version: input.version,
      p_change_notes: notes,
    });
    if (error) throw error;
    revalidateTemplates(input.id);
    return ok({ version: version as number }, 'templates.toast.restored');
  },
  { scope: 'certificates.restoreTemplate' },
);

export const setTemplateActive = withAction(
  templateActiveSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { error } = await supabase.rpc('set_certificate_template_active', { p_template_id: input.id, p_active: input.active });
    if (error) throw error;
    revalidateTemplates(input.id);
    return ok(undefined, input.active ? 'templates.toast.activated' : 'templates.toast.deactivated');
  },
  { scope: 'certificates.setTemplateActive' },
);

export const setDefaultTemplate = withAction(
  templateIdSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { error } = await supabase.rpc('set_default_certificate_template', { p_template_id: input.id });
    if (error) throw error;
    revalidateTemplates(input.id);
    return ok(undefined, 'templates.toast.defaultSet');
  },
  { scope: 'certificates.setDefaultTemplate' },
);

/* ─── Previews ────────────────────────────────────────────────────────────── */

async function issuingContext(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string | null | undefined): Promise<IssuingContext> {
  const [org, emp] = await Promise.all([
    loadOrganizationContext(supabase),
    employeeId ? loadEmployeeContext(supabase, employeeId) : Promise.resolve({ employee: null, compensation: null }),
  ]);
  return { ...org, ...emp };
}

export type PreviewResult = { html?: string; pdfBase64?: string; fileName: string };

/** Renders the editor's (unsaved) template for an employee — HTML for the iframe or a PDF. */
export const previewTemplate = withAction(
  previewTemplateSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.view', 'certificates.administer', 'settings.edit');
    const supabase = await createClient({ timeoutMs: 15_000 });
    const context = await issuingContext(supabase, input.employeeId);
    if (input.employeeId && !context.employee) throw new ActionError('errors.notFound');
    const draft = cleanDraft(input.draft);
    if (!templateSupportsLanguage(draft.language, input.language)) throw new ActionError('errors.templateLanguageMismatch');
    const tv = getTranslator(ctx.locale);
    const html = await buildCertificateDocument({
      template: draftToContent(draft),
      language: input.language,
      ctx: context,
      certificateNumber: previewCertificateNumber(),
      options: { includeSalary: input.includeSalary, includeAllowances: input.includeAllowances, addressedTo: input.addressedTo ?? null },
      mode: input.employeeId ? 'final' : 'placeholders',
      placeholderLabel: (token) => (tv.has(`templates.variables.${token}.label`) ? tv(`templates.variables.${token}.label`) : token),
      watermark: true,
      screen: input.format === 'html',
    });
    const fileName = `${draft.name_en || 'template'}-preview.pdf`;
    if (input.format === 'html') return ok<PreviewResult>({ html, fileName });
    const pdf = await renderCertificatePdf(html).catch(toPdfError);
    return ok<PreviewResult>({ pdfBase64: pdf.toString('base64'), fileName });
  },
  { scope: 'certificates.previewTemplate' },
);

export type EmployeeOption = { value: string; label: string; description?: string };

/** Employee search for previews (RLS: only employees the caller can see). */
export const searchPreviewEmployees = withAction(
  employeeSearchSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.view', 'certificates.administer', 'certificates.create', 'employees.view');
    const supabase = await createClient();
    let query = supabase.from('employees').select('id, employee_number, name_ar, name_en').is('archived_at', null).order('name_ar').limit(20);
    if (input.q) query = query.ilike('search_text', `%${input.q.toLowerCase().replace(/[\\%_,()]/g, ' ')}%`);
    const { data, error } = await query;
    if (error) throw error;
    return ok<EmployeeOption[]>(
      (data ?? []).map((e) => ({
        value: e.id as string,
        label: employeeDisplayName(e, ctx.locale),
        description: [e.employee_number, employeeAlternateName(e, ctx.locale)].filter(Boolean).join(' · ') || undefined,
      })),
    );
  },
  { scope: 'certificates.searchEmployees' },
);

/* ─── Issuing ─────────────────────────────────────────────────────────────── */

async function prepareIssue(input: { requestId: string; templateId: string; language: CertificateLanguage }) {
  const supabase = await createClient({ timeoutMs: 20_000 });
  const request = await loadCertificateRequest(supabase, input.requestId);
  if (!request) throw new ActionError('errors.notFound');
  if (!(ISSUABLE_STATUSES as readonly string[]).includes(request.status)) throw new ActionError('errors.invalidTransition');
  const template = await loadPublishedTemplate(supabase, input.templateId);
  if (!template) throw new ActionError('errors.templateNotPublished');
  if (!templateSupportsLanguage(template.language, input.language)) throw new ActionError('errors.templateLanguageMismatch');
  const context = await issuingContext(supabase, request.employee_id);
  if (!context.employee) throw new ActionError('errors.notFound');
  return { supabase, request, template, context };
}

/** Preview of the certificate HR is about to issue (published template, real employee data). */
export const previewCertificate = withAction(
  previewCertificateSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'certificates.create');
    const { request, template, context } = await prepareIssue(input);
    const html = await buildCertificateDocument({
      template: template.content,
      language: input.language,
      ctx: context,
      certificateNumber: previewCertificateNumber(),
      options: {
        addressedTo: input.addressedTo ?? null,
        purpose: input.purpose ?? null,
        includeSalary: request.values.include_salary,
        includeAllowances: request.values.include_allowances,
      },
      watermark: true,
      screen: input.format === 'html',
    });
    const fileName = `${request.request_number ?? 'certificate'}-preview.pdf`;
    if (input.format === 'html') return ok<PreviewResult>({ html, fileName });
    const pdf = await renderCertificatePdf(html).catch(toPdfError);
    return ok<PreviewResult>({ pdfBase64: pdf.toString('base64'), fileName });
  },
  { scope: 'certificates.previewCertificate' },
);

export type IssuedResult = { id: string; number: string; downloadUrl: string; verifyUrl: string };

/**
 * Generates the PDF and records the certificate:
 * number (next_document_number) → render → upload `certificates/{employee}/{number}.pdf` →
 * `issue_certificate` RPC (insert + audit + employee notification + request history, atomically).
 * The uploaded file is removed again when the RPC fails.
 */
export const issueCertificate = withAction(
  issueCertificateSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'certificates.create');
    const { supabase, request, template, context } = await prepareIssue(input);

    const { data: number, error: numberError } = await supabase.rpc('next_document_number', { p_prefix: 'CERT' });
    if (numberError) throw numberError;
    const certificateNumber = String(number);

    const html = await buildCertificateDocument({
      template: template.content,
      language: input.language,
      ctx: context,
      certificateNumber,
      options: {
        addressedTo: input.addressedTo ?? null,
        purpose: input.purpose ?? null,
        includeSalary: request.values.include_salary,
        includeAllowances: request.values.include_allowances,
      },
    });
    const pdf = await renderCertificatePdf(html).catch(toPdfError);

    const path = storagePaths.certificate(request.employee_id, certificateNumber);
    const { error: uploadError } = await supabase.storage
      .from(BUCKETS.certificateFiles)
      .upload(path, pdf, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' });
    if (uploadError) {
      console.error('[certificates] upload failed:', uploadError.message);
      throw new ActionError('errors.uploadFailed');
    }

    const { data: id, error } = await supabase.rpc('issue_certificate', {
      p_certificate_number: certificateNumber,
      p_request_id: request.id,
      p_employee_id: request.employee_id,
      p_template_id: template.id,
      p_template_version: template.version,
      p_language: input.language,
      p_addressed_to: input.addressedTo ?? '',
      p_purpose: input.purpose ?? '',
    });
    if (error) {
      await removeFiles(supabase, BUCKETS.certificateFiles, [path]);
      throw error;
    }

    revalidatePath(`/requests/${request.id}`);
    revalidatePath('/certificates');
    revalidatePath(`/employees/${request.employee_id}`);
    return ok<IssuedResult>(
      {
        id: id as string,
        number: certificateNumber,
        downloadUrl: fileRouteUrl(BUCKETS.certificateFiles, path, { download: true }),
        verifyUrl: `/verify/${encodeURIComponent(certificateNumber)}`,
      },
      'certificates.toast.issued',
    );
  },
  { scope: 'certificates.issue' },
);

/** Completes the certificate request (approving the HR step first when it is still pending). */
export const completeCertificateRequest = withAction(
  requestIdSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'requests.edit', 'requests.approve', 'approvals.approve');
    const supabase = await createClient();
    const request = await loadCertificateRequest(supabase, input.requestId);
    if (!request) throw new ActionError('errors.notFound');
    const { count } = await supabase
      .from('certificates')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', request.id)
      .eq('status', 'valid');
    if (!count) throw new ActionError('certificates.errors.issueFirst');
    if (request.status === 'pending_hr_review') {
      const { error } = await supabase.rpc('act_on_request', { p_request_id: request.id, p_action: 'approve' });
      if (error) throw error;
    }
    const { error } = await supabase.rpc('act_on_request', { p_request_id: request.id, p_action: 'complete' });
    if (error) throw error;
    revalidatePath(`/requests/${request.id}`);
    revalidatePath('/requests');
    revalidatePath('/certificates');
    return ok(undefined, 'certificates.toast.requestCompleted');
  },
  { scope: 'certificates.completeRequest' },
);

export const revokeCertificate = withAction(
  revokeCertificateSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'certificates.edit', 'certificates.create');
    const supabase = await createClient();
    const { error } = await supabase.rpc('revoke_certificate', { p_certificate_id: input.id, p_reason: input.reason });
    if (error) throw error;
    await logAuditEvent({ action: 'certificate.revoke', entityType: 'certificate', entityId: input.id, summary: input.reason }, supabase);
    revalidatePath('/certificates');
    return ok(undefined, 'certificates.toast.revoked');
  },
  { scope: 'certificates.revoke' },
);

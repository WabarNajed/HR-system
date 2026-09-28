'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { renderEmailLayout, renderTemplate } from '@/lib/email/render';
import { sendEmail, type SendEmailResult } from '@/lib/email/send';
import { getTranslator } from '@/lib/i18n/translator';
import { createClient } from '@/lib/supabase/server';
import { buildPreviewContext } from './sample';
import { providerTestSchema, saveTemplateSchema, sendTestSchema, setTemplateActiveSchema } from './schemas';

/**
 * Settings › Email templates mutations (`settings.edit`; RLS enforces the same). Template edits are
 * audited by the `email_templates` row trigger; test sends write an `email_template.test` event and
 * an `email_logs` row (via `sendEmail`).
 */

function revalidateTemplates(key?: string) {
  revalidatePath('/settings/email-templates');
  if (key) revalidatePath(`/settings/email-templates/${key}`);
  revalidatePath('/settings/notifications');
}

export const saveEmailTemplate = withAction(
  saveTemplateSchema,
  async (v, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('email_templates')
      .update({ subject_ar: v.subjectAr, subject_en: v.subjectEn, body_ar: v.bodyAr, body_en: v.bodyEn })
      .eq('key', v.key)
      .select('updated_at');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidateTemplates(v.key);
    return ok({ updatedAt: data[0]!.updated_at }, 'emailTemplates.toast.saved');
  },
  { scope: 'emailTemplates.save' },
);

export const setEmailTemplateActive = withAction(
  setTemplateActiveSchema,
  async ({ key, active }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase.from('email_templates').update({ is_active: active }).eq('key', key).select('key');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidateTemplates(key);
    return ok(undefined, active ? 'emailTemplates.toast.activated' : 'emailTemplates.toast.deactivated');
  },
  { scope: 'emailTemplates.setActive' },
);

function resultMessage(result: SendEmailResult): string {
  if (result.status === 'sent') return 'emailTemplates.toast.testSent';
  if (result.status === 'skipped') return 'emailTemplates.toast.testSkipped';
  throw new ActionError('errors.emailFailed');
}

/** Renders the (possibly unsaved) template with sample values and sends it to the signed-in user. */
export const sendTestEmail = withAction(
  sendTestSchema,
  async ({ key, locale, subject, body }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const to = ctx.profile.email;
    if (!to) throw new ActionError('emailTemplates.errors.noEmail');
    const t = getTranslator(locale);
    const preview = await buildPreviewContext(locale);
    const renderedSubject = `${t('emailTemplates.test.prefix')} ${renderTemplate(subject, preview.vars, { html: false })}`;
    const html = renderEmailLayout({
      locale,
      subject: renderedSubject,
      bodyHtml: renderTemplate(body, preview.vars),
      branding: preview.branding,
      action: { label: preview.actionLabel, url: String(preview.vars.link) },
      footerNote: t('emailTemplates.test.footer'),
    });
    const result = await sendEmail({ to, subject: renderedSubject, html, templateKey: key, relatedEntityType: 'email_template' });
    await logAuditEvent({ action: 'email_template.test', entityType: 'email_template', entityId: key, summary: `Test email (${locale}) → ${to}: ${result.status}` });
    revalidatePath('/settings/email-templates');
    return ok({ status: result.status, to }, resultMessage(result));
  },
  { scope: 'emailTemplates.sendTest' },
);

/** Plain delivery check from the Notifications page / setup wizard (no template involved). */
export const sendProviderTestEmail = withAction(
  providerTestSchema,
  async ({ locale }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const to = ctx.profile.email;
    if (!to) throw new ActionError('emailTemplates.errors.noEmail');
    const t = getTranslator(locale);
    const preview = await buildPreviewContext(locale);
    const subject = t('emailTemplates.providerTest.subject', { portal: preview.branding.portalName });
    const html = renderEmailLayout({
      locale,
      subject,
      bodyHtml: `<p>${t('emailTemplates.providerTest.body')}</p>`,
      branding: preview.branding,
      footerNote: t('emailTemplates.test.footer'),
    });
    const result = await sendEmail({ to, subject, html, templateKey: null, relatedEntityType: 'email_template' });
    await logAuditEvent({ action: 'email.test', entityType: 'email', entityId: to, summary: `Delivery test → ${to}: ${result.status}` });
    revalidatePath('/settings/email-templates');
    return ok({ status: result.status, to }, resultMessage(result));
  },
  { scope: 'emailTemplates.providerTest' },
);

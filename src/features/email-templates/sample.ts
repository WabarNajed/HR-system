import 'server-only';

import { brandingCompanyName, brandingPortalName, getPublicBranding } from '@/lib/branding';
import { addDays, formatDate } from '@/lib/dates';
import type { EmailBranding, TemplateVars } from '@/lib/email/render';
import type { Locale } from '@/lib/i18n/config';
import { getTranslator } from '@/lib/i18n/translator';
import { siteUrl } from '@/lib/supabase/env';

/**
 * Sample values for email template previews and test sends. They are clearly labelled as sample
 * data in the editor; company / portal names and branding are the organization's real settings.
 */
export type PreviewContext = {
  vars: TemplateVars;
  branding: EmailBranding;
  actionLabel: string;
  footerNote: string;
};

export async function buildPreviewContext(locale: Locale, requestTypeName?: { ar: string; en: string } | null): Promise<PreviewContext> {
  const t = getTranslator(locale);
  const branding = await getPublicBranding();
  const portalName = brandingPortalName(branding, locale, t('common.appName'));
  const companyName = brandingCompanyName(branding, locale) ?? portalName;
  const expiry = formatDate(addDays(new Date(), 30) ?? new Date(), locale);
  const vars: TemplateVars = {
    recipient_name: t('emailTemplates.sample.recipient'),
    employee_name: t('emailTemplates.sample.employee'),
    manager_name: t('emailTemplates.sample.manager'),
    actor_name: t('emailTemplates.sample.manager'),
    request_number: 'HR-2026-000123',
    request_type: requestTypeName ? (locale === 'ar' ? requestTypeName.ar : requestTypeName.en) : t('emailTemplates.sample.requestType'),
    request_status: t('statuses.request.pending_hr_review'),
    company_name: companyName,
    portal_name: portalName,
    link: `${siteUrl()}/requests`,
    comment: t('emailTemplates.sample.comment'),
    reason: t('emailTemplates.sample.reason'),
    note: t('emailTemplates.sample.note'),
    expiry_date: expiry,
    days_left: 30,
    document_type: t('emailTemplates.sample.documentType'),
    email: 'employee@example.com',
    employee_number: 'EMP-0001',
  };
  return {
    vars,
    branding: {
      portalName,
      companyName,
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
    },
    actionLabel: t('notifications.email.open'),
    footerNote: t('notifications.email.footer', { portal: portalName }),
  };
}

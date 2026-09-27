import 'server-only';

import { brandingCompanyName, brandingPortalName, getPublicBranding } from '@/lib/branding';
import { formatDate } from '@/lib/dates';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { getTranslator } from '@/lib/i18n/translator';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/supabase/env';
import { renderEmailLayout, renderTemplate, type TemplateVars } from './email/render';
import { sendEmail } from './email/send';

/**
 * Email delivery for in-app notifications created by RPCs (`submit_request`, `act_on_request`, …
 * return `notification_ids`). Call after a successful mutation:
 *
 *   const { data } = await supabase.rpc('submit_request', { p_request_id });
 *   after(() => deliverEmailsForNotifications(data?.notification_ids ?? []));
 *
 * For each notification (not yet emailed): recipient profile email + language, the matching
 * `email_templates` row (active) and `notification_settings.email_enabled` for the event.
 * Renders `{{placeholders}}` in the recipient's language, wraps it in the branded layout, sends
 * (Resend | SMTP | skipped — always logged in `email_logs`) and stamps `notifications.emailed_at`
 * when sent. Uses the service-role client (cross-user reads); never throws.
 */

/** Notification type → `email_templates.key` (types without an email are absent). */
export const NOTIFICATION_EMAIL_TEMPLATES: Record<string, string | ((params: Record<string, unknown>) => string)> = {
  request_submitted: 'request_submitted',
  approval_required: 'approval_required',
  request_approved: 'request_approved',
  request_rejected: 'request_rejected',
  request_returned: 'request_returned',
  request_completed: 'request_completed',
  registration_submitted: 'registration_submitted',
  registration_approved: 'registration_approved',
  registration_rejected: 'registration_rejected',
  account_invited: 'account_invitation',
  expiry_alert: (params) => {
    const kind = String(params.kind ?? params.expiry_kind ?? params.document_kind ?? '');
    if (kind === 'iqama') return 'iqama_expiry';
    if (kind === 'passport') return 'passport_expiry';
    if (kind === 'insurance') return 'insurance_expiry';
    if (kind === 'contract') return 'contract_expiry';
    return 'document_expiry';
  },
};

export function emailTemplateKeyFor(type: string, params: Record<string, unknown> = {}): string | null {
  const entry = NOTIFICATION_EMAIL_TEMPLATES[type];
  if (!entry) return null;
  return typeof entry === 'function' ? entry(params) : entry;
}

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  params: Record<string, unknown> | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  emailed_at: string | null;
};

type ProfileRow = { id: string; email: string | null; full_name: string | null; preferred_language: string | null };
type TemplateRow = { key: string; subject_ar: string; subject_en: string; body_ar: string; body_en: string; is_active: boolean };

export type DeliverySummary = { sent: number; failed: number; skipped: number };

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Builds template variables from notification params (bilingual fields resolved per locale). */
export function buildEmailVars(
  n: Pick<NotificationRow, 'type' | 'params' | 'link'>,
  recipient: Pick<ProfileRow, 'full_name' | 'email'>,
  locale: Locale,
  context: { companyName: string; portalName: string },
): TemplateVars {
  const p = n.params ?? {};
  const t = getTranslator(locale);
  const vars: TemplateVars = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
    else if (typeof v === 'boolean') vars[k] = t(v ? 'common.yes' : 'common.no');
  }
  const employee =
    employeeDisplayName({ name_ar: str(p.employee_name_ar), name_en: str(p.employee_name_en) }, locale) ||
    str(p.employee_name) ||
    str(recipient.full_name);
  const requestType = localized({ name_ar: str(p.request_type_name_ar), name_en: str(p.request_type_name_en) }, 'name', locale);
  const status = str(p.status);
  const statusKey = `statuses.request.${status}`;
  const link = n.link ? (/^https?:\/\//.test(n.link) ? n.link : `${siteUrl()}${n.link.startsWith('/') ? '' : '/'}${n.link}`) : siteUrl();

  Object.assign(vars, {
    employee_name: employee,
    recipient_name: str(recipient.full_name) || str(recipient.email),
    manager_name: str(p.manager_name) || str(p.actor_name),
    actor_name: str(p.actor_name),
    request_number: str(p.request_number),
    request_type: requestType || str(p.request_type_key),
    request_status: status && t.has(statusKey) ? t(statusKey) : status,
    company_name: context.companyName,
    portal_name: context.portalName,
    link,
    comment: str(p.comment),
  });
  for (const dateKey of ['expiry_date', 'start_date', 'end_date', 'issue_date', 'date']) {
    if (typeof p[dateKey] === 'string') vars[dateKey] = formatDate(p[dateKey] as string, locale);
  }
  return vars;
}

export async function deliverEmailsForNotifications(ids: readonly (string | null | undefined)[]): Promise<DeliverySummary> {
  const summary: DeliverySummary = { sent: 0, failed: 0, skipped: 0 };
  const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (!unique.length) return summary;
  if (!isAdminClientConfigured()) {
    console.warn('[notifications] email delivery skipped: SUPABASE_SERVICE_ROLE_KEY is not set');
    summary.skipped = unique.length;
    return summary;
  }

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from('notifications')
      .select('id, user_id, type, params, link, entity_type, entity_id, emailed_at')
      .in('id', unique)
      .is('emailed_at', null);
    if (error) throw error;
    const notifications = (rows ?? []) as NotificationRow[];
    if (!notifications.length) return summary;

    const userIds = Array.from(new Set(notifications.map((n) => n.user_id)));
    const types = Array.from(new Set(notifications.map((n) => n.type)));
    const templateKeys = Array.from(
      new Set(notifications.map((n) => emailTemplateKeyFor(n.type, n.params ?? {})).filter((k): k is string => !!k)),
    );

    const [profilesRes, settingsRes, templatesRes, orgSettingsRes, branding] = await Promise.all([
      admin.from('profiles').select('id, email, full_name, preferred_language').in('id', userIds),
      admin.from('notification_settings').select('event_key, email_enabled').in('event_key', types),
      templateKeys.length
        ? admin.from('email_templates').select('key, subject_ar, subject_en, body_ar, body_en, is_active').in('key', templateKeys)
        : Promise.resolve({ data: [] as TemplateRow[], error: null }),
      admin.from('organization_settings').select('default_language, email_from_name, email_reply_to').maybeSingle(),
      getPublicBranding(),
    ]);
    for (const res of [profilesRes, settingsRes, templatesRes, orgSettingsRes]) {
      if (res.error) console.error('[notifications] lookup failed:', res.error.code, res.error.message);
    }

    const profiles = new Map(((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));
    const emailEnabled = new Map(
      ((settingsRes.data ?? []) as { event_key: string; email_enabled: boolean }[]).map((s) => [s.event_key, s.email_enabled]),
    );
    const templates = new Map(((templatesRes.data ?? []) as TemplateRow[]).map((tpl) => [tpl.key, tpl]));
    const orgSettings = (orgSettingsRes.data ?? null) as {
      default_language?: string | null;
      email_from_name?: string | null;
      email_reply_to?: string | null;
    } | null;
    const orgLocale: Locale = isLocale(orgSettings?.default_language) ? orgSettings.default_language : 'ar';

    for (const n of notifications) {
      const recipient = profiles.get(n.user_id);
      const templateKey = emailTemplateKeyFor(n.type, n.params ?? {});
      const template = templateKey ? templates.get(templateKey) : undefined;
      if (!recipient?.email || !emailEnabled.get(n.type) || !template || !template.is_active) {
        summary.skipped++;
        continue;
      }
      const locale: Locale = isLocale(recipient.preferred_language) ? recipient.preferred_language : orgLocale;
      const t = getTranslator(locale);
      const portalName = brandingPortalName(branding, locale, t('common.appName'));
      const companyName = brandingCompanyName(branding, locale) ?? portalName;
      const vars = buildEmailVars(n, recipient, locale, { companyName, portalName });
      const subject = renderTemplate(locale === 'ar' ? template.subject_ar : template.subject_en, vars, { html: false });
      const bodyHtml = renderTemplate(locale === 'ar' ? template.body_ar : template.body_en, vars);
      const html = renderEmailLayout({
        locale,
        subject,
        bodyHtml,
        branding: {
          portalName,
          companyName,
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          secondaryColor: branding.secondaryColor,
        },
        action: n.link ? { label: t('notifications.email.open'), url: String(vars.link) } : null,
        footerNote: t('notifications.email.footer', { portal: portalName }),
      });

      const result = await sendEmail({
        to: recipient.email,
        subject,
        html,
        fromName: orgSettings?.email_from_name ?? null,
        replyTo: orgSettings?.email_reply_to ?? null,
        templateKey,
        relatedEntityType: n.entity_type,
        relatedEntityId: n.entity_id,
      });
      summary[result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'skipped']++;
      if (result.status === 'sent') {
        const { error: markError } = await admin.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', n.id);
        if (markError) console.error('[notifications] marking emailed_at failed:', markError.code, markError.message);
      }
    }
  } catch (error) {
    console.error('[notifications] delivery failed:', error instanceof Error ? error.message : error);
  }
  return summary;
}

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { brandingCompanyName, brandingPortalName, getPublicBranding } from '@/lib/branding';
import { formatDate } from '@/lib/dates';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { getTranslator } from '@/lib/i18n/translator';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { renderEmailLayout, renderTemplate, type TemplateVars } from './email/render';
import { recordEmail, sendEmail } from './email/send';

/**
 * Email delivery for in-app notifications (docs/DATABASE.md §11). Call after a successful mutation
 * with the `notification_ids` returned by the RPC:
 *
 *   const { data } = await supabase.rpc('submit_request', { p_request_id });
 *   after(() => deliverEmailsForNotifications(data?.notification_ids ?? []));
 *
 * 1. `claim_notification_emails(ids)` (as the acting user — or the service role with
 *    `{ asService: true }` for trigger-created notifications such as registrations) returns only
 *    notifications whose event has `email_enabled`, with recipient email/name/language, the
 *    template key, the template subject/body already in the recipient's language and the sender
 *    settings, and stamps `emailed_at` (idempotent — a notification is never emailed twice).
 *    No service role is needed for user-caused notifications (migration
 *    20260928012000_integration_rpc_fixes.sql); it is only used as a fallback to read templates
 *    when talking to a database that predates that migration.
 * 2. The template is rendered (`{{placeholders}}`, HTML-escaped) inside the branded layout.
 * 3. `sendEmail` (Resend | SMTP | skipped) and `log_email` for every attempt.
 * Never throws; returns a summary.
 */

type AnyClient = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Notification type → `email_templates.key` (mirrors the SQL in `claim_notification_emails`). */
export function emailTemplateKeyFor(type: string, params: Record<string, unknown> = {}): string {
  if (type === 'account_invited') return 'account_invitation';
  if (type === 'expiry_alert') {
    const kind = typeof params.kind === 'string' && params.kind ? params.kind : 'document';
    return `${kind}_expiry`;
  }
  return type;
}

type ClaimedRow = {
  notification_id: string;
  recipient_email: string | null;
  recipient_name: string | null;
  language: string | null;
  type: string;
  params: Record<string, unknown> | null;
  link: string | null;
  template_key: string | null;
  /** Present since migration 20260928012000 (null = template missing). */
  template_active?: boolean | null;
  subject?: string | null;
  body?: string | null;
  email_from_name?: string | null;
  email_reply_to?: string | null;
};

type ResolvedTemplate = { subject: string; body: string; active: boolean };

type TemplateRow = { key: string; subject_ar: string; subject_en: string; body_ar: string; body_en: string; is_active: boolean };

export type DeliverySummary = { claimed: number; sent: number; failed: number; skipped: number };

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function absoluteLink(link: string | null): string {
  if (!link) return siteUrl();
  if (/^https?:\/\//.test(link)) return link;
  return `${siteUrl()}${link.startsWith('/') ? '' : '/'}${link}`;
}

/** Template variables from notification params (bilingual fields resolved per locale). */
export function buildEmailVars(
  row: Pick<ClaimedRow, 'type' | 'params' | 'link' | 'recipient_name' | 'recipient_email'>,
  locale: Locale,
  context: { companyName: string; portalName: string },
): TemplateVars {
  const p = row.params ?? {};
  const t = getTranslator(locale);
  const vars: TemplateVars = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
    else if (typeof v === 'boolean') vars[k] = t(v ? 'common.yes' : 'common.no');
  }
  const employee =
    employeeDisplayName({ name_ar: str(p.employee_name_ar), name_en: str(p.employee_name_en) }, locale) ||
    str(p.full_name) ||
    str(row.recipient_name);
  const requestType = localized({ name_ar: str(p.request_type_name_ar), name_en: str(p.request_type_name_en) }, 'name', locale);
  const status = str(p.status);
  const statusKey = `statuses.request.${status}`;
  Object.assign(vars, {
    employee_name: employee,
    recipient_name: str(row.recipient_name) || str(row.recipient_email),
    manager_name: str(p.manager_name) || str(p.actor_name),
    actor_name: str(p.actor_name),
    request_number: str(p.request_number),
    request_type: requestType || str(p.request_type_key),
    request_status: status && t.has(statusKey) ? t(statusKey) : status,
    company_name: context.companyName,
    portal_name: context.portalName,
    link: absoluteLink(row.link),
    comment: str(p.comment),
  });
  for (const dateKey of ['expiry_date', 'start_date', 'end_date', 'issue_date', 'date']) {
    if (typeof p[dateKey] === 'string') vars[dateKey] = formatDate(p[dateKey] as string, locale);
  }
  return vars;
}

export async function deliverEmailsForNotifications(
  ids: readonly (string | null | undefined)[],
  options: { asService?: boolean } = {},
): Promise<DeliverySummary> {
  const summary: DeliverySummary = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (!unique.length) return summary;

  try {
    const userClient: AnyClient | null = options.asService ? null : await createClient().catch(() => null);
    const claimClient: AnyClient | null = options.asService
      ? isAdminClientConfigured()
        ? createAdminClient()
        : null
      : userClient;
    if (!claimClient) {
      console.warn('[notifications] email delivery skipped: no client for claim_notification_emails');
      return summary;
    }

    const { data, error } = await claimClient.rpc('claim_notification_emails', { p_notification_ids: unique });
    if (error) throw error;
    const claimed = (data ?? []) as ClaimedRow[];
    summary.claimed = claimed.length;
    if (!claimed.length) return summary;

    const templateKeyOf = (c: ClaimedRow) => c.template_key ?? emailTemplateKeyFor(c.type, c.params ?? {});
    // The claim returns the template in the recipient's language. Fallback (older database without the
    // template columns): read `email_templates` — RLS lets only HR read it, so use the service role when
    // configured. The claim above already authorized delivery of these notifications.
    const needsLookup = claimed.some((c) => c.template_active === undefined);
    let lookedUp = new Map<string, TemplateRow>();
    if (needsLookup) {
      const templateClient: AnyClient = isAdminClientConfigured() ? createAdminClient() : claimClient;
      const keys = Array.from(new Set(claimed.map(templateKeyOf)));
      const res = await templateClient
        .from('email_templates')
        .select('key, subject_ar, subject_en, body_ar, body_en, is_active')
        .in('key', keys);
      if (res.error) console.error('[notifications] templates lookup failed:', res.error.code, res.error.message);
      lookedUp = new Map(((res.data ?? []) as TemplateRow[]).map((tpl) => [tpl.key, tpl]));
    }
    const resolveTemplate = (row: ClaimedRow, locale: Locale): ResolvedTemplate | null => {
      if (row.template_active !== undefined) {
        if (row.template_active === null || !row.subject || !row.body) return null;
        return { subject: row.subject, body: row.body, active: row.template_active };
      }
      const tpl = lookedUp.get(templateKeyOf(row));
      if (!tpl) return null;
      const pick = (ar: string, en: string) => (locale === 'ar' ? ar || en : en || ar);
      return { subject: pick(tpl.subject_ar, tpl.subject_en), body: pick(tpl.body_ar, tpl.body_en), active: tpl.is_active };
    };

    const branding = await getPublicBranding();
    let senderSettings: { email_from_name?: string | null; email_reply_to?: string | null } | null = null;
    if (claimed.some((c) => c.email_from_name === undefined)) {
      const res = await claimClient.from('organization_settings').select('email_from_name, email_reply_to').maybeSingle();
      senderSettings = (res.data ?? null) as typeof senderSettings;
    }

    for (const row of claimed) {
      const templateKey = templateKeyOf(row);
      const locale: Locale = isLocale(row.language) ? row.language : 'ar';
      const template = resolveTemplate(row, locale);
      const to = row.recipient_email ?? '';
      if (!template || !template.active) {
        summary.skipped++;
        await recordEmail(
          { to, subject: templateKey, html: '', templateKey, relatedEntityType: 'notification', relatedEntityId: row.notification_id },
          { status: 'skipped', provider: null, error: 'email template missing or inactive' },
          userClient,
        );
        continue;
      }
      const t = getTranslator(locale);
      const portalName = brandingPortalName(branding, locale, t('common.appName'));
      const companyName = brandingCompanyName(branding, locale) ?? portalName;
      const vars = buildEmailVars(row, locale, { companyName, portalName });
      const subject = renderTemplate(template.subject, vars, { html: false });
      const bodyHtml = renderTemplate(template.body, vars);
      const html = renderEmailLayout({
        locale,
        subject,
        bodyHtml,
        branding: { portalName, companyName, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor },
        action: row.link ? { label: t('notifications.email.open'), url: String(vars.link) } : null,
        footerNote: t('notifications.email.footer', { portal: portalName }),
      });
      const result = await sendEmail(
        {
          to,
          subject,
          html,
          fromName: (row.email_from_name === undefined ? senderSettings?.email_from_name : row.email_from_name) ?? null,
          replyTo: (row.email_reply_to === undefined ? senderSettings?.email_reply_to : row.email_reply_to) ?? null,
          templateKey,
          relatedEntityType: 'notification',
          relatedEntityId: row.notification_id,
        },
        { client: userClient },
      );
      summary[result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'skipped']++;
    }
  } catch (error) {
    console.error('[notifications] delivery failed:', error instanceof Error ? error.message : error);
  }
  return summary;
}

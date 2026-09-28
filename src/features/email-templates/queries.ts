import 'server-only';

import type { ListParams } from '@/lib/list-params';
import { toIlikePattern } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import type { EMAIL_LOG_FILTER_KEYS, EMAIL_LOG_SORTS } from './constants';

export type EmailTemplateRow = {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  subject_ar: string;
  subject_en: string;
  body_ar: string;
  body_en: string;
  placeholders: string[];
  is_active: boolean;
  updated_at: string;
};

export type EmailLogRow = {
  id: string;
  recipient: string;
  subject: string | null;
  template_key: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  status: 'sent' | 'failed' | 'skipped';
  provider: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  /** Resolved app link of the related record (notification link, user, template). */
  href: string | null;
  /** Related record kind for the label (`request`, `registration`, `employee`, `certificate`, `leave`, `user`, `test`, `other`). */
  relatedKind: string | null;
};

const TEMPLATE_COLUMNS = 'id, key, name_ar, name_en, subject_ar, subject_en, body_ar, body_en, placeholders, is_active, updated_at';

function toTemplate(raw: Record<string, unknown>): EmailTemplateRow {
  const r = raw as Omit<EmailTemplateRow, 'placeholders'> & { placeholders: unknown };
  return { ...r, placeholders: Array.isArray(r.placeholders) ? r.placeholders.filter((p): p is string => typeof p === 'string') : [] };
}

export async function listEmailTemplates(supabase: ServerSupabaseClient): Promise<EmailTemplateRow[]> {
  const { data, error } = await supabase.from('email_templates').select(TEMPLATE_COLUMNS).order('key');
  if (error) throw error;
  return (data ?? []).map((r) => toTemplate(r as Record<string, unknown>));
}

export async function getEmailTemplate(supabase: ServerSupabaseClient, key: string): Promise<EmailTemplateRow | null> {
  const { data, error } = await supabase.from('email_templates').select(TEMPLATE_COLUMNS).eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? toTemplate(data as Record<string, unknown>) : null;
}

export type EmailStats = { sent: number; failed: number; skipped: number };

/** Delivery counts of the last `days` days. */
export async function emailStats(supabase: ServerSupabaseClient, sinceIso: string): Promise<EmailStats> {
  const count = async (status: string) => {
    const { count: c, error } = await supabase.from('email_logs').select('id', { count: 'exact', head: true }).eq('status', status).gte('created_at', sinceIso);
    if (error) throw error;
    return c ?? 0;
  };
  const [sent, failed, skipped] = await Promise.all([count('sent'), count('failed'), count('skipped')]);
  return { sent, failed, skipped };
}

function kindFromLink(link: string | null, type: string | null): string {
  if (link?.startsWith('/requests/')) return 'request';
  if (link?.startsWith('/settings/pending-registrations') || type?.startsWith('registration_')) return 'registration';
  if (link?.startsWith('/employees/')) return 'employee';
  if (link?.startsWith('/certificates')) return 'certificate';
  if (link?.startsWith('/leave')) return 'leave';
  return 'other';
}

type LogSort = (typeof EMAIL_LOG_SORTS)[number];
type LogFilter = (typeof EMAIL_LOG_FILTER_KEYS)[number];

/** Server-side paginated Email log (RLS: settings.view / audit.view). */
export async function listEmailLogs(supabase: ServerSupabaseClient, params: ListParams<LogSort, LogFilter>): Promise<{ rows: EmailLogRow[]; total: number }> {
  let query = supabase
    .from('email_logs')
    .select('id, recipient, subject, template_key, related_entity_type, related_entity_id, status, provider, error, sent_at, created_at', { count: 'exact' });
  if (params.q) {
    const pattern = toIlikePattern(params.q);
    query = query.or(`recipient.ilike.${pattern},subject.ilike.${pattern}`);
  }
  const statuses = params.filters.status?.filter((s) => ['sent', 'failed', 'skipped'].includes(s));
  if (statuses?.length) query = query.in('status', statuses);
  const templates = params.filters.template?.filter((k) => /^[a-z][a-z0-9_]{0,62}$/.test(k));
  if (templates?.length) query = query.in('template_key', templates);
  const from = params.filters.sentFrom?.[0];
  const to = params.filters.sentTo?.[0];
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte('created_at', `${from}T00:00:00+03:00`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte('created_at', `${to}T23:59:59.999+03:00`);
  const sort = params.sort ?? 'created_at';
  query = query.order(sort, { ascending: params.dir === 'asc' }).order('id').range(params.from, params.to);

  const { data, error, count } = await query;
  if (error) throw error;
  const raw = (data ?? []) as Omit<EmailLogRow, 'href' | 'relatedKind'>[];

  const notificationIds = raw.filter((r) => r.related_entity_type === 'notification' && r.related_entity_id).map((r) => r.related_entity_id!);
  const links = new Map<string, { link: string | null; type: string | null }>();
  if (notificationIds.length) {
    const res = await supabase.rpc('email_log_links', { p_notification_ids: Array.from(new Set(notificationIds)) });
    if (res.error) console.error('[email-templates] email_log_links failed:', res.error.code, res.error.message);
    for (const l of res.data ?? []) links.set(l.notification_id, { link: l.link, type: l.type });
  }

  const rows: EmailLogRow[] = raw.map((r) => {
    if (r.related_entity_type === 'notification' && r.related_entity_id) {
      const l = links.get(r.related_entity_id);
      return { ...r, href: l?.link ?? null, relatedKind: l ? kindFromLink(l.link, l.type) : null };
    }
    if (r.related_entity_type === 'profile') return { ...r, href: `/settings/users?q=${encodeURIComponent(r.recipient)}`, relatedKind: 'user' };
    if (r.related_entity_type === 'email_template') return { ...r, href: r.template_key ? `/settings/email-templates/${r.template_key}` : null, relatedKind: 'test' };
    return { ...r, href: null, relatedKind: r.related_entity_type ? 'other' : null };
  });
  return { rows, total: count ?? 0 };
}

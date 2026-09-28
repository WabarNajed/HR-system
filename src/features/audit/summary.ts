import 'server-only';

import { getExportDataset } from '@/lib/export/registry';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { splitAction, type AuditTranslator } from './labels';

/**
 * Display text for an audit event's `summary` column. Several writers store technical or English
 * text there (`employees · csv · 13`, `35 tables · 1002 rows`, a request-type key, `IBAN revealed`, …),
 * so the summary is rebuilt from the event's structured `changes` through i18n whenever possible,
 * request-type keys are resolved to their localized name, and text that only repeats the action or the
 * actor is dropped. Unknown actions keep their stored summary (record names, request numbers …).
 */

export type AuditSummaryRow = {
  action: string;
  entity_id: string | null;
  summary: string | null;
  changes: unknown;
  actor_email: string | null;
};

export type RequestTypeName = { name_ar: string | null; name_en: string | null };

export type AuditSummaryLookups = {
  /** request_types.key → names (for `request.create`, whose summary is the type key). */
  requestTypes?: Map<string, RequestTypeName>;
};

const EXPORT_FORMATS = new Set(['csv', 'xlsx', 'pdf']);
const TYPE_KEY_RE = /^[a-z0-9_]+$/;
const EMAIL_TEST_RE = /→\s*(\S+@\S+?):\s*(sent|failed|skipped)\s*$/;
const LEAVE_INIT_RE = /^(\d{4}):\s*(\d+)\s+balances?$/;
const ROLE_ASSIGN_RE = /^([a-z_]+) → (.+)$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function int(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function exportSummary(t: AuditTranslator, row: AuditSummaryRow, verb: string, c: Record<string, unknown>): string | null {
  const format = text(c.format);
  const rows = int(c.rows);
  if (!format || !EXPORT_FORMATS.has(format) || rows === null) return null;
  const dataset = [row.entity_id, verb, verb.replace(/_/g, '-')]
    .map((k) => (k ? getExportDataset(k) : null))
    .find((d) => d !== null);
  const title = dataset && t.has(dataset.titleKey) ? t(dataset.titleKey) : null;
  const values = { format: t(`enums.exportFormat.${format}`), count: rows };
  return title ? t('audit.summaries.exportDataset', { ...values, dataset: title }) : t('audit.summaries.export', values);
}

function importSummary(t: AuditTranslator, c: Record<string, unknown>): string | null {
  const file = text(c.file);
  const created = int(c.created);
  const updated = int(c.updated);
  const failed = int(c.not_imported) ?? 0;
  if (created === null || updated === null) return file;
  const counts = t('audit.summaries.importCounts', { created, updated, failed });
  return file ? `${file} · ${counts}` : counts;
}

export function auditSummary(
  t: AuditTranslator,
  row: AuditSummaryRow,
  locale: Locale,
  lookups: AuditSummaryLookups = {},
): string | null {
  const raw = row.summary?.trim() || null;
  const c = record(row.changes) ?? {};
  const { entity, verb } = splitAction(row.action);

  if (entity === 'export') return exportSummary(t, row, verb, c);
  if (entity === 'import' || row.action === 'employee.import') return importSummary(t, c) ?? null;

  switch (row.action) {
    case 'backup.export': {
      const tables = int(c.tables) ?? (record(c.counts) ? Object.keys(record(c.counts)!).length : null);
      const rows = int(c.rows);
      if (tables === null || rows === null) return null;
      const base = t('audit.summaries.backup', { tables, rows });
      const sensitive = c.sensitive === true || Boolean(raw && /salary/i.test(raw));
      return sensitive ? `${base} · ${t('audit.summaries.backupSensitive')}` : base;
    }
    case 'backup.reset_denied':
      return t('audit.summaries.reauthFailed');
    case 'employee.iban_reveal':
      // The action label says it all (legacy rows stored the English "IBAN revealed").
      return null;
    case 'request.create': {
      if (!raw || !TYPE_KEY_RE.test(raw)) return raw;
      const type = lookups.requestTypes?.get(raw);
      return type ? localized(type, 'name', locale) || null : null;
    }
    case 'leave_balance.initialize': {
      const m = raw ? LEAVE_INIT_RE.exec(raw) : null;
      return m ? t('audit.summaries.leaveInitialize', { year: m[1]!, count: Number(m[2]) }) : raw;
    }
    case 'document.expiry_check': {
      const items = int(c.items);
      const notifications = int(c.notifications);
      return items !== null && notifications !== null ? t('audit.summaries.expiryCheck', { items, notifications }) : null;
    }
    case 'email.test':
    case 'email_template.test': {
      const m = raw ? EMAIL_TEST_RE.exec(raw) : null;
      return m ? t('audit.summaries.emailTest', { email: m[1]!, status: t(`statuses.email.${m[2]}`) }) : null;
    }
    default:
      break;
  }

  if (entity === 'user_role' && raw) {
    const m = ROLE_ASSIGN_RE.exec(raw);
    if (m && t.has(`enums.role.${m[1]}`)) return `${t(`enums.role.${m[1]}`)} → ${m[2]}`;
  }
  // Sign-in events (and similar) store the actor's e-mail — already shown as the actor.
  if (raw && row.actor_email && raw.toLowerCase() === row.actor_email.toLowerCase()) return null;
  return raw;
}

/** Request-type keys referenced by `request.create` events (for `AuditSummaryLookups`). */
export function requestTypeKeysOf(rows: readonly Pick<AuditSummaryRow, 'action' | 'summary'>[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) {
    const s = r.summary?.trim();
    if (r.action === 'request.create' && s && TYPE_KEY_RE.test(s)) keys.add(s);
  }
  return [...keys];
}

/** Loads what `auditSummary` needs for a page of events (request-type names; RLS as the viewer). */
export async function getAuditSummaryLookups(
  supabase: ServerSupabaseClient,
  rows: readonly Pick<AuditSummaryRow, 'action' | 'summary'>[],
): Promise<AuditSummaryLookups> {
  const keys = requestTypeKeysOf(rows);
  if (!keys.length) return {};
  const { data, error } = await supabase.from('request_types').select('key, name_ar, name_en').in('key', keys);
  if (error) {
    console.error('[audit] request type names failed', error);
    return {};
  }
  return { requestTypes: new Map((data ?? []).map((r) => [r.key, { name_ar: r.name_ar, name_en: r.name_en }])) };
}

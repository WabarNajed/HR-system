import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverEmailsForNotifications, type DeliverySummary } from '@/lib/notifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type ExpiryRunResult = {
  runId: string | null;
  items: number;
  notifications: number;
  documentsExpired: number;
  emails: DeliverySummary;
};

type RpcResult = {
  run_id?: string | null;
  items?: number | null;
  notifications?: number | null;
  documents_expired?: number | null;
  notification_ids?: string[] | null;
};

/**
 * Runs the expiry-alert engine (`public.run_expiry_alerts`, idempotent per item + expiry date +
 * threshold) and emails the resulting notifications through the standard pipeline
 * (`claim_notification_emails` → template `{kind}_expiry` → send → `log_email`).
 *
 * - Cron: pass the service-role client and `asService: true`.
 * - HR "Run expiry check now": the user's client (the RPC checks org `documents.edit`); the
 *   notifications are created by that user, so the same user claims their e-mails.
 * Throws the RPC error (callers map it).
 */
export async function runExpiryAlerts(client: AnyClient, options: { source: 'cron' | 'manual'; asService?: boolean }): Promise<ExpiryRunResult> {
  const { data, error } = await client.rpc('run_expiry_alerts', { p_source: options.source });
  if (error) throw error;
  const result = (data ?? {}) as RpcResult;
  const ids = Array.isArray(result.notification_ids) ? result.notification_ids : [];
  const emails = ids.length
    ? await deliverEmailsForNotifications(ids, { asService: options.asService })
    : { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  return {
    runId: result.run_id ?? null,
    items: result.items ?? 0,
    notifications: result.notifications ?? ids.length,
    documentsExpired: result.documents_expired ?? 0,
    emails,
  };
}

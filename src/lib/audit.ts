import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Application-level audit events via RPC `public.log_audit_event` (actor = the signed-in user;
 * sensitive keys in `changes` are masked by the database). Table-level changes are audited by
 * triggers — use this for events without a row change: login/logout, exports, downloads,
 * backups, PDF generation, etc.
 *
 * Action names are dot-namespaced lowercase (`auth.login`, `export.employees`) — the RPC rejects
 * anything else. Never throws: failures are logged server-side and reported as `false`.
 */

export type AuditEvent = {
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  summary?: string | null;
  changes?: Record<string, unknown> | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

const ACTION_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** Normalizes free-form keys (e.g. `export.leave-balances`) to the RPC's allowed format. */
export function normalizeAuditAction(action: string): string {
  return action
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/\._|_\./g, '.');
}

export async function logAuditEvent(event: AuditEvent, client?: AnyClient): Promise<boolean> {
  const action = normalizeAuditAction(event.action);
  if (!ACTION_RE.test(action)) {
    console.error('[audit] invalid action name:', event.action);
    return false;
  }
  try {
    const supabase = client ?? (await createClient());
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: action,
      p_entity_type: event.entityType ?? null,
      p_entity_id: event.entityId === null || event.entityId === undefined ? null : String(event.entityId),
      p_summary: event.summary ?? null,
      p_changes: event.changes ?? null,
    });
    if (error) {
      console.error('[audit] log_audit_event failed:', action, error.code, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[audit] log_audit_event threw:', action, error instanceof Error ? error.message : error);
    return false;
  }
}

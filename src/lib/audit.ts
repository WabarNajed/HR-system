import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';

/**
 * Application-level audit events (docs/DATABASE.md §12). Table-level changes are audited by
 * triggers — use this for events without a row change: logout, password change, exports,
 * downloads, backups, PDF generation, e-mail tests, etc.
 *
 * Call it ONLY after the action's own permission check: RPC `public.log_audit_event` is service-role
 * only (a user JWT can never write the audit trail), so this module writes through the service-role
 * client with the VERIFIED actor of the current session (`auth.getClaims()` → `sub`) plus the
 * end-user's IP / user agent from the incoming request. Sensitive keys in `changes` are masked by
 * the database.
 *
 * Action names are dot-namespaced lowercase (`auth.logout`, `export.employees`) — the RPC rejects
 * anything else. Never throws: failures are logged server-side and reported as `false`.
 */

export type AuditEvent = {
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  summary?: string | null;
  changes?: Record<string, unknown> | null;
  /**
   * Actor override for server code that already verified the user (e.g. `ctx.user.id`). When omitted,
   * the actor is read from the session of `client` (or of the current request). `null` = system event.
   */
  actorId?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

const ACTION_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalizes free-form keys (e.g. `export.leave-balances`) to the RPC's allowed format. */
export function normalizeAuditAction(action: string): string {
  return action
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/\._|_\./g, '.');
}

/** The signed-in user of `client` (session client) or of the current request; null when there is none. */
async function sessionActor(client?: AnyClient): Promise<string | null> {
  try {
    const supabase = client ?? (await createClient());
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return typeof sub === 'string' && UUID_RE.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

/** End-user IP / user agent of the current request (null outside a request scope). */
async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || h.get('x-real-ip')?.trim() || null;
    return { ip: ip ? ip.slice(0, 100) : null, userAgent: h.get('user-agent')?.slice(0, 500) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Appends one audit event. `client` is the caller's SESSION client (used only to identify the actor,
 * e.g. right before `signOut()`); the row itself is written with the service-role client.
 */
export async function logAuditEvent(event: AuditEvent, client?: AnyClient): Promise<boolean> {
  const action = normalizeAuditAction(event.action);
  if (!ACTION_RE.test(action)) {
    console.error('[audit] invalid action name:', event.action);
    return false;
  }
  if (!isAdminClientConfigured()) {
    console.error('[audit] event not recorded — SUPABASE_SERVICE_ROLE_KEY is not configured:', action);
    return false;
  }
  try {
    const explicitActor = event.actorId === undefined ? undefined : event.actorId && UUID_RE.test(event.actorId) ? event.actorId : null;
    const [actorId, meta] = await Promise.all([
      explicitActor === undefined ? sessionActor(client) : Promise.resolve(explicitActor),
      requestMeta(),
    ]);
    const { error } = await createAdminClient().rpc('log_audit_event', {
      p_action: action,
      p_entity_type: event.entityType ?? undefined,
      p_entity_id: event.entityId === null || event.entityId === undefined ? undefined : String(event.entityId),
      p_summary: event.summary ?? undefined,
      p_changes: (event.changes ?? undefined) as Json | undefined,
      p_actor_id: actorId ?? undefined,
      p_ip: meta.ip ?? undefined,
      p_user_agent: meta.userAgent ?? undefined,
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

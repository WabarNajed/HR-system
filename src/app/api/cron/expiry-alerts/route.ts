import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { runExpiryAlerts } from '@/features/documents/expiry-alerts';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

/**
 * GET /api/cron/expiry-alerts — daily expiry alerts (Vercel Cron, see vercel.json).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel sends it automatically when the env var is
 * set). Missing/invalid secret → 401; secret or service role not configured → 503.
 * Runs `run_expiry_alerts` with the service role (idempotent per item + expiry date + threshold, so
 * re-runs and retries never duplicate alerts) and e-mails the new notifications. Also removes rows of
 * uploads that never completed (`cleanup_orphan_employee_documents`, rows older than a day).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1]!.trim());
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return json(503, { ok: false, error: 'cron_not_configured' });
  if (!secretMatches(request.headers.get('authorization'), secret)) return json(401, { ok: false, error: 'unauthorized' });
  if (!isAdminClientConfigured()) return json(503, { ok: false, error: 'service_role_not_configured' });

  const started = Date.now();
  try {
    const admin = createAdminClient({ timeoutMs: 30_000 });
    const result = await runExpiryAlerts(admin, { source: 'cron', asService: true });
    // Housekeeping: rows of uploads that never completed (tab closed mid-upload), older than a day.
    const orphans = await admin.rpc('cleanup_orphan_employee_documents', {});
    if (orphans.error) console.error('[cron] orphan document cleanup failed:', orphans.error.code, orphans.error.message);
    return json(200, {
      ok: true,
      run_id: result.runId,
      items: result.items,
      notifications: result.notifications,
      documents_expired: result.documentsExpired,
      emails: result.emails,
      orphan_documents_removed: orphans.error ? null : (orphans.data ?? 0),
      duration_ms: Date.now() - started,
    });
  } catch (error) {
    const e = error as { code?: string; message?: string } | null;
    console.error('[cron] expiry-alerts failed:', e?.code, e?.message ?? error);
    return json(500, { ok: false, error: 'run_failed' });
  }
}

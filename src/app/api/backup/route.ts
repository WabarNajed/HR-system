import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { buildBackup } from '@/features/backup/server/build';
import { logAuditEvent } from '@/lib/audit';
import { getSessionContext } from '@/lib/auth/session';
import { todayIso } from '@/lib/dates';
import { logAndMapError } from '@/lib/errors';
import { contentDisposition, plainText } from '@/lib/http';
import { getTranslator } from '@/lib/i18n/translator';
import { checkAccess } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/backup → streamed ZIP backup package (manifest.json + JSON and XLSX per table).
 * Access: /admin/backup rule (settings.administer); salary/bank tables for a super admin only.
 * Writes a `backup.export` audit event (the backup history is read from the audit trail).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return plainText(401, getTranslator('en')('errors.unauthorized'));
  const t = getTranslator(ctx.locale);
  if (ctx.profile.status !== 'active' || !checkAccess(ctx, ROUTE_ACCESS['/admin/backup'])) return plainText(403, t('errors.forbidden'));
  try {
    const supabase = await createClient({ timeoutMs: 60_000 });
    const { stream, manifest } = await buildBackup(supabase, ctx);
    const fileName = `hr-backup-${todayIso().replace(/-/g, '')}-${new Date().toISOString().slice(11, 16).replace(':', '')}.zip`;
    await logAuditEvent(
      {
        action: 'backup.export',
        entityType: 'backup',
        entityId: fileName,
        summary: `${manifest.tables.length} tables · ${manifest.total_rows} rows${manifest.includes_sensitive ? ' · incl. salary & bank' : ''}`,
        changes: { tables: manifest.tables.length, rows: manifest.total_rows, sensitive: manifest.includes_sensitive, file: fileName, counts: manifest.counts },
      },
      supabase,
    );
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition(fileName),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return plainText(500, t(logAndMapError('backup.export', error)));
  }
}

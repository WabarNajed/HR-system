import type { NextRequest } from 'next/server';
import type { DbClient } from '@/features/data-management/lib/context';
import { buildErrorReport, type ReportRow } from '@/features/data-management/lib/error-report';
import { msg } from '@/features/data-management/lib/messages';
import type { Issue, JsonCell } from '@/features/data-management/lib/types';
import { canImportType } from '@/features/data-management/permissions';
import { loadImport } from '@/features/data-management/server/service';
import { getSessionContext } from '@/lib/auth/session';
import { getPublicBranding } from '@/lib/branding';
import { todayIso } from '@/lib/dates';
import { logAndMapError } from '@/lib/errors';
import { contentDisposition, plainText } from '@/lib/http';
import { getTranslator } from '@/lib/i18n/translator';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/data-management/imports/<id>/error-report → XLSX of the rows with errors or warnings
 * (messages in the viewer's language, original values in the file's column order).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = { row_number: number; status: string; raw: unknown; errors: unknown; warnings: unknown };

async function fetchRows(db: DbClient, importId: string, mode: 'errors' | 'warnings'): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    let q = db.from('import_rows').select('row_number, status, raw, errors, warnings').eq('import_id', importId);
    q = mode === 'errors' ? q.eq('status', 'error') : q.neq('status', 'error').filter('warnings', 'cs', JSON.stringify([{ level: 'warning' }]));
    const { data, error } = await q.order('row_number').range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return plainText(401, getTranslator('en')('errors.unauthorized'));
  const t = getTranslator(ctx.locale);
  if (ctx.profile.status !== 'active') return plainText(403, t('errors.forbidden'));
  try {
    const db = (await createClient({ timeoutMs: 30_000 })) as unknown as DbClient;
    const imp = await loadImport(db, id);
    if (!imp) return plainText(404, t('errors.notFound'));
    if (!canImportType(ctx, imp.type)) return plainText(403, t('errors.forbidden'));

    const [errors, warnings] = await Promise.all([fetchRows(db, imp.id, 'errors'), fetchRows(db, imp.id, 'warnings')]);
    const rows: ReportRow[] = [...errors, ...warnings]
      .sort((a, b) => a.row_number - b.row_number)
      .map((r) => ({
        row_number: r.row_number,
        status: r.status,
        raw: (r.raw as Record<string, JsonCell>) ?? {},
        errors: (r.errors as Issue[]) ?? [],
        warnings: (r.warnings as Issue[]) ?? [],
      }));
    const columns =
      imp.mapping?.columns?.map((c) => c.label) ??
      Array.from(new Set(rows.flatMap((r) => Object.keys(r.raw))));
    const branding = await getPublicBranding();
    const buffer = await buildErrorReport({
      locale: ctx.locale,
      type: imp.type,
      fileName: imp.fileName,
      createdAt: imp.createdAt,
      columns,
      rows,
      totals: imp.totals,
      headerColor: branding.primaryColor ?? undefined,
    });
    const base = imp.fileName.replace(/\.[^.]+$/, '');
    const fileName = `${msg(ctx.locale, 'dataManagement.report.fileName')}-${base}-${todayIso().replace(/-/g, '')}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(fileName),
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return plainText(500, t(logAndMapError('dataManagement.errorReport', error)));
  }
}

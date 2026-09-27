import type { NextRequest } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { getSessionContext } from '@/lib/auth/session';
import { brandingCompanyName, brandingPortalName, getPublicBranding } from '@/lib/branding';
import { formatDateTime, todayIso } from '@/lib/dates';
import { logAndMapError } from '@/lib/errors';
import { contentDisposition, plainText } from '@/lib/http';
import { buildCsv, buildPdf, buildXlsx } from '@/lib/export/engine';
import { getExportDataset } from '@/lib/export/registry';
import { EXPORT_FORMATS, EXPORT_ROW_LIMIT, type ExportContext, type ExportFormat } from '@/lib/export/types';
import { getTranslator } from '@/lib/i18n/translator';
import { parseListParams } from '@/lib/list-params';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/export/<dataset>?format=xlsx|csv|pdf&<same filters as the page>
 * Auth → dataset lookup (404) → permission (403) → rows via RLS client (capped) → file.
 * Every export writes an `export.<dataset>` audit event.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
};

function textResponse(status: number, key: string, locale: 'ar' | 'en' = 'en') {
  return plainText(status, getTranslator(locale)(key));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset: key } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return textResponse(401, 'errors.unauthorized');
  const locale = ctx.locale;
  if (ctx.profile.status !== 'active') return textResponse(403, 'errors.forbidden', locale);

  const dataset = getExportDataset(key);
  if (!dataset) return textResponse(404, 'errors.notFound', locale);
  if (!can(ctx, dataset.permission)) return textResponse(403, 'errors.forbidden', locale);

  const search = request.nextUrl.searchParams;
  const requested = (search.get('format') ?? 'xlsx').toLowerCase() as ExportFormat;
  const allowed = dataset.formats ?? EXPORT_FORMATS;
  if (!EXPORT_FORMATS.includes(requested) || !allowed.includes(requested)) return textResponse(400, 'errors.validation', locale);

  const t = getTranslator(locale);
  try {
    const supabase = await createClient({ timeoutMs: 30_000 });
    const listParams = parseListParams(search, {
      filterKeys: dataset.filterKeys ?? [],
      allowedSorts: dataset.allowedSorts,
      defaultSort: dataset.defaultSort,
      defaultDir: dataset.defaultDir,
      defaultPageSize: EXPORT_ROW_LIMIT,
      maxPageSize: EXPORT_ROW_LIMIT,
    });
    // Exports ignore pagination: always from the first row up to the cap.
    const exportParams = { ...listParams, page: 1, pageSize: EXPORT_ROW_LIMIT, from: 0, to: EXPORT_ROW_LIMIT - 1 };

    const { data: settings } = await supabase.from('organization_settings').select('currency').maybeSingle();
    const currency = ((settings as { currency?: string | null } | null)?.currency ?? 'SAR') || 'SAR';
    const exportCtx: ExportContext = { session: ctx, locale, t, currency };

    const rows = (await dataset.fetchRows(supabase, exportParams, { ...exportCtx, limit: EXPORT_ROW_LIMIT })).slice(0, EXPORT_ROW_LIMIT);
    const columns = dataset.columns(t, exportCtx);
    const title = t.has(dataset.titleKey) ? t(dataset.titleKey) : dataset.key;
    const yesNo: [string, string] = [t('common.yes'), t('common.no')];
    const branding = await getPublicBranding();
    const fileName = `${dataset.key}-${todayIso().replace(/-/g, '')}.${requested}`;

    let body: Buffer;
    if (requested === 'xlsx') {
      body = await buildXlsx({
        sheetName: title,
        columns,
        rows,
        rtl: locale === 'ar',
        headerColor: branding.primaryColor,
        yesNo,
        creator: brandingPortalName(branding, locale, t('common.appName')),
      });
    } else if (requested === 'csv') {
      body = buildCsv({ columns, rows, locale, yesNo, currency });
    } else {
      const filters = dataset.describeFilters?.(exportParams, t) ?? [];
      if (exportParams.q) filters.unshift(t('common.exportMeta.search', { query: exportParams.q }));
      body = await buildPdf({
        columns,
        rows,
        locale,
        title,
        orgName: brandingCompanyName(branding, locale) ?? brandingPortalName(branding, locale, t('common.appName')),
        generatedLabel: t('common.exportMeta.generatedAt', { date: formatDateTime(new Date(), locale) }),
        countLabel: t('common.table.total', { count: rows.length }),
        emptyLabel: t('common.table.emptyTitle'),
        filters,
        landscape: dataset.landscape ?? true,
        primaryColor: branding.primaryColor,
        logoUrl: branding.logoUrl,
        yesNo,
        currency,
      });
    }

    await logAuditEvent(
      {
        action: `export.${dataset.key}`,
        entityType: 'export',
        entityId: dataset.key,
        summary: `${dataset.key} · ${requested} · ${rows.length}`,
        changes: { format: requested, rows: rows.length, q: exportParams.q || null, filters: exportParams.filters },
      },
      supabase,
    );

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[requested],
        'Content-Disposition': contentDisposition(fileName),
        'Content-Length': String(body.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const mapped = logAndMapError(`export:${key}`, error);
    return textResponse(500, mapped === 'errors.generic' ? 'errors.exportFailed' : mapped, locale);
  }
}

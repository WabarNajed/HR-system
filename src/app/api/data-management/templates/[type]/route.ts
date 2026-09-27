import type { NextRequest } from 'next/server';
import { buildTemplate, templateFileName } from '@/features/data-management/lib/template';
import { isImportType } from '@/features/data-management/lib/types';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { getSessionContext } from '@/lib/auth/session';
import { getPublicBranding } from '@/lib/branding';
import { logAndMapError } from '@/lib/errors';
import { contentDisposition, plainText } from '@/lib/http';
import { isLocale } from '@/lib/i18n/config';
import { getTranslator } from '@/lib/i18n/translator';
import { checkAccess } from '@/lib/permissions';

/**
 * GET /api/data-management/templates/<type>[?lang=ar|en] → XLSX import template (headers in the
 * viewer's language by default, bilingual instructions, drop-down lists, example row).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return plainText(401, getTranslator('en')('errors.unauthorized'));
  const t = getTranslator(ctx.locale);
  if (ctx.profile.status !== 'active' || !checkAccess(ctx, ROUTE_ACCESS['/admin/data-management'])) return plainText(403, t('errors.forbidden'));
  if (!isImportType(type)) return plainText(404, t('errors.notFound'));
  const lang = request.nextUrl.searchParams.get('lang');
  const locale = isLocale(lang) ? lang : ctx.locale;
  try {
    const branding = await getPublicBranding();
    const buffer = await buildTemplate(type, locale, branding.primaryColor ?? undefined);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': contentDisposition(templateFileName(type, locale)),
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return plainText(500, t(logAndMapError('dataManagement.template', error)));
  }
}

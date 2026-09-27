import type { NextRequest } from 'next/server';
import { createImportRecord } from '@/features/data-management/lib/store';
import type { DbClient } from '@/features/data-management/lib/context';
import { isImportType } from '@/features/data-management/lib/types';
import { MAX_IMPORT_BYTES, parseWorkbook, WorkbookError } from '@/features/data-management/lib/workbook';
import { canImportType } from '@/features/data-management/permissions';
import { inspectWorkbook } from '@/features/data-management/server/service';
import { getSessionContext } from '@/lib/auth/session';
import { logAndMapError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/data-management/imports (multipart: `file`, `type`)
 * Parses the uploaded XLSX/CSV once, stores the grid (import_sources) with a new `imports` row
 * (status `uploaded`) and returns the sheet/header/mapping inspection for the wizard.
 * Responses are JSON: `{ ok: true, data }` or `{ ok: false, error: <i18n key> }`.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const ctx = await getSessionContext();
  if (!ctx) return json(401, { ok: false, error: 'errors.sessionExpired' });
  if (ctx.profile.status !== 'active') return json(403, { ok: false, error: 'errors.forbidden' });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: 'errors.validation' });
  }
  const type = form.get('type');
  const file = form.get('file');
  if (!isImportType(type)) return json(400, { ok: false, error: 'errors.validation' });
  if (!canImportType(ctx, type)) return json(403, { ok: false, error: 'errors.forbidden' });
  if (!(file instanceof File) || !file.name) return json(400, { ok: false, error: 'dataManagement.errors.unsupportedFormat' });
  if (file.size > MAX_IMPORT_BYTES) return json(413, { ok: false, error: 'dataManagement.errors.tooLarge' });

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const workbook = await parseWorkbook(bytes, file.name);
    const supabase = (await createClient({ timeoutMs: 30_000 })) as unknown as DbClient;
    const importId = await createImportRecord(supabase, { type, fileName: file.name, fileSize: file.size, workbook });
    const inspection = inspectWorkbook(workbook, type);
    return json(200, { ok: true, data: { importId, fileName: file.name, inspection } });
  } catch (error) {
    if (error instanceof WorkbookError) return json(422, { ok: false, error: `dataManagement.errors.${error.code}` });
    return json(500, { ok: false, error: logAndMapError('dataManagement.upload', error) });
  }
}

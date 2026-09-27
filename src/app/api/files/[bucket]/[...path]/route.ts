import { NextResponse, type NextRequest } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { plainText } from '@/lib/http';
import { getTranslator } from '@/lib/i18n/translator';
import { hasAny } from '@/lib/permissions';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import { BUCKETS, createSignedUrl, isBucketName, publicBrandingUrl, type BucketName } from '@/lib/storage';

/**
 * GET /api/files/<bucket>/<path…>[?download=1]
 *
 * Access is decided by RLS: the owning DB row is read with the USER's client (employee_documents,
 * employees.avatar_path, request_attachments, certificates by `storage_path`). Only when that row is
 * visible do we redirect (302) to a 60-second signed URL. Anything else → 404 (no existence leak).
 * The public `branding` bucket redirects to its public URL.
 */
export const dynamic = 'force-dynamic';

type Owner = { fileName: string | null } | null;

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function findOwner(supabase: ServerSupabaseClient, bucket: BucketName, path: string, canSeeBranding: boolean): Promise<Owner> {
  switch (bucket) {
    case BUCKETS.employeeDocuments: {
      const { data: doc } = await supabase.from('employee_documents').select('id, file_name').eq('storage_path', path).maybeSingle();
      if (doc) return { fileName: (doc as { file_name: string | null }).file_name };
      if (/^[^/]+\/avatar\//.test(path)) {
        const { data: emp } = await supabase.from('employees').select('id').eq('avatar_path', path).maybeSingle();
        if (emp) return { fileName: null };
      }
      return null;
    }
    case BUCKETS.requestAttachments: {
      const { data } = await supabase.from('request_attachments').select('id, file_name').eq('storage_path', path).maybeSingle();
      return data ? { fileName: (data as { file_name: string | null }).file_name } : null;
    }
    case BUCKETS.certificateFiles: {
      if (path.startsWith('branding/')) return canSeeBranding ? { fileName: null } : null;
      const { data } = await supabase.from('certificates').select('id, certificate_number').eq('storage_path', path).maybeSingle();
      return data ? { fileName: `${(data as { certificate_number: string }).certificate_number}.pdf` } : null;
    }
    default:
      return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ bucket: string; path: string[] }> }) {
  const { bucket, path: segments } = await params;
  const path = (segments ?? []).map(safeDecode).join('/');
  const notFound = () => plainText(404, getTranslator('en')('errors.notFound'));

  if (!isBucketName(bucket) || !path || path.includes('..')) return notFound();

  if (bucket === BUCKETS.branding) {
    const env = getSupabaseEnv();
    return env ? NextResponse.redirect(publicBrandingUrl(env.url, path), 302) : notFound();
  }

  const ctx = await getSessionContext();
  if (!ctx) return plainText(401, getTranslator('en')('errors.unauthorized'));
  const t = getTranslator(ctx.locale);
  if (ctx.profile.status !== 'active') return plainText(403, t('errors.forbidden'));

  try {
    const supabase = await createClient();
    const canSeeBranding = hasAny(ctx, ['settings.view', 'certificates.create', 'certificates.edit']);
    const owner = await findOwner(supabase, bucket, path, canSeeBranding);
    if (!owner) return plainText(404, t('errors.notFound'));

    const wantsDownload = request.nextUrl.searchParams.get('download') === '1';
    const download = wantsDownload ? owner.fileName || true : undefined;

    // Signed with the user's client first (storage policies); if the storage policy is narrower than
    // the row policy, fall back to the service role — access was already verified above via RLS.
    let url = await createSignedUrl(supabase, bucket, path, { download });
    if (!url && isAdminClientConfigured()) {
      url = await createSignedUrl(createAdminClient(), bucket, path, { download });
    }
    if (!url) return plainText(404, t('errors.notFound'));

    const response = NextResponse.redirect(url, 302);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    console.error('[files] failed:', bucket, error instanceof Error ? error.message : error);
    return plainText(500, t('errors.downloadFailed'));
  }
}

/**
 * Storage conventions (ARCHITECTURE §7 "Storage"). Isomorphic: pure helpers + functions that take
 * a Supabase client, so they work with the server (RLS), browser or admin client alike.
 *
 * | Bucket               | Path                                                              |
 * |----------------------|-------------------------------------------------------------------|
 * | employee-documents   | {employee_id}/{document_id}/{file} · avatars {employee_id}/avatar/{file} |
 * | request-attachments  | requests/{request_id}/{uuid}-{file}                               |
 * | certificate-files    | certificates/{employee_id}/{certificate_number}.pdf, branding/stamp.*, branding/signature.* |
 * | branding (public)    | logo/*, login/*                                                   |
 *
 * Downloads go through `GET /api/files/{bucket}/{path}` (access checked via RLS on the owning row,
 * then a 60-second signed URL) — use `fileRouteUrl()` to build links.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKETS = {
  employeeDocuments: 'employee-documents',
  requestAttachments: 'request-attachments',
  certificateFiles: 'certificate-files',
  branding: 'branding',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export const BUCKET_NAMES: readonly BucketName[] = Object.values(BUCKETS);

export function isBucketName(value: unknown): value is BucketName {
  return typeof value === 'string' && (BUCKET_NAMES as readonly string[]).includes(value);
}

/** Default signed-URL lifetime (seconds). */
export const SIGNED_URL_TTL_SECONDS = 60;

/* ─── Upload limits ───────────────────────────────────────────────────────── */

export const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  document: { maxBytes: 10 * MB, types: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  attachment: {
    maxBytes: 10 * MB,
    types: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  avatar: { maxBytes: 2 * MB, types: ['image/jpeg', 'image/png', 'image/webp'] },
  brandingImage: { maxBytes: 2 * MB, types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] },
  import: {
    maxBytes: 20 * MB,
    types: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.ms-excel'],
  },
} as const satisfies Record<string, { maxBytes: number; types: readonly string[] }>;

export type UploadKind = keyof typeof UPLOAD_LIMITS;

/* ─── Path builders ───────────────────────────────────────────────────────── */

/**
 * Storage keys must be ASCII-safe (Supabase rejects many Unicode characters). The original
 * (possibly Arabic) file name is kept in the DB row (`file_name`); the key gets a safe slug.
 */
export function sanitizeFileName(name: string, fallback = 'file'): string {
  const trimmed = name.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = trimmed.lastIndexOf('.');
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1) : '';
  const safeBase = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toLowerCase();
  return `${safeBase || fallback}${safeExt ? `.${safeExt}` : ''}`;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export const storagePaths = {
  /** `{employee_id}/{document_id}/{file}` in `employee-documents`. */
  employeeDocument: (employeeId: string, documentId: string, fileName: string) =>
    `${employeeId}/${documentId}/${sanitizeFileName(fileName)}`,
  /** `{employee_id}/avatar/{uuid}.{ext}` in `employee-documents`. */
  employeeAvatar: (employeeId: string, fileName: string) =>
    `${employeeId}/avatar/${uuid()}.${fileExtension(fileName) || 'jpg'}`,
  /** `requests/{request_id}/{uuid}-{file}` in `request-attachments`. */
  requestAttachment: (requestId: string, fileName: string) => `requests/${requestId}/${uuid()}-${sanitizeFileName(fileName)}`,
  /** `certificates/{employee_id}/{certificate_number}.pdf` in `certificate-files`. */
  certificate: (employeeId: string, certificateNumber: string) =>
    `certificates/${employeeId}/${sanitizeFileName(certificateNumber)}.pdf`,
  /** `branding/stamp.{ext}` / `branding/signature.{ext}` in `certificate-files`. */
  certificateBranding: (kind: 'stamp' | 'signature', fileName: string) => `branding/${kind}.${fileExtension(fileName) || 'png'}`,
  /** `logo/{uuid}.{ext}` / `login/{uuid}.{ext}` in the public `branding` bucket. */
  brandingAsset: (kind: 'logo' | 'login', fileName: string) => `${kind}/${uuid()}.${fileExtension(fileName) || 'png'}`,
};

/** `/api/files/{bucket}/{path}` — access-checked download/preview link (302 → 60 s signed URL). */
export function fileRouteUrl(bucket: BucketName, path: string, options: { download?: boolean } = {}): string {
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `/api/files/${bucket}/${encoded}${options.download ? '?download=1' : ''}`;
}

/** Public URL for an object in the public `branding` bucket. */
export function publicBrandingUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKETS.branding}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

/* ─── Validation, upload, signed URLs ─────────────────────────────────────── */

export type FileLike = { name: string; size: number; type: string };

export type FileValidationError = 'errors.fileTooLarge' | 'errors.invalidFileType';

/** Validates size and MIME type (falls back to the extension when the browser gives no type). */
export function validateFile(file: FileLike, kind: UploadKind): FileValidationError | null {
  const limits = UPLOAD_LIMITS[kind];
  if (file.size > limits.maxBytes) return 'errors.fileTooLarge';
  const type = file.type || mimeFromExtension(file.name);
  if (!type || !(limits.types as readonly string[]).includes(type)) return 'errors.invalidFileType';
  return null;
}

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

export function mimeFromExtension(name: string): string | null {
  return EXTENSION_MIME[fileExtension(name)] ?? null;
}

// Any Supabase client flavour (server/browser/admin, typed or not).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export type UploadResult =
  | { ok: true; path: string; size: number; mimeType: string }
  | { ok: false; error: FileValidationError | 'errors.uploadFailed' };

/**
 * Validates then uploads a file (never overwrites). Returns i18n error keys on failure.
 * `file` may be a browser `File`/`Blob` or a server `Buffer` wrapped as `{ name, size, type, body }`.
 */
export async function uploadFile(
  client: AnySupabaseClient,
  params: {
    bucket: BucketName;
    path: string;
    file: FileLike & { body?: Blob | ArrayBuffer | Uint8Array };
    kind: UploadKind;
    upsert?: boolean;
  },
): Promise<UploadResult> {
  const invalid = validateFile(params.file, params.kind);
  if (invalid) return { ok: false, error: invalid };
  const mimeType = params.file.type || mimeFromExtension(params.file.name) || 'application/octet-stream';
  const body = params.file.body ?? (params.file as unknown as Blob);
  const { error } = await client.storage.from(params.bucket).upload(params.path, body, {
    contentType: mimeType,
    upsert: params.upsert ?? false,
    cacheControl: '3600',
  });
  if (error) {
    console.error('[storage] upload failed:', params.bucket, error.message);
    return { ok: false, error: 'errors.uploadFailed' };
  }
  return { ok: true, path: params.path, size: params.file.size, mimeType };
}

/**
 * Short-lived signed URL (default 60 s). `download` forces `Content-Disposition: attachment`
 * (pass a string to set the downloaded file name). Returns null on failure.
 */
export async function createSignedUrl(
  client: AnySupabaseClient,
  bucket: BucketName,
  path: string,
  options: { expiresIn?: number; download?: string | boolean } = {},
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, options.expiresIn ?? SIGNED_URL_TTL_SECONDS, options.download ? { download: options.download } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Removes objects; returns false on failure (never throws). */
export async function removeFiles(client: AnySupabaseClient, bucket: BucketName, paths: string[]): Promise<boolean> {
  if (!paths.length) return true;
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) console.error('[storage] remove failed:', bucket, error.message);
  return !error;
}

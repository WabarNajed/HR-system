import { BUCKETS, fileExtension, storagePaths, type BucketName } from '@/lib/storage';
import type { Permission } from '@/lib/permissions';

/**
 * Branding images (isomorphic). Public assets (logo, sign-in image) live in the public `branding`
 * bucket; the certificate stamp and authorized signature are PRIVATE (`certificate-files/branding/*`)
 * and are only ever shown through the access-checked `/api/files` route.
 */
export const BRAND_IMAGE_KINDS = ['logo', 'loginImage', 'stamp', 'signature'] as const;
export type BrandImageKind = (typeof BRAND_IMAGE_KINDS)[number];

export type BrandImageConfig = {
  kind: BrandImageKind;
  bucket: BucketName;
  /** DB location of the stored path. */
  table: 'organizations' | 'organization_settings';
  column: 'logo_path' | 'login_image_path' | 'stamp_path' | 'signature_path';
  /** Accepted MIME types (must be allowed by the bucket). */
  types: readonly string[];
  accept: string;
  maxBytes: number;
  /** Storage write policy: branding bucket → settings.administer; certificate-files/branding → settings.edit. */
  permissions: Permission[];
  /** Upload over an existing object (fixed file names). */
  upsert: boolean;
  path: (fileName: string) => string;
  pathPattern: RegExp;
};

const MB = 1024 * 1024;
const PUBLIC_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const PRIVATE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const BRAND_IMAGES: Record<BrandImageKind, BrandImageConfig> = {
  logo: {
    kind: 'logo',
    bucket: BUCKETS.branding,
    table: 'organizations',
    column: 'logo_path',
    types: PUBLIC_TYPES,
    accept: '.png,.jpg,.jpeg,.webp,.svg',
    maxBytes: 2 * MB,
    permissions: ['settings.edit', 'settings.administer'],
    upsert: false,
    path: (name) => storagePaths.brandingAsset('logo', name),
    pathPattern: /^logo\/[0-9a-f-]{36}\.(png|jpe?g|webp|svg)$/,
  },
  loginImage: {
    kind: 'loginImage',
    bucket: BUCKETS.branding,
    table: 'organization_settings',
    column: 'login_image_path',
    types: PUBLIC_TYPES.filter((t) => t !== 'image/svg+xml'),
    accept: '.png,.jpg,.jpeg,.webp',
    maxBytes: 4 * MB,
    permissions: ['settings.edit', 'settings.administer'],
    upsert: false,
    path: (name) => storagePaths.brandingAsset('login', name),
    pathPattern: /^login\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/,
  },
  stamp: {
    kind: 'stamp',
    bucket: BUCKETS.certificateFiles,
    table: 'organization_settings',
    column: 'stamp_path',
    types: PRIVATE_TYPES,
    accept: '.png,.jpg,.jpeg,.webp',
    maxBytes: 2 * MB,
    permissions: ['settings.edit'],
    upsert: true,
    path: (name) => storagePaths.certificateBranding('stamp', name),
    pathPattern: /^branding\/stamp\.(png|jpe?g|webp)$/,
  },
  signature: {
    kind: 'signature',
    bucket: BUCKETS.certificateFiles,
    table: 'organization_settings',
    column: 'signature_path',
    types: PRIVATE_TYPES,
    accept: '.png,.jpg,.jpeg,.webp',
    maxBytes: 2 * MB,
    permissions: ['settings.edit'],
    upsert: true,
    path: (name) => storagePaths.certificateBranding('signature', name),
    pathPattern: /^branding\/signature\.(png|jpe?g|webp)$/,
  },
};

const EXT_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

/** MIME type of a picked file (falls back to the extension when the browser gives none). */
export function brandImageMime(file: { name: string; type: string }): string | null {
  return file.type || EXT_MIME[fileExtension(file.name)] || null;
}

/** i18n error key when a file doesn't fit the kind's limits, else null. */
export function validateBrandImage(kind: BrandImageKind, file: { name: string; type: string; size: number }): 'errors.fileTooLarge' | 'errors.invalidFileType' | null {
  const config = BRAND_IMAGES[kind];
  const mime = brandImageMime(file);
  if (!mime || !config.types.includes(mime)) return 'errors.invalidFileType';
  if (file.size > config.maxBytes) return 'errors.fileTooLarge';
  return null;
}

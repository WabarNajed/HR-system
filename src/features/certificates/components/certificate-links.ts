'use client';

import { BUCKETS, fileRouteUrl } from '@/lib/storage';
import { certificateVerifyPath } from '../verification-code';

/** Access-checked download route for a certificate PDF (302 → 60 s signed URL). */
export function certificateDownloadUrl(storagePath: string | null | undefined): string | null {
  return storagePath ? fileRouteUrl(BUCKETS.certificateFiles, storagePath, { download: true }) : null;
}

export { certificateVerifyPath };

/** Absolute public verification URL incl. the verification code (same target as the certificate's QR code). */
export function certificateVerifyUrl(number: string, code?: string | null): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  return `${base}${certificateVerifyPath(number, code)}`;
}

/** Starts a file download without leaving the page (the route answers with a redirect). */
export function startDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

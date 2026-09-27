'use client';

import { BUCKETS, fileRouteUrl } from '@/lib/storage';

/** Access-checked download route for a certificate PDF (302 → 60 s signed URL). */
export function certificateDownloadUrl(storagePath: string | null | undefined): string | null {
  return storagePath ? fileRouteUrl(BUCKETS.certificateFiles, storagePath, { download: true }) : null;
}

export function certificateVerifyPath(number: string): string {
  return `/verify/${encodeURIComponent(number)}`;
}

/** Absolute public verification URL (same base as the QR code when NEXT_PUBLIC_SITE_URL is set). */
export function certificateVerifyUrl(number: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  return `${base}${certificateVerifyPath(number)}`;
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

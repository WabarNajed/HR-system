'use client';

import { getSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/client';
import { mimeFromExtension } from '@/lib/storage';

export type UploadProgressHandler = (percent: number) => void;

/**
 * Uploads a file straight from the browser to Supabase Storage as the signed-in user (storage
 * policies decide), with progress events. Direct uploads keep large files off the Next.js server
 * (Vercel caps request bodies at ~4.5 MB). Resolves on success; rejects with `errors.*` keys.
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: File,
  onProgress?: UploadProgressHandler,
  signal?: AbortSignal,
): Promise<void> {
  const env = getSupabaseEnv();
  const supabase = createClient();
  if (!env || !supabase) throw new Error('errors.serverError');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('errors.sessionExpired');

  const url = `${env.url.replace(/\/+$/, '')}/storage/v1/object/${bucket}/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
  const contentType = file.type || mimeFromExtension(file.name) || 'application/octet-stream';

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', env.anonKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error('errors.forbidden'));
      } else if (xhr.status === 413) {
        reject(new Error('errors.fileTooLarge'));
      } else if (xhr.status === 415) {
        reject(new Error('errors.invalidFileType'));
      } else {
        reject(new Error('errors.uploadFailed'));
      }
    };
    xhr.onerror = () => reject(new Error('errors.network'));
    xhr.ontimeout = () => reject(new Error('errors.timeout'));
    xhr.onabort = () => reject(new Error('errors.uploadFailed'));
    if (signal) {
      if (signal.aborted) {
        reject(new Error('errors.uploadFailed'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

/** Error key from a thrown upload error (falls back to `errors.uploadFailed`). */
export function uploadErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^errors\.[a-zA-Z]+$/.test(message) ? message : 'errors.uploadFailed';
}

'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Client-side cap for a single export request (the route itself allows 60 s). */
const EXPORT_TIMEOUT_MS = 90_000;

/** File name from `Content-Disposition` (RFC 5987 `filename*` first, then plain `filename`). */
export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain?.[1]?.trim() || null;
}

/**
 * Downloads an `/api/export/...` file with feedback: a loading toast while the file is generated
 * (PDF can take several seconds), the server's translated plain-text message on 4xx/5xx instead of a
 * broken download, a success toast naming the file, and a guard against double clicks.
 * `pending` holds the format being generated.
 */
export function useExportDownload() {
  const t = useTranslations();
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);

  const download = useCallback(
    async (href: string, format: string) => {
      if (busy.current) return;
      busy.current = true;
      setPending(format);
      const toastId = toast.loading(t('common.table.exporting'));
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
      try {
        const res = await fetch(href, { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) {
          const text = (await res.text().catch(() => '')).trim();
          const plain = text && text.length <= 240 && !text.startsWith('<') ? text : null;
          toast.error(plain ?? t('errors.exportFailed'), { id: toastId });
          return;
        }
        const blob = await res.blob();
        const name = fileNameFromDisposition(res.headers.get('content-disposition')) ?? `export.${format}`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
        toast.success(t('common.table.exportReady'), { id: toastId, description: name });
      } catch {
        toast.error(t(controller.signal.aborted ? 'errors.timeout' : 'errors.exportFailed'), { id: toastId });
      } finally {
        window.clearTimeout(timer);
        busy.current = false;
        setPending(null);
      }
    },
    [t],
  );

  return { download, pending };
}

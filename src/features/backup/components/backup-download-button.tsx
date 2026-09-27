'use client';

import { DownloadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { formatFileSize } from '@/lib/format';

function fileNameFrom(header: string | null): string {
  const star = header ? /filename\*=UTF-8''([^;]+)/i.exec(header) : null;
  if (star?.[1]) return decodeURIComponent(star[1]);
  const plain = header ? /filename="([^"]+)"/i.exec(header) : null;
  return plain?.[1] ?? 'hr-backup.zip';
}

/** Streams the backup ZIP with progress, then saves it (toast on success/failure). */
export function BackupDownloadButton({ label, onDownloaded, ...props }: ButtonProps & { label?: string; onDownloaded?: () => void }) {
  const t = useTranslations('backup');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const [bytes, setBytes] = useState<number | null>(null);

  const download = async () => {
    setBytes(0);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10 * 60_000);
    try {
      const res = await fetch('/api/backup', { signal: controller.signal, cache: 'no-store' });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        toast.error(text && text.length < 200 ? text : t('errors.downloadFailed'));
        return;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new Uint8Array(value));
        received += value.byteLength;
        setBytes(received);
      }
      const url = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileNameFrom(res.headers.get('Content-Disposition'));
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(t('toast.backupReady'));
      onDownloaded?.();
      router.refresh();
    } catch {
      toast.error(t('errors.downloadFailed'));
    } finally {
      window.clearTimeout(timer);
      setBytes(null);
    }
  };

  const busy = bytes !== null;
  return (
    <Button {...props} loading={busy} onClick={() => void download()} aria-live="polite">
      {busy ? null : <DownloadIcon />}
      {busy ? (bytes ? t('create.received', { size: formatFileSize(bytes, locale) }) : t('create.preparing')) : (label ?? t('create.download'))}
    </Button>
  );
}

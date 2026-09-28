'use client';

import { ImageIcon, ImageUpIcon, Loader2Icon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { setBrandImage } from '../actions';
import { BRAND_IMAGES, brandImageMime, validateBrandImage, type BrandImageKind } from '../image-kinds';

export type BrandImageFieldProps = {
  kind: BrandImageKind;
  label: ReactNode;
  description?: ReactNode;
  /** Current display URL (public URL or `/api/files/…`). */
  url: string | null;
  /** Reason shown in a tooltip when the viewer can't change the image; null = editable. */
  lockedReason?: string | null;
  onChange?: (url: string | null) => void;
  /** Preview surface: `logo` (square, contain), `wide` (cover), `stamp` (square, contain on paper). */
  variant?: 'logo' | 'wide' | 'stamp';
  className?: string;
};

const MAX_MB: Record<BrandImageKind, number> = { logo: 2, loginImage: 4, stamp: 2, signature: 2 };

/**
 * Upload / replace / remove one branding image. The file goes straight from the browser to
 * Storage (the bucket policies are the access check), then `setBrandImage` stores the path.
 * Changes apply immediately (independent of the page's Save button).
 */
export function BrandImageField({ kind, label, description, url, lockedReason = null, onChange, variant = 'logo', className }: BrandImageFieldProps) {
  const t = useTranslations('settings.branding.image');
  const resolve = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<string | null>(url);
  const [prevUrl, setPrevUrl] = useState(url);
  const [uploading, setUploading] = useState(false);
  const [removing, startRemove] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [broken, setBroken] = useState(false);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setCurrent(url);
    setBroken(false);
  }

  const config = BRAND_IMAGES[kind];
  const locked = Boolean(lockedReason);
  const busy = uploading || removing;

  const apply = (next: string | null) => {
    setCurrent(next);
    setBroken(false);
    onChange?.(next);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const invalid = validateBrandImage(kind, file);
    if (invalid) {
      toast.error(resolve(invalid));
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      toast.error(resolve('errors.notConfigured'));
      return;
    }
    setUploading(true);
    try {
      const path = config.path(file.name);
      const { error } = await supabase.storage
        .from(config.bucket)
        .upload(path, file, { contentType: brandImageMime(file) ?? undefined, upsert: config.upsert, cacheControl: '3600' });
      if (error) {
        toast.error(resolve('errors.uploadFailed'));
        return;
      }
      const result = await setBrandImage({ kind, path });
      if (!result.ok) {
        // Unique-name uploads would otherwise stay orphaned in the bucket (best effort).
        if (!config.upsert) void supabase.storage.from(config.bucket).remove([path]).catch(() => undefined);
        toast.error(resolve(result.error));
        return;
      }
      apply(result.data?.url ?? null);
      toast.success(resolve(result.message));
    } catch {
      toast.error(resolve('errors.uploadFailed'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = () =>
    new Promise<boolean>((resolvePromise) =>
      startRemove(async () => {
        const result = await setBrandImage({ kind, path: null });
        if (!result.ok) {
          toast.error(resolve(result.error));
          resolvePromise(false);
          return;
        }
        apply(null);
        toast.success(resolve(result.message));
        resolvePromise(true);
      }),
    );

  const surface =
    variant === 'wide'
      ? 'h-20 w-32'
      : variant === 'stamp'
        ? 'size-20 bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]'
        : 'size-20';

  const uploadButton = (
    <Button type="button" size="sm" variant="outline" disabled={locked || busy} onClick={() => inputRef.current?.click()}>
      {uploading ? <Loader2Icon className="animate-spin" /> : current ? <RefreshCwIcon /> : <ImageUpIcon />}
      {uploading ? t('uploading') : current ? t('replace') : t('upload')}
    </Button>
  );

  return (
    <div className={cn('flex items-start gap-4', className)} data-brand-image={kind}>
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-subtle',
          surface,
          !current && 'border-dashed',
        )}
      >
        {current && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- branding asset (public URL or signed redirect)
          <img
            src={current}
            alt=""
            onError={() => setBroken(true)}
            className={cn('size-full', variant === 'wide' ? 'object-cover' : 'object-contain p-1.5')}
          />
        ) : (
          <ImageIcon className="size-6 text-faint-foreground" strokeWidth={1.6} aria-hidden />
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-card/70 backdrop-blur-[1px]">
            <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden />
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        <p className="text-xs text-faint-foreground">
          {t('limits', { types: config.accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', '), size: MAX_MB[kind] })}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {locked ? (
            <SimpleTooltip content={lockedReason}>
              <span tabIndex={0}>{uploadButton}</span>
            </SimpleTooltip>
          ) : (
            uploadButton
          )}
          {current && !locked ? (
            <Button type="button" size="sm" variant="ghost" className="text-danger hover:text-danger" disabled={busy} onClick={() => setConfirmRemove(true)}>
              <Trash2Icon />
              {t('remove')}
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={config.accept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        variant="danger"
        title={t('removeTitle')}
        description={t('removeDescription')}
        confirmLabel={t('remove')}
        onConfirm={remove}
      />
    </div>
  );
}

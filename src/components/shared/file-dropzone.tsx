'use client';

import { FileIcon, FileImageIcon, FileSpreadsheetIcon, FileTextIcon, UploadCloudIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn, fileSizeParts } from '@/lib/utils';

export type DropzoneFileState = {
  /** 0–100 while uploading. */
  progress?: number;
  status?: 'idle' | 'uploading' | 'done' | 'error';
  error?: string;
};

export type FileDropzoneProps = {
  /** Selected files (controlled). */
  value?: File[];
  onChange?: (files: File[]) => void;
  /** Accept list, e.g. `['.pdf', '.jpg', 'image/*']` or `".pdf,.png"`. */
  accept?: string | string[];
  /** Max size per file in bytes (default 10 MB). */
  maxSize?: number;
  /** Max number of files (default 1 when `multiple` is false, 10 otherwise). */
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** Per-file upload state keyed by `fileKey(file)`. Upload logic lives in the caller. */
  fileStates?: Record<string, DropzoneFileState>;
  /** Called with translated validation errors (also rendered inline). */
  onReject?: (errors: string[]) => void;
  /** Compact single-row variant (inside dialogs/forms). */
  compact?: boolean;
  className?: string;
  id?: string;
  'aria-invalid'?: boolean;
};

/** Stable key for a File (name + size + lastModified). */
export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function acceptList(accept: FileDropzoneProps['accept']): string[] {
  if (!accept) return [];
  return (Array.isArray(accept) ? accept : accept.split(',')).map((a) => a.trim().toLowerCase()).filter(Boolean);
}

function matchesAccept(file: File, list: string[]) {
  if (!list.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return list.some((a) => {
    if (a.startsWith('.')) return name.endsWith(a);
    if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
}

function iconFor(file: File) {
  const n = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return FileImageIcon;
  if (/\.(xlsx|xls|csv)$/.test(n)) return FileSpreadsheetIcon;
  if (/\.(pdf|docx?|txt)$/.test(n)) return FileTextIcon;
  return FileIcon;
}

/** Drag & drop / click-to-browse file picker with validation, list and per-file progress. No upload logic. */
export function FileDropzone({
  value,
  onChange,
  accept,
  maxSize = 10 * 1024 * 1024,
  maxFiles,
  multiple = false,
  disabled = false,
  fileStates,
  onReject,
  compact = false,
  className,
  id,
  'aria-invalid': ariaInvalid,
}: FileDropzoneProps) {
  const t = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  const autoId = useId();
  const inputId = id ?? autoId;
  const [internal, setInternal] = useState<File[]>([]);
  const files = value ?? internal;
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const limit = maxFiles ?? (multiple ? 10 : 1);
  const list = acceptList(accept);

  const formatSize = useCallback(
    (bytes: number) => {
      const { size, unit } = fileSizeParts(bytes);
      return t(`fileSize.${unit}`, { size });
    },
    [t],
  );

  const setFiles = (next: File[]) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };

  const addFiles = (incoming: FileList | File[]) => {
    const errs: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (!matchesAccept(file, list)) errs.push(t('dropzone.invalidType', { name: file.name }));
      else if (file.size > maxSize) errs.push(t('dropzone.fileTooLarge', { name: file.name, size: formatSize(maxSize) }));
      else accepted.push(file);
    }
    let next = multiple ? [...files] : [];
    for (const f of accepted) if (!next.some((x) => fileKey(x) === fileKey(f))) next.push(f);
    if (next.length > limit) {
      errs.push(t('dropzone.tooManyFiles', { count: limit }));
      next = next.slice(0, limit);
    }
    setErrors(errs);
    if (errs.length) onReject?.(errs);
    setFiles(next);
  };

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  const typesLabel = list.map((a) => a.replace(/^\./, '').toUpperCase()).join(', ');
  const hint = typesLabel
    ? t('dropzone.hint', { types: typesLabel, size: formatSize(maxSize) })
    : t('dropzone.hintAnyType', { size: formatSize(maxSize) });

  return (
    <div className={cn('flex flex-col gap-2.5', className)} data-slot="file-dropzone">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        data-invalid={ariaInvalid || undefined}
        aria-describedby={`${inputId}-hint`}
        onClick={open}
        onKeyDown={onKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        className={cn(
          'group/dz flex cursor-pointer items-center rounded-lg border border-dashed border-border-strong bg-subtle text-center transition-[border-color,background-color,box-shadow] outline-none',
          'hover:border-primary/50 hover:bg-primary-soft/40 focus-visible:ring-[3px] focus-visible:ring-ring/40',
          'data-[dragging]:border-primary data-[dragging]:bg-primary-soft/60',
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 data-[invalid]:border-danger/60',
          compact ? 'gap-3 px-4 py-3 text-start' : 'flex-col justify-center gap-2 px-6 py-7',
        )}
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-xs ring-1 ring-border transition-transform group-hover/dz:scale-105',
            compact ? 'size-9' : 'size-11',
          )}
        >
          <UploadCloudIcon className={compact ? 'size-4.5' : 'size-5'} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {multiple ? t('dropzone.title') : t('dropzone.titleSingle')}{' '}
            <span className="font-normal text-primary">{t('dropzone.browse')}</span>
          </p>
          <p id={`${inputId}-hint`} className="mt-0.5 text-xs text-muted-foreground">
            {hint}
            {multiple ? ` · ${t('dropzone.maxFiles', { count: limit })}` : null}
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={list.join(',') || undefined}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {errors.length ? (
        <ul className="space-y-0.5 text-xs font-medium text-danger" role="alert">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      ) : null}

      {files.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label={t('dropzone.selectedFiles')}>
          {files.map((file) => {
            const key = fileKey(file);
            const state = fileStates?.[key];
            const Icon = iconFor(file);
            return (
              <li key={key} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <bdi className="truncate text-sm font-medium text-foreground">{file.name}</bdi>
                    <span className="shrink-0 text-xs text-muted-foreground numeric">{formatSize(file.size)}</span>
                  </div>
                  {state?.status === 'uploading' ? (
                    <Progress value={state.progress ?? 0} indeterminate={state.progress === undefined} className="mt-1.5 h-1" />
                  ) : null}
                  {state?.status === 'error' ? (
                    <p className="mt-0.5 text-xs text-danger">{state.error ?? t('dropzone.failed')}</p>
                  ) : null}
                  {state?.status === 'done' ? <p className="mt-0.5 text-xs text-success">{t('dropzone.uploaded')}</p> : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('dropzone.remove')}
                  disabled={disabled || state?.status === 'uploading'}
                  onClick={() => setFiles(files.filter((f) => fileKey(f) !== key))}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

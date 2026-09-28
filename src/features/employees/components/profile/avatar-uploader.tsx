'use client';

import { CameraIcon, ImageUpIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { ActionResult } from '@/lib/action';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { avatarTint, EmployeeAvatar } from '@/components/shared/employee-avatar';
import { useErrorMessage } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import { BUCKETS, removeFiles, storagePaths, UPLOAD_LIMITS, uploadFile, validateFile } from '@/lib/storage';
import { cn, getInitials } from '@/lib/utils';
import { removeEmployeeAvatar, setEmployeeAvatar } from '../../actions';

const AVATAR_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Large profile avatar; HR editors get a camera button to upload/replace/remove the photo. */
export function AvatarUploader({
  employeeId,
  name,
  src,
  editable,
  className,
}: {
  employeeId: string;
  name: string;
  src: string | null;
  editable: boolean;
  className?: string;
}) {
  const t = useTranslations('employees');
  const resolve = useErrorMessage();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Tint + initials sit behind the avatar: the server HTML already shows them (the avatar's own
  // fallback only appears after hydration) and they stay visible while the signed photo URL loads.
  const avatar = (
    <span className="relative block shrink-0 self-start rounded-full" style={avatarTint(employeeId)}>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tracking-wide">
        {getInitials(name)}
      </span>
      <EmployeeAvatar
        name={name}
        seed={employeeId}
        src={src}
        size="xl"
        className={cn('size-20 text-2xl shadow-raised ring-4 ring-card sm:size-24', className)}
      />
    </span>
  );
  if (!editable) return avatar;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const invalid = validateFile(file, 'avatar');
    if (invalid) {
      toast.error(resolve(invalid));
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      toast.error(resolve('errors.notConfigured'));
      return;
    }
    startTransition(async () => {
      // Extension from the (validated) MIME type, not the file name: `photo.jfif` / `IMG.HEIC.jpg`
      // style names would otherwise fail the server's path check after the upload.
      const path = storagePaths.employeeAvatar(employeeId, `avatar.${AVATAR_EXT[file.type] ?? 'jpg'}`);
      const uploaded = await uploadFile(supabase, { bucket: BUCKETS.employeeDocuments, path, file, kind: 'avatar' });
      if (!uploaded.ok) {
        toast.error(resolve(uploaded.error));
        return;
      }
      const result: ActionResult<{ url: string }> = await setEmployeeAvatar({ id: employeeId, path }).catch(() => ({ ok: false, error: 'errors.generic' }));
      if (!result.ok) {
        await removeFiles(supabase, BUCKETS.employeeDocuments, [path]);
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      router.refresh();
    });
  };

  return (
    <div className="relative shrink-0 self-start">
      {avatar}
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 backdrop-blur-[1px]" role="status">
          <Loader2Icon className="size-6 animate-spin text-primary" aria-hidden />
          <span className="sr-only">{t('profile.avatar.uploading')}</span>
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            aria-label={src ? t('actions.changePhoto') : t('actions.uploadPhoto')}
            className="absolute -end-0.5 bottom-0.5 inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-raised transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-60"
          >
            <CameraIcon className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('profile.avatar.hint')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <ImageUpIcon />
            {src ? t('actions.changePhoto') : t('actions.uploadPhoto')}
          </DropdownMenuItem>
          {src ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
              <Trash2Icon />
              {t('actions.removePhoto')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={input}
        type="file"
        accept={UPLOAD_LIMITS.avatar.types.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        variant="danger"
        title={t('profile.avatar.removeTitle')}
        description={t('profile.avatar.removeDescription')}
        confirmLabel={t('actions.removePhoto')}
        onConfirm={async () => {
          const result: ActionResult = await removeEmployeeAvatar({ id: employeeId }).catch(() => ({ ok: false, error: 'errors.generic' }));
          if (!result.ok) {
            toast.error(resolve(result.error));
            return false;
          }
          toast.success(resolve(result.message));
          router.refresh();
        }}
      />
    </div>
  );
}

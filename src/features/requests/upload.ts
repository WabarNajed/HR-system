'use client';

import { fileKey, type DropzoneFileState } from '@/components/shared/file-dropzone';
import { createClient } from '@/lib/supabase/client';
import { BUCKETS, storagePaths, uploadFile, validateFile } from '@/lib/storage';
import { registerAttachment } from './actions';
import type { AttachmentItem } from './types';

export type UploadOutcome = {
  /** Uploaded files, keyed by the pending item's id. */
  uploaded: Map<string, AttachmentItem & { kind: 'existing' }>;
  failed: { item: AttachmentItem & { kind: 'pending' }; error: string }[];
};

/**
 * Uploads pending attachments of a saved request straight to Storage (the bucket policy allows the
 * requester while draft/returned, and HR), then registers each `request_attachments` row through a
 * server action (which removes the object again if the row is refused).
 */
export async function uploadPendingAttachments(
  requestId: string,
  items: (AttachmentItem & { kind: 'pending' })[],
  onState?: (key: string, state: DropzoneFileState) => void,
): Promise<UploadOutcome> {
  const out: UploadOutcome = { uploaded: new Map(), failed: [] };
  const supabase = createClient();
  for (const item of items) {
    const key = fileKey(item.file);
    const invalid = validateFile(item.file, 'attachment');
    if (invalid || !supabase) {
      const error = invalid ?? 'errors.notConfigured';
      out.failed.push({ item, error });
      onState?.(key, { status: 'error', error });
      continue;
    }
    onState?.(key, { status: 'uploading' });
    const path = storagePaths.requestAttachment(requestId, item.file.name);
    const upload = await uploadFile(supabase, { bucket: BUCKETS.requestAttachments, path, file: item.file, kind: 'attachment' });
    if (!upload.ok) {
      out.failed.push({ item, error: upload.error });
      onState?.(key, { status: 'error', error: upload.error });
      continue;
    }
    const res = await registerAttachment({
      requestId,
      fieldKey: item.fieldKey,
      path,
      fileName: item.file.name,
      size: item.file.size,
      mime: upload.mimeType,
    });
    if (!res.ok || !res.data) {
      const error = res.ok ? 'errors.uploadFailed' : res.error;
      out.failed.push({ item, error });
      onState?.(key, { status: 'error', error });
      continue;
    }
    onState?.(key, { status: 'done' });
    out.uploaded.set(item.id, {
      kind: 'existing',
      id: res.data.id,
      name: item.file.name,
      size: item.file.size,
      mime: upload.mimeType,
      path,
      fieldKey: item.fieldKey,
      canRemove: true,
      uploadedAt: res.data.createdAt,
    });
  }
  return out;
}

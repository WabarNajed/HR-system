import 'server-only';

import { BUCKET_NAMES, type BucketName } from '@/lib/storage';
import type { AdminSupabaseClient } from '@/lib/supabase/admin';

/** Every object path in a bucket (recursive; folders have `id === null`). */
async function listAll(admin: AdminSupabaseClient, bucket: BucketName, prefix = '', depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    const items = data ?? [];
    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(admin, bucket, path, depth + 1)));
      else out.push(path);
    }
    if (items.length < 1000) break;
  }
  return out;
}

/**
 * Removes every stored file of the organization (organization reset). Service role, called only
 * after the super-admin re-authentication and a successful `reset_organization`.
 */
export async function purgeOrganizationFiles(admin: AdminSupabaseClient): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const bucket of BUCKET_NAMES) {
    let paths: string[] = [];
    try {
      paths = await listAll(admin, bucket);
    } catch (error) {
      console.error('[backup.reset] list failed', bucket, error instanceof Error ? error.message : error);
      failed++;
      continue;
    }
    for (let i = 0; i < paths.length; i += 100) {
      const part = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(part);
      if (error) {
        console.error('[backup.reset] remove failed', bucket, error.message);
        failed += part.length;
      } else removed += part.length;
    }
  }
  return { removed, failed };
}

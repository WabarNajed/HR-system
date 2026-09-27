'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { ActionError, ok, withAction } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { BRANDING_CACHE_TAG } from '@/lib/branding';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { RESET_PHRASE } from './lib/constants';
import { purgeOrganizationFiles } from './server/storage';

/**
 * Organization reset (super admin only):
 *  1. re-authenticates with the password (a separate, non-persistent sign-in — the current session is untouched),
 *  2. runs `reset_organization('RESET ORGANIZATION')` as the user (the RPC re-checks super admin + phrase,
 *     deletes business data, non-super-admin accounts and configuration, re-seeds defaults, audits `organization.reset`),
 *  3. removes the organization's stored files with the service role (only after 1 and 2 succeeded),
 *  4. signs the user out — the client then goes to /login?next=/setup.
 */
export const resetOrganizationAction = withAction(
  z.object({ password: z.string().min(1).max(200), confirmation: z.string().max(40) }),
  async (input, { ctx }) => {
    if (!ctx.isSuperAdmin) throw new ActionError('errors.forbidden');
    if (input.confirmation !== RESET_PHRASE) throw new ActionError('errors.confirmationMismatch');
    const email = ctx.user.email;
    const env = getSupabaseEnv();
    if (!email || !env) throw new ActionError('errors.forbidden');

    // 1. Re-authentication.
    const verifier = createSupabaseClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: signIn, error: signInError } = await verifier.auth.signInWithPassword({ email, password: input.password });
    if (signInError || signIn.user?.id !== ctx.user.id) {
      await logAuditEvent({ action: 'backup.reset_denied', entityType: 'organization', summary: 'Organization reset: re-authentication failed' });
      throw new ActionError(signInError?.status === 429 ? 'errors.rateLimited' : 'backup.errors.wrongPassword');
    }
    await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);

    // 2. Reset (security-definer RPC, audited as organization.reset).
    const supabase = await createClient({ timeoutMs: 120_000 });
    const { error } = await supabase.rpc('reset_organization', { p_confirmation: input.confirmation });
    if (error) throw error;

    // 3. Stored files (service role, after the checks above).
    let files = { removed: 0, failed: 0 };
    if (isAdminClientConfigured()) files = await purgeOrganizationFiles(createAdminClient({ timeoutMs: 60_000 }));
    else files.failed = -1;
    await logAuditEvent(
      {
        action: 'backup.reset_files',
        entityType: 'organization',
        summary: `Organization reset: ${files.removed} stored files removed`,
        changes: { removed: files.removed, failed: files.failed },
      },
      supabase,
    );

    // 4. Caches and session.
    updateTag(BRANDING_CACHE_TAG);
    revalidatePath('/', 'layout');
    await supabase.auth.signOut();
    return ok({ filesRemoved: files.removed, filesFailed: files.failed }, files.failed ? 'backup.toast.resetDoneFilesPending' : 'backup.toast.resetDone');
  },
  { scope: 'backup.reset' },
);

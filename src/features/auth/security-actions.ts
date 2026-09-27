'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { ok, requirePermissionIn, withAction } from '@/lib/action';
import { BRANDING_CACHE_TAG } from '@/lib/branding';
import { createClient } from '@/lib/supabase/server';

const securitySchema = z.object({
  allowSelfRegistration: z.boolean(),
  sessionTimeoutMinutes: z.number().int().min(5, 'validation.min|{"min":5}').max(10080, 'validation.max|{"max":10080}'),
});

/**
 * Saves the security settings (`organization_settings`, audited by the row trigger). Needs
 * `settings.administer` here and `settings.edit` in RLS. Public branding carries
 * `allow_self_registration`, so its cache is refreshed.
 */
export const saveSecuritySettingsAction = withAction(
  securitySchema,
  async ({ allowSelfRegistration, sessionTimeoutMinutes }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.administer');
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organization_settings')
      .update({ allow_self_registration: allowSelfRegistration, session_timeout_minutes: sessionTimeoutMinutes })
      .eq('singleton', true)
      .select('id');
    if (error) throw error;
    if (!data?.length) return { ok: false, error: 'errors.forbidden' };
    updateTag(BRANDING_CACHE_TAG);
    revalidatePath('/settings/security');
    revalidatePath('/settings');
    return ok(undefined, 'security.toast.saved');
  },
  { scope: 'security.save' },
);

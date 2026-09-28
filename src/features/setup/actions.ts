'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { BRANDING_CACHE_TAG } from '@/lib/branding';
import { createClient } from '@/lib/supabase/server';
import { completeSetupSchema, setupOrganizationSchema } from './schemas';

/** Setup wizard mutations. The wizard is for `settings.administer`; writes also need `settings.edit`. */

export const saveSetupOrganization = withAction(
  setupOrganizationSchema,
  async (v, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const nul = (s: string) => s.trim() || null;
    const { data, error } = await supabase
      .from('organizations')
      .update({
        name_ar: nul(v.nameAr),
        name_en: nul(v.nameEn),
        legal_name_ar: nul(v.legalNameAr),
        legal_name_en: nul(v.legalNameEn),
        hr_email: nul(v.hrEmail.toLowerCase()),
        phone: nul(v.phone),
        city: nul(v.city),
      })
      .eq('singleton', true)
      .select('updated_at');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.forbidden');
    updateTag(BRANDING_CACHE_TAG);
    revalidatePath('/setup');
    revalidatePath('/settings');
    return ok(undefined, 'setup.toast.organizationSaved');
  },
  { scope: 'setup.organization' },
);

export const completeSetup = withAction(
  completeSetupSchema,
  async (_input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.administer');
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organization_settings')
      .update({ setup_completed_at: new Date().toISOString() })
      .eq('singleton', true)
      .select('setup_completed_at');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.forbidden');
    revalidatePath('/setup');
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return ok(undefined, 'setup.toast.completed');
  },
  { scope: 'setup.complete' },
);

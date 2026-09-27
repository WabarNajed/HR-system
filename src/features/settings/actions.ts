'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { BRANDING_CACHE_TAG } from '@/lib/branding';
import { createClient } from '@/lib/supabase/server';
import { isValidTimezone } from './queries';
import { normalizeWebsite, organizationFormSchema } from './schemas';

/**
 * Settings › Organization. Needs `settings.edit` (checked here and by RLS on both singleton rows).
 * Row changes are audited by the DB triggers. The public branding cache (company name, default
 * language) is expired and the root layout re-rendered so the new values show at once.
 */
export const saveOrganization = withAction(
  organizationFormSchema,
  async (v, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    if (!isValidTimezone(v.timezone)) throw new ActionError('errors.validation', { timezone: 'validation.invalidValue' });
    const supabase = await createClient();
    const nul = (s: string) => s.trim() || null;

    // Regional + schedule first: the DB validates the time zone / working days there.
    const settings = await supabase
      .from('organization_settings')
      .update({
        currency: v.currency,
        timezone: v.timezone,
        default_language: v.defaultLanguage,
        fiscal_year_start_month: v.fiscalYearStartMonth,
        working_days: [...new Set(v.workingDays)].sort(),
        weekend_days: [...new Set(v.weekendDays)].sort(),
        work_start: v.workStart,
        work_end: v.workEnd,
      })
      .eq('singleton', true)
      .select('updated_at');
    if (settings.error) throw settings.error;
    if (!settings.data?.length) throw new ActionError('errors.forbidden');

    const org = await supabase
      .from('organizations')
      .update({
        name_ar: nul(v.nameAr),
        name_en: nul(v.nameEn),
        legal_name_ar: nul(v.legalNameAr),
        legal_name_en: nul(v.legalNameEn),
        address_ar: nul(v.addressAr),
        address_en: nul(v.addressEn),
        city: nul(v.city),
        country: nul(v.country),
        website: normalizeWebsite(v.website),
        phone: nul(v.phone),
        hr_email: nul(v.hrEmail.toLowerCase()),
        commercial_registration: nul(v.commercialRegistration),
        vat_number: nul(v.vatNumber),
      })
      .eq('singleton', true)
      .select('updated_at');
    if (org.error) throw org.error;
    if (!org.data?.length) throw new ActionError('errors.forbidden');

    updateTag(BRANDING_CACHE_TAG);
    revalidatePath('/', 'layout');
    return ok({ updatedAt: org.data[0]!.updated_at }, 'settings.organization.toast.saved');
  },
  { scope: 'settings.organization.save' },
);

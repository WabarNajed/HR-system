'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { BRANDING_CACHE_TAG } from '@/lib/branding';
import { removeFiles } from '@/lib/storage';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import { hasAll } from '@/lib/permissions';
import { BRAND_IMAGES } from './image-kinds';
import { brandImageUrl } from './queries';
import { brandingFormSchema, setBrandImageSchema } from './schemas';

/**
 * Settings › Branding. Text/color fields need `settings.edit` (RLS on organization_settings);
 * public images (logo, sign-in image) also need `settings.administer` (storage policy on the
 * `branding` bucket). Changes are audited by the row triggers. Every save expires the cached
 * public branding (`updateTag`) and re-renders the root layout so the brand CSS variables apply.
 */

function refreshBranding() {
  updateTag(BRANDING_CACHE_TAG);
  revalidatePath('/', 'layout');
}

const blank = (v: string) => v.trim();
const blankToNull = (v: string) => v.trim() || null;

export const saveBranding = withAction(
  brandingFormSchema,
  async (values, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organization_settings')
      .update({
        // NOT NULL columns: an empty name falls back to the other language at display time.
        portal_name_ar: blank(values.portalNameAr),
        portal_name_en: blank(values.portalNameEn),
        primary_color: values.primaryColor.toUpperCase(),
        secondary_color: values.secondaryColor.toUpperCase(),
        login_title_ar: blankToNull(values.loginTitleAr),
        login_title_en: blankToNull(values.loginTitleEn),
        login_subtitle_ar: blankToNull(values.loginSubtitleAr),
        login_subtitle_en: blankToNull(values.loginSubtitleEn),
        signatory_name_ar: blankToNull(values.signatoryNameAr),
        signatory_name_en: blankToNull(values.signatoryNameEn),
        signatory_title_ar: blankToNull(values.signatoryTitleAr),
        signatory_title_en: blankToNull(values.signatoryTitleEn),
      })
      .eq('singleton', true)
      .select('updated_at');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.forbidden');
    refreshBranding();
    return ok({ updatedAt: data[0]!.updated_at }, 'settings.branding.toast.saved');
  },
  { scope: 'branding.save' },
);

async function objectExists(supabase: ServerSupabaseClient, bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(bucket).list(folder, { search: name, limit: 5 });
  if (error) return false;
  return (data ?? []).some((o) => o.name === name);
}

/** Stores (or clears) a branding image path after the browser uploaded it to Storage. */
export const setBrandImage = withAction(
  setBrandImageSchema,
  async ({ kind, path }, { ctx }) => {
    const config = BRAND_IMAGES[kind];
    if (!hasAll(ctx, config.permissions)) throw new ActionError('errors.forbidden');
    if (path !== null && !config.pathPattern.test(path)) throw new ActionError('errors.validation');

    const supabase = await createClient();
    if (path && !(await objectExists(supabase, config.bucket, path))) throw new ActionError('errors.uploadFailed');

    // Previous file (removed after the switch, unless it is the same object).
    let previous: string | null = null;
    if (config.table === 'organizations') {
      const { data, error } = await supabase.from('organizations').select('logo_path').maybeSingle();
      if (error) throw error;
      previous = data?.logo_path ?? null;
      const res = await supabase.from('organizations').update({ logo_path: path }).eq('singleton', true).select('id');
      if (res.error) throw res.error;
      if (!res.data?.length) throw new ActionError('errors.forbidden');
    } else {
      const column = config.column as 'login_image_path' | 'stamp_path' | 'signature_path';
      const { data, error } = await supabase.from('organization_settings').select('login_image_path, stamp_path, signature_path').maybeSingle();
      if (error) throw error;
      previous = (data?.[column] as string | null | undefined) ?? null;
      const res = await supabase
        .from('organization_settings')
        .update({ [column]: path } as { stamp_path: string | null })
        .eq('singleton', true)
        .select('updated_at');
      if (res.error) throw res.error;
      if (!res.data?.length) throw new ActionError('errors.forbidden');
    }

    if (previous && previous !== path) await removeFiles(supabase, config.bucket, [previous]);

    refreshBranding();
    const url = brandImageUrl(kind, path, new Date().toISOString());
    return ok({ url, path }, path ? 'settings.branding.toast.imageUpdated' : 'settings.branding.toast.imageRemoved');
  },
  { scope: 'branding.setImage' },
);

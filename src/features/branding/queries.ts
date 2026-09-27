import 'server-only';

import { getSupabaseEnv } from '@/lib/supabase/env';
import { fileRouteUrl, publicBrandingUrl } from '@/lib/storage';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { BRAND_IMAGES, type BrandImageKind } from './image-kinds';
import type { BrandingFormValues } from './schemas';

export type BrandImages = Record<BrandImageKind, { path: string | null; url: string | null }>;

export type BrandingSettings = {
  values: BrandingFormValues;
  images: BrandImages;
  company: {
    nameAr: string | null;
    nameEn: string | null;
    legalNameAr: string | null;
    legalNameEn: string | null;
    commercialRegistration: string | null;
    vatNumber: string | null;
    addressAr: string | null;
    addressEn: string | null;
    phone: string | null;
    website: string | null;
    hrEmail: string | null;
  };
  updatedAt: string | null;
};

/** Display URL for a stored branding image (public URL or the access-checked file route). */
export function brandImageUrl(kind: BrandImageKind, path: string | null, version?: string | null): string | null {
  if (!path) return null;
  const config = BRAND_IMAGES[kind];
  if (config.bucket === 'branding') {
    const env = getSupabaseEnv();
    return env ? publicBrandingUrl(env.url, path) : null;
  }
  const url = fileRouteUrl(config.bucket, path);
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

export async function getBrandingSettings(supabase: ServerSupabaseClient): Promise<BrandingSettings> {
  const [{ data: s, error: se }, { data: o, error: oe }] = await Promise.all([
    supabase
      .from('organization_settings')
      .select(
        'portal_name_ar, portal_name_en, primary_color, secondary_color, login_title_ar, login_title_en, login_subtitle_ar, login_subtitle_en, login_image_path, stamp_path, signature_path, signatory_name_ar, signatory_name_en, signatory_title_ar, signatory_title_en, updated_at',
      )
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('name_ar, name_en, legal_name_ar, legal_name_en, logo_path, commercial_registration, vat_number, address_ar, address_en, phone, website, hr_email, updated_at')
      .maybeSingle(),
  ]);
  if (se) throw se;
  if (oe) throw oe;
  const version = s?.updated_at ?? null;
  return {
    values: {
      portalNameAr: s?.portal_name_ar ?? '',
      portalNameEn: s?.portal_name_en ?? '',
      primaryColor: (s?.primary_color ?? '#0F5E6B').toLowerCase(),
      secondaryColor: (s?.secondary_color ?? '#B8862F').toLowerCase(),
      loginTitleAr: s?.login_title_ar ?? '',
      loginTitleEn: s?.login_title_en ?? '',
      loginSubtitleAr: s?.login_subtitle_ar ?? '',
      loginSubtitleEn: s?.login_subtitle_en ?? '',
      signatoryNameAr: s?.signatory_name_ar ?? '',
      signatoryNameEn: s?.signatory_name_en ?? '',
      signatoryTitleAr: s?.signatory_title_ar ?? '',
      signatoryTitleEn: s?.signatory_title_en ?? '',
    },
    images: {
      logo: { path: o?.logo_path ?? null, url: brandImageUrl('logo', o?.logo_path ?? null) },
      loginImage: { path: s?.login_image_path ?? null, url: brandImageUrl('loginImage', s?.login_image_path ?? null) },
      stamp: { path: s?.stamp_path ?? null, url: brandImageUrl('stamp', s?.stamp_path ?? null, version) },
      signature: { path: s?.signature_path ?? null, url: brandImageUrl('signature', s?.signature_path ?? null, version) },
    },
    company: {
      nameAr: o?.name_ar ?? null,
      nameEn: o?.name_en ?? null,
      legalNameAr: o?.legal_name_ar ?? null,
      legalNameEn: o?.legal_name_en ?? null,
      commercialRegistration: o?.commercial_registration ?? null,
      vatNumber: o?.vat_number ?? null,
      addressAr: o?.address_ar ?? null,
      addressEn: o?.address_en ?? null,
      phone: o?.phone ?? null,
      website: o?.website ?? null,
      hrEmail: o?.hr_email ?? null,
    },
    updatedAt: s?.updated_at ?? null,
  };
}

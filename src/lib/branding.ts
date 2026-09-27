import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { isLocale, type Locale } from '@/lib/i18n/config';
import type { Database } from '@/types/database';
import { fetchWithTimeout, getSupabaseEnv } from '@/lib/supabase/env';
import { normalizeHex } from '@/lib/utils';

/**
 * Public (anon-safe) organization branding from RPC `get_public_branding()`.
 *
 * Cached across requests for 5 minutes under the `branding` tag — the Settings › Branding /
 * Organization save actions must call `updateTag(BRANDING_CACHE_TAG)` so changes show at once.
 * Never throws: any failure (not configured, network, timeout, RPC missing) yields defaults.
 */

export const BRANDING_CACHE_TAG = 'branding';

export type PublicBranding = {
  portalNameAr: string | null;
  portalNameEn: string | null;
  companyNameAr: string | null;
  companyNameEn: string | null;
  logoUrl: string | null;
  loginImageUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  loginTitleAr: string | null;
  loginTitleEn: string | null;
  loginSubtitleAr: string | null;
  loginSubtitleEn: string | null;
  defaultLanguage: Locale | null;
  hrEmail: string | null;
  allowSelfRegistration: boolean;
  /** True when the values come from the built-in defaults (RPC unavailable). */
  isFallback: boolean;
};

export const DEFAULT_BRANDING: PublicBranding = {
  portalNameAr: null,
  portalNameEn: null,
  companyNameAr: null,
  companyNameEn: null,
  logoUrl: null,
  loginImageUrl: null,
  primaryColor: null,
  secondaryColor: null,
  loginTitleAr: null,
  loginTitleEn: null,
  loginSubtitleAr: null,
  loginSubtitleEn: null,
  defaultLanguage: null,
  hrEmail: null,
  allowSelfRegistration: true,
  isFallback: true,
};

type Json = Record<string, unknown>;

function str(obj: Json, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function publicBucketUrl(baseUrl: string, pathOrUrl: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('/')) return pathOrUrl;
  const clean = pathOrUrl.replace(/^branding\//, '');
  return `${baseUrl.replace(/\/+$/, '')}/storage/v1/object/public/branding/${clean
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

/** Tolerant parser: accepts snake_case or camelCase keys and `*_url` or `*_path` values. */
export function parseBranding(raw: unknown, supabaseUrl: string): PublicBranding {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_BRANDING;
  const o = raw as Json;
  const lang = str(o, 'default_language', 'defaultLanguage');
  const allow = o.allow_self_registration ?? o.allowSelfRegistration;
  return {
    portalNameAr: str(o, 'portal_name_ar', 'portalNameAr'),
    portalNameEn: str(o, 'portal_name_en', 'portalNameEn'),
    companyNameAr: str(o, 'company_name_ar', 'companyNameAr', 'name_ar'),
    companyNameEn: str(o, 'company_name_en', 'companyNameEn', 'name_en'),
    logoUrl: publicBucketUrl(supabaseUrl, str(o, 'logo_url', 'logoUrl', 'logo_path')),
    loginImageUrl: publicBucketUrl(supabaseUrl, str(o, 'login_image_url', 'loginImageUrl', 'login_image_path')),
    primaryColor: normalizeHex(str(o, 'primary_color', 'primaryColor')),
    secondaryColor: normalizeHex(str(o, 'secondary_color', 'secondaryColor')),
    loginTitleAr: str(o, 'login_title_ar', 'loginTitleAr'),
    loginTitleEn: str(o, 'login_title_en', 'loginTitleEn'),
    loginSubtitleAr: str(o, 'login_subtitle_ar', 'loginSubtitleAr'),
    loginSubtitleEn: str(o, 'login_subtitle_en', 'loginSubtitleEn'),
    defaultLanguage: isLocale(lang) ? lang : null,
    hrEmail: str(o, 'hr_email', 'hrEmail'),
    allowSelfRegistration: typeof allow === 'boolean' ? allow : true,
    isFallback: false,
  };
}

const fetchBrandingCached = unstable_cache(
  async (url: string, anonKey: string): Promise<PublicBranding> => {
    const client = createSupabaseClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchWithTimeout(5000) },
    });
    const { data, error } = await client.rpc('get_public_branding');
    // Throwing keeps failures out of the cache; the caller falls back to defaults.
    if (error) throw new Error(`get_public_branding failed: ${error.code ?? ''} ${error.message}`);
    return parseBranding(data, url);
  },
  ['public-branding-v1'],
  { revalidate: 300, tags: [BRANDING_CACHE_TAG] },
);

let lastFailureLog = 0;

/** Branding for the current request (deduped per request; cached across requests). */
export const getPublicBranding = cache(async (): Promise<PublicBranding> => {
  const env = getSupabaseEnv();
  if (!env) return DEFAULT_BRANDING;
  try {
    return await fetchBrandingCached(env.url, env.anonKey);
  } catch (error) {
    // Throttle the log so a missing RPC doesn't flood the console on every request.
    if (Date.now() - lastFailureLog > 60_000) {
      lastFailureLog = Date.now();
      console.warn('[branding] using defaults:', error instanceof Error ? error.message : error);
    }
    return DEFAULT_BRANDING;
  }
});

/** Localized portal name with fallback to the other language, then to the translated app name. */
export function brandingPortalName(b: PublicBranding, locale: Locale, fallback: string): string {
  return (locale === 'ar' ? b.portalNameAr || b.portalNameEn : b.portalNameEn || b.portalNameAr) || fallback;
}

export function brandingCompanyName(b: PublicBranding, locale: Locale): string | null {
  return (locale === 'ar' ? b.companyNameAr || b.companyNameEn : b.companyNameEn || b.companyNameAr) || null;
}

export function brandingLoginTitle(b: PublicBranding, locale: Locale): string | null {
  return (locale === 'ar' ? b.loginTitleAr || b.loginTitleEn : b.loginTitleEn || b.loginTitleAr) || null;
}

export function brandingLoginSubtitle(b: PublicBranding, locale: Locale): string | null {
  return (locale === 'ar' ? b.loginSubtitleAr || b.loginSubtitleEn : b.loginSubtitleEn || b.loginSubtitleAr) || null;
}

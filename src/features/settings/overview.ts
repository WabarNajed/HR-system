import 'server-only';

import type { ServerSupabaseClient } from '@/lib/supabase/server';

/** Parsed `settings_overview()` (sections are absent when the caller lacks the permission). */
export type Counted = { total: number; inactive: number };

export type SettingsOverview = {
  organization?: {
    name_ar: string | null;
    name_en: string | null;
    legal_name_ar: string | null;
    legal_name_en: string | null;
    has_logo: boolean;
    hr_email: string | null;
    phone: string | null;
    city: string | null;
    country: string | null;
    commercial_registration: string | null;
    vat_number: string | null;
    updated_at: string | null;
  };
  settings?: {
    currency: string;
    timezone: string;
    default_language: 'ar' | 'en';
    working_days: number[];
    weekend_days: number[];
    work_start: string;
    work_end: string;
    fiscal_year_start_month: number;
    portal_name_ar: string | null;
    portal_name_en: string | null;
    primary_color: string;
    secondary_color: string;
    has_login_image: boolean;
    has_stamp: boolean;
    has_signature: boolean;
    has_signatory: boolean;
    allow_self_registration: boolean;
    session_timeout_minutes: number;
    setup_completed_at: string | null;
    updated_at: string | null;
  };
  departments?: Counted;
  job_titles?: Counted;
  locations?: Counted;
  cost_centers?: Counted;
  request_types?: Counted;
  request_fields?: { total: number };
  workflows?: Counted;
  request_types_without_workflow?: number;
  sla?: { with_sla: number; total: number };
  email_templates?: Counted;
  notification_rules?: { total: number; email_enabled: number };
  employees?: { total: number };
  leave_types?: Counted;
  public_holidays?: { total: number; this_year: number; upcoming: number };
  certificate_templates?: Counted;
  users?: { total: number; active: number; pending: number; disabled: number };
  roles?: { total: number; custom: number };
  hr_admins?: number;
  super_admins?: number;
  imports?: { total: number; last_at: string | null; failed: number };
  audit?: { last_7_days: number; last_at: string | null };
};

/** Loads the console overview; returns null (and logs) when the RPC fails so the page still renders. */
export async function getSettingsOverview(supabase: ServerSupabaseClient): Promise<SettingsOverview | null> {
  const { data, error } = await supabase.rpc('settings_overview');
  if (error) {
    console.error('[settings] settings_overview failed:', error.code, error.message);
    return null;
  }
  return (data ?? {}) as SettingsOverview;
}

/** Pending self-registrations (for the console nav badge); null when not visible to the caller. */
export async function countPendingRegistrations(supabase: ServerSupabaseClient): Promise<number | null> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'info_requested']);
  return error ? null : (count ?? 0);
}

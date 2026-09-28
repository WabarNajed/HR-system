import 'server-only';

import { getEmailProviderStatus, type EmailProviderStatus } from '@/features/email-templates/provider';
import { getSettingsOverview, type SettingsOverview } from '@/features/settings/overview';
import { DEFAULT_BRAND_COLORS } from '@/lib/utils';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { SETUP_STEPS, type SetupStep } from './steps';

export type NamedItem = { id: string; name_ar: string | null; name_en: string | null; code?: string | null };

export type SetupData = {
  completion: Record<SetupStep, boolean>;
  counts: Partial<Record<SetupStep, number>>;
  completedAt: string | null;
  organization: {
    name_ar: string | null;
    name_en: string | null;
    legal_name_ar: string | null;
    legal_name_en: string | null;
    hr_email: string | null;
    phone: string | null;
    city: string | null;
  } | null;
  branding: { hasLogo: boolean; primary: string | null; secondary: string | null; portalAr: string | null; portalEn: string | null };
  departments: NamedItem[];
  jobTitles: NamedItem[];
  locations: NamedItem[];
  leaveTypes: NamedItem[];
  requestTypes: (NamedItem & { steps: string[] })[];
  hrAdmins: { id: string; name: string; email: string | null }[];
  employees: number;
  provider: EmailProviderStatus;
};

async function names(supabase: ServerSupabaseClient, table: 'departments' | 'job_titles' | 'locations' | 'leave_types'): Promise<NamedItem[]> {
  const { data, error } = await supabase.from(table).select('id, name_ar, name_en, code').eq('is_active', true).order('name_en').limit(200);
  if (error) throw error;
  return (data ?? []) as NamedItem[];
}

export async function loadSetupData(supabase: ServerSupabaseClient): Promise<SetupData> {
  const [overview, departments, jobTitles, locations, leaveTypes, orgRes, typesRes, adminsRes] = await Promise.all([
    getSettingsOverview(supabase),
    names(supabase, 'departments'),
    names(supabase, 'job_titles'),
    names(supabase, 'locations'),
    names(supabase, 'leave_types'),
    supabase.from('organizations').select('name_ar, name_en, legal_name_ar, legal_name_en, hr_email, phone, city').limit(1).maybeSingle(),
    supabase
      .from('request_types')
      .select('id, name_ar, name_en, workflow_id, requires_manager_approval, requires_hr_approval, workflow:request_workflows!request_types_workflow_id_fkey(steps:request_workflow_steps(step_order, step_type))')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('user_roles').select('user_id, role:roles!inner(key), profile:profiles!inner(id, full_name, email, status)').eq('role.key', 'hr_admin').eq('profile.status', 'active'),
  ]);
  if (orgRes.error) throw orgRes.error;
  if (typesRes.error) throw typesRes.error;
  if (adminsRes.error) console.error('[setup] hr admins lookup failed:', adminsRes.error.code, adminsRes.error.message);

  const o: SettingsOverview = overview ?? {};
  const provider = getEmailProviderStatus();
  type RawType = NamedItem & { workflow: { steps: { step_order: number; step_type: string }[] | null } | null };
  const requestTypes = ((typesRes.data ?? []) as unknown as RawType[]).map((r) => ({
    id: r.id,
    name_ar: r.name_ar,
    name_en: r.name_en,
    steps: [...(r.workflow?.steps ?? [])].sort((a, b) => a.step_order - b.step_order).map((s) => s.step_type),
  }));
  type RawAdmin = { user_id: string; profile: { id: string; full_name: string | null; email: string | null } | null };
  const hrAdmins = ((adminsRes.data ?? []) as unknown as RawAdmin[])
    .filter((a) => a.profile)
    .map((a) => ({ id: a.profile!.id, name: a.profile!.full_name || a.profile!.email || a.profile!.id, email: a.profile!.email }));

  const settings = o.settings;
  const customColors =
    Boolean(settings) &&
    ((settings!.primary_color ?? '').toLowerCase() !== DEFAULT_BRAND_COLORS.primary || (settings!.secondary_color ?? '').toLowerCase() !== DEFAULT_BRAND_COLORS.secondary);
  const employees = o.employees?.total ?? 0;
  const hrAdminCount = o.hr_admins ?? hrAdmins.length;

  const completion: Record<SetupStep, boolean> = {
    organization: Boolean(orgRes.data?.name_ar || orgRes.data?.name_en),
    branding: Boolean(o.organization?.has_logo) || customColors,
    departments: departments.length > 0,
    jobTitles: jobTitles.length > 0,
    locations: locations.length > 0,
    leaveTypes: leaveTypes.length > 0,
    requestTypes: requestTypes.length > 0,
    workflows: requestTypes.length > 0 && (o.request_types_without_workflow ?? 0) === 0,
    hrAdmin: hrAdminCount > 0,
    email: Boolean(provider.provider && provider.from),
    employeeImport: employees > 0,
  };
  for (const step of SETUP_STEPS) completion[step] = Boolean(completion[step]);

  return {
    completion,
    counts: {
      departments: departments.length,
      jobTitles: jobTitles.length,
      locations: locations.length,
      leaveTypes: leaveTypes.length,
      requestTypes: requestTypes.length,
      workflows: requestTypes.filter((r) => r.steps.length).length,
      hrAdmin: hrAdminCount,
      employeeImport: employees,
    },
    completedAt: settings?.setup_completed_at ?? null,
    organization: orgRes.data ?? null,
    branding: {
      hasLogo: Boolean(o.organization?.has_logo),
      primary: settings?.primary_color ?? null,
      secondary: settings?.secondary_color ?? null,
      portalAr: settings?.portal_name_ar ?? null,
      portalEn: settings?.portal_name_en ?? null,
    },
    departments,
    jobTitles,
    locations,
    leaveTypes,
    requestTypes,
    hrAdmins,
    employees,
    provider,
  };
}

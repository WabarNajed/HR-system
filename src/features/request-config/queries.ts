import 'server-only';

import { loadTypeFields } from '@/features/requests/queries';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { classifyWorkflow } from './workflow-logic';
import {
  EMPTY_USAGE,
  type BuilderField,
  type LeaveTypeLite,
  type OrgCalendar,
  type RequestTypeRow,
  type RoleOption,
  type StepType,
  type TypeUsage,
  type UserOption,
  type WorkflowStep,
} from './types';

/**
 * Server loaders for Settings › Requests (RLS as the signed-in user; HR with `settings.view` sees
 * inactive rows too). Aggregates come from the security-definer `request_type_usage()` RPC.
 */

const TYPE_COLUMNS =
  'id, key, category, name_ar, name_en, description_ar, description_en, icon, color, sla_business_days, requires_manager_approval, requires_hr_approval, allow_attachments, is_active, is_system, sort_order, workflow_id, updated_at';

type RawType = Omit<RequestTypeRow, 'fieldsCount' | 'activeFieldsCount' | 'steps' | 'workflowKind' | 'usage'>;

type RawWorkflow = {
  id: string;
  request_type_id: string;
  is_active: boolean;
  created_at: string;
  steps: (Omit<WorkflowStep, 'step_type'> & { step_type: string })[] | null;
};

function toStep(raw: Omit<WorkflowStep, 'step_type'> & { step_type: string }): WorkflowStep {
  return {
    id: raw.id,
    step_order: raw.step_order,
    step_type: (['manager', 'hr', 'role', 'user'].includes(raw.step_type) ? raw.step_type : 'hr') as StepType,
    name_ar: raw.name_ar,
    name_en: raw.name_en,
    approver_role_key: raw.approver_role_key,
    approver_user_id: raw.approver_user_id,
    sla_business_days: raw.sla_business_days,
    can_return: raw.can_return,
    can_reassign: raw.can_reassign,
  };
}

/** Mirrors private.resolve_steps' workflow choice: the type's workflow_id, else its latest active workflow. */
function stepsOf(type: RawType, workflows: RawWorkflow[]): WorkflowStep[] {
  const own = workflows.filter((w) => w.request_type_id === type.id && w.is_active);
  const chosen = own.find((w) => w.id === type.workflow_id) ?? [...own].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return (chosen?.steps ?? []).map(toStep).sort((a, b) => a.step_order - b.step_order);
}

export async function loadTypeUsage(supabase: ServerSupabaseClient): Promise<Map<string, TypeUsage>> {
  const { data, error } = await supabase.rpc('request_type_usage');
  if (error) {
    console.error('[request-config] request_type_usage failed:', error.code, error.message);
    return new Map();
  }
  return new Map(
    (data ?? []).map((r) => [
      r.request_type_id,
      {
        total: Number(r.total ?? 0),
        open: Number(r.open ?? 0),
        overdueOpen: Number(r.overdue_open ?? 0),
        resolved: Number(r.resolved ?? 0),
        resolvedOnTime: Number(r.resolved_on_time ?? 0),
        lastSubmittedAt: r.last_submitted_at ?? null,
      },
    ]),
  );
}

/** Every request type (active and inactive) with field counts, workflow steps and usage. */
export async function loadRequestTypeRows(supabase: ServerSupabaseClient): Promise<RequestTypeRow[]> {
  const [typesRes, fieldsRes, workflowsRes, usage] = await Promise.all([
    supabase.from('request_types').select(TYPE_COLUMNS).order('sort_order').order('name_en'),
    supabase.from('request_fields').select('request_type_id, is_active'),
    supabase
      .from('request_workflows')
      .select(
        'id, request_type_id, is_active, created_at, steps:request_workflow_steps(id, step_order, step_type, name_ar, name_en, approver_role_key, approver_user_id, sla_business_days, can_return, can_reassign)',
      ),
    loadTypeUsage(supabase),
  ]);
  if (typesRes.error) throw typesRes.error;
  if (fieldsRes.error) throw fieldsRes.error;
  if (workflowsRes.error) throw workflowsRes.error;

  const counts = new Map<string, { all: number; active: number }>();
  for (const f of fieldsRes.data ?? []) {
    const c = counts.get(f.request_type_id) ?? { all: 0, active: 0 };
    c.all++;
    if (f.is_active) c.active++;
    counts.set(f.request_type_id, c);
  }
  const workflows = (workflowsRes.data ?? []) as unknown as RawWorkflow[];

  return ((typesRes.data ?? []) as RawType[]).map((t) => {
    const steps = stepsOf(t, workflows);
    return {
      ...t,
      fieldsCount: counts.get(t.id)?.all ?? 0,
      activeFieldsCount: counts.get(t.id)?.active ?? 0,
      steps,
      workflowKind: classifyWorkflow(steps, t),
      usage: usage.get(t.id) ?? EMPTY_USAGE,
    };
  });
}

/** Form Builder: fields of one type with per-key usage (keys holding request data are immutable). */
export async function loadBuilderFields(supabase: ServerSupabaseClient, typeId: string): Promise<BuilderField[]> {
  const [fields, usageRes] = await Promise.all([loadTypeFields(supabase, typeId), supabase.rpc('request_field_usage', { p_request_type_id: typeId })]);
  if (usageRes.error) console.error('[request-config] request_field_usage failed:', usageRes.error.code, usageRes.error.message);
  const uses = new Map((usageRes.data ?? []).map((u) => [u.field_key, Number(u.uses ?? 0)]));
  return fields.map((f) => ({ ...f, uid: f.id ?? f.key, uses: uses.get(f.key) ?? 0 }));
}

export async function loadRoleOptions(supabase: ServerSupabaseClient): Promise<RoleOption[]> {
  const { data, error } = await supabase.from('roles').select('key, name_ar, name_en, data_scope, rank').order('rank', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ key: r.key, name_ar: r.name_ar, name_en: r.name_en, data_scope: r.data_scope }));
}

/** Display names of the users referenced by `user` steps. */
export async function loadStepUsers(supabase: ServerSupabaseClient, ids: string[]): Promise<UserOption[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const { data, error } = await supabase.from('profiles').select('id, full_name, email').in('id', unique);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || p.id, email: p.email }));
}

export async function loadLeaveTypesLite(supabase: ServerSupabaseClient): Promise<LeaveTypeLite[]> {
  const { data, error } = await supabase.from('leave_types').select('id, code, name_ar, name_en').eq('is_active', true).order('sort_order');
  if (error) throw error;
  return (data ?? []).map((l) => ({ id: l.id, code: l.code, name_ar: l.name_ar, name_en: l.name_en }));
}

export async function loadOrgCalendar(supabase: ServerSupabaseClient, todayIso: string): Promise<OrgCalendar> {
  const year = todayIso.slice(0, 4);
  const [settings, thisYear, upcoming] = await Promise.all([
    supabase.from('organization_settings').select('working_days, weekend_days, work_end, timezone').limit(1).maybeSingle(),
    supabase
      .from('public_holidays')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`),
    supabase.from('public_holidays').select('id', { count: 'exact', head: true }).eq('is_active', true).gte('end_date', todayIso),
  ]);
  return {
    workingDays: settings.data?.working_days ?? [],
    weekendDays: settings.data?.weekend_days ?? [],
    workEnd: settings.data?.work_end ?? null,
    timezone: settings.data?.timezone ?? null,
    holidaysThisYear: thisYear.count ?? 0,
    upcomingHolidays: upcoming.count ?? 0,
  };
}

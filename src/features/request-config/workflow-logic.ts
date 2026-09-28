/**
 * Isomorphic workflow helpers (Workflow Builder, Request Types admin, SLA page).
 */
import type { StepType, WorkflowKind, WorkflowStep } from './types';

/** Default bilingual step names (match the engine's synthesized names). */
export const DEFAULT_STEP_NAMES: Record<StepType, { name_ar: string; name_en: string }> = {
  manager: { name_ar: 'اعتماد المدير المباشر', name_en: 'Direct manager approval' },
  hr: { name_ar: 'مراجعة الموارد البشرية', name_en: 'HR review' },
  role: { name_ar: 'اعتماد حسب الدور', name_en: 'Role approval' },
  user: { name_ar: 'اعتماد مستخدم محدد', name_en: 'Named approver' },
};

/**
 * `standard` = exactly the steps implied by the approval flags (manager first, then HR), `custom` =
 * anything else (role/user steps, repeats, other order), `none` = no stored steps.
 */
export function classifyWorkflow(
  steps: readonly Pick<WorkflowStep, 'step_type'>[],
  flags: { requires_manager_approval: boolean; requires_hr_approval: boolean },
): WorkflowKind {
  if (!steps.length) return 'none';
  const expected: StepType[] = [];
  if (flags.requires_manager_approval) expected.push('manager');
  if (flags.requires_hr_approval || !flags.requires_manager_approval) expected.push('hr');
  const actual = steps.map((s) => s.step_type);
  return actual.length === expected.length && actual.every((t, i) => t === expected[i]) ? 'standard' : 'custom';
}

/** Steps the engine runs when no workflow is stored (mirrors private.resolve_steps). */
export function synthesizedSteps(flags: { requires_manager_approval: boolean; requires_hr_approval: boolean }): WorkflowStep[] {
  const out: WorkflowStep[] = [];
  const add = (type: StepType) =>
    out.push({
      id: null,
      step_order: out.length + 1,
      step_type: type,
      ...DEFAULT_STEP_NAMES[type],
      approver_role_key: null,
      approver_user_id: null,
      sla_business_days: null,
      can_return: true,
      can_reassign: true,
    });
  if (flags.requires_manager_approval) add('manager');
  if (flags.requires_hr_approval || !flags.requires_manager_approval) add('hr');
  return out;
}

/** Sum of per-step SLAs when every step has one, else null. */
export function stepSlaTotal(steps: readonly Pick<WorkflowStep, 'sla_business_days'>[]): number | null {
  if (!steps.length || steps.some((s) => s.sla_business_days === null)) return null;
  return steps.reduce((sum, s) => sum + (s.sla_business_days ?? 0), 0);
}

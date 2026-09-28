/**
 * Request configuration (Settings › Requests) — isomorphic types shared by the Request Types admin,
 * Form Builder, Workflow Builder and SLA settings. Field definitions reuse the Requests module's
 * `RequestField` contract so the builder preview renders exactly what employees will see.
 */
import type { FieldOption, RequestField, RequestFieldType, VisibilityRule } from '@/features/requests/types';

export type { FieldOption, RequestField, RequestFieldType, VisibilityRule };

export const STEP_TYPES = ['manager', 'hr', 'role', 'user'] as const;
export type StepType = (typeof STEP_TYPES)[number];

/** Aggregates from `request_type_usage()` (drafts excluded). */
export type TypeUsage = {
  total: number;
  open: number;
  overdueOpen: number;
  resolved: number;
  resolvedOnTime: number;
  lastSubmittedAt: string | null;
};

export const EMPTY_USAGE: TypeUsage = { total: 0, open: 0, overdueOpen: 0, resolved: 0, resolvedOnTime: 0, lastSubmittedAt: null };

export type WorkflowStep = {
  id: string | null;
  step_order: number;
  step_type: StepType;
  name_ar: string;
  name_en: string;
  approver_role_key: string | null;
  approver_user_id: string | null;
  sla_business_days: number | null;
  can_return: boolean;
  can_reassign: boolean;
};

/**
 * `standard`: the manager/HR steps implied by the type's approval flags;
 * `custom`: role or user steps, repeated steps or a non-standard order;
 * `none`: no stored steps (the engine synthesizes them from the flags).
 */
export type WorkflowKind = 'standard' | 'custom' | 'none';

/** One row of the Request Types admin (and the builder rails). */
export type RequestTypeRow = {
  id: string;
  key: string;
  category: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  icon: string;
  color: string | null;
  sla_business_days: number | null;
  requires_manager_approval: boolean;
  requires_hr_approval: boolean;
  allow_attachments: boolean;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  workflow_id: string | null;
  updated_at: string;
  fieldsCount: number;
  activeFieldsCount: number;
  steps: WorkflowStep[];
  workflowKind: WorkflowKind;
  usage: TypeUsage;
};

export type RoleOption = { key: string; name_ar: string; name_en: string; data_scope: string };

export type UserOption = { id: string; name: string; email: string | null };

/** Editable field in the Form Builder (a `RequestField` plus client-only bookkeeping). */
export type BuilderField = RequestField & {
  /** Stable client id (the row id, or a generated one for unsaved fields). */
  uid: string;
  /** Number of requests holding a value for this key (0 for new fields). */
  uses: number;
};

export type LeaveTypeLite = { id: string; code: string; name_ar: string; name_en: string };

/** Organization calendar facts shown on the SLA page. */
export type OrgCalendar = {
  workingDays: number[];
  weekendDays: number[];
  workEnd: string | null;
  timezone: string | null;
  holidaysThisYear: number;
  upcomingHolidays: number;
};

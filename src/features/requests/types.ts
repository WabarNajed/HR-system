/**
 * Shared (isomorphic) types of the requests module. Field definitions mirror `request_fields`
 * (docs/DATABASE.md §10); list/detail rows mirror what `queries.ts` selects.
 */

export const REQUEST_FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'currency',
  'date',
  'datetime',
  'time',
  'dropdown',
  'multi_select',
  'yes_no',
  'attachment',
  'leave_type',
  'dependent',
  'employee',
  'email',
  'phone',
] as const;
export type RequestFieldType = (typeof REQUEST_FIELD_TYPES)[number];

export const REQUEST_STATUSES = [
  'draft',
  'submitted',
  'pending_manager_approval',
  'pending_hr_review',
  'returned',
  'approved',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type FieldOption = { value: string; label_ar: string; label_en: string };

export type VisibilityRule =
  | { field: string; in?: unknown[]; not_in?: unknown[] }
  | { all: VisibilityRule[] }
  | { any: VisibilityRule[] };

export type FieldValidation = {
  pattern?: string;
  min?: number;
  max?: number;
  step?: number;
  readonly?: boolean;
  computed?: 'leave_days' | string;
  granularity?: 'month' | string;
};

/** One dynamic form field (a `request_fields` row). */
export type RequestField = {
  id?: string;
  key: string;
  field_type: RequestFieldType;
  label_ar: string;
  label_en: string;
  help_ar?: string | null;
  help_en?: string | null;
  placeholder_ar?: string | null;
  placeholder_en?: string | null;
  required: boolean;
  options: FieldOption[];
  sort_order: number;
  visibility: VisibilityRule | null;
  validation: FieldValidation;
  is_system?: boolean;
  is_active?: boolean;
};

/** Attachment entries held in form state for `attachment` fields (and the general attachments list). */
export type AttachmentItem =
  | {
      kind: 'existing';
      id: string;
      name: string;
      size: number | null;
      mime: string | null;
      path: string;
      fieldKey: string | null;
      /** Viewer may delete it now (draft/returned requester, or HR). */
      canRemove?: boolean;
      uploadedAt?: string | null;
      uploaderName?: string | null;
    }
  | { kind: 'pending'; id: string; file: File; fieldKey: string | null };

export type LeaveTypeOption = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  color: string | null;
  deducts_balance: boolean;
  requires_attachment: boolean;
  max_days_per_request: number | null;
  day_count_basis: 'working' | 'calendar' | string;
  gender_restriction: 'male' | 'female' | null;
  is_paid: boolean;
};

export type DependentOption = { id: string; name_ar: string | null; name_en: string | null; relationship: string | null };

export type EmployeeOption = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  department?: { name_ar: string | null; name_en: string | null } | null;
};

/** Lookup data for `leave_type` / `dependent` / `employee` fields (prefetched or lazily loaded). */
export type FormLookups = {
  leaveTypes: LeaveTypeOption[];
  dependents: DependentOption[];
  /** id → label for `employee` values shown read-only. */
  employees?: Record<string, EmployeeOption>;
};

export type RequestFormValues = Record<string, unknown>;

/** Approval path preview step (resolved from the type's workflow). */
export type ApprovalPathStep = {
  order: number;
  type: 'manager' | 'hr' | 'role' | 'user' | string;
  name_ar: string;
  name_en: string;
  roleKey?: string | null;
};

/** Request type as used by the wizard (with its active fields and approval path). */
export type RequestTypeDefinition = {
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
  allow_attachments: boolean;
  sort_order: number;
  fields: RequestField[];
  path: ApprovalPathStep[];
};

/** Viewer flags from `get_my_request_access()`. */
export type RequestAccess = {
  active: boolean;
  isSuperAdmin: boolean;
  employeeId: string | null;
  orgView: boolean;
  orgCreate: boolean;
  orgEdit: boolean;
  orgApprove: boolean;
  roleStepIds: string[];
  userId: string;
};

/** Per-request capabilities from `get_request_capabilities()`. */
export type RequestCapabilities = {
  is_requester: boolean;
  is_owner: boolean;
  can_approve: boolean;
  can_reject: boolean;
  can_return: boolean;
  can_reassign: boolean;
  reassign_scope: 'fulfilment' | 'hr' | 'approver';
  can_start: boolean;
  can_complete: boolean;
  can_cancel: boolean;
  can_edit: boolean;
  can_submit: boolean;
  can_delete: boolean;
  can_attach: boolean;
  can_remove_any_attachment: boolean;
  can_comment: boolean;
  can_comment_internal: boolean;
  can_view_internal: boolean;
};

export type BilingualName = { name_ar: string | null; name_en: string | null };

/** Row of the request lists (Request Center, approvals queue, employee tab). */
export type RequestListRow = {
  id: string;
  request_number: string | null;
  status: RequestStatus;
  subtype: string | null;
  title: string | null;
  created_at: string;
  submitted_at: string | null;
  due_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  current_step_type: string | null;
  current_step_id: string | null;
  current_approver_id: string | null;
  assigned_to: string | null;
  requester_id: string | null;
  employee_id: string;
  type: {
    id: string;
    key: string;
    name_ar: string;
    name_en: string;
    icon: string;
    color: string | null;
    category: string;
    subtypes: FieldOption[];
  } | null;
  employee: {
    id: string;
    employee_number: string | null;
    name_ar: string | null;
    name_en: string | null;
    avatar_url: string | null;
    department: BilingualName | null;
  } | null;
  assignee_name: string | null;
  approver_name: string | null;
  step: { name_ar: string | null; name_en: string | null; can_return: boolean; can_reassign: boolean } | null;
};

export type ApprovalDecisionRow = RequestListRow & {
  decision: 'approved' | 'rejected' | 'returned';
  decision_comment: string | null;
  decided_at: string | null;
  decision_step_type: string | null;
};

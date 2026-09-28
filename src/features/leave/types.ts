/**
 * Leave module — serializable shapes shared by server queries and client components.
 * Dates are ISO `yyyy-MM-dd` strings; numeric DB columns arrive as numbers.
 */

export type LeaveScope = 'mine' | 'team' | 'org';

export type LeaveTypeRef = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  color: string;
};

export type LeaveTypeRow = LeaveTypeRef & {
  description_ar: string | null;
  description_en: string | null;
  is_paid: boolean;
  deducts_balance: boolean;
  default_entitlement: number;
  max_days_per_request: number | null;
  day_count_basis: 'working' | 'calendar';
  requires_attachment: boolean;
  gender_restriction: 'male' | 'female' | null;
  sort_order: number;
  is_active: boolean;
};

export type HolidayRow = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  /** Calendar days in the range. */
  days: number;
  /** Organization working days inside the range (what leave/SLA counts skip). */
  working_days: number;
};

export type EmployeeRef = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  avatarUrl: string | null;
  department: { name_ar: string | null; name_en: string | null } | null;
};

export type LeaveRequestListRow = {
  id: string;
  request_id: string;
  request_number: string | null;
  status: string;
  current_step_type: string | null;
  /** Snapshot name of the pending approver (manager/user steps); null for queue steps. */
  approver_name: string | null;
  submitted_at: string | null;
  start_date: string;
  end_date: string;
  return_date: string | null;
  days: number;
  balance_effect: string;
  employee: EmployeeRef;
  leave_type: LeaveTypeRef | null;
};

export type BalanceRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  opening_balance: number;
  entitlement: number;
  adjustment: number;
  used: number;
  pending: number;
  /** opening + entitlement + adjustment − used (DB generated). */
  remaining: number;
  /** remaining − pending: what a new request can still use. */
  available: number;
  leave_type: LeaveTypeRef & { sort_order: number };
  employee?: EmployeeRef;
};

export type AdjustmentRow = {
  id: string;
  amount: number;
  reason: string;
  old_remaining: number | null;
  new_remaining: number | null;
  changed_by_name: string | null;
  changed_at: string;
};

export type BalanceMovementRow = {
  request_id: string;
  request_number: string | null;
  status: string;
  start_date: string;
  end_date: string;
  days: number;
  balance_effect: string;
};

export type BalanceFigures = {
  opening_balance: number;
  entitlement: number;
  adjustment: number;
  used: number;
  pending: number;
  remaining: number;
};

export type BalanceHistory = {
  /** Current figures of the balance (fresher than the row the drawer was opened from). */
  balance: BalanceFigures;
  adjustments: AdjustmentRow[];
  movements: BalanceMovementRow[];
};

export type CalendarEvent = {
  id: string;
  request_id: string;
  start_date: string;
  end_date: string;
  days: number;
  /** `approved` (approved / in progress / completed) or `pending`. */
  state: 'approved' | 'pending';
  status: string;
  employee: { id: string; name_ar: string | null; name_en: string | null; employee_number: string | null };
  leave_type: LeaveTypeRef | null;
};

export type CalendarHoliday = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  start_date: string;
  end_date: string;
};

export type Option = { value: string; label: string };

/**
 * Shapes returned by `public.dashboard_stats()` (docs/DATABASE.md §7) and the M11 helper RPCs.
 * Every section is optional: the RPC only includes the sections the caller qualifies for.
 */

export type LeaveBalanceStat = {
  leave_type_id: string;
  code: string;
  name_ar: string | null;
  name_en: string | null;
  color: string | null;
  remaining: number;
  pending: number;
  used: number;
  available: number;
};

export type EmployeeStats = {
  open_requests: number;
  returned_requests: number;
  draft_requests: number;
  certificates: number;
  documents_expiring: number;
  upcoming_leave: number;
  unread_notifications: number;
  leave_balances: LeaveBalanceStat[];
};

export type ManagerStats = {
  direct_reports: number;
  pending_approvals: number;
  team_on_leave_today: number;
  team_upcoming_leave: number;
  team_open_requests: number;
};

export type ExpiryCounts = {
  expired: number;
  within7: number;
  within14: number;
  within30: number;
  within60: number;
  within90: number;
};

export const EXPIRY_KINDS = ['iqama', 'passport', 'contract', 'insurance', 'documents'] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

export type HrStats = {
  total_employees: number;
  employees_by_status: Record<string, number>;
  new_joiners_30d: number;
  pending_requests: number;
  pending_hr_review: number;
  pending_my_action: number;
  in_progress_requests: number;
  overdue_requests: number;
  due_soon_requests: number;
  on_leave_today: number;
  upcoming_leave_7d: number;
  certificates_issued_30d: number;
  pending_registrations: number;
  expiring: Record<ExpiryKind, ExpiryCounts>;
};

export type AdminStats = {
  users_total: number;
  users_by_status: Record<string, number>;
  roles: number;
  setup_completed: boolean | null;
  active_request_types: number;
  active_leave_types: number;
  departments: number;
  imports_last_30d: number;
  audit_events_24h: number | null;
};

export type DashboardStats = {
  scope?: 'none';
  employee?: EmployeeStats;
  manager?: ManagerStats;
  hr?: HrStats;
  admin?: AdminStats;
  generated_at?: string;
  /** Organization date (yyyy-MM-dd, Asia/Riyadh by default). */
  today?: string;
};

export type EmployeeBreakdown = {
  total: number;
  by_department: { id: string | null; name_ar: string | null; name_en: string | null; count: number }[];
  by_nationality: { nationality: string | null; count: number }[];
};

export type ExpiryItemKind = 'iqama' | 'passport' | 'contract' | 'insurance' | 'document';

export type ExpiryItem = {
  kind: ExpiryItemKind;
  entity_id: string;
  employee_id: string;
  employee_name_ar: string | null;
  employee_name_en: string | null;
  employee_number: string | null;
  document_type: string | null;
  expiry_date: string;
  days_left: number;
};

/** Compact request row used by the queue / recent lists. */
export type DashboardRequest = {
  id: string;
  request_number: string | null;
  status: string;
  title: string | null;
  priority: string;
  submitted_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  current_step_type: string | null;
  request_type: { key: string; name_ar: string | null; name_en: string | null; icon: string | null; color: string | null } | null;
  employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null; avatar_path: string | null } | null;
};

export type DashboardLeave = {
  id: string;
  request_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  leave_type: { code: string; name_ar: string | null; name_en: string | null; color: string | null } | null;
  employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null; avatar_path: string | null } | null;
};

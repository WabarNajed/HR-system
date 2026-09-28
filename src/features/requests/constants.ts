import { slaStatus, type SlaState } from '@/lib/dates';
import type { RequestStatus } from './types';

/** Status tabs of the Request Center (`?tab=`). `drafts` / `returned` are the requester's work queues. */
export const REQUEST_TABS = ['all', 'pending', 'in_progress', 'completed', 'rejected', 'returned', 'drafts'] as const;
export type RequestTab = (typeof REQUEST_TABS)[number];

export const TAB_STATUSES: Record<RequestTab, readonly RequestStatus[] | null> = {
  all: null,
  pending: ['submitted', 'pending_manager_approval', 'pending_hr_review'],
  in_progress: ['approved', 'in_progress'],
  completed: ['completed'],
  rejected: ['rejected'],
  returned: ['returned'],
  drafts: ['draft'],
};

export function parseRequestTab(value: string | string[] | undefined | null): RequestTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (REQUEST_TABS as readonly string[]).includes(v ?? '') ? (v as RequestTab) : 'all';
}

export const PENDING_STATUSES: readonly RequestStatus[] = ['submitted', 'pending_manager_approval', 'pending_hr_review'];
export const DECISION_STATUSES: readonly RequestStatus[] = ['pending_manager_approval', 'pending_hr_review'];
/** Open = someone still has to act (the SLA clock runs), excluding the requester's own queues. */
export const OPEN_STATUSES: readonly RequestStatus[] = ['submitted', 'pending_manager_approval', 'pending_hr_review', 'approved', 'in_progress'];
export const FINAL_STATUSES: readonly RequestStatus[] = ['rejected', 'completed', 'cancelled'];
/** Statuses offered in the status filter (drafts live in their own tab). */
export const FILTER_STATUSES: readonly RequestStatus[] = [
  'pending_manager_approval',
  'pending_hr_review',
  'returned',
  'approved',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
];

export const REQUEST_CATEGORIES = [
  'time_off',
  'documents',
  'government',
  'benefits',
  'payroll',
  'attendance',
  'personal_data',
  'travel',
  'separation',
  'general',
] as const;

export const SLA_STATES: readonly SlaState[] = ['on_track', 'due_soon', 'overdue'];

/**
 * Approvals queues (`/approvals?queue=`): `direct` = manager / named-user steps assigned to me
 * (`current_approver_id = me`, the dashboard's manager KPI), `hr` = the HR review queue,
 * `role` = role-step queues I belong to.
 */
export const APPROVAL_QUEUES = ['direct', 'hr', 'role'] as const;
export type ApprovalQueue = (typeof APPROVAL_QUEUES)[number];

/** Sortable columns (DataTable column ids = `?sort=` values). */
export const REQUEST_SORTS = ['created_at', 'request_number', 'due_at', 'status', 'updated_at', 'submitted_at'] as const;
export type RequestSort = (typeof REQUEST_SORTS)[number];

export const REQUEST_FILTER_KEYS = ['tab', 'type', 'employee', 'department', 'status', 'assigned', 'sla', 'createdFrom', 'createdTo'] as const;
export type RequestFilterKey = (typeof REQUEST_FILTER_KEYS)[number];

/**
 * SLA state shown for a request: drafts and returned requests have no running clock; final
 * requests keep the state they closed with (see `slaStatus`).
 */
export function requestSla(row: {
  status: string;
  due_at: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
}, now: Date = new Date()): SlaState | null {
  if (!row.due_at || row.status === 'draft' || row.status === 'returned' || row.status === 'cancelled') return null;
  const closedAt = row.status === 'completed' ? row.completed_at : row.status === 'rejected' ? row.updated_at : null;
  // "approved" is not final for the SLA: HR still has to fulfil the request.
  const finalForSla = row.status === 'completed' || row.status === 'rejected' ? row.status : null;
  return slaStatus(row.due_at, finalForSla, { closedAt: closedAt ?? null, now });
}

/** Whole calendar days until the due date (negative = overdue); null without a due date. */
export function daysUntilDue(dueAt: string | null, now: Date = new Date()): number | null {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return null;
  const diff = due - now.getTime();
  return diff >= 0 ? Math.floor(diff / 86_400_000) : -Math.ceil(-diff / 86_400_000);
}

/** Maximum upload size for request attachments (mirrors UPLOAD_LIMITS.attachment). */
export const ATTACHMENT_ACCEPT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx'];

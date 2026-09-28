/**
 * Notification events (docs/DATABASE.md §11) grouped for the settings matrix. `notification_settings`
 * rows are keyed by the same event keys; unknown keys fall into `other`.
 */
export const EVENT_GROUPS = [
  {
    key: 'requests',
    events: [
      'request_submitted',
      'approval_required',
      'request_approved',
      'request_rejected',
      'request_returned',
      'request_assigned',
      'request_in_progress',
      'request_completed',
      'request_cancelled',
      'request_comment',
    ],
  },
  { key: 'accounts', events: ['registration_submitted', 'registration_approved', 'registration_rejected', 'registration_info_requested', 'account_invited'] },
  { key: 'other', events: ['certificate_issued', 'leave_balance_adjusted', 'expiry_alert'] },
] as const;

export type EventGroupKey = (typeof EVENT_GROUPS)[number]['key'];

/** Email templates used by an event (mirrors `emailTemplateKeyFor` / claim_notification_emails). */
export function templateKeysFor(event: string): string[] {
  if (event === 'account_invited') return ['account_invitation'];
  if (event === 'expiry_alert') return ['iqama_expiry', 'passport_expiry', 'insurance_expiry', 'contract_expiry', 'document_expiry'];
  return [event];
}

export const RECIPIENT_KEYS = ['requester', 'employee', 'approver', 'assignee', 'participants', 'applicant', 'registration_reviewers', 'invitee', 'hr'] as const;

/**
 * Email template catalog helpers (isomorphic). Template keys come from `email_templates.key`
 * (docs/DATABASE.md §6); unknown keys fall into `other`.
 */
export const TEMPLATE_GROUPS = ['account', 'requests', 'expiry', 'other'] as const;
export type TemplateGroup = (typeof TEMPLATE_GROUPS)[number];

export function templateGroup(key: string): TemplateGroup {
  if (key.endsWith('_expiry')) return 'expiry';
  if (key.startsWith('request_') || key === 'approval_required') return 'requests';
  if (key.startsWith('registration_') || key === 'account_invitation' || key === 'password_reset') return 'account';
  return 'other';
}

/** Placeholders every template can use (plus the template's own list from `email_templates.placeholders`). */
export const COMMON_PLACEHOLDERS = ['recipient_name', 'company_name', 'portal_name', 'link'] as const;

/** Placeholders with a translated description (`emailTemplates.placeholders.<key>`). */
export const DESCRIBED_PLACEHOLDERS = [
  'recipient_name',
  'employee_name',
  'manager_name',
  'request_number',
  'request_type',
  'request_status',
  'company_name',
  'portal_name',
  'link',
  'comment',
  'reason',
  'note',
  'expiry_date',
  'days_left',
  'document_type',
  'email',
  'employee_number',
] as const;

export const EMAIL_LOG_STATUSES = ['sent', 'failed', 'skipped'] as const;
export const EMAIL_LOG_SORTS = ['created_at', 'recipient', 'status'] as const;
export const EMAIL_LOG_FILTER_KEYS = ['status', 'template', 'sentFrom', 'sentTo'] as const;

export const SUBJECT_MAX = 250;
export const BODY_MAX = 20000;

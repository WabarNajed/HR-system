/**
 * Notification types (CHECK constraint on `notifications.type`, ARCHITECTURE §6) grouped into the
 * categories offered by the /notifications type filter. Isomorphic.
 */

export const NOTIFICATION_TYPES = [
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
  'registration_submitted',
  'registration_approved',
  'registration_rejected',
  'registration_info_requested',
  'certificate_issued',
  'leave_balance_adjusted',
  'expiry_alert',
  'account_invited',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CATEGORIES = ['approvals', 'requests', 'registrations', 'certificates', 'leave', 'expiry', 'account'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_TYPES: Record<NotificationCategory, readonly NotificationType[]> = {
  approvals: ['approval_required', 'request_assigned'],
  requests: [
    'request_submitted',
    'request_approved',
    'request_rejected',
    'request_returned',
    'request_in_progress',
    'request_completed',
    'request_cancelled',
    'request_comment',
  ],
  registrations: ['registration_submitted', 'registration_approved', 'registration_rejected', 'registration_info_requested'],
  certificates: ['certificate_issued'],
  leave: ['leave_balance_adjusted'],
  expiry: ['expiry_alert'],
  account: ['account_invited'],
};

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function categoryOf(type: string): NotificationCategory | null {
  for (const c of NOTIFICATION_CATEGORIES) if ((CATEGORY_TYPES[c] as readonly string[]).includes(type)) return c;
  return null;
}

/** Only in-app paths are followed (`/requests/…`); protocol-relative or absolute URLs are ignored. */
export function safeNotificationLink(link: string | null | undefined): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.startsWith('/\\')) return null;
  return link;
}

/** Window event fired after read-state changes so the header bell refreshes its badge. */
export const NOTIFICATIONS_CHANGED_EVENT = 'hr:notifications-changed';

export function emitNotificationsChanged(detail?: { unread?: number }) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail }));
}

import {
  AlertTriangleIcon,
  AwardIcon,
  BanIcon,
  BellIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleCheckBigIcon,
  ClipboardCheckIcon,
  CornerUpLeftIcon,
  LoaderIcon,
  MailIcon,
  MessageSquareIcon,
  SendIcon,
  UserCheckIcon,
  UserPlusIcon,
  UserRoundSearchIcon,
  UserXIcon,
  XCircleIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * Notification record shape and per-type visuals (icon + tone). Isomorphic (server and client) —
 * text rendering lives in `notification-text.ts` (client hook).
 */

export type NotificationRecord = {
  id: string;
  type: string;
  params: Record<string, unknown> | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationTone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export const NOTIFICATION_VISUALS: Record<string, { icon: LucideIcon; tone: NotificationTone }> = {
  request_submitted: { icon: SendIcon, tone: 'info' },
  approval_required: { icon: ClipboardCheckIcon, tone: 'primary' },
  request_approved: { icon: CheckCircle2Icon, tone: 'success' },
  request_rejected: { icon: XCircleIcon, tone: 'danger' },
  request_returned: { icon: CornerUpLeftIcon, tone: 'warning' },
  request_assigned: { icon: UserRoundSearchIcon, tone: 'primary' },
  request_in_progress: { icon: LoaderIcon, tone: 'info' },
  request_completed: { icon: CircleCheckBigIcon, tone: 'success' },
  request_cancelled: { icon: BanIcon, tone: 'neutral' },
  request_comment: { icon: MessageSquareIcon, tone: 'info' },
  registration_submitted: { icon: UserPlusIcon, tone: 'primary' },
  registration_approved: { icon: UserCheckIcon, tone: 'success' },
  registration_rejected: { icon: UserXIcon, tone: 'danger' },
  registration_info_requested: { icon: UserRoundSearchIcon, tone: 'warning' },
  certificate_issued: { icon: AwardIcon, tone: 'success' },
  leave_balance_adjusted: { icon: CalendarClockIcon, tone: 'info' },
  expiry_alert: { icon: AlertTriangleIcon, tone: 'warning' },
  account_invited: { icon: MailIcon, tone: 'primary' },
};

export const DEFAULT_NOTIFICATION_VISUAL = { icon: BellIcon, tone: 'neutral' as NotificationTone };

export const NOTIFICATION_TONE_CLASS: Record<NotificationTone, string> = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
};

/** Visual (icon + tone) of a notification; expired expiry alerts use the danger tone. */
export function notificationVisual(n: Pick<NotificationRecord, 'type' | 'params'>): { icon: LucideIcon; tone: NotificationTone } {
  const base = NOTIFICATION_VISUALS[n.type] ?? DEFAULT_NOTIFICATION_VISUAL;
  if (n.type === 'expiry_alert') {
    const days = Number((n.params ?? {}).days_left);
    if (Number.isFinite(days) && days < 0) return { ...base, tone: 'danger' };
  }
  return base;
}


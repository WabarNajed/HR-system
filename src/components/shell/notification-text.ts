'use client';

import {
  AlertTriangleIcon,
  AwardIcon,
  BellIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
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
  BanIcon,
  CircleCheckBigIcon,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { formatDate } from '@/lib/i18n/date-format';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';

/**
 * Renders a notification row (`type` + `params`) into translated text using
 * `notifications.types.<type>.title/body` (ARCHITECTURE §6: text is rendered client-side).
 * Shared by the header bell and the /notifications page.
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

function s(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Returns `(n) => { title, body }` bound to the active locale. */
export function useNotificationText() {
  const locale = useLocale();
  const t = useTranslations('notifications');
  return useCallback(
    (n: Pick<NotificationRecord, 'type' | 'params'>): { title: string; body: string } => {
      const p = n.params ?? {};
      const tt = t as unknown as { has: (k: string) => boolean; (k: string, v?: Record<string, string>): string };
      const kind = s(p.kind ?? p.expiry_kind ?? p.document_kind);
      const values: Record<string, string> = {
        number: s(p.request_number),
        requestType:
          localized({ name_ar: s(p.request_type_name_ar), name_en: s(p.request_type_name_en) }, 'name', locale) ||
          tt('fallback.requestType'),
        employee:
          employeeDisplayName({ name_ar: s(p.employee_name_ar), name_en: s(p.employee_name_en) }, locale) ||
          s(p.employee_name) ||
          tt('fallback.employee'),
        actor: s(p.actor_name) || tt('fallback.actor'),
        comment: s(p.comment),
        name: s(p.full_name ?? p.name ?? p.email),
        certificateNumber: s(p.certificate_number),
        leaveType: localized({ name_ar: s(p.leave_type_name_ar), name_en: s(p.leave_type_name_en) }, 'name', locale),
        document: tt.has(`expiryKinds.${kind}`) ? tt(`expiryKinds.${kind}`) : tt('fallback.document'),
        date: typeof p.expiry_date === 'string' ? formatDate(p.expiry_date, locale) : s(p.date),
        days: s(p.days ?? p.days_remaining),
      };
      const base = `types.${n.type}`;
      if (!tt.has(`${base}.title`)) return { title: n.type, body: '' };
      return { title: tt(`${base}.title`, values), body: tt.has(`${base}.body`) ? tt(`${base}.body`, values) : '' };
    },
    [t, locale],
  );
}

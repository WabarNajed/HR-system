'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { formatDate } from '@/lib/i18n/date-format';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { NotificationRecord } from './notification-visuals';

export {
  DEFAULT_NOTIFICATION_VISUAL,
  NOTIFICATION_TONE_CLASS,
  NOTIFICATION_VISUALS,
  notificationVisual,
  type NotificationRecord,
  type NotificationTone,
} from './notification-visuals';

/**
 * Renders a notification row (`type` + `params`) into translated text using
 * `notifications.types.<type>.title/body` (ARCHITECTURE §6: text is rendered client-side).
 * Shared by the header bell, the /notifications page and the dashboard widget.
 * Params per type: docs/DATABASE.md §11.
 */

function s(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

type LooseT = { has: (k: string) => boolean; (k: string, v?: Record<string, string | number>): string };

export type NotificationText = {
  title: string;
  body: string;
  /** Approver/HR comment attached to rejections and returns (user text, shown as a quote). */
  comment: string | null;
};

/** Returns `(n) => { title, body, comment }` bound to the active locale. */
export function useNotificationText() {
  const locale = useLocale();
  const tRoot = useTranslations();
  return useCallback(
    (n: Pick<NotificationRecord, 'type' | 'params'>): NotificationText => {
      const t = tRoot as unknown as LooseT;
      const p = n.params ?? {};
      const kind = s(p.kind ?? p.expiry_kind ?? p.document_kind);
      const documentType = s(p.document_type);
      const certificateType = s(p.certificate_type);
      const daysLeft = Number(p.days_left ?? p.days ?? p.days_remaining);
      const amount = Number(p.amount);

      let documentLabel = t('notifications.fallback.document');
      if (kind === 'document' && documentType && t.has(`enums.documentType.${documentType}`)) {
        documentLabel = t(`enums.documentType.${documentType}`);
      } else if (t.has(`notifications.expiryKinds.${kind}`)) {
        documentLabel = t(`notifications.expiryKinds.${kind}`);
      }

      const values: Record<string, string | number> = {
        number: s(p.request_number) || t('notifications.fallback.number'),
        requestType:
          localized({ name_ar: s(p.request_type_name_ar), name_en: s(p.request_type_name_en) }, 'name', locale) ||
          t('notifications.fallback.requestType'),
        employee:
          employeeDisplayName({ name_ar: s(p.employee_name_ar), name_en: s(p.employee_name_en) }, locale) ||
          s(p.employee_name) ||
          t('notifications.fallback.employee'),
        employeeNumber: s(p.employee_number),
        actor: s(p.actor_name) || t('notifications.fallback.actor'),
        name: s(p.full_name ?? p.name ?? p.email) || t('notifications.fallback.applicant'),
        email: s(p.email),
        certificateNumber: s(p.certificate_number),
        certificateType:
          certificateType && t.has(`enums.certificateType.${certificateType}`)
            ? t(`enums.certificateType.${certificateType}`)
            : t('notifications.fallback.certificate'),
        leaveType:
          localized({ name_ar: s(p.leave_type_name_ar), name_en: s(p.leave_type_name_en) }, 'name', locale) ||
          t('notifications.fallback.leaveType'),
        year: s(p.year),
        amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
        direction: Number.isFinite(amount) && amount < 0 ? 'down' : 'up',
        newRemaining: s(p.new_remaining),
        document: documentLabel,
        date: typeof p.expiry_date === 'string' ? formatDate(p.expiry_date, locale) : s(p.date),
        days: Number.isFinite(daysLeft) ? Math.abs(daysLeft) : 0,
        state: !Number.isFinite(daysLeft) ? 'soon' : daysLeft < 0 ? 'expired' : daysLeft === 0 ? 'today' : 'soon',
        resubmitted: p.resubmitted === true ? 'yes' : 'no',
      };

      const base = `notifications.types.${n.type}`;
      const comment = (n.type === 'request_rejected' || n.type === 'request_returned') && s(p.comment).trim() ? s(p.comment).trim() : null;
      if (!t.has(`${base}.title`)) return { title: t('notifications.fallback.title'), body: '', comment: null };
      return {
        title: t(`${base}.title`, values),
        body: t.has(`${base}.body`) ? t(`${base}.body`, values) : '',
        comment,
      };
    },
    [tRoot, locale],
  );
}

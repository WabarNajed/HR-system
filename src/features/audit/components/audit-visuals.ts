import {
  ActivityIcon,
  CalendarDaysIcon,
  DatabaseIcon,
  FileBadgeIcon,
  FileTextIcon,
  KeyRoundIcon,
  Settings2Icon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { auditCategory, auditTone, type AuditCategory, type AuditTone } from '../labels';

/** Icon per audit category (dashboard feed, activity timeline, table). */
export const AUDIT_CATEGORY_ICONS: Record<AuditCategory, LucideIcon> = {
  access: KeyRoundIcon,
  employees: UsersIcon,
  requests: FileTextIcon,
  leave: CalendarDaysIcon,
  documents: FileBadgeIcon,
  configuration: Settings2Icon,
  data: DatabaseIcon,
};

export function auditIcon(action: string): LucideIcon {
  const category = auditCategory(action);
  return category ? AUDIT_CATEGORY_ICONS[category] : ActivityIcon;
}

export const AUDIT_TONE_CLASS: Record<AuditTone, string> = {
  primary: 'bg-primary-soft text-primary',
  secondary: 'bg-secondary-soft text-secondary-soft-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
};

export function auditToneClass(action: string): string {
  return AUDIT_TONE_CLASS[auditTone(action)];
}

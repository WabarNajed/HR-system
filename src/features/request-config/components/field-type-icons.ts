import {
  AlignLeftIcon,
  AtSignIcon,
  BanknoteIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ClockIcon,
  HashIcon,
  ListChecksIcon,
  ListIcon,
  PaperclipIcon,
  PhoneIcon,
  ToggleLeftIcon,
  TypeIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import type { RequestFieldType } from '../types';

export const FIELD_TYPE_ICONS: Record<RequestFieldType, LucideIcon> = {
  short_text: TypeIcon,
  long_text: AlignLeftIcon,
  number: HashIcon,
  currency: BanknoteIcon,
  date: CalendarIcon,
  datetime: CalendarClockIcon,
  time: ClockIcon,
  dropdown: ListIcon,
  multi_select: ListChecksIcon,
  yes_no: ToggleLeftIcon,
  attachment: PaperclipIcon,
  leave_type: CalendarRangeIcon,
  dependent: UsersIcon,
  employee: UserIcon,
  email: AtSignIcon,
  phone: PhoneIcon,
};

/** Order of the "Add field" palette (general types first, lookups last). */
export const PALETTE_GROUPS: { key: 'text' | 'choice' | 'time' | 'other'; types: RequestFieldType[] }[] = [
  { key: 'text', types: ['short_text', 'long_text', 'number', 'currency', 'email', 'phone'] },
  { key: 'choice', types: ['dropdown', 'multi_select', 'yes_no'] },
  { key: 'time', types: ['date', 'datetime', 'time'] },
  { key: 'other', types: ['attachment', 'employee', 'dependent', 'leave_type'] },
];

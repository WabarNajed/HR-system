import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { daysBetween, formatHijri, todayIso } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

/** Icon + text item for the profile header meta row. */
export function MetaItem({ icon: Icon, children, className }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon className="size-4 shrink-0 text-faint-foreground" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Whole years + remaining months of service from `start` to today (null when not started). */
export function serviceLength(start: string | null, today: string = todayIso()): { years: number; months: number } | null {
  if (!start) return null;
  if (start > today) return null;
  const [sy, sm, sd] = start.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  let months = (ty - sy) * 12 + (tm - sm);
  if (td < sd) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** Age in whole years (null without a date of birth). */
export function ageFrom(dob: string | null, today: string = todayIso()): number | null {
  if (!dob) return null;
  const s = serviceLength(dob, today);
  return s ? s.years : null;
}

export function daysLeft(date: string | null, today: string = todayIso()): number | null {
  return date ? daysBetween(today, date) : null;
}

/** Phone card: opens the edit sheet for editors, plain content for read-only viewers. */
export function MobileCardShell({ onOpen, children }: { onOpen?: () => void; children: ReactNode }) {
  return onOpen ? (
    <button type="button" className="w-full text-start" onClick={onOpen}>
      {children}
    </button>
  ) : (
    <div>{children}</div>
  );
}

/**
 * Hijri (Umm al-Qura) Iqama expiry: the imported Hijri text when one was recorded, otherwise derived
 * from the Gregorian expiry date (ARCHITECTURE §4 — Iqama expiry is always shown in Hijri as well).
 */
export function iqamaExpiryHijri(employee: { iqama_expiry_date: string | null; iqama_expiry_hijri: string | null }, locale: Locale): string | null {
  const stored = employee.iqama_expiry_hijri?.trim();
  if (stored) return stored;
  return employee.iqama_expiry_date ? formatHijri(employee.iqama_expiry_date, locale) || null : null;
}

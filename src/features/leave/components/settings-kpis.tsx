import { CalendarCheckIcon, CalendarDaysIcon, CircleOffIcon, PaperclipIcon, SunIcon, TagsIcon, WalletCardsIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatCard } from '@/components/shared/stat-card';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { formatDate } from '@/lib/dates';
import { resolveLocale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { formatInteger } from '@/lib/format';
import type { HolidayRow, LeaveTypeRow } from '../types';

export async function LeaveTypesKpis({ rows }: { rows: LeaveTypeRow[] }) {
  const t = await getTranslations('leave.types.kpis');
  const locale = resolveLocale(await getLocale());
  const n = (v: number) => formatInteger(v, locale);
  const active = rows.filter((r) => r.is_active);
  return (
    <KpiGrid count={4}>
      <StatCard label={t('total')} value={n(rows.length)} icon={TagsIcon} tone="primary" hint={t('totalHint', { count: active.length })} />
      <StatCard label={t('deducting')} value={n(active.filter((r) => r.deducts_balance).length)} icon={WalletCardsIcon} tone="info" hint={t('deductingHint')} />
      <StatCard label={t('attachment')} value={n(active.filter((r) => r.requires_attachment).length)} icon={PaperclipIcon} tone="secondary" hint={t('attachmentHint')} />
      <StatCard label={t('inactive')} value={n(rows.length - active.length)} icon={CircleOffIcon} tone="neutral" hint={t('inactiveHint')} />
    </KpiGrid>
  );
}

export async function HolidaysKpis({ rows, year, today }: { rows: HolidayRow[]; year: number; today: string }) {
  const t = await getTranslations('leave.holidays.kpis');
  const locale = resolveLocale(await getLocale());
  const n = (v: number) => formatInteger(v, locale);
  const active = rows.filter((r) => r.is_active);
  const next = active.filter((r) => r.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  return (
    <KpiGrid count={4}>
      <StatCard label={t('count', { year })} value={n(active.length)} icon={CalendarDaysIcon} tone="primary" hint={t('countHint')} />
      <StatCard label={t('days')} value={n(active.reduce((s, r) => s + r.days, 0))} icon={SunIcon} tone="secondary" hint={t('daysHint')} />
      <StatCard label={t('workingDays')} value={n(active.reduce((s, r) => s + r.working_days, 0))} icon={CalendarCheckIcon} tone="info" hint={t('workingDaysHint')} />
      <StatCard
        label={t('next')}
        value={next ? formatDate(next.start_date, locale, 'dayMonth') : '—'}
        icon={CalendarDaysIcon}
        tone="success"
        hint={next ? localized(next, 'name', locale) : t('nextNone')}
      />
    </KpiGrid>
  );
}

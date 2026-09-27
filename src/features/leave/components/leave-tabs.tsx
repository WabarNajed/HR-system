import { InfoIcon, UserRoundXIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionCard } from '@/components/shared/section-card';
import type { SessionContext } from '@/lib/auth/session';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { parseListParams, type SearchParamsInput } from '@/lib/list-params';
import { gridRange, parseMonthParam, weekStartDay } from '../calendar-utils';
import {
  BALANCE_FILTERS,
  BALANCE_SORTS,
  getBalanceYears,
  getCalendarData,
  getEmployeeBalances,
  getHolidayYears,
  listBalances,
  listDepartmentOptions,
  listHolidaysForYear,
  listLeaveRequests,
  listLeaveTypes,
  REQUEST_FILTERS,
  REQUEST_SORTS,
  resolveScope,
  type LeaveAccess,
  type LeaveOrgSettings,
} from '../queries';
import type { LeaveTypeRow } from '../types';
import { BalanceCards } from './balance-cards';
import { InitializeBalancesButton, NoBalancesState } from './balance-dialogs';
import { BalancesTable } from './balances-table';
import { HolidaysManager } from './holidays-manager';
import { LeaveCalendar } from './leave-calendar';
import { LeaveRequestsTable } from './leave-requests-table';
import { LeaveTypesManager } from './leave-types-manager';
import { UrlSegmented, UrlSelect } from './url-controls';

export type TabProps = {
  sp: Record<string, string | string[] | undefined>;
  ctx: SessionContext;
  access: LeaveAccess;
  settings: LeaveOrgSettings;
  locale: Locale;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function typeOptions(types: LeaveTypeRow[], locale: Locale) {
  return types.map((lt) => ({ value: lt.id, label: localized(lt, 'name', locale), color: lt.color }));
}

function parseYear(value: string | undefined, fallback: number): number {
  const y = Number(value);
  return Number.isInteger(y) && y >= 2000 && y <= 2200 ? y : fallback;
}

/* ─── Requests ───────────────────────────────────────────────────────────── */

export async function RequestsTab({ sp, access, locale }: TabProps) {
  const t = await getTranslations('leave');
  if (!access.employeeId && !access.orgView && !access.hasTeam) {
    return <NotLinkedState title={t('requests.notLinkedTitle')} description={t('requests.notLinkedDescription')} />;
  }
  const params = parseListParams(sp as SearchParamsInput, {
    allowedSorts: REQUEST_SORTS,
    defaultSort: 'start_date',
    defaultDir: 'desc',
    filterKeys: REQUEST_FILTERS,
  });
  const scope = resolveScope(first(sp.scope), access);
  const [{ rows, total }, types, departments] = await Promise.all([
    listLeaveRequests(params, access, locale),
    listLeaveTypes(),
    scope === 'org' ? listDepartmentOptions(locale) : Promise.resolve([]),
  ]);
  return (
    <LeaveRequestsTable
      rows={rows}
      total={total}
      typeOptions={typeOptions(types, locale)}
      departmentOptions={departments}
      scopes={access.scopes}
      defaultScope={access.defaultScope}
      scope={scope}
      canExport={access.canExport}
      canRequest={access.canRequest}
    />
  );
}

/* ─── Balances ───────────────────────────────────────────────────────────── */

export async function BalancesTab({ sp, ctx, access, settings, locale }: TabProps) {
  const t = await getTranslations('leave');
  const scope = resolveScope(first(sp.scope), access);
  const year = parseYear(first(sp.year), settings.year);
  const years = await getBalanceYears(settings.year);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);

  const controls = (
    <>
      <UrlSegmented
        param="scope"
        defaultValue={access.defaultScope}
        aria-label={t('scope.label')}
        options={access.scopes.map((s) => ({ value: s, label: t(`scope.${s}`) }))}
      />
      <UrlSelect param="year" defaultValue={String(settings.year)} label={t('fields.year')} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
    </>
  );

  if (scope === 'mine') {
    if (!access.employeeId) return <NotLinkedState title={t('requests.notLinkedTitle')} description={t('requests.notLinkedDescription')} />;
    const rows = await getEmployeeBalances(access.employeeId, year);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-meta text-muted-foreground">{t('balances.mineIntro', { year })}</p>
          <div className="flex flex-wrap items-center gap-2">{controls}</div>
        </div>
        {rows.length ? (
          <BalanceCards rows={rows} employeeName={ctx.employee ? { name_ar: ctx.employee.name_ar, name_en: ctx.employee.name_en } : null} />
        ) : (
          <NoBalancesState year={year} />
        )}
      </div>
    );
  }

  const params = parseListParams(sp as SearchParamsInput, {
    allowedSorts: BALANCE_SORTS,
    defaultSort: 'employee',
    defaultDir: 'asc',
    filterKeys: BALANCE_FILTERS,
  });
  const [{ rows, total }, types, departments] = await Promise.all([
    listBalances(params, access, scope, year, locale),
    listLeaveTypes(),
    scope === 'org' ? listDepartmentOptions(locale) : Promise.resolve([]),
  ]);
  const deducting = types.filter((lt) => lt.deducts_balance);
  const initialize = access.orgEdit && scope === 'org' ? <InitializeBalancesButton year={year} /> : null;
  return (
    <BalancesTable
      rows={rows}
      total={total}
      typeOptions={typeOptions(deducting.length ? deducting : types, locale).map(({ value, label }) => ({ value, label }))}
      departmentOptions={departments}
      canEdit={access.orgEdit}
      canExport={access.canExport}
      toolbar={
        <>
          {controls}
          {initialize}
        </>
      }
      emptyAction={access.orgEdit && scope === 'org' ? <InitializeBalancesButton year={year} variant="default" /> : undefined}
    />
  );
}

/* ─── Calendar ───────────────────────────────────────────────────────────── */

export async function CalendarTab({ sp, access, settings, locale }: TabProps) {
  const t = await getTranslations('leave');
  if (!access.employeeId && !access.orgView && !access.hasTeam) {
    return <NotLinkedState title={t('requests.notLinkedTitle')} description={t('requests.notLinkedDescription')} />;
  }
  const scope = resolveScope(first(sp.scope), access);
  const month = parseMonthParam(first(sp.month), settings.today);
  const weekStart = weekStartDay(settings.weekendDays);
  const range = gridRange(month, weekStart);
  const split = (v: string | undefined) => (v ? v.split(',').filter(Boolean) : undefined);
  const [data, types, departments] = await Promise.all([
    getCalendarData({ from: range.from, to: range.to }, scope, access, { type: split(first(sp.type)), department: split(first(sp.department)) }),
    listLeaveTypes(),
    scope === 'org' ? listDepartmentOptions(locale) : Promise.resolve([]),
  ]);
  const view = first(sp.view) === 'list' ? 'list' : 'month';
  return (
    <div className="flex flex-col gap-3">
      <LeaveCalendar
        month={month}
        view={view}
        events={data.events}
        holidays={data.holidays}
        weekendDays={settings.weekendDays}
        weekStart={weekStart}
        today={settings.today}
        scope={scope}
        scopes={access.scopes}
        defaultScope={access.defaultScope}
        typeOptions={typeOptions(types, locale)}
        departmentOptions={departments}
        truncated={data.truncated}
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <InfoIcon className="size-3.5 shrink-0" aria-hidden />
        {t('calendar.privacyNote')}
      </p>
    </div>
  );
}

/* ─── Leave types / Public holidays ──────────────────────────────────────── */

export async function TypesTab({ access }: TabProps) {
  const rows = await listLeaveTypes();
  return <LeaveTypesManager rows={rows} canEdit={access.canConfigure} />;
}

export async function HolidaysTab({ sp, access, settings }: TabProps) {
  const year = parseYear(first(sp.year), settings.year);
  const [rows, years] = await Promise.all([listHolidaysForYear(year, settings), getHolidayYears(settings.year)]);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);
  return (
    <HolidaysManager rows={rows} year={year} years={years} currentYear={settings.year} today={settings.today} canEdit={access.canConfigure} />
  );
}

/* ─── States ─────────────────────────────────────────────────────────────── */

function NotLinkedState({ title, description }: { title: string; description: string }) {
  return (
    <SectionCard>
      <EmptyState icon={UserRoundXIcon} tone="neutral" title={title} description={description} />
    </SectionCard>
  );
}

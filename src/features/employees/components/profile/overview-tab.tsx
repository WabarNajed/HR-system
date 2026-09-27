import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  FileTextIcon,
  IdCardIcon,
  NetworkIcon,
  PlaneIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { SectionCard } from '@/components/shared/section-card';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { formatDate, todayIso } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { fileRouteUrl } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { PortalAccessCard } from '@/features/users/components/portal-access-card';
import { getDirectReports, getInsurance, getLeaveSnapshot, getRecentRequests, type LeaveSnapshotRow } from '../../queries';
import type { EmployeeRecord, ManagerCard } from '../../types';
import { ExpiryBadge } from '../expiry-badge';
import { daysLeft, serviceLength } from './profile-parts';

export type OverviewCaps = {
  compliance: boolean;
  insurance: boolean;
  leave: boolean;
  requests: boolean;
  reports: boolean;
  portal: boolean;
  /** Viewer may open other employees' profiles (directory access). */
  linkEmployees: boolean;
};

const _employeesTranslator = () => getTranslations('employees');
type T = Awaited<ReturnType<typeof _employeesTranslator>>;

function ServiceText({ start, t, locale }: { start: string | null; t: T; locale: Locale }) {
  if (!start) return null;
  const today = todayIso();
  if (start > today) return <>{t('profile.service.notStarted', { date: formatDate(start, locale) })}</>;
  const s = serviceLength(start, today);
  if (!s) return null;
  const parts = [
    s.years > 0 ? t('profile.service.years', { count: s.years }) : null,
    s.months > 0 ? t('profile.service.months', { count: s.months }) : null,
  ].filter(Boolean);
  return <>{parts.length ? parts.join(locale === 'ar' ? ' و' : ', ') : t('profile.service.lessThanMonth')}</>;
}

export async function OverviewTab({
  employee,
  manager,
  locale,
  caps,
}: {
  employee: EmployeeRecord;
  manager: ManagerCard | null;
  locale: Locale;
  caps: OverviewCaps;
}) {
  const t = await getTranslations('employees');
  const year = Number(todayIso().slice(0, 4));
  const [leave, requests, reports, insurance] = await Promise.all([
    caps.leave ? getLeaveSnapshot(employee.id, year) : Promise.resolve([]),
    caps.requests ? getRecentRequests(employee.id) : Promise.resolve([]),
    caps.reports ? getDirectReports(employee.id) : Promise.resolve({ rows: [], total: 0 }),
    caps.compliance && caps.insurance ? getInsurance(employee.id) : Promise.resolve([]),
  ]);
  const d = (v: string | null) => (v ? formatDate(v, locale) : null);
  const named = (r: { name_ar: string | null; name_en: string | null } | null) => (r ? localized(r, 'name', locale) : null);
  const te = await getTranslations('enums');
  const tt = te as unknown as { has: (k: string) => boolean; (k: string): string };
  const typeLabel =
    employee.employment_type && tt.has(`employmentType.${employee.employment_type}`) ? tt(`employmentType.${employee.employment_type}`) : null;
  const ownPolicy = insurance
    .filter((p) => !p.dependent_id && p.status !== 'cancelled')
    .sort((a, b) => (b.expiry_date ?? '').localeCompare(a.expiry_date ?? ''))[0];

  const main = (
    <>
      <SectionCard title={t('profile.overview.snapshot')} icon={<CalendarDaysIcon />}>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t('fields.jobTitle'), value: named(employee.job_title) },
            { label: t('fields.department'), value: named(employee.department) },
            { label: t('fields.employmentType'), value: typeLabel },
            {
              label: t('fields.joiningDate'),
              value: d(employee.joining_date),
              hint: employee.joining_date ? <ServiceText start={employee.joining_date} t={t} locale={locale} /> : undefined,
            },
            { label: t('fields.probationEndDate'), value: d(employee.probation_end_date) },
            { label: t('fields.location'), value: named(employee.location) },
          ]}
        />
      </SectionCard>

      {caps.leave ? (
        <SectionCard
          title={t('profile.overview.leave', { year })}
          icon={<PlaneIcon />}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="?tab=leave" scroll={false}>
                {t('profile.overview.viewAll')}
              </Link>
            </Button>
          }
        >
          {leave.length ? <LeaveBars rows={leave} locale={locale} t={t} /> : <p className="py-2 text-meta text-muted-foreground">{t('profile.overview.leaveEmpty', { year })}</p>}
        </SectionCard>
      ) : null}

      {caps.requests ? (
        <SectionCard
          title={t('profile.overview.recentRequests')}
          icon={<FileTextIcon />}
          flush
          actions={
            requests.length ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="?tab=requests" scroll={false}>
                  {t('profile.overview.viewAll')}
                </Link>
              </Button>
            ) : null
          }
        >
          {requests.length ? (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/requests/${r.id}`}
                    className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {r.request_type ? localized(r.request_type, 'name', locale) : r.title || t('profile.overview.untitledRequest')}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {r.request_number ? (
                          <bdi dir="ltr" className="tabular-nums">
                            {r.request_number}
                          </bdi>
                        ) : null}
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">{formatDate(r.submitted_at ?? r.created_at, locale)}</span>
                      </div>
                    </div>
                    <StatusBadge domain="request" status={r.status} size="sm" />
                    <ArrowUpRightIcon className="size-4 shrink-0 text-faint-foreground transition-colors group-hover:text-foreground rtl:-scale-x-100" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-meta text-muted-foreground">{t('profile.overview.requestsEmpty')}</p>
          )}
        </SectionCard>
      ) : null}
      {caps.portal ? (
        <div id="portal-access" className="scroll-mt-20">
          <PortalAccessCard
            employeeId={employee.id}
            employeeEmail={employee.company_email ?? employee.personal_email}
            employeeName={employeeDisplayName(employee, locale)}
          />
        </div>
      ) : null}
    </>
  );

  const today = todayIso();
  const side = (
    <>
      {caps.compliance ? (
        <SectionCard title={t('profile.overview.compliance')} description={t('profile.overview.complianceDescription')} icon={<ShieldCheckIcon />} flush>
          <ul className="divide-y divide-border">
            <ComplianceRow icon={IdCardIcon} label={t('profile.overview.iqama')} date={employee.iqama_expiry_date} hint={employee.iqama_expiry_hijri} locale={locale} t={t} today={today} />
            <ComplianceRow icon={PlaneIcon} label={t('profile.overview.passport')} date={employee.passport_expiry_date} locale={locale} t={t} today={today} />
            <ComplianceRow icon={CalendarClockIcon} label={t('profile.overview.contract')} date={employee.contract_end_date} locale={locale} t={t} today={today} />
            {caps.insurance ? (
              <ComplianceRow icon={ShieldCheckIcon} label={t('profile.overview.insurance')} date={ownPolicy?.expiry_date ?? null} locale={locale} t={t} today={today} />
            ) : null}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title={t('profile.overview.reportingLine')} icon={<NetworkIcon />}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t('fields.manager')}</p>
            {manager ? (
              <EmployeeCell
                employee={{
                  id: manager.id,
                  name_ar: manager.name_ar,
                  name_en: manager.name_en,
                  avatarUrl: manager.avatar_path ? fileRouteUrl('employee-documents', manager.avatar_path) : null,
                }}
                subtitle={localized({ name_ar: manager.job_title_ar, name_en: manager.job_title_en }, 'name', locale) || manager.employee_number}
                href={caps.linkEmployees ? `/employees/${manager.id}` : undefined}
              />
            ) : (
              <p className="text-meta text-faint-foreground">{t('profile.overview.noManager')}</p>
            )}
          </div>
          {caps.reports ? (
            <div>
              <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>{t('profile.overview.directReports')}</span>
                {reports.total ? <span className="tabular-nums">{reports.total}</span> : null}
              </p>
              {reports.rows.length ? (
                <ul className="flex flex-col gap-2.5">
                  {reports.rows.map((r) => (
                    <li key={r.id}>
                      <EmployeeCell
                        employee={{ id: r.id, name_ar: r.name_ar, name_en: r.name_en, avatarUrl: r.avatar_path ? fileRouteUrl('employee-documents', r.avatar_path) : null }}
                        subtitle={named(r.job_title) || r.employee_number}
                        href={caps.linkEmployees ? `/employees/${r.id}` : undefined}
                        size="sm"
                      />
                    </li>
                  ))}
                  {reports.total > reports.rows.length ? (
                    <li>
                      <Link href={`/employees?manager=${employee.id}`} className="text-meta font-medium text-primary hover:underline">
                        {t('profile.overview.moreReports', { count: reports.total - reports.rows.length })}
                      </Link>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="text-meta text-faint-foreground">{t('profile.overview.noReports')}</p>
              )}
            </div>
          ) : null}
        </div>
      </SectionCard>

    </>
  );

  return <SplitLayout main={main} side={side} />;
}

function ComplianceRow({
  icon: Icon,
  label,
  date,
  hint,
  locale,
  t,
  today,
}: {
  icon: LucideIcon;
  label: string;
  date: string | null;
  hint?: string | null;
  locale: Locale;
  t: T;
  today: string;
}) {
  const left = daysLeft(date, today);
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
          left === null ? 'bg-muted text-faint-foreground' : left < 0 ? 'bg-danger-soft text-danger' : left <= 30 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <ExpiryBadge date={date} today={today} />
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {date ? (
            <>
              <span className="tabular-nums">{formatDate(date, locale)}</span>
              {left !== null ? (
                <>
                  {' · '}
                  {left < 0 ? t('profile.overview.expiredAgo', { count: -left }) : t('profile.overview.expiresIn', { count: left })}
                </>
              ) : null}
              {hint ? <span className="mt-0.5 block">{t('profile.personal.hijri', { date: hint })}</span> : null}
            </>
          ) : (
            t('profile.overview.notRecorded')
          )}
        </div>
      </div>
    </li>
  );
}

function LeaveBars({ rows, locale, t }: { rows: LeaveSnapshotRow[]; locale: Locale; t: T }) {
  const nf = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { maximumFractionDigits: 1 });
  return (
    <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {rows.map((r) => {
        const total = Number(r.opening_balance) + Number(r.entitlement) + Number(r.adjustment);
        const used = Number(r.used);
        const pending = Number(r.pending);
        const available = Math.max(0, Number(r.remaining ?? total - used) - pending);
        const usedPct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
        const pendingPct = total > 0 ? Math.min(100 - usedPct, (pending / total) * 100) : 0;
        const color = r.leave_type?.color || 'var(--primary)';
        return (
          <li key={r.id} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                <span className="truncate">{r.leave_type ? localized(r.leave_type, 'name', locale) : '—'}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{t('profile.overview.available', { count: nf.format(available) })}</span>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full" style={{ width: `${usedPct}%`, backgroundColor: color }} />
              <div className="h-full opacity-40" style={{ width: `${pendingPct}%`, backgroundColor: color }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">{t('profile.overview.usedOf', { used: nf.format(used), total: nf.format(total) })}</span>
              {pending > 0 ? <span className="tabular-nums">{t('profile.overview.pending', { count: nf.format(pending) })}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

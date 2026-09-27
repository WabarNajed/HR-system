import { BriefcaseIcon, CalendarRangeIcon, DatabaseIcon, FileClockIcon } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { SectionCard } from '@/components/shared/section-card';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatDateTime, todayIso } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { EmployeeRecord, ManagerCard } from '../../types';
import { ExpiryBadge } from '../expiry-badge';

export async function EmploymentTab({
  employee,
  manager,
  locale,
  showImported,
  linkEmployees,
}: {
  employee: EmployeeRecord;
  manager: ManagerCard | null;
  locale: Locale;
  showImported: boolean;
  linkEmployees: boolean;
}) {
  const t = await getTranslations('employees');
  const te = await getTranslations('enums');
  const tt = te as unknown as { has: (k: string) => boolean; (k: string): string };
  const d = (v: string | null) => (v ? formatDate(v, locale) : null);
  const named = (r: { name_ar: string | null; name_en: string | null } | null) => (r ? localized(r, 'name', locale) || null : null);
  const today = todayIso();
  const managerName = manager ? employeeDisplayName(manager, locale) : null;
  const extra = showImported && employee.extra_data ? Object.entries(employee.extra_data).filter(([, v]) => v !== null && v !== '') : [];

  const main = (
    <>
      <SectionCard title={t('profile.employment.position')} icon={<BriefcaseIcon />}>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t('fields.jobTitle'), value: named(employee.job_title) },
            { label: t('fields.grade'), value: employee.grade },
            {
              label: t('fields.manager'),
              value:
                manager && managerName ? (
                  linkEmployees ? (
                    <Link href={`/employees/${manager.id}`} className="font-medium text-primary hover:underline hover:underline-offset-4">
                      {managerName}
                    </Link>
                  ) : (
                    managerName
                  )
                ) : null,
            },
            { label: t('fields.department'), value: named(employee.department) },
            { label: t('fields.division'), value: employee.division },
            { label: t('fields.section'), value: employee.section },
            {
              label: t('fields.location'),
              value: named(employee.location),
              hint: employee.location?.city && employee.location.city !== named(employee.location) ? employee.location.city : undefined,
            },
            { label: t('fields.costCenter'), value: named(employee.cost_center) },
            {
              label: t('fields.employmentType'),
              value: employee.employment_type && tt.has(`employmentType.${employee.employment_type}`) ? tt(`employmentType.${employee.employment_type}`) : null,
            },
          ]}
        />
      </SectionCard>

      <SectionCard title={t('profile.employment.dates')} icon={<CalendarRangeIcon />}>
        <KeyValueGrid
          columns={3}
          items={[
            { label: t('fields.employmentStatus'), value: <StatusBadge domain="employment" status={employee.employment_status} /> },
            { label: t('fields.joiningDate'), value: d(employee.joining_date) },
            { label: t('fields.probationEndDate'), value: d(employee.probation_end_date) },
            { label: t('fields.contractStartDate'), value: d(employee.contract_start_date) },
            {
              label: t('fields.contractEndDate'),
              value: employee.contract_end_date ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  {d(employee.contract_end_date)}
                  <ExpiryBadge date={employee.contract_end_date} today={today} hideValid />
                </span>
              ) : null,
            },
            { label: t('fields.terminationDate'), value: d(employee.termination_date) },
          ]}
        />
      </SectionCard>
    </>
  );

  const side = (
    <>
      <SectionCard title={t('profile.employment.record')} icon={<FileClockIcon />} dense>
        <KeyValueGrid
          columns={1}
          items={[
            { label: t('fields.employeeNumber'), value: employee.employee_number, ltr: true },
            { label: t('fields.createdAt'), value: formatDateTime(employee.created_at, locale) },
            { label: t('fields.updatedAt'), value: formatDateTime(employee.updated_at, locale) },
            { label: t('fields.archivedAt'), value: employee.archived_at ? formatDateTime(employee.archived_at, locale) : null, hidden: !employee.archived_at },
          ]}
        />
      </SectionCard>
      {extra.length ? (
        <SectionCard title={t('profile.employment.imported')} description={t('profile.employment.importedDescription')} icon={<DatabaseIcon />} dense>
          <dl className="grid gap-3">
            {extra.map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{key}</dt>
                <dd className="mt-0.5 text-sm break-words text-foreground">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      ) : null}
    </>
  );

  return <SplitLayout main={main} side={side} sideWidth="sm" />;
}

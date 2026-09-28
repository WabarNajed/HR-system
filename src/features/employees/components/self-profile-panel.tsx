import {
  ArrowUpRightIcon,
  BriefcaseIcon,
  FilePenLineIcon,
  HeartHandshakeIcon,
  IdCardIcon,
  LandmarkIcon,
  PhoneCallIcon,
  UserRoundXIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/auth/session';
import { formatDate, todayIso } from '@/lib/dates';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { getBankAccount, getDependents, getEmployeeRecord, getManagerCard, getViewer } from '../queries';
import type { RELATIONSHIPS } from '../types';
import { ExpiryBadge } from './expiry-badge';
import { IbanReveal } from './profile/iban-reveal';
import { nationalityKey } from '../nationality';
import { iqamaExpiryHijri, serviceLength } from './profile/profile-parts';

/**
 * The signed-in employee's own information (cross-module contract — owned by the employees module,
 * rendered by `/profile`). Read-only; corrections go through an `employee_info_update` request.
 */
export async function SelfProfilePanel({ employeeId }: { employeeId: string | null }) {
  const t = await getTranslations('employees');
  const ctx = await getSessionContext();

  if (!employeeId || !ctx) {
    return (
      <EmptyState
        variant="card"
        icon={UserRoundXIcon}
        tone="neutral"
        title={t('self.noEmployeeTitle')}
        description={t('self.noEmployeeDescription')}
      />
    );
  }

  const viewer = await getViewer(ctx);
  // Contract: the signed-in user's OWN record only (it shows bank/dependents without HR framing).
  const loaded = viewer.employeeId === employeeId ? await getEmployeeRecord(employeeId, viewer) : null;
  if (!loaded) {
    return (
      <EmptyState
        variant="card"
        icon={UserRoundXIcon}
        tone="neutral"
        title={t('self.noEmployeeTitle')}
        description={t('self.noEmployeeDescription')}
      />
    );
  }

  const { employee } = loaded;
  const locale = ctx.locale;
  const te = await getTranslations('enums');
  const tt = te as unknown as { has: (k: string) => boolean; (k: string): string };
  const [manager, bank, dependents] = await Promise.all([
    employee.manager_id ? getManagerCard(employeeId) : Promise.resolve(null),
    getBankAccount(employeeId),
    getDependents(employeeId),
  ]);

  const today = todayIso();
  const d = (v: string | null) => (v ? formatDate(v, locale) : null);
  const named = (r: { name_ar: string | null; name_en: string | null } | null) => (r ? localized(r, 'name', locale) || null : null);
  const en = (group: string, v: string | null) => (v && tt.has(`${group}.${v}`) ? tt(`${group}.${v}`) : v);
  const withBadge = (date: string | null) =>
    date ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="tabular-nums">{d(date)}</span>
        <ExpiryBadge date={date} today={today} />
      </span>
    ) : null;
  const nationalityCode = nationalityKey(employee.nationality);
  const nationality = nationalityCode ? t(`nationalityValues.${nationalityCode}`) : employee.nationality;
  const iqamaHijri = iqamaExpiryHijri(employee, locale);
  const service = serviceLength(employee.joining_date, today);
  const serviceText = service
    ? [
        service.years ? t('profile.service.years', { count: service.years }) : null,
        service.months ? t('profile.service.months', { count: service.months }) : null,
      ]
        .filter(Boolean)
        .join(locale === 'ar' ? ' و' : ', ') || t('profile.service.lessThanMonth')
    : undefined;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-card-title text-foreground">{t('self.title')}</h2>
          <p className="mt-0.5 text-meta text-muted-foreground">{t('self.requestUpdateHint')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/employees/${employeeId}`}>
              <ArrowUpRightIcon className="rtl:-scale-x-100" />
              {t('self.openProfile')}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/requests/new?type=employee_info_update">
              <FilePenLineIcon />
              {t('self.requestUpdate')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:gap-5 xl:grid-cols-2">
        <SectionCard title={t('self.employment')} icon={<BriefcaseIcon />}>
          <KeyValueGrid
            columns={2}
            className="max-sm:grid-cols-2"
            items={[
              { label: t('fields.employeeNumber'), value: employee.employee_number, ltr: true },
              { label: t('fields.employmentStatus'), value: <StatusBadge domain="employment" status={employee.employment_status} /> },
              { label: t('fields.jobTitle'), value: named(employee.job_title) },
              { label: t('fields.department'), value: named(employee.department) },
              { label: t('fields.manager'), value: manager ? employeeDisplayName(manager, locale) : null },
              { label: t('fields.location'), value: named(employee.location) },
              { label: t('fields.joiningDate'), value: d(employee.joining_date), hint: serviceText },
              { label: t('fields.employmentType'), value: en('employmentType', employee.employment_type) },
              { label: t('fields.contractEndDate'), value: withBadge(employee.contract_end_date) },
              { label: t('fields.probationEndDate'), value: d(employee.probation_end_date) },
            ]}
          />
        </SectionCard>

        <SectionCard title={t('self.identity')} icon={<IdCardIcon />}>
          <KeyValueGrid
            columns={2}
            className="max-sm:grid-cols-2"
            items={[
              { label: t('fields.nameAr'), value: employee.name_ar },
              { label: t('fields.nameEn'), value: employee.name_en },
              { label: t('fields.nationalId'), value: employee.national_id, ltr: true },
              { label: t('fields.nationality'), value: nationality },
              {
                label: t('fields.iqamaExpiryDate'),
                value: withBadge(employee.iqama_expiry_date),
                hint: iqamaHijri ? t('profile.personal.hijri', { date: iqamaHijri }) : undefined,
              },
              { label: t('fields.passportNumber'), value: employee.passport_number, ltr: true },
              { label: t('fields.passportExpiryDate'), value: withBadge(employee.passport_expiry_date) },
              { label: t('fields.dateOfBirth'), value: d(employee.date_of_birth) },
              { label: t('fields.companyEmail'), value: employee.company_email, ltr: true },
              { label: t('fields.mobile'), value: employee.mobile, ltr: true },
            ]}
          />
        </SectionCard>

        <SectionCard title={t('self.emergency')} icon={<PhoneCallIcon />} dense>
          {employee.emergency_contact_name || employee.emergency_contact_relationship || employee.emergency_contact_mobile ? (
            <KeyValueGrid
              columns={3}
              className="max-sm:grid-cols-2"
              items={[
                { label: t('fields.emergencyName'), value: employee.emergency_contact_name },
                { label: t('fields.emergencyRelationship'), value: employee.emergency_contact_relationship },
                { label: t('fields.emergencyMobile'), value: employee.emergency_contact_mobile, ltr: true },
              ]}
            />
          ) : (
            <p className="py-1 text-meta text-faint-foreground">{t('profile.overview.notRecorded')}</p>
          )}
        </SectionCard>

        <SectionCard title={t('self.bank')} icon={<LandmarkIcon />} dense>
          {bank ? (
            <KeyValueGrid
              columns={3}
              items={[
                { label: t('fields.bankName'), value: bank.bank_name },
                {
                  label: t('fields.iban'),
                  value: bank.iban_masked ? <IbanReveal employeeId={employeeId} masked={bank.iban_masked} audited={false} /> : null,
                  span: 2,
                },
              ]}
            />
          ) : (
            <p className="py-1 text-meta text-faint-foreground">{t('profile.personal.bankEmpty')}</p>
          )}
        </SectionCard>

        <SectionCard
          title={t('self.dependents')}
          icon={<HeartHandshakeIcon />}
          dense
          actions={dependents.length ? <span className="text-meta text-muted-foreground">{t('dependents.summary', { count: dependents.length })}</span> : null}
          className="xl:col-span-2"
        >
          {dependents.length ? (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {dependents.map((dep) => (
                <li key={dep.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{employeeDisplayName(dep, locale)}</div>
                    <div className="text-xs text-muted-foreground">
                      {te(`relationship.${dep.relationship as (typeof RELATIONSHIPS)[number]}`)}
                      {dep.date_of_birth ? ` · ${formatDate(dep.date_of_birth, locale)}` : ''}
                    </div>
                  </div>
                  {dep.insurance_status ? (
                    <Badge variant={dep.insurance_status === 'insured' ? 'success' : dep.insurance_status === 'pending' ? 'warning' : 'neutral'} size="sm" dot>
                      {en('insuranceStatus', dep.insurance_status)}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-meta text-faint-foreground">{t('dependents.emptyTitle')}</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

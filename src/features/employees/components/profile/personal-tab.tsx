import { IdCardIcon, LandmarkIcon, PhoneCallIcon, UserRoundIcon, WalletIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { SectionCard } from '@/components/shared/section-card';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { formatDate, todayIso } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { getBankAccount, getCompensation } from '../../queries';
import type { EmployeeRecord } from '../../types';
import { ExpiryBadge } from '../expiry-badge';
import { IbanReveal } from './iban-reveal';
import { nationalityKey } from '../../nationality';
import { ageFrom, iqamaExpiryHijri } from './profile-parts';

export async function PersonalTab({
  employee,
  locale,
  caps,
  currency,
}: {
  employee: EmployeeRecord;
  locale: Locale;
  caps: { personal: boolean; bank: boolean; auditedReveal: boolean };
  currency: string;
}) {
  const t = await getTranslations('employees');
  const te = await getTranslations('enums');
  const tt = te as unknown as { has: (k: string) => boolean; (k: string): string };
  const [compensation, bank] = await Promise.all([
    caps.bank ? getCompensation(employee.id) : Promise.resolve(null),
    caps.bank ? getBankAccount(employee.id) : Promise.resolve(null),
  ]);
  const today = todayIso();
  const d = (v: string | null) => (v ? formatDate(v, locale) : null);
  const nationalityCode = nationalityKey(employee.nationality);
  const nationality = nationalityCode ? t(`nationalityValues.${nationalityCode}`) : employee.nationality;
  const iqamaHijri = iqamaExpiryHijri(employee, locale);
  const en = (group: string, v: string | null) => (v && tt.has(`${group}.${v}`) ? tt(`${group}.${v}`) : v);
  const withBadge = (date: string | null) =>
    date ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="tabular-nums">{d(date)}</span>
        <ExpiryBadge date={date} today={today} />
      </span>
    ) : null;
  const age = ageFrom(employee.date_of_birth, today);
  const money = (v: number | null | undefined) => (v === null || v === undefined ? null : formatCurrency(v, locale, compensation?.currency || currency));

  const main = caps.personal ? (
    <>
      <SectionCard title={t('profile.personal.info')} icon={<UserRoundIcon />}>
        <KeyValueGrid
          columns={3}
          className="max-sm:grid-cols-2"
          items={[
            { label: t('fields.gender'), value: en('gender', employee.gender) },
            { label: t('fields.nationality'), value: nationality },
            {
              label: t('fields.dateOfBirth'),
              value: d(employee.date_of_birth),
              hint: age !== null ? t('fields.age', { count: age }) : undefined,
            },
            { label: t('fields.maritalStatus'), value: en('maritalStatus', employee.marital_status) },
            { label: t('fields.personalEmail'), value: employee.personal_email, ltr: true },
            { label: t('fields.companyEmail'), value: employee.company_email, ltr: true },
            { label: t('fields.mobile'), value: employee.mobile, ltr: true },
            { label: t('fields.altMobile'), value: employee.alt_mobile, ltr: true },
            { label: t('fields.address'), value: employee.address, span: 'full' },
          ]}
        />
      </SectionCard>

      <SectionCard title={t('profile.personal.governmentIds')} icon={<IdCardIcon />}>
        <KeyValueGrid
          columns={3}
          className="max-sm:grid-cols-2"
          items={[
            { label: t('fields.idType'), value: en('idType', employee.id_type) },
            { label: t('fields.nationalId'), value: employee.national_id, ltr: true },
            { label: t('fields.iqamaProfession'), value: employee.iqama_profession },
            { label: t('fields.iqamaIssueDate'), value: d(employee.iqama_issue_date) },
            {
              label: t('fields.iqamaExpiryDate'),
              value: withBadge(employee.iqama_expiry_date),
              hint: iqamaHijri ? t('profile.personal.hijri', { date: iqamaHijri }) : undefined,
            },
            {
              label: t('fields.outsideKingdom'),
              value:
                employee.is_outside_kingdom === null ? null : te(employee.is_outside_kingdom ? 'outsideKingdom.outside' : 'outsideKingdom.inside'),
            },
            { label: t('fields.passportNumber'), value: employee.passport_number, ltr: true },
            { label: t('fields.passportExpiryDate'), value: withBadge(employee.passport_expiry_date) },
            { label: t('fields.employerNumber'), value: employee.employer_number, ltr: true },
          ]}
        />
      </SectionCard>

      <SectionCard title={t('profile.personal.emergency')} icon={<PhoneCallIcon />}>
        <KeyValueGrid
          columns={3}
          className="max-sm:grid-cols-2"
          items={[
            { label: t('fields.emergencyName'), value: employee.emergency_contact_name },
            { label: t('fields.emergencyRelationship'), value: employee.emergency_contact_relationship },
            { label: t('fields.emergencyMobile'), value: employee.emergency_contact_mobile, ltr: true },
          ]}
        />
      </SectionCard>
    </>
  ) : null;

  const side = caps.bank ? (
    <>
      <SectionCard title={t('profile.personal.compensation')} icon={<WalletIcon />} dense>
        {compensation ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-subtle px-3.5 py-3">
              <div className="text-xs font-medium text-muted-foreground">{t('fields.totalSalary')}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold text-foreground tabular-nums">{money(compensation.total_salary)}</span>
                <span className="text-xs text-muted-foreground">{t('profile.personal.perMonth')}</span>
              </div>
              {compensation.effective_date ? (
                <div className="mt-1 text-xs text-muted-foreground">{t('profile.personal.effective', { date: formatDate(compensation.effective_date, locale) })}</div>
              ) : null}
            </div>
            <dl className="divide-y divide-border text-sm">
              {(
                [
                  ['basicSalary', compensation.basic_salary],
                  ['housingAllowance', compensation.housing_allowance],
                  ['transportAllowance', compensation.transport_allowance],
                  ['otherAllowance', compensation.other_allowance],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-muted-foreground">{t(`fields.${key}`)}</dt>
                  <dd className="font-medium text-foreground tabular-nums">{money(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="py-1 text-meta text-faint-foreground">{t('profile.personal.compensationEmpty')}</p>
        )}
      </SectionCard>

      <SectionCard title={t('profile.personal.bank')} icon={<LandmarkIcon />} dense>
        {bank ? (
          <KeyValueGrid
            columns={1}
            items={[
              { label: t('fields.bankName'), value: bank.bank_name },
              {
                label: t('fields.iban'),
                value: bank.iban_masked ? <IbanReveal employeeId={employee.id} masked={bank.iban_masked} audited={caps.auditedReveal} /> : null,
              },
              { label: t('fields.accountHolder'), value: bank.account_holder },
            ]}
          />
        ) : (
          <p className="py-1 text-meta text-faint-foreground">{t('profile.personal.bankEmpty')}</p>
        )}
      </SectionCard>
    </>
  ) : null;

  if (main && side) return <SplitLayout main={main} side={side} />;
  return <div className="flex flex-col gap-4 lg:gap-5">{main ?? side}</div>;
}

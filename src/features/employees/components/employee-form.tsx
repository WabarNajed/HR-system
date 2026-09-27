'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  BriefcaseIcon,
  CircleAlertIcon,
  IdCardIcon,
  LandmarkIcon,
  LockIcon,
  PhoneCallIcon,
  UserRoundIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useForm, useFormContext, useWatch, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import { Combobox } from '@/components/shared/combobox';
import { DatePicker } from '@/components/shared/date-picker';
import { FormFullRow, FormGrid, FormSection } from '@/components/shared/form-section';
import { StickyFormFooter } from '@/components/shared/sticky-form-footer';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { saveEmployee } from '../actions';
import {
  BANK_FIELDS,
  COMPENSATION_FIELDS,
  employeeFormSchema,
  hasValidIbanChecksum,
  identityNumberWarning,
  isValidSaudiIbanFormat,
  PERSONAL_FIELDS,
  type EmployeeFormValues,
} from '../schemas';
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, GENDERS, ID_TYPES, MARITAL_STATUSES, type MasterDataOptions } from '../types';
import { ManagerPicker, type ManagerOption } from './manager-picker';

type FieldName = FieldPath<EmployeeFormValues>;

type SectionDef = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  fields: readonly FieldName[];
};

export type EmployeeFormProps = {
  mode: 'create' | 'edit';
  employeeId: string | null;
  defaultValues: EmployeeFormValues;
  options: MasterDataOptions;
  currentManager: ManagerOption | null;
  permissions: { personalEdit: boolean; personalView: boolean; bankEdit: boolean };
  currency: string;
  cancelHref: string;
};

const IDENTITY_FIELDS: readonly FieldName[] = [
  'employee_number',
  'name_ar',
  'name_en',
  'company_email',
  'personal_email',
  'mobile',
  'alt_mobile',
  'gender',
  'nationality',
  'date_of_birth',
  'marital_status',
  'address',
];
const EMPLOYMENT_FIELDS: readonly FieldName[] = [
  'department_id',
  'division',
  'section',
  'job_title_id',
  'grade',
  'manager_id',
  'employment_type',
  'employment_status',
  'joining_date',
  'probation_end_date',
  'contract_start_date',
  'contract_end_date',
  'termination_date',
  'location_id',
  'cost_center_id',
];
const GOVERNMENT_FIELDS: readonly FieldName[] = [
  'id_type',
  'national_id',
  'iqama_issue_date',
  'iqama_expiry_date',
  'iqama_expiry_hijri',
  'iqama_profession',
  'passport_number',
  'passport_expiry_date',
  'employer_number',
  'is_outside_kingdom',
];
const EMERGENCY_FIELDS: readonly FieldName[] = ['emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_mobile'];

const PERSONAL = new Set<string>(PERSONAL_FIELDS);

export function EmployeeForm({ mode, employeeId, defaultValues, options, currentManager, permissions, currency, cancelHref }: EmployeeFormProps) {
  const t = useTranslations('employees');
  const resolve = useErrorMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues,
    mode: 'onTouched',
  });

  const sections = useMemo<SectionDef[]>(() => {
    const list: SectionDef[] = [
      {
        id: 'identity',
        title: t('form.sections.identity'),
        description: t('form.sections.identityDescription'),
        icon: UserRoundIcon,
        fields: IDENTITY_FIELDS,
      },
      {
        id: 'employment',
        title: t('form.sections.employment'),
        description: t('form.sections.employmentDescription'),
        icon: BriefcaseIcon,
        fields: EMPLOYMENT_FIELDS,
      },
    ];
    if (permissions.personalView || permissions.personalEdit) {
      list.push(
        {
          id: 'government',
          title: t('form.sections.government'),
          description: t('form.sections.governmentDescription'),
          icon: IdCardIcon,
          fields: GOVERNMENT_FIELDS,
        },
        {
          id: 'emergency',
          title: t('form.sections.emergency'),
          description: t('form.sections.emergencyDescription'),
          icon: PhoneCallIcon,
          fields: EMERGENCY_FIELDS,
        },
      );
    }
    if (permissions.bankEdit) {
      list.push(
        {
          id: 'compensation',
          title: t('form.sections.compensation'),
          description: t('form.sections.compensationDescription'),
          icon: WalletIcon,
          fields: COMPENSATION_FIELDS,
        },
        { id: 'bank', title: t('form.sections.bank'), description: t('form.sections.bankDescription'), icon: LandmarkIcon, fields: BANK_FIELDS },
      );
    }
    return list;
  }, [t, permissions]);

  const { errors, isDirty } = form.formState;
  const errorCount = Object.keys(errors).length;

  const scrollToFirstError = (names: string[]) => {
    const section = sections.find((s) => s.fields.some((f) => names.includes(f)));
    if (section) document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onSubmit = form.handleSubmit(
    (values) => {
      startTransition(async () => {
        const result = await saveEmployee({ id: employeeId, values });
        if (!result.ok) {
          const fieldErrors = result.fieldErrors ?? {};
          for (const [name, message] of Object.entries(fieldErrors)) {
            form.setError(name as FieldName, { type: 'server', message });
          }
          toast.error(resolve(result.error));
          if (Object.keys(fieldErrors).length) scrollToFirstError(Object.keys(fieldErrors));
          return;
        }
        toast.success(resolve(result.message));
        form.reset(values);
        router.push(`/employees/${result.data?.id ?? employeeId}`);
        router.refresh();
      });
    },
    (invalid) => {
      toast.error(t('toast.invalidForm'));
      scrollToFirstError(Object.keys(invalid));
    },
  );

  const personalDisabled = !permissions.personalEdit;
  const fieldDisabled = (name: FieldName) => pending || (PERSONAL.has(name) && personalDisabled);

  return (
    <Form {...form}>
      <form id="employee-form" onSubmit={onSubmit} noValidate className="mx-auto flex w-full max-w-form flex-col">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-6">
          <SectionIndex sections={sections} errors={errors as Record<string, unknown>} />

          <div className="flex min-w-0 flex-col gap-5">
            <FormSection
              id="section-identity"
              title={sections[0]!.title}
              description={sections[0]!.description}
              icon={<UserRoundIcon />}
              className="scroll-mt-20"
            >
              <FormGrid>
                <TextField name="name_ar" label={t('fields.nameAr')} placeholder={t('form.placeholders.nameAr')} required disabled={pending} dir="rtl" />
                <TextField
                  name="name_en"
                  label={t('fields.nameEn')}
                  placeholder={t('form.placeholders.nameEn')}
                  description={t('form.hints.nameEn')}
                  disabled={pending}
                  dir="ltr"
                />
                <TextField
                  name="employee_number"
                  label={t('fields.employeeNumber')}
                  placeholder={t('form.placeholders.employeeNumber')}
                  description={t('form.hints.employeeNumber')}
                  disabled={pending}
                  dir="ltr"
                />
                <TextField name="nationality" label={t('fields.nationality')} placeholder={t('form.placeholders.nationality')} disabled={pending} />
                <TextField name="company_email" label={t('fields.companyEmail')} placeholder={t('form.placeholders.email')} type="email" dir="ltr" disabled={pending} />
                <TextField
                  name="personal_email"
                  label={t('fields.personalEmail')}
                  placeholder={t('form.placeholders.email')}
                  type="email"
                  dir="ltr"
                  disabled={fieldDisabled('personal_email')}
                  hidden={!permissions.personalView && !permissions.personalEdit}
                />
                <TextField name="mobile" label={t('fields.mobile')} placeholder={t('form.placeholders.mobile')} type="tel" dir="ltr" disabled={pending} />
                <TextField name="alt_mobile" label={t('fields.altMobile')} placeholder={t('form.placeholders.mobile')} type="tel" dir="ltr" disabled={pending} />
                <EnumField name="gender" label={t('fields.gender')} values={GENDERS} labelKey="gender" disabled={pending} />
                {permissions.personalView || permissions.personalEdit ? (
                  <>
                    <EnumField
                      name="marital_status"
                      label={t('fields.maritalStatus')}
                      values={MARITAL_STATUSES}
                      labelKey="maritalStatus"
                      disabled={fieldDisabled('marital_status')}
                    />
                    <DateField name="date_of_birth" label={t('fields.dateOfBirth')} disabled={fieldDisabled('date_of_birth')} />
                    <FormFullRow>
                      <TextAreaField name="address" label={t('fields.address')} disabled={fieldDisabled('address')} />
                    </FormFullRow>
                  </>
                ) : null}
              </FormGrid>
            </FormSection>

            <FormSection
              id="section-employment"
              title={t('form.sections.employment')}
              description={t('form.sections.employmentDescription')}
              icon={<BriefcaseIcon />}
              className="scroll-mt-20"
            >
              <FormGrid>
                <ComboField name="job_title_id" label={t('fields.jobTitle')} options={options.jobTitles} placeholder={t('form.placeholders.jobTitle')} disabled={pending} />
                <TextField name="grade" label={t('fields.grade')} disabled={pending} />
                <ComboField
                  name="department_id"
                  label={t('fields.department')}
                  options={options.departments}
                  placeholder={t('form.placeholders.department')}
                  disabled={pending}
                />
                <FormField
                  control={form.control}
                  name="manager_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('fields.manager')}</FormLabel>
                      <ManagerPickerControl
                        employeeId={employeeId}
                        value={field.value}
                        onChange={field.onChange}
                        current={currentManager}
                        disabled={pending}
                      />
                      <FormDescription>{t('form.hints.manager')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <TextField name="division" label={t('fields.division')} disabled={pending} />
                <TextField name="section" label={t('fields.section')} disabled={pending} />
                <ComboField name="location_id" label={t('fields.location')} options={options.locations} placeholder={t('form.placeholders.location')} disabled={pending} />
                <ComboField
                  name="cost_center_id"
                  label={t('fields.costCenter')}
                  options={options.costCenters}
                  placeholder={t('form.placeholders.costCenter')}
                  disabled={pending}
                />
                <EnumField name="employment_type" label={t('fields.employmentType')} values={EMPLOYMENT_TYPES} labelKey="employmentType" disabled={pending} />
                <StatusField disabled={pending} />
                <DateField name="joining_date" label={t('fields.joiningDate')} disabled={pending} />
                <DateField name="probation_end_date" label={t('fields.probationEndDate')} disabled={pending} minFrom="joining_date" />
                <DateField name="contract_start_date" label={t('fields.contractStartDate')} disabled={pending} />
                <DateField name="contract_end_date" label={t('fields.contractEndDate')} disabled={pending} minFrom="contract_start_date" />
                <DateField name="termination_date" label={t('fields.terminationDate')} disabled={pending} minFrom="joining_date" />
              </FormGrid>
              <p className="mt-4 text-xs text-muted-foreground">{t('form.masterDataHint')}</p>
            </FormSection>

            {permissions.personalView || permissions.personalEdit ? (
              <>
                <FormSection
                  id="section-government"
                  title={t('form.sections.government')}
                  description={t('form.sections.governmentDescription')}
                  icon={<IdCardIcon />}
                  actions={personalDisabled ? <ReadOnlyNote /> : undefined}
                  className="scroll-mt-20"
                >
                  <FormGrid>
                    <EnumField name="id_type" label={t('fields.idType')} values={ID_TYPES} labelKey="idType" disabled={fieldDisabled('id_type')} />
                    <IdentityNumberField disabled={fieldDisabled('national_id')} />
                    <DateField name="iqama_issue_date" label={t('fields.iqamaIssueDate')} disabled={fieldDisabled('iqama_issue_date')} />
                    <DateField
                      name="iqama_expiry_date"
                      label={t('fields.iqamaExpiryDate')}
                      disabled={fieldDisabled('iqama_expiry_date')}
                      minFrom="iqama_issue_date"
                    />
                    <TextField
                      name="iqama_expiry_hijri"
                      label={t('fields.iqamaExpiryHijri')}
                      placeholder={t('form.placeholders.hijri')}
                      description={t('form.hints.iqamaHijri')}
                      dir="ltr"
                      disabled={fieldDisabled('iqama_expiry_hijri')}
                    />
                    <TextField name="iqama_profession" label={t('fields.iqamaProfession')} disabled={fieldDisabled('iqama_profession')} />
                    <TextField name="passport_number" label={t('fields.passportNumber')} dir="ltr" disabled={fieldDisabled('passport_number')} />
                    <DateField name="passport_expiry_date" label={t('fields.passportExpiryDate')} disabled={fieldDisabled('passport_expiry_date')} />
                    <TextField name="employer_number" label={t('fields.employerNumber')} dir="ltr" disabled={fieldDisabled('employer_number')} />
                    <OutsideKingdomField disabled={fieldDisabled('is_outside_kingdom')} />
                  </FormGrid>
                </FormSection>

                <FormSection
                  id="section-emergency"
                  title={t('form.sections.emergency')}
                  description={t('form.sections.emergencyDescription')}
                  icon={<PhoneCallIcon />}
                  actions={personalDisabled ? <ReadOnlyNote /> : undefined}
                  className="scroll-mt-20"
                >
                  <FormGrid columns={3}>
                    <TextField name="emergency_contact_name" label={t('fields.emergencyName')} disabled={fieldDisabled('emergency_contact_name')} />
                    <TextField
                      name="emergency_contact_relationship"
                      label={t('fields.emergencyRelationship')}
                      disabled={fieldDisabled('emergency_contact_relationship')}
                    />
                    <TextField
                      name="emergency_contact_mobile"
                      label={t('fields.emergencyMobile')}
                      placeholder={t('form.placeholders.mobile')}
                      type="tel"
                      dir="ltr"
                      disabled={fieldDisabled('emergency_contact_mobile')}
                    />
                  </FormGrid>
                </FormSection>
              </>
            ) : null}

            {permissions.bankEdit ? (
              <>
                <FormSection
                  id="section-compensation"
                  title={t('form.sections.compensation')}
                  description={t('form.sections.compensationDescription')}
                  icon={<WalletIcon />}
                  className="scroll-mt-20"
                >
                  <FormGrid>
                    <MoneyField name="basic_salary" label={t('fields.basicSalary')} currency={currency} disabled={pending} />
                    <MoneyField name="housing_allowance" label={t('fields.housingAllowance')} currency={currency} disabled={pending} />
                    <MoneyField name="transport_allowance" label={t('fields.transportAllowance')} currency={currency} disabled={pending} />
                    <MoneyField name="other_allowance" label={t('fields.otherAllowance')} currency={currency} disabled={pending} />
                    <DateField name="compensation_effective_date" label={t('fields.effectiveDate')} disabled={pending} />
                    <TotalSalary currency={currency} />
                  </FormGrid>
                </FormSection>

                <FormSection
                  id="section-bank"
                  title={t('form.sections.bank')}
                  description={t('form.sections.bankDescription')}
                  icon={<LandmarkIcon />}
                  className="scroll-mt-20"
                >
                  <FormGrid>
                    <TextField name="bank_name" label={t('fields.bankName')} disabled={pending} />
                    <TextField name="account_holder" label={t('fields.accountHolder')} disabled={pending} />
                    <FormFullRow>
                      <IbanField disabled={pending} />
                    </FormFullRow>
                  </FormGrid>
                </FormSection>
              </>
            ) : null}
          </div>
        </div>

        <StickyFormFooter
          formId="employee-form"
          dirty={isDirty}
          pending={pending}
          cancelHref={cancelHref}
          submitLabel={mode === 'create' ? t('form.submitCreate') : t('form.submitSave')}
          start={
            errorCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-danger">
                <CircleAlertIcon className="size-3.5" aria-hidden />
                <span className="truncate">{t('form.fieldsNeedAttention', { count: errorCount })}</span>
              </span>
            ) : null
          }
        />
      </form>
    </Form>
  );
}

/* ─── Section index (sticky, scroll-spy) ───────────────────────────────────── */

function SectionIndex({ sections, errors }: { sections: SectionDef[]; errors: Record<string, unknown> }) {
  const t = useTranslations('employees.form');
  const [active, setActive] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const elements = sections.map((s) => document.getElementById(`section-${s.id}`)).filter((el): el is HTMLElement => Boolean(el));
    if (!elements.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('section-', ''));
      },
      { rootMargin: '-72px 0px -55% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={t('onThisPage')} className="hidden lg:block">
      <div className="sticky top-[calc(var(--spacing-header)+1.25rem)]">
        <p className="mb-2 px-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('onThisPage')}</p>
        <ul className="flex flex-col gap-0.5 border-s border-border">
          {sections.map((s) => {
            const count = s.fields.filter((f) => f in errors).length;
            const Icon = s.icon;
            const isActive = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#section-${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setActive(s.id);
                  }}
                  aria-current={isActive ? 'location' : undefined}
                  className={cn(
                    '-ms-px flex items-center gap-2 border-s-2 py-1.5 ps-3 pe-2 text-meta transition-colors',
                    isActive ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className={cn('size-3.5 shrink-0', isActive ? 'text-primary' : 'text-faint-foreground')} aria-hidden />
                  <span className="min-w-0 flex-1 leading-snug">{s.title}</span>
                  {count > 0 ? (
                    <span className="min-w-4.5 rounded-full bg-danger px-1 text-center text-[0.6875rem] leading-4.5 font-semibold text-danger-foreground tabular-nums">
                      {count}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function ReadOnlyNote() {
  const t = useTranslations('employees.form');
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      <LockIcon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{t('readOnlySection')}</span>
    </span>
  );
}

/* ─── Field helpers ────────────────────────────────────────────────────────── */

function TextField({
  name,
  label,
  placeholder,
  description,
  required,
  disabled,
  type = 'text',
  dir,
  hidden,
  className,
}: {
  name: FieldName;
  label: string;
  placeholder?: string;
  description?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  type?: string;
  dir?: 'ltr' | 'rtl';
  hidden?: boolean;
  className?: string;
}) {
  const { control } = useFormContext<EmployeeFormValues>();
  if (hidden) return null;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel required={required}>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={(field.value as string) ?? ''}
              type={type}
              dir={dir}
              placeholder={placeholder}
              disabled={disabled}
              autoComplete="off"
              className={cn(dir === 'ltr' && 'text-start', className)}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function TextAreaField({ name, label, disabled }: { name: FieldName; label: string; disabled?: boolean }) {
  const { control } = useFormContext<EmployeeFormValues>();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...field} value={(field.value as string) ?? ''} rows={2} disabled={disabled} className="min-h-16" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function DateField({ name, label, disabled, minFrom }: { name: FieldName; label: string; disabled?: boolean; minFrom?: FieldName }) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees.form.placeholders');
  const min = useWatch({ control, name: minFrom ?? name, disabled: !minFrom }) as string | undefined;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <DatePicker
              value={(field.value as string) || null}
              onChange={(v) => {
                field.onChange(v ?? '');
                field.onBlur();
              }}
              placeholder={t('date')}
              disabled={disabled}
              captionLayout="dropdown"
              min={minFrom && min ? min : undefined}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function EnumField<K extends 'gender' | 'maritalStatus' | 'employmentType' | 'idType'>({
  name,
  label,
  values,
  labelKey,
  disabled,
}: {
  name: FieldName;
  label: string;
  values: readonly string[];
  labelKey: K;
  disabled?: boolean;
}) {
  const { control } = useFormContext<EmployeeFormValues>();
  const te = useTranslations('enums');
  const tf = useTranslations('employees.form');
  const tt = te as unknown as (key: string) => string;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={(field.value as string) || '__none'} onValueChange={(v) => field.onChange(v === '__none' ? '' : v)} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={tf('placeholders.select')} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="__none">
                <span className="text-muted-foreground">{tf('none')}</span>
              </SelectItem>
              {values.map((v) => (
                <SelectItem key={v} value={v}>
                  {tt(`${labelKey}.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function StatusField({ disabled }: { disabled?: boolean }) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees.fields');
  const ts = useTranslations('statuses.employment');
  return (
    <FormField
      control={control}
      name="employment_status"
      render={({ field }) => (
        <FormItem>
          <FormLabel required>{t('employmentStatus')}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {EMPLOYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ts(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function OutsideKingdomField({ disabled }: { disabled?: boolean }) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees');
  const te = useTranslations('enums.outsideKingdom');
  return (
    <FormField
      control={control}
      name="is_outside_kingdom"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('fields.outsideKingdom')}</FormLabel>
          <Select value={field.value || '__none'} onValueChange={(v) => field.onChange(v === '__none' ? '' : v)} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="__none">
                <span className="text-muted-foreground">{t('form.none')}</span>
              </SelectItem>
              <SelectItem value="inside">{te('inside')}</SelectItem>
              <SelectItem value="outside">{te('outside')}</SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ComboField({
  name,
  label,
  options,
  placeholder,
  disabled,
}: {
  name: FieldName;
  label: string;
  options: { value: string; label: string; keywords?: string[] }[];
  placeholder: string;
  disabled?: boolean;
}) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees.form.placeholders');
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Combobox
              value={(field.value as string) || null}
              onChange={(v) => {
                field.onChange(v ?? '');
                field.onBlur();
              }}
              options={options}
              placeholder={placeholder}
              searchPlaceholder={t('search')}
              disabled={disabled}
              aria-invalid={Boolean(fieldState.error)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ManagerPickerControl(props: {
  employeeId: string | null;
  value: string;
  onChange: (value: string) => void;
  current: ManagerOption | null;
  disabled?: boolean;
}) {
  return (
    <FormControl>
      <ManagerPicker {...props} />
    </FormControl>
  );
}

function IdentityNumberField({ disabled }: { disabled?: boolean }) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees');
  const tt = t as unknown as (key: string) => string;
  const idType = useWatch({ control, name: 'id_type' });
  return (
    <FormField
      control={control}
      name="national_id"
      render={({ field }) => {
        const warning = identityNumberWarning(idType ?? '', field.value ?? '');
        return (
          <FormItem>
            <FormLabel>{t('fields.nationalId')}</FormLabel>
            <FormControl>
              <Input {...field} dir="ltr" inputMode="numeric" disabled={disabled} autoComplete="off" className="text-start tabular-nums" />
            </FormControl>
            {warning ? (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                {tt(warning.replace(/^employees\./, ''))}
              </p>
            ) : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function MoneyField({ name, label, currency, disabled }: { name: FieldName; label: string; currency: string; disabled?: boolean }) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees.form.placeholders');
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="relative" dir="ltr">
            <FormControl>
              <Input
                {...field}
                value={(field.value as string) ?? ''}
                inputMode="decimal"
                placeholder={t('amount')}
                disabled={disabled}
                autoComplete="off"
                className="ps-14 text-start tabular-nums"
              />
            </FormControl>
            <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-xs font-medium text-muted-foreground">
              {currency}
            </span>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function TotalSalary({ currency }: { currency: string }) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees');
  const locale = useLocale();
  const values = useWatch({ control, name: ['basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance'] });
  const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0);
  return (
    <div className="flex flex-col justify-center rounded-lg border border-dashed border-border-strong bg-subtle px-4 py-2.5">
      <span className="text-xs font-medium text-muted-foreground">{t('fields.totalSalary')}</span>
      <span className="mt-0.5 text-lg font-semibold text-foreground tabular-nums">{formatCurrency(total, locale, currency)}</span>
      <span className="text-xs text-muted-foreground">{t('form.hints.totalSalary')}</span>
    </div>
  );
}

function IbanField({ disabled }: { disabled?: boolean }) {
  const { control } = useFormContext<EmployeeFormValues>();
  const t = useTranslations('employees');
  return (
    <FormField
      control={control}
      name="iban"
      render={({ field }) => {
        const value = field.value ?? '';
        const checksumWarning = value && isValidSaudiIbanFormat(value) && !hasValidIbanChecksum(value);
        return (
          <FormItem>
            <FormLabel>{t('fields.iban')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                dir="ltr"
                placeholder={t('form.placeholders.iban')}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                className="text-start font-mono tracking-wide uppercase"
              />
            </FormControl>
            {checksumWarning ? (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                {t('form.warnings.ibanChecksum')}
              </p>
            ) : (
              <FormDescription>{t('form.hints.iban')}</FormDescription>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

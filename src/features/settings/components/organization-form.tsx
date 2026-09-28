'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2Icon, CalendarClockIcon, EyeIcon, GlobeIcon, MailIcon, PhoneIcon, ScaleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Combobox } from '@/components/shared/combobox';
import { FormFullRow, FormGrid, FormSection } from '@/components/shared/form-section';
import { StickyFormFooter } from '@/components/shared/sticky-form-footer';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { InputGroup } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BrandImageField } from '@/features/branding/components/brand-image-field';
import { saveOrganization } from '../actions';
import { WEEKDAYS, organizationFormSchema, type OrganizationFormValues } from '../schemas';
import type { Option } from '../queries';
import { TimeField } from './time-field';
import { useUnsavedChangesWarning } from './use-unsaved-changes';

export type OrganizationFormProps = {
  defaultValues: OrganizationFormValues;
  logoUrl: string | null;
  canEdit: boolean;
  /** Reason the logo can't be changed (missing settings.administer), else null. */
  logoLockedReason: string | null;
  options: {
    countries: Option[];
    currencies: Option[];
    timezones: Option[];
    months: Option[];
    weekdays: { short: string; long: string; compact: string }[];
  };
};

const b = (chunks: ReactNode) => <span className="font-semibold text-foreground numeric">{chunks}</span>;

/** Weekday toggle label: compact on phones (seven toggles share one row), short otherwise. */
function DayLabel({ day }: { day: { short: string; compact: string } | undefined }) {
  return (
    <>
      <span className="min-w-0 truncate sm:hidden">{day?.compact}</span>
      <span className="min-w-0 truncate max-sm:hidden">{day?.short}</span>
    </>
  );
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Settings › Organization form: Identity · Contact · Legal · Regional · Working schedule. */
export function OrganizationForm({ defaultValues, logoUrl, canEdit, logoLockedReason, options }: OrganizationFormProps) {
  const t = useTranslations('settings.organization');
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();

  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues,
    mode: 'onTouched',
  });
  const dirty = form.formState.isDirty;
  useUnsavedChangesWarning(dirty && canEdit);

  const [workingDays, weekendDays, workStart, workEnd] = useWatch({
    control: form.control,
    name: ['workingDays', 'weekendDays', 'workStart', 'workEnd'],
  });
  const dailyMinutes = Math.max(0, minutes(workEnd) - minutes(workStart));
  const weeklyHours = Math.round(((dailyMinutes * workingDays.length) / 60) * 10) / 10;

  const onSubmit = (values: OrganizationFormValues) =>
    startTransition(async () => {
      const result = await saveOrganization(values);
      if (!result.ok) {
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as keyof OrganizationFormValues, { message: key }, { shouldFocus: true });
        }
        toast.error(resolve(result.error));
        return;
      }
      form.reset(values);
      toast.success(resolve(result.message));
    });

  const onInvalid = () => toast.error(tc('form.fixErrors'));

  const setDays = (field: 'workingDays' | 'weekendDays', other: 'workingDays' | 'weekendDays', next: string[]) => {
    const days = next.map(Number).sort();
    form.setValue(field, days, { shouldDirty: true, shouldValidate: true });
    // A day is either a working day or a weekend day.
    const otherDays = form.getValues(other).filter((d) => !days.includes(d));
    form.setValue(other, otherDays, { shouldDirty: true, shouldValidate: true });
  };

  const disabled = !canEdit || pending;
  const textField = (
    name: keyof OrganizationFormValues,
    label: string,
    opts: { dir?: 'ltr' | 'rtl'; lang?: string; optional?: boolean; required?: boolean; hint?: string; autoComplete?: string; placeholder?: string; icon?: ReactNode; type?: string } = {},
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel optional={opts.optional} required={opts.required}>
            {label}
          </FormLabel>
          <FormControl>
            {opts.icon ? (
              <InputGroup
                {...field}
                value={String(field.value ?? '')}
                start={opts.icon}
                dir={opts.dir}
                lang={opts.lang}
                type={opts.type}
                autoComplete={opts.autoComplete ?? 'off'}
                placeholder={opts.placeholder}
              />
            ) : (
              <Input {...field} value={String(field.value ?? '')} dir={opts.dir} lang={opts.lang} autoComplete={opts.autoComplete ?? 'off'} placeholder={opts.placeholder} />
            )}
          </FormControl>
          {opts.hint ? <FormDescription>{opts.hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate aria-busy={pending} className="@container flex flex-col gap-5">
        {!canEdit ? (
          <Alert variant="info">
            <EyeIcon />
            <AlertDescription>{t('readOnly')}</AlertDescription>
          </Alert>
        ) : null}

        {/* Wide containers: two balanced columns (identity · contact | legal · regional · schedule). */}
        <fieldset disabled={disabled} className="grid min-w-0 grid-cols-1 items-start gap-5 @min-[76rem]:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-5">
            <FormSection icon={<Building2Icon />} title={t('sections.identity')} description={t('sections.identityHint')}>
              <FormGrid>
                <FormFullRow>
                  <BrandImageField
                    kind="logo"
                    label={t('fields.logo')}
                    description={t('fields.logoHint')}
                    url={logoUrl}
                    lockedReason={!canEdit ? t('readOnly') : logoLockedReason}
                    className="rounded-lg border border-border bg-subtle/60 p-3"
                  />
                </FormFullRow>
                {textField('nameAr', t('fields.nameAr'), { dir: 'rtl', lang: 'ar', autoComplete: 'organization' })}
                {textField('nameEn', t('fields.nameEn'), { dir: 'ltr', lang: 'en', autoComplete: 'organization' })}
                {textField('legalNameAr', t('fields.legalNameAr'), { dir: 'rtl', lang: 'ar', optional: true })}
                {textField('legalNameEn', t('fields.legalNameEn'), { dir: 'ltr', lang: 'en', optional: true })}
                <FormFullRow>
                  <p className="-mt-1 text-xs text-muted-foreground">{t('fields.namesHint')}</p>
                </FormFullRow>
              </FormGrid>
            </FormSection>

            <FormSection icon={<PhoneIcon />} title={t('sections.contact')} description={t('sections.contactHint')}>
              <FormGrid>
                <FormField
                  control={form.control}
                  name="addressAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel optional>{t('fields.addressAr')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} dir="rtl" lang="ar" rows={2} className="min-h-16" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel optional>{t('fields.addressEn')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} dir="ltr" lang="en" rows={2} className="min-h-16" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {textField('city', t('fields.city'), { optional: true, autoComplete: 'address-level2' })}
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel optional>{t('fields.country')}</FormLabel>
                      <FormControl>
                        <Combobox
                          options={options.countries}
                          value={field.value || null}
                          onChange={(value) => field.onChange(value ?? '')}
                          placeholder={t('fields.countryPlaceholder')}
                          searchPlaceholder={t('fields.countrySearch')}
                          disabled={disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {textField('website', t('fields.website'), { dir: 'ltr', optional: true, placeholder: 'www.example.com', icon: <GlobeIcon />, autoComplete: 'url' })}
                {textField('phone', t('fields.phone'), { dir: 'ltr', optional: true, placeholder: '+966 11 000 0000', icon: <PhoneIcon />, type: 'tel', autoComplete: 'tel' })}
                {textField('hrEmail', t('fields.hrEmail'), {
                  dir: 'ltr',
                  optional: true,
                  placeholder: 'hr@example.com',
                  icon: <MailIcon />,
                  type: 'email',
                  hint: t('fields.hrEmailHint'),
                  autoComplete: 'email',
                })}
              </FormGrid>
            </FormSection>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <FormSection icon={<ScaleIcon />} title={t('sections.legal')} description={t('sections.legalHint')}>
              <FormGrid>
                {textField('commercialRegistration', t('fields.commercialRegistration'), { dir: 'ltr', optional: true, hint: t('fields.commercialRegistrationHint') })}
                {textField('vatNumber', t('fields.vatNumber'), { dir: 'ltr', optional: true, hint: t('fields.vatNumberHint') })}
              </FormGrid>
            </FormSection>

            <FormSection icon={<GlobeIcon />} title={t('sections.regional')} description={t('sections.regionalHint')}>
              <FormGrid>
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('fields.currency')}</FormLabel>
                      <FormControl>
                        <Combobox
                          options={options.currencies}
                          value={field.value}
                          onChange={(value) => value && field.onChange(value)}
                          clearable={false}
                          searchPlaceholder={t('fields.currencySearch')}
                          disabled={disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('fields.timezone')}</FormLabel>
                      <FormControl>
                        <Combobox
                          options={options.timezones}
                          value={field.value}
                          onChange={(value) => value && field.onChange(value)}
                          clearable={false}
                          searchPlaceholder={t('fields.timezoneSearch')}
                          disabled={disabled}
                        />
                      </FormControl>
                      <FormDescription>{t('fields.timezoneHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultLanguage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('fields.defaultLanguage')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ar">{tc('arabic')}</SelectItem>
                          <SelectItem value="en">{tc('english')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>{t('fields.defaultLanguageHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fiscalYearStartMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('fields.fiscalYearStart')}</FormLabel>
                      <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))} disabled={disabled}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {options.months.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t('fields.fiscalYearStartHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormGrid>
            </FormSection>

            <FormSection icon={<CalendarClockIcon />} title={t('sections.schedule')} description={t('sections.scheduleHint')}>
              <FormGrid>
                <FormFullRow>
                  <FormField
                    control={form.control}
                    name="workingDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>{t('fields.workingDays')}</FormLabel>
                        <FormControl>
                          <ToggleGroup
                            type="multiple"
                            variant="outline"
                            value={field.value.map(String)}
                            onValueChange={(next) => setDays('workingDays', 'weekendDays', next)}
                            disabled={disabled}
                            className="w-full max-w-xl min-w-0"
                            aria-label={t('fields.workingDays')}
                          >
                            {WEEKDAYS.map((d) => (
                              <ToggleGroupItem
                                key={d}
                                value={String(d)}
                                aria-label={options.weekdays[d]?.long}
                                className="flex-1 px-0.5 data-[state=on]:font-semibold max-sm:text-xs sm:px-2.5"
                              >
                                <DayLabel day={options.weekdays[d]} />
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormFullRow>
                <FormFullRow>
                  <FormField
                    control={form.control}
                    name="weekendDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.weekendDays')}</FormLabel>
                        <FormControl>
                          <ToggleGroup
                            type="multiple"
                            variant="outline"
                            value={field.value.map(String)}
                            onValueChange={(next) => setDays('weekendDays', 'workingDays', next)}
                            disabled={disabled}
                            className="w-full max-w-xl min-w-0"
                            aria-label={t('fields.weekendDays')}
                          >
                            {WEEKDAYS.map((d) => (
                              <ToggleGroupItem
                                key={d}
                                value={String(d)}
                                aria-label={options.weekdays[d]?.long}
                                className="flex-1 px-0.5 data-[state=on]:bg-secondary-soft data-[state=on]:font-semibold data-[state=on]:text-secondary-soft-foreground max-sm:text-xs sm:px-2.5"
                              >
                                <DayLabel day={options.weekdays[d]} />
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </FormControl>
                        <FormDescription>{t('fields.weekendDaysHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormFullRow>
                <FormField
                  control={form.control}
                  name="workStart"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('fields.workStart')}</FormLabel>
                      <FormControl>
                        <TimeField
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={disabled}
                          searchPlaceholder={t('fields.timeSearch')}
                          className="max-w-40"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="workEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t('fields.workEnd')}</FormLabel>
                      <FormControl>
                        <TimeField
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={disabled}
                          searchPlaceholder={t('fields.timeSearch')}
                          className="max-w-40"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormFullRow>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-subtle px-4 py-2.5 text-meta text-muted-foreground">
                    <span>{t.rich('summary.workingDays', { count: workingDays.length, b })}</span>
                    <span>{t.rich('summary.weekendDays', { count: weekendDays.length, b })}</span>
                    <span>{t.rich('summary.weeklyHours', { hours: weeklyHours, b })}</span>
                  </div>
                </FormFullRow>
              </FormGrid>
            </FormSection>
          </div>
        </fieldset>

        {canEdit ? (
          <StickyFormFooter
            className="[&>div]:max-w-none"
            dirty={dirty}
            pending={pending}
            onCancel={dirty ? () => form.reset() : undefined}
            cancelLabel={tc('discardChanges')}
            submitDisabled={!dirty}
            start={dirty ? null : <span className="truncate">{t('footerHint')}</span>}
          />
        ) : null}
      </form>
    </Form>
  );
}

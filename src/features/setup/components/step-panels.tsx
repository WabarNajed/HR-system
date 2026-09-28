'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpRightIcon, CheckIcon, ImageIcon, MailPlusIcon, PlusIcon, UploadIcon, UserPlusIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useErrorMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { ProviderStatus } from '@/features/email-templates/components/provider-status';
import { saveMasterData } from '@/features/master-data/actions';
import { EMPTY_MASTER_DATA_FORM } from '@/features/master-data/schemas';
import { ApprovalPathChips } from '@/features/request-config/components/type-visual';
import { STEP_TYPES, type StepType } from '@/features/request-config/types';
import { inviteUserAction } from '@/features/users/actions';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { saveSetupOrganization } from '../actions';
import type { NamedItem, SetupData } from '../queries';
import { setupOrganizationSchema, type SetupOrganizationValues } from '../schemas';
import { STEP_LINKS, type SetupStep } from '../steps';

const isStepType = (v: string): v is StepType => (STEP_TYPES as readonly string[]).includes(v);

export type StepPermissions = { canEditSettings: boolean; canInvite: boolean; canImport: boolean; userEmail: string | null };

/** Content of one wizard step (compact inline form, summary of real data and a deep link). */
export function StepPanel({ step, data, perms }: { step: SetupStep; data: SetupData; perms: StepPermissions }) {
  switch (step) {
    case 'organization':
      return <OrganizationStep data={data} canEdit={perms.canEditSettings} />;
    case 'branding':
      return <BrandingStep data={data} />;
    case 'departments':
      return <MasterDataStep entity="departments" items={data.departments} canEdit={perms.canEditSettings} />;
    case 'jobTitles':
      return <MasterDataStep entity="job_titles" items={data.jobTitles} canEdit={perms.canEditSettings} />;
    case 'locations':
      return <MasterDataStep entity="locations" items={data.locations} canEdit={perms.canEditSettings} />;
    case 'leaveTypes':
      return <ChipsStep items={data.leaveTypes} emptyKey="leaveTypes" />;
    case 'requestTypes':
      return <ChipsStep items={data.requestTypes} emptyKey="requestTypes" />;
    case 'workflows':
      return <WorkflowsStep data={data} />;
    case 'hrAdmin':
      return <HrAdminStep data={data} canInvite={perms.canInvite} />;
    case 'email':
      return <EmailStep data={data} perms={perms} />;
    case 'employeeImport':
      return <ImportStep data={data} canImport={perms.canImport} />;
  }
}

function Block({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
      {children}
    </div>
  );
}

function OrganizationStep({ data, canEdit }: { data: SetupData; canEdit: boolean }) {
  const t = useTranslations('setup');
  const tc = useTranslations('common');
  const router = useRouter();
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const o = data.organization;
  const form = useForm<SetupOrganizationValues>({
    resolver: zodResolver(setupOrganizationSchema),
    defaultValues: {
      nameAr: o?.name_ar ?? '',
      nameEn: o?.name_en ?? '',
      legalNameAr: o?.legal_name_ar ?? '',
      legalNameEn: o?.legal_name_en ?? '',
      hrEmail: o?.hr_email ?? '',
      phone: o?.phone ?? '',
      city: o?.city ?? '',
    },
    mode: 'onTouched',
  });
  const submit = (values: SetupOrganizationValues) =>
    startTransition(async () => {
      const result = await saveSetupOrganization(values);
      if (!result.ok) {
        for (const [field, key] of Object.entries(result.fieldErrors ?? {})) form.setError(field as keyof SetupOrganizationValues, { message: key });
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      form.reset(values);
      router.refresh();
    });

  const field = (name: keyof SetupOrganizationValues, label: string, opts: { dir?: 'rtl' | 'ltr'; type?: string; optional?: boolean } = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel optional={opts.optional}>{label}</FormLabel>
          <FormControl>
            <Input {...f} dir={opts.dir} type={opts.type} autoComplete="off" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-4">
        <fieldset disabled={!canEdit || pending} className="grid gap-4 sm:grid-cols-2">
          {field('nameAr', t('org.nameAr'), { dir: 'rtl' })}
          {field('nameEn', t('org.nameEn'), { dir: 'ltr' })}
          {field('legalNameAr', t('org.legalNameAr'), { dir: 'rtl', optional: true })}
          {field('legalNameEn', t('org.legalNameEn'), { dir: 'ltr', optional: true })}
          {field('hrEmail', t('org.hrEmail'), { dir: 'ltr', type: 'email', optional: true })}
          {field('phone', t('org.phone'), { dir: 'ltr', optional: true })}
          {field('city', t('org.city'), { optional: true })}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <SimpleTooltip content={canEdit ? undefined : t('noPermission')}>
            <span tabIndex={canEdit ? -1 : 0}>
              <Button type="submit" loading={pending} disabled={!canEdit || !form.formState.isDirty}>
                <CheckIcon />
                {pending ? tc('saving') : tc('saveChanges')}
              </Button>
            </span>
          </SimpleTooltip>
          <p className="text-meta text-muted-foreground">{t('org.more')}</p>
        </div>
      </form>
    </Form>
  );
}

function Swatch({ color, label }: { color: string | null; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
      <span className="size-7 rounded-md border border-black/10" style={{ backgroundColor: color ?? undefined }} aria-hidden />
      <span className="leading-tight">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span dir="ltr" className="block font-mono text-[0.8125rem] text-foreground uppercase">
          {color ?? '—'}
        </span>
      </span>
    </div>
  );
}

function BrandingStep({ data }: { data: SetupData }) {
  const t = useTranslations('setup');
  const b = data.branding;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
          <span className={cn('flex size-7 items-center justify-center rounded-md', b.hasLogo ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
            <ImageIcon className="size-4" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-xs text-muted-foreground">{t('branding.logo')}</span>
            <span className="block text-[0.8125rem] text-foreground">{b.hasLogo ? t('branding.logoSet') : t('branding.logoMissing')}</span>
          </span>
        </div>
        <Swatch color={b.primary} label={t('branding.primary')} />
        <Swatch color={b.secondary} label={t('branding.secondary')} />
      </div>
      <p className="text-meta text-muted-foreground">{t('branding.portalNames', { ar: b.portalAr ?? '—', en: b.portalEn ?? '—' })}</p>
    </div>
  );
}

type MasterEntity = 'departments' | 'job_titles' | 'locations';

function ItemChips({ items, max = 24, emptyText }: { items: NamedItem[]; max?: number; emptyText: string }) {
  const t = useTranslations('setup');
  const locale = useLocale() as Locale;
  if (!items.length) return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-meta text-muted-foreground">{emptyText}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, max).map((i) => (
        <span key={i.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-subtle px-2 py-1 text-[0.8125rem] text-foreground">
          {localized(i, 'name', locale)}
          {i.code ? (
            <span dir="ltr" className="font-mono text-[0.6875rem] text-muted-foreground">
              {i.code}
            </span>
          ) : null}
        </span>
      ))}
      {items.length > max ? <span className="inline-flex items-center px-1 text-meta text-muted-foreground">{t('moreItems', { count: items.length - max })}</span> : null}
    </div>
  );
}

function MasterDataStep({ entity, items, canEdit }: { entity: MasterEntity; items: NamedItem[]; canEdit: boolean }) {
  const t = useTranslations('setup');
  const tc = useTranslations('common');
  const router = useRouter();
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ nameAr: '', nameEn: '', code: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const key = entity === 'job_titles' ? 'jobTitles' : entity;

  const add = () => {
    if (!values.nameAr.trim() && !values.nameEn.trim()) {
      setErrors({ nameAr: 'validation.atLeastOneName' });
      return;
    }
    startTransition(async () => {
      const result = await saveMasterData({ entity, id: null, values: { ...EMPTY_MASTER_DATA_FORM, nameAr: values.nameAr, nameEn: values.nameEn, code: values.code } });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(resolve(result.error));
        return;
      }
      toast.success(t('quickAdd.added', { name: values.nameAr || values.nameEn }));
      setValues({ nameAr: '', nameEn: '', code: '' });
      setErrors({});
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Block title={t(`quickAdd.title.${key}`)}>
        <form
          className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          {(
            [
              ['nameAr', tc('nameAr'), 'rtl'],
              ['nameEn', tc('nameEn'), 'ltr'],
              ['code', tc('code'), 'ltr'],
            ] as const
          ).map(([name, label, dir]) => (
            <div key={name} className="flex flex-col gap-1">
              <Input
                value={values[name]}
                dir={dir}
                placeholder={label}
                aria-label={label}
                aria-invalid={Boolean(errors[name]) || undefined}
                disabled={!canEdit || pending}
                className={name === 'code' ? 'font-mono' : undefined}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              />
              {errors[name] ? <p className="text-xs text-danger">{resolve(errors[name])}</p> : null}
            </div>
          ))}
          <SimpleTooltip content={canEdit ? undefined : t('noPermission')}>
            <span tabIndex={canEdit ? -1 : 0}>
              <Button type="submit" loading={pending} disabled={!canEdit} className="w-full sm:w-auto">
                <PlusIcon />
                {tc('add')}
              </Button>
            </span>
          </SimpleTooltip>
        </form>
      </Block>
      <Block title={t('existing', { count: items.length })}>
        <ItemChips items={items} emptyText={t(`empty.${key}`)} />
      </Block>
    </div>
  );
}

function ChipsStep({ items, emptyKey }: { items: NamedItem[]; emptyKey: 'leaveTypes' | 'requestTypes' }) {
  const t = useTranslations('setup');
  return (
    <Block title={t('activeItems', { count: items.length })}>
      <ItemChips items={items} max={30} emptyText={t(`empty.${emptyKey}`)} />
      <p className="text-meta text-muted-foreground">{t(`hints.${emptyKey}`)}</p>
    </Block>
  );
}

function WorkflowsStep({ data }: { data: SetupData }) {
  const t = useTranslations('setup');
  const locale = useLocale() as Locale;
  return (
    <Block title={t('workflowsList')}>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.requestTypes.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-foreground">{localized(r, 'name', locale)}</span>
            <ApprovalPathChips steps={r.steps.map((s, i) => ({ id: `${r.id}-${i}`, step_type: (isStepType(s) ? s : 'hr') as StepType, approver_role_key: null }))} />
          </li>
        ))}
      </ul>
      {!data.requestTypes.length ? <p className="text-meta text-muted-foreground">{t('empty.requestTypes')}</p> : null}
    </Block>
  );
}

function HrAdminStep({ data, canInvite }: { data: SetupData; canInvite: boolean }) {
  const t = useTranslations('setup');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const resolve = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ fullName: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const invite = () =>
    startTransition(async () => {
      const result = await inviteUserAction({ fullName: values.fullName, email: values.email, roleKeys: ['hr_admin'], employeeId: null, locale });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(resolve(result.error));
        return;
      }
      toast.success(result.data?.email === 'sent' ? t('hrAdmin.invited', { email: values.email }) : t('hrAdmin.invitedNoEmail', { email: values.email }));
      setValues({ fullName: '', email: '' });
      setErrors({});
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <Block title={t('hrAdmin.current', { count: data.hrAdmins.length })}>
        {data.hrAdmins.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.hrAdmins.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
                <EmployeeAvatar name={a.name} seed={a.id} size="sm" />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-medium text-foreground">{a.name}</span>
                  <span dir="ltr" className="block truncate text-start text-xs text-muted-foreground">
                    {a.email}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-meta text-muted-foreground">{t('hrAdmin.none')}</p>
        )}
      </Block>
      <Block title={t('hrAdmin.inviteTitle')}>
        <form
          className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <div className="flex flex-col gap-1">
            <Input
              value={values.fullName}
              placeholder={t('hrAdmin.fullName')}
              aria-label={t('hrAdmin.fullName')}
              aria-invalid={Boolean(errors.fullName) || undefined}
              disabled={!canInvite || pending}
              onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))}
            />
            {errors.fullName ? <p className="text-xs text-danger">{resolve(errors.fullName)}</p> : null}
          </div>
          <div className="flex flex-col gap-1">
            <Input
              value={values.email}
              type="email"
              dir="ltr"
              placeholder={t('hrAdmin.email')}
              aria-label={t('hrAdmin.email')}
              aria-invalid={Boolean(errors.email) || undefined}
              disabled={!canInvite || pending}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            />
            {errors.email ? <p className="text-xs text-danger">{resolve(errors.email)}</p> : null}
          </div>
          <SimpleTooltip content={canInvite ? undefined : t('hrAdmin.noPermission')}>
            <span tabIndex={canInvite ? -1 : 0}>
              <Button type="submit" loading={pending} disabled={!canInvite || !values.email.trim() || !values.fullName.trim()} className="w-full sm:w-auto">
                <UserPlusIcon />
                {t('hrAdmin.invite')}
              </Button>
            </span>
          </SimpleTooltip>
        </form>
        <p className="text-meta text-muted-foreground">{t('hrAdmin.hint')}</p>
      </Block>
    </div>
  );
}

function EmailStep({ data, perms }: { data: SetupData; perms: StepPermissions }) {
  const t = useTranslations('setup');
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border px-4 py-3.5">
        <ProviderStatus status={data.provider} email={perms.userEmail} canTest={perms.canEditSettings} />
      </div>
      <ul className="flex flex-col gap-2 text-meta text-muted-foreground">
        <li className="flex items-start gap-2">
          <MailPlusIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {t('emailStep.configure')}
        </li>
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/settings/email-templates" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            {t('emailStep.templates')}
            <ArrowUpRightIcon className="size-3.5 flip-rtl" aria-hidden />
          </Link>
          <Link href="/settings/notifications" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            {t('emailStep.notifications')}
            <ArrowUpRightIcon className="size-3.5 flip-rtl" aria-hidden />
          </Link>
        </li>
      </ul>
    </div>
  );
}

function ImportStep({ data, canImport }: { data: SetupData; canImport: boolean }) {
  const t = useTranslations('setup');
  return (
    <div className="flex flex-col gap-4">
      <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', data.employees ? 'border-success/30 bg-success-soft/50' : 'border-border')}>
        <span className={cn('flex size-9 items-center justify-center rounded-lg', data.employees ? 'bg-success text-white' : 'bg-muted text-muted-foreground')}>
          {data.employees ? <CheckIcon className="size-4" aria-hidden /> : <XIcon className="size-4" aria-hidden />}
        </span>
        <span className="text-sm text-foreground">{data.employees ? t('import.count', { count: data.employees }) : t('import.none')}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <SimpleTooltip content={canImport ? undefined : t('noPermission')}>
          <span tabIndex={canImport ? -1 : 0}>
            {canImport ? (
              <Button asChild>
                <Link href={STEP_LINKS.employeeImport}>
                  <UploadIcon />
                  {t('import.open')}
                </Link>
              </Button>
            ) : (
              <Button disabled>
                <UploadIcon />
                {t('import.open')}
              </Button>
            )}
          </span>
        </SimpleTooltip>
        <Button variant="outline" asChild>
          <Link href="/employees/new">
            <UserPlusIcon />
            {t('import.addOne')}
          </Link>
        </Button>
      </div>
      <p className="text-meta text-muted-foreground">{t('import.hint')}</p>
    </div>
  );
}

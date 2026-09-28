import { BadgeCheckIcon, BriefcaseIcon, Building2Icon, IdCardIcon, MailIcon, UnlinkIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { EmptyState } from '@/components/shared/empty-state';
import { LinkTabs } from '@/components/shared/link-tabs';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { SelfProfilePanel } from '@/features/employees/components/self-profile-panel';
import { AccountDetailsForm, ChangePasswordForm, SessionsCard } from '@/features/profile/components/account-security';
import { PreferencesForm } from '@/features/profile/components/preferences-form';
import { requireAccess } from '@/lib/auth/guards';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('profile.title');

const TABS = ['info', 'security', 'preferences'] as const;
type Tab = (typeof TABS)[number];

/** My profile: header + tabs (My information · Account & security · Preferences). */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/profile']);
  const [t, sp] = await Promise.all([getTranslations('profile'), searchParams]);
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'info';
  const locale = ctx.locale;

  const employee = ctx.employee;
  const name = (employee ? employeeDisplayName(employee, locale) : '') || ctx.profile.fullName?.trim() || ctx.user.email || '—';
  const primary = ctx.roleDetails.find((r) => r.key === ctx.primaryRole) ?? null;
  const primaryLabel = primary ? localized({ name_ar: primary.nameAr, name_en: primary.nameEn }, 'name', locale) : null;
  const jobTitle = employee ? localized(employee.job_title, 'name', locale) : '';
  const department = employee ? localized(employee.department, 'name', locale) : '';

  return (
    <div className="flex flex-col gap-5">
      <header className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div aria-hidden className="h-16 bg-gradient-to-l from-primary/15 via-primary/5 to-secondary/10 sm:h-20 ltr:bg-gradient-to-r" />
        <div className="-mt-9 flex flex-col gap-4 px-5 pb-4 sm:-mt-10 sm:flex-row sm:items-end sm:gap-5">
          <EmployeeAvatar name={name} seed={employee?.id ?? ctx.user.id} src={employee?.avatar ?? null} size="xl" ring className="size-[4.5rem] text-xl sm:size-20" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 dir="auto" className="min-w-0 max-w-full truncate text-page-title text-foreground">{name}</h1>
              {primaryLabel ? (
                <Badge variant={ctx.isSuperAdmin ? 'secondary' : 'default'} size="md">
                  <BadgeCheckIcon className="size-3.5" aria-hidden />
                  {primaryLabel}
                </Badge>
              ) : null}
              <StatusBadge domain="profile" status={ctx.profile.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <MailIcon className="size-3.5" aria-hidden />
                <bdi dir="ltr">{ctx.user.email}</bdi>
              </span>
              {employee?.employee_number ? (
                <span className="inline-flex items-center gap-1.5">
                  <IdCardIcon className="size-3.5" aria-hidden />
                  <bdi className="numeric">{employee.employee_number}</bdi>
                </span>
              ) : null}
              {jobTitle ? (
                <span className="inline-flex items-center gap-1.5">
                  <BriefcaseIcon className="size-3.5" aria-hidden />
                  {jobTitle}
                </span>
              ) : null}
              {department ? (
                <span className="inline-flex items-center gap-1.5">
                  <Building2Icon className="size-3.5" aria-hidden />
                  {department}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="px-5">
          <LinkTabs
            aria-label={t('title')}
            value={tab}
            className="border-b-0"
            items={[
              { value: 'info', label: t('tabs.info') },
              { value: 'security', label: t('tabs.security') },
              { value: 'preferences', label: t('tabs.preferences') },
            ]}
          />
        </div>
      </header>

      {tab === 'info' ? (
        employee && ctx.profile.employeeId ? (
          <SelfProfilePanel employeeId={ctx.profile.employeeId} />
        ) : (
          <EmptyState
            variant="card"
            icon={UnlinkIcon}
            tone="neutral"
            title={t('notLinked.title')}
            description={ctx.isHR || ctx.isSuperAdmin ? t('notLinked.adminDescription') : t('notLinked.description')}
          />
        )
      ) : null}

      {tab === 'security' ? (
        <SplitLayout
          main={
            <>
              <AccountDetailsForm email={ctx.user.email} fullName={ctx.profile.fullName ?? ''} mobile={ctx.profile.mobile ?? ''} />
              <ChangePasswordForm email={ctx.user.email} />
            </>
          }
          side={<SessionsCard lastLoginAt={ctx.profile.lastLoginAt} />}
        />
      ) : null}

      {tab === 'preferences' ? (
        <PreferencesForm language={locale} theme={ctx.profile.theme} />
      ) : null}
    </div>
  );
}

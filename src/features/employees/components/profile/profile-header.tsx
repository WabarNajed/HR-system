import { Building2Icon, BriefcaseIcon, HashIcon, KeyRoundIcon, MailIcon, MapPinIcon, PhoneIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { employeeAlternateName, employeeDisplayName, localized } from '@/lib/i18n/localized';
import { fileRouteUrl } from '@/lib/storage';
import type { PortalAccount } from '../../queries';
import type { EmployeeRecord, ManagerCard } from '../../types';
import { AvatarUploader } from './avatar-uploader';
import { MetaItem } from './profile-parts';
import { ProfileActions, type ProfileActionsProps } from './profile-actions';

function ContactChip({ href, icon: Icon, children }: { href?: string; icon: typeof MailIcon; children: ReactNode }) {
  const cls =
    'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-subtle px-2.5 text-xs text-foreground transition-colors';
  const body = (
    <>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <bdi dir="ltr" className="truncate tabular-nums">
        {children}
      </bdi>
    </>
  );
  return href ? (
    <a href={href} className={`${cls} hover:border-border-strong hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none`}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** Premium profile header card: cover band, avatar, names, meta, contact chips, actions and tab strip. */
export function ProfileHeader({
  employee,
  manager,
  managerLinkable,
  portal,
  showPortal,
  canEditAvatar,
  actions,
  tabs,
}: {
  employee: EmployeeRecord;
  manager: ManagerCard | null;
  /** Viewer may open the manager's profile. */
  managerLinkable: boolean;
  portal: PortalAccount | null;
  showPortal: boolean;
  canEditAvatar: boolean;
  actions: Omit<ProfileActionsProps, 'name' | 'employeeId' | 'employeeNumber' | 'archived'>;
  tabs: ReactNode;
}) {
  const t = useTranslations('employees');
  const locale = useLocale();
  const name = employeeDisplayName(employee, locale) || employee.employee_number || '—';
  const alt = employeeAlternateName(employee, locale);
  const job = employee.job_title ? localized(employee.job_title, 'name', locale) : '';
  const dept = employee.department ? localized(employee.department, 'name', locale) : '';
  const loc = employee.location ? localized(employee.location, 'name', locale) : '';
  const managerName = manager ? employeeDisplayName(manager, locale) : '';
  const archived = Boolean(employee.archived_at);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card" aria-labelledby="employee-name">
      <div
        aria-hidden
        className="h-16 sm:h-20"
        style={{
          backgroundImage:
            'radial-gradient(color-mix(in oklab, var(--primary) 14%, transparent) 1px, transparent 1px), linear-gradient(115deg, color-mix(in oklab, var(--primary) 16%, var(--card)) 0%, color-mix(in oklab, var(--primary) 6%, var(--card)) 55%, color-mix(in oklab, var(--secondary) 12%, var(--card)) 100%)',
          backgroundSize: '14px 14px, 100% 100%',
        }}
      />
      <div className="px-4 sm:px-6">
        {/* Name and actions start just below the cover band (never on top of it), whatever the name length. */}
        <div className="-mt-10 flex flex-col gap-3 sm:-mt-12 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <AvatarUploader
              employeeId={employee.id}
              name={name}
              src={employee.avatar_path ? fileRouteUrl('employee-documents', employee.avatar_path) : null}
              editable={canEditAvatar && !archived}
            />
            <div className="min-w-0 sm:pt-14">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1
                  id="employee-name"
                  title={name}
                  className="line-clamp-2 min-w-0 text-page-title-compact break-words text-foreground"
                >
                  {name}
                </h1>
                <StatusBadge domain="employment" status={employee.employment_status} />
                {archived ? (
                  <Badge variant="neutral" dot>
                    {t('directory.archived')}
                  </Badge>
                ) : null}
              </div>
              {alt ? <p className="truncate text-sm text-muted-foreground">{alt}</p> : null}
            </div>
          </div>
          <div className="shrink-0 lg:pt-14">
            <ProfileActions
              employeeId={employee.id}
              name={name}
              employeeNumber={employee.employee_number}
              archived={archived}
              {...actions}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-meta text-muted-foreground">
          <MetaItem icon={HashIcon}>
            {employee.employee_number ? (
              <bdi dir="ltr" className="font-medium text-foreground tabular-nums">
                {employee.employee_number}
              </bdi>
            ) : (
              t('profile.noNumber')
            )}
          </MetaItem>
          {job ? <MetaItem icon={BriefcaseIcon}>{job}</MetaItem> : null}
          {dept ? <MetaItem icon={Building2Icon}>{dept}</MetaItem> : null}
          {loc ? <MetaItem icon={MapPinIcon}>{loc}</MetaItem> : null}
          {manager ? (
            <MetaItem icon={UserRoundIcon}>
              {t('profile.reportsTo')}{' '}
              {managerLinkable ? (
                <Link href={`/employees/${manager.id}`} className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-4">
                  {managerName}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{managerName}</span>
              )}
            </MetaItem>
          ) : null}
        </div>

        {employee.company_email || employee.mobile || showPortal ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {employee.company_email ? (
              <ContactChip href={`mailto:${employee.company_email}`} icon={MailIcon}>
                {employee.company_email}
              </ContactChip>
            ) : null}
            {employee.mobile ? (
              <ContactChip href={`tel:${employee.mobile.replace(/\s+/g, '')}`} icon={PhoneIcon}>
                {employee.mobile}
              </ContactChip>
            ) : null}
            {showPortal ? (
              portal ? (
                <Link
                  href="?tab=overview#portal-access"
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-subtle px-2.5 text-xs text-foreground hover:border-border-strong hover:bg-accent"
                >
                  <KeyRoundIcon className="size-3.5 text-muted-foreground" aria-hidden />
                  <StatusBadge domain="profile" status={portal.status} size="sm" dot className="-me-1 bg-transparent px-0" />
                </Link>
              ) : (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-2.5 text-xs text-muted-foreground">
                  <KeyRoundIcon className="size-3.5" aria-hidden />
                  {t('profile.portal.none')}
                </span>
              )
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 px-2 sm:px-4">{tabs}</div>
    </section>
  );
}

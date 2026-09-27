import { ArchiveIcon, FilePenLineIcon, InfoIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { LinkTabs, type LinkTabItem } from '@/components/shared/link-tabs';
import { PageStack } from '@/components/shared/responsive-grid';
import { Button } from '@/components/ui/button';
import { requireAccess } from '@/lib/auth/guards';
import { formatDate, todayIso } from '@/lib/dates';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { pageMetadata } from '@/lib/metadata';
import { checkAccess } from '@/lib/permissions';
import { EmployeeActivityTab } from '@/features/audit/components/employee-activity-tab';
import { EmployeeCertificatesTab } from '@/features/certificates/components/employee-certificates-tab';
import { EmployeeDocumentsTab } from '@/features/documents/components/employee-documents-tab';
import { EmployeeLeaveTab } from '@/features/leave/components/employee-leave-tab';
import { EmployeeRequestsTab } from '@/features/requests/components/employee-requests-tab';
import { isUuid } from '@/features/employees/directory-params';
import { DependentsManager } from '@/features/employees/components/profile/dependents-manager';
import { EmploymentTab } from '@/features/employees/components/profile/employment-tab';
import { InsuranceManager } from '@/features/employees/components/profile/insurance-manager';
import { OverviewTab } from '@/features/employees/components/profile/overview-tab';
import { PersonalTab } from '@/features/employees/components/profile/personal-tab';
import { ProfileHeader } from '@/features/employees/components/profile/profile-header';
import { TabSkeleton } from '@/features/employees/components/profile/tab-skeleton';
import {
  getChildCounts,
  getDependents,
  getEmployeeRecord,
  getInsurance,
  getManagerCard,
  getOrgCurrency,
  getPortalAccount,
  getViewer,
} from '@/features/employees/queries';
import { PROFILE_TABS, type ProfileTab } from '@/features/employees/types';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('employees.title');

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAccess(ROUTE_ACCESS['/employees/[id]']);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const viewer = await getViewer(ctx);

  const loaded = await getEmployeeRecord(id, viewer);
  if (!loaded) {
    // Org viewers see every row: a miss means the record doesn't exist. Anyone else simply may not see it.
    if (viewer.isOrgViewer) notFound();
    forbidden();
  }
  const { employee, mode } = loaded;
  const org = mode === 'org';
  const self = mode === 'self';
  const oc = viewer.orgCan;

  const caps = {
    edit: org && oc('employees.edit'),
    personal: org ? oc('personal_data.view') : self,
    bank: org ? oc('bank.view') : self,
    dependents: org ? oc('personal_data.view') : self,
    dependentsEdit: org && (oc('personal_data.edit') || oc('personal_data.create')),
    insurance: org ? oc('insurance.view') : self,
    insuranceEdit: org && (oc('insurance.edit') || oc('insurance.create')),
    leave: org ? oc('leave.view') : true,
    requests: org ? oc('requests.view') : true,
    documents: org ? oc('documents.view') : self,
    documentsUpload: org ? oc('documents.create') : self,
    certificates: org ? oc('certificates.view') : self,
    activity: org && oc('audit.view'),
    portal: org && ctx.isHR,
    linkEmployees: checkAccess(ctx, ROUTE_ACCESS['/employees']),
  };

  const visible: Record<ProfileTab, boolean> = {
    overview: true,
    employment: true,
    personal: caps.personal || caps.bank,
    leave: caps.leave,
    documents: caps.documents,
    requests: caps.requests,
    certificates: caps.certificates,
    dependents: caps.dependents,
    insurance: caps.insurance,
    activity: caps.activity,
  };
  const requested = typeof sp.tab === 'string' ? (sp.tab as ProfileTab) : 'overview';
  const tab: ProfileTab = PROFILE_TABS.includes(requested) && visible[requested] ? requested : 'overview';

  const [t, manager, portal, counts, currency] = await Promise.all([
    getTranslations('employees'),
    employee.manager_id ? getManagerCard(id) : Promise.resolve(null),
    caps.portal ? getPortalAccount(id) : Promise.resolve(null),
    getChildCounts(id, { dependents: caps.dependents, insurance: caps.insurance }),
    getOrgCurrency(),
  ]);

  const name = employeeDisplayName(employee, ctx.locale) || employee.employee_number || '—';
  const archived = Boolean(employee.archived_at);
  const today = todayIso();

  const tabItems: LinkTabItem[] = PROFILE_TABS.filter((k) => visible[k]).map((k) => ({
    value: k,
    label: t(`profile.tabs.${k}`),
    count: k === 'dependents' ? counts.dependents : k === 'insurance' ? counts.insurance : undefined,
  }));

  const requestHref = org && oc('requests.create') ? `/requests/new?employee=${id}` : self ? '/requests/new' : null;

  let content: ReactNode;
  switch (tab) {
    case 'employment':
      content = <EmploymentTab employee={employee} manager={manager} locale={ctx.locale} showImported={org} linkEmployees={caps.linkEmployees} />;
      break;
    case 'personal':
      content = (
        <PersonalTab
          employee={employee}
          locale={ctx.locale}
          caps={{ personal: caps.personal, bank: caps.bank, auditedReveal: !self }}
          currency={currency}
        />
      );
      break;
    case 'leave':
      content = <EmployeeLeaveTab employeeId={id} />;
      break;
    case 'documents':
      content = <EmployeeDocumentsTab employeeId={id} />;
      break;
    case 'requests':
      content = <EmployeeRequestsTab employeeId={id} />;
      break;
    case 'certificates':
      content = <EmployeeCertificatesTab employeeId={id} />;
      break;
    case 'dependents':
      content = <DependentsTabContent employeeId={id} canEdit={caps.dependentsEdit && !archived} today={today} />;
      break;
    case 'insurance':
      content = <InsuranceTabContent employeeId={id} employeeName={name} canEdit={caps.insuranceEdit && !archived} today={today} />;
      break;
    case 'activity':
      content = <EmployeeActivityTab employeeId={id} />;
      break;
    default:
      content = (
        <OverviewTab
          employee={employee}
          manager={manager}
          locale={ctx.locale}
          caps={{
            compliance: org ? caps.personal : self,
            insurance: caps.insurance,
            leave: caps.leave,
            requests: caps.requests,
            reports: org || mode === 'team' || self,
            portal: caps.portal,
            linkEmployees: caps.linkEmployees,
          }}
        />
      );
  }

  return (
    <PageStack>
      <BreadcrumbLabel label={name} />
      <ProfileHeader
        employee={employee}
        manager={manager}
        managerLinkable={caps.linkEmployees && org}
        portal={portal}
        showPortal={caps.portal}
        canEditAvatar={caps.edit}
        actions={{
          canEdit: caps.edit,
          requestHref,
          canUploadDocument: caps.documentsUpload && !archived,
          portalHref: caps.portal ? '?tab=overview#portal-access' : null,
        }}
        tabs={<LinkTabs items={tabItems} value={tab} aria-label={t('profile.tabsLabel')} className="border-b-0" />}
      />

      {archived ? (
        <Notice icon={<ArchiveIcon />} tone="neutral">
          {t('archive.banner', { date: formatDate(employee.archived_at, ctx.locale) })}
        </Notice>
      ) : null}
      {self && tab === 'overview' ? (
        <Notice
          icon={<InfoIcon />}
          tone="info"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/requests/new?type=employee_info_update">
                <FilePenLineIcon />
                {t('profile.requestUpdate')}
              </Link>
            </Button>
          }
        >
          {t('profile.selfNotice')}
        </Notice>
      ) : null}

      <Suspense key={tab} fallback={<TabSkeleton />}>
        {content}
      </Suspense>
    </PageStack>
  );
}

function Notice({ icon, tone, children, action }: { icon: ReactNode; tone: 'info' | 'neutral'; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={
        tone === 'info'
          ? 'flex flex-col gap-3 rounded-lg border border-info/25 bg-info-soft/60 px-4 py-3 text-meta text-info-soft-foreground sm:flex-row sm:items-center'
          : 'flex flex-col gap-3 rounded-lg border border-border bg-muted/60 px-4 py-3 text-meta text-muted-foreground sm:flex-row sm:items-center'
      }
      role="status"
    >
      <span className="flex min-w-0 flex-1 items-start gap-2.5 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        <span>{children}</span>
      </span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  );
}

async function DependentsTabContent({ employeeId, canEdit, today }: { employeeId: string; canEdit: boolean; today: string }) {
  const dependents = await getDependents(employeeId);
  return <DependentsManager employeeId={employeeId} dependents={dependents} canEdit={canEdit} today={today} />;
}

async function InsuranceTabContent({
  employeeId,
  employeeName,
  canEdit,
  today,
}: {
  employeeId: string;
  employeeName: string;
  canEdit: boolean;
  today: string;
}) {
  const [policies, dependents] = await Promise.all([getInsurance(employeeId), getDependents(employeeId)]);
  return (
    <InsuranceManager employeeId={employeeId} employeeName={employeeName} policies={policies} dependents={dependents} canEdit={canEdit} today={today} />
  );
}

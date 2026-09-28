import { BriefcaseBusinessIcon, Building2Icon, ShieldCheckIcon, UserRoundIcon, UsersIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { DashboardHeader } from '@/features/dashboard/components/dashboard-header';
import { getDocumentAccess } from '@/features/documents/access';
import { DashboardSection, Widget, WidgetEmpty, WidgetSkeleton } from '@/features/dashboard/components/widget-parts';
import { ApprovalQueueWidget } from '@/features/dashboard/widgets/approval-queue';
import { AuditActivityWidget } from '@/features/dashboard/widgets/audit-activity';
import { ComplianceRow } from '@/features/dashboard/widgets/compliance-row';
import { EmployeeKpis, KpiRowSkeleton } from '@/features/dashboard/widgets/employee-kpis';
import { WorkforceOverviewWidget } from '@/features/dashboard/widgets/employee-overview';
import { ExpiryAlertsWidget } from '@/features/dashboard/widgets/expiry-alerts';
import { HrKpis } from '@/features/dashboard/widgets/hr-kpis';
import { LatestNotificationsWidget } from '@/features/dashboard/widgets/latest-notifications';
import { ManagerKpis } from '@/features/dashboard/widgets/manager-kpis';
import { OrgHealthWidget } from '@/features/dashboard/widgets/org-health';
import { PendingRegistrationsWidget } from '@/features/dashboard/widgets/pending-registrations';
import { RecentActivityWidget } from '@/features/dashboard/widgets/recent-activity';
import { RecentImportsWidget } from '@/features/dashboard/widgets/recent-imports';
import { RecentRequestsWidget } from '@/features/dashboard/widgets/recent-requests';
import { RequestQueueWidget } from '@/features/dashboard/widgets/request-queue';
import { RolesSummaryWidget } from '@/features/dashboard/widgets/roles-summary';
import { TeamLeaveCalendarWidget } from '@/features/dashboard/widgets/team-leave-calendar';
import { TeamRequestsWidget } from '@/features/dashboard/widgets/team-requests';
import { UpcomingLeaveWidget } from '@/features/dashboard/widgets/upcoming-leave';
import { UsersSummaryWidget } from '@/features/dashboard/widgets/users-summary';
import { requireAccess } from '@/lib/auth/guards';
import { todayIso } from '@/lib/i18n/date-format';
import { pageMetadata } from '@/lib/metadata';
import { can, checkAccess } from '@/lib/permissions';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('dashboard.title');

function ComplianceSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <WidgetSkeleton key={i} rows={0} className="min-h-[6.5rem]" />
      ))}
    </div>
  );
}

/**
 * Role-aware dashboard (PRODUCT-SPEC §16). Sections appear by the caller's scope:
 * super admin → Administration; HR (org employees/requests view) → Organization; managers (with
 * direct reports) → My team; anyone linked to an employee → My workspace. Every widget streams in
 * its own Suspense boundary; numbers come from `dashboard_stats()` + targeted RLS queries.
 */
export default async function DashboardPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/dashboard']);
  const t = await getTranslations('dashboard');
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const nowIso = new Date().toISOString();

  const view = {
    admin: ctx.isSuperAdmin,
    hr: ctx.isHR && (can(ctx, 'employees.view') || can(ctx, 'requests.view')),
    manager: Boolean(ctx.employee) && ctx.directReportsCount > 0,
    employee: Boolean(ctx.employee),
  };
  const canAudit = can(ctx, 'audit.view');
  // Compliance counters / expiry alerts are organization-wide document data (org `documents.view`).
  const canDocuments = view.hr ? (await getDocumentAccess(ctx)).view : false;
  const multi = [view.admin, view.hr, view.manager, view.employee].filter(Boolean).length > 1;

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-4">
      <DashboardHeader ctx={ctx} today={today} view={view} />

      {view.admin ? (
        <DashboardSection title={t('sections.administration.title')} description={t('sections.administration.description')} icon={ShieldCheckIcon}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Suspense fallback={<WidgetSkeleton rows={6} />}>
                <OrgHealthWidget year={year} canSetup={checkAccess(ctx, ROUTE_ACCESS['/setup'])} />
              </Suspense>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-1">
              <Suspense fallback={<WidgetSkeleton rows={3} chart />}>
                <UsersSummaryWidget />
              </Suspense>
              <Suspense fallback={<WidgetSkeleton rows={2} />}>
                <PendingRegistrationsWidget />
              </Suspense>
            </div>
          </div>
          <div className={canAudit ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>
            <Suspense fallback={<WidgetSkeleton rows={4} />}>
              <RolesSummaryWidget />
            </Suspense>
            <Suspense fallback={<WidgetSkeleton rows={4} />}>
              <RecentImportsWidget />
            </Suspense>
            {canAudit ? (
              <div className="md:col-span-2 xl:col-span-1">
                <Suspense fallback={<WidgetSkeleton rows={4} chart />}>
                  <AuditActivityWidget />
                </Suspense>
              </div>
            ) : null}
          </div>
        </DashboardSection>
      ) : null}

      {view.hr ? (
        <DashboardSection
          title={t('sections.organization.title')}
          description={multi ? t('sections.organization.description') : undefined}
          icon={Building2Icon}
        >
          <Suspense fallback={<KpiRowSkeleton count={5} />}>
            <HrKpis />
          </Suspense>
          {canDocuments ? (
            <Suspense fallback={<ComplianceSkeleton />}>
              <ComplianceRow />
            </Suspense>
          ) : null}
          {canDocuments ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Suspense fallback={<WidgetSkeleton rows={6} />}>
                  <RequestQueueWidget />
                </Suspense>
              </div>
              <Suspense fallback={<WidgetSkeleton rows={6} />}>
                <ExpiryAlertsWidget />
              </Suspense>
            </div>
          ) : (
            <Suspense fallback={<WidgetSkeleton rows={6} />}>
              <RequestQueueWidget />
            </Suspense>
          )}
          {canAudit ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Suspense fallback={<WidgetSkeleton rows={5} chart />}>
                <WorkforceOverviewWidget />
              </Suspense>
              <div className="lg:col-span-2">
                <Suspense fallback={<WidgetSkeleton rows={6} />}>
                  <RecentActivityWidget />
                </Suspense>
              </div>
            </div>
          ) : (
            <Suspense fallback={<WidgetSkeleton rows={4} chart />}>
              <WorkforceOverviewWidget split />
            </Suspense>
          )}
        </DashboardSection>
      ) : null}

      {view.manager && ctx.employee ? (
        <DashboardSection title={t('sections.team.title')} description={multi ? t('sections.team.description') : undefined} icon={UsersIcon}>
          <Suspense fallback={<KpiRowSkeleton />}>
            <ManagerKpis />
          </Suspense>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Suspense fallback={<WidgetSkeleton rows={5} />}>
                <ApprovalQueueWidget userId={ctx.user.id} />
              </Suspense>
            </div>
            <Suspense fallback={<WidgetSkeleton rows={5} />}>
              <TeamRequestsWidget employeeId={ctx.employee.id} />
            </Suspense>
          </div>
          <Suspense fallback={<WidgetSkeleton rows={3} chart />}>
            <TeamLeaveCalendarWidget employeeId={ctx.employee.id} today={today} />
          </Suspense>
        </DashboardSection>
      ) : null}

      {view.employee && ctx.employee ? (
        <DashboardSection
          title={multi ? t('sections.workspace.title') : t('sections.workspace.titleSingle')}
          description={multi ? t('sections.workspace.description') : undefined}
          icon={multi ? UserRoundIcon : BriefcaseBusinessIcon}
        >
          <Suspense fallback={<KpiRowSkeleton />}>
            <EmployeeKpis employeeId={ctx.employee.id} />
          </Suspense>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Suspense fallback={<WidgetSkeleton rows={5} />}>
              <RecentRequestsWidget employeeId={ctx.employee.id} userId={ctx.user.id} />
            </Suspense>
            <Suspense fallback={<WidgetSkeleton rows={4} />}>
              <UpcomingLeaveWidget employeeId={ctx.employee.id} today={today} />
            </Suspense>
            <div className="md:col-span-2 xl:col-span-1">
              <Suspense fallback={<WidgetSkeleton rows={5} />}>
                <LatestNotificationsWidget nowIso={nowIso} />
              </Suspense>
            </div>
          </div>
        </DashboardSection>
      ) : null}

      {!view.employee && !view.admin && !view.hr ? (
        <DashboardSection title={t('sections.workspace.titleSingle')} icon={BriefcaseBusinessIcon}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Widget title={t('sections.workspace.title')} icon={UserRoundIcon}>
              <WidgetEmpty icon={UserRoundIcon} title={t('sections.workspace.notLinkedTitle')} description={t('sections.workspace.notLinkedDescription')} />
            </Widget>
            <Suspense fallback={<WidgetSkeleton rows={5} />}>
              <LatestNotificationsWidget nowIso={nowIso} />
            </Suspense>
          </div>
        </DashboardSection>
      ) : null}
    </div>
  );
}

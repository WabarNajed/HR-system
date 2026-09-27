import { AlarmClockIcon, ArchiveIcon, HourglassIcon, KeyRoundIcon, PalmtreeIcon, UploadIcon, UserPlusIcon, UsersIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { todayIso } from '@/lib/dates';
import { parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { EmployeesTable } from '@/features/employees/components/employees-table';
import { DIRECTORY_LIST_OPTIONS } from '@/features/employees/directory-params';
import { fetchDirectoryPage, getDirectoryFilterOptions, getDirectoryStats, getViewer } from '@/features/employees/queries';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('employees.title');

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/employees']);
  const [viewer, sp, t] = await Promise.all([getViewer(ctx), searchParams, getTranslations()]);
  const params = parseListParams(sp, DIRECTORY_LIST_OPTIONS);
  const supabase = await createClient();

  const [page, stats, options] = await Promise.all([
    fetchDirectoryPage(supabase, params, viewer),
    getDirectoryStats(viewer),
    getDirectoryFilterOptions(ctx.locale),
  ]);

  const orgView = viewer.isOrgViewer;
  const nf = new Intl.NumberFormat(ctx.locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US');
  const n = (v: number | undefined) => nf.format(v ?? 0);
  const canCreate = viewer.orgCan('employees.create');
  const canImport = canCreate || can(ctx, 'settings.administer');

  const actions = orgView ? (
    <>
      {canImport ? (
        <Button asChild variant="outline">
          <Link href="/admin/data-management?type=employees">
            <UploadIcon />
            {t('employees.actions.import')}
          </Link>
        </Button>
      ) : null}
      {canCreate ? (
        <Button asChild>
          <Link href="/employees/new">
            <UserPlusIcon />
            {t('employees.actions.add')}
          </Link>
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <PageStack>
      <PageHeader
        title={orgView ? t('employees.title') : t('employees.directory.teamTitle')}
        description={orgView ? t('employees.directory.description') : t('employees.directory.teamDescription')}
        actions={actions}
      />

      {stats ? (
        orgView ? (
          <KpiGrid count={5} className="xl:grid-cols-5">
            <StatCard
              label={t('employees.kpi.active')}
              value={n(stats.active)}
              icon={UsersIcon}
              tone="primary"
              hint={t('employees.kpi.activeHint', { total: stats.total })}
              href="/employees?status=active,probation,on_leave"
            />
            <StatCard
              label={t('employees.kpi.probation')}
              value={n(stats.probation)}
              icon={HourglassIcon}
              tone="info"
              hint={t('employees.kpi.probationHint')}
              href="/employees?status=probation"
            />
            <StatCard
              label={t('employees.kpi.iqamaExpiring')}
              value={n(stats.iqama_expiring_30)}
              icon={AlarmClockIcon}
              tone={stats.iqama_expiring_30 > 0 || stats.iqama_expired > 0 ? 'warning' : 'success'}
              hint={t('employees.kpi.iqamaExpiringHint', { count: stats.iqama_expired })}
              href="/employees?iqama=within30&sort=iqama_expiry_date&dir=asc"
            />
            <StatCard
              label={t('employees.kpi.withoutPortal')}
              value={n(stats.without_portal)}
              icon={KeyRoundIcon}
              tone="secondary"
              hint={t('employees.kpi.withoutPortalHint')}
              href="/employees?portal=without"
            />
            <StatCard
              label={t('employees.kpi.archived')}
              value={n(stats.archived)}
              icon={ArchiveIcon}
              tone="neutral"
              hint={t('employees.kpi.archivedHint')}
              href="/employees?archived=only"
              className="col-span-2 lg:col-span-1"
            />
          </KpiGrid>
        ) : (
          <KpiGrid count={3}>
            <StatCard label={t('employees.kpi.teamSize')} value={n(stats.total)} icon={UsersIcon} tone="primary" hint={t('employees.kpi.teamSizeHint')} />
            <StatCard
              label={t('employees.kpi.probation')}
              value={n(stats.probation)}
              icon={HourglassIcon}
              tone="info"
              hint={t('employees.kpi.probationHint')}
              href="/employees?status=probation"
            />
            <StatCard
              label={t('employees.kpi.onLeave')}
              value={n(stats.on_leave)}
              icon={PalmtreeIcon}
              tone="secondary"
              hint={t('employees.kpi.onLeaveHint')}
              href="/employees?status=on_leave"
              className="col-span-2 lg:col-span-1"
            />
          </KpiGrid>
        )
      ) : null}

      <EmployeesTable
        rows={page.rows}
        total={page.total}
        options={options}
        orgView={orgView}
        canEdit={viewer.orgCan('employees.edit')}
        canCreate={canCreate}
        canRequestFor={viewer.orgCan('requests.create')}
        canExport={orgView && can(ctx, 'employees.export')}
        relatedExports={{ dependents: viewer.orgCan('personal_data.view'), insurance: viewer.orgCan('insurance.view') }}
        sensitiveSearch={orgView && viewer.orgCan('personal_data.view')}
        today={todayIso()}
      />
    </PageStack>
  );
}

import { AlarmClockIcon, CheckCheckIcon, FolderOpenIcon, InboxIcon, PlusIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { Button } from '@/components/ui/button';
import { RequestsTable } from '@/features/requests/components/requests-table';
import { parseRequestTab, REQUEST_FILTER_KEYS, REQUEST_SORTS, type RequestTab } from '@/features/requests/constants';
import {
  countRequestTabs,
  getRequestAccess,
  listRequests,
  loadDepartments,
  loadEmployeeOptions,
  loadRequestHandlers,
  loadRequestTypes,
  requestKpis,
  subtypeMap,
} from '@/features/requests/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatInteger } from '@/lib/format';
import { mergeSearchParams, parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { can, checkAccess } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

/** Same set as the "Open requests" KPI (requestKpis: open statuses + returned), as status filter values. */
const OPEN_FILTER = ['pending_manager_approval', 'pending_hr_review', 'returned', 'approved', 'in_progress'] as const;

export const generateMetadata = (): Promise<Metadata> => pageMetadata('requests.title');

/** HR Request Center: KPIs, status tabs and the server-side request table (RLS-scoped per role). */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/requests']);
  const sp = await searchParams;
  const t = await getTranslations('requests');
  const tab = parseRequestTab(sp.tab);
  const params = parseListParams(sp, {
    defaultSort: 'created_at',
    defaultDir: 'desc',
    allowedSorts: REQUEST_SORTS,
    filterKeys: REQUEST_FILTER_KEYS,
  });

  const supabase = await createClient();
  const [access, types] = await Promise.all([getRequestAccess(supabase, ctx.user.id), loadRequestTypes(supabase, { withFields: false })]);
  const typeIdsByKey = new Map(types.map((x) => [x.key, x.id]));
  const seesOthers = access.orgView || ctx.isManager || access.roleStepIds.length > 0;
  const canCreate = can(ctx, 'requests.create') || can(ctx, 'leave.create') || access.orgCreate;

  const [list, counts, kpis, departments, employees, handlers] = await Promise.all([
    listRequests(supabase, params, { tab, access, typeIdsByKey, subtypes: subtypeMap(types), locale: ctx.locale }),
    countRequestTabs(supabase),
    requestKpis(supabase, access),
    seesOthers ? loadDepartments(supabase) : Promise.resolve(null),
    seesOthers ? loadEmployeeOptions(supabase) : Promise.resolve(null),
    access.orgView ? loadRequestHandlers(supabase) : Promise.resolve(null),
  ]);

  // Stale `?page=` past the last page (bookmark, rows moved to another tab): go to the last page.
  const lastPage = Math.max(1, Math.ceil(list.total / params.pageSize));
  if (!list.rows.length && list.total > 0 && params.page > lastPage) {
    redirect(`/requests?${mergeSearchParams(sp, { page: lastPage > 1 ? lastPage : null }).toString()}`);
  }

  const locale = ctx.locale;
  const approvalsHref = checkAccess(ctx, ROUTE_ACCESS['/approvals']) ? '/approvals' : undefined;
  const awaiting = kpis.awaitingApprovals + kpis.awaitingReturned;
  const showRequesterTabs = canCreate || counts.drafts > 0 || counts.returned > 0;
  const tabs: { value: RequestTab; label: string; count: number }[] = [
    { value: 'all', label: t('tabs.all'), count: counts.all },
    { value: 'pending', label: t('tabs.pending'), count: counts.pending },
    { value: 'in_progress', label: t('tabs.inProgress'), count: counts.in_progress },
    { value: 'completed', label: t('tabs.completed'), count: counts.completed },
    { value: 'rejected', label: t('tabs.rejected'), count: counts.rejected },
    ...(showRequesterTabs
      ? [
          { value: 'returned' as const, label: t('tabs.returned'), count: counts.returned },
          { value: 'drafts' as const, label: t('tabs.drafts'), count: counts.drafts },
        ]
      : []),
  ];

  return (
    <PageStack>
      <PageHeader
        title={t('title')}
        description={access.orgView ? t('descriptionHr') : seesOthers ? t('descriptionManager') : t('descriptionEmployee')}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/requests/new">
                <PlusIcon />
                {t('newRequest')}
              </Link>
            </Button>
          ) : null
        }
      />

      <KpiGrid>
        <StatCard
          label={t('kpi.open')}
          value={formatInteger(kpis.open, locale)}
          icon={FolderOpenIcon}
          tone="primary"
          hint={t('kpi.openHint', { count: kpis.dueSoon })}
          href={`/requests?status=${OPEN_FILTER.join(',')}`}
        />
        <StatCard
          label={t('kpi.awaiting')}
          value={formatInteger(awaiting, locale)}
          icon={InboxIcon}
          tone={awaiting > 0 ? 'warning' : 'neutral'}
          hint={t('kpi.awaitingHint', { approvals: kpis.awaitingApprovals, returned: kpis.awaitingReturned })}
          href={kpis.awaitingApprovals > 0 && approvalsHref ? approvalsHref : '/requests?tab=returned'}
        />
        <StatCard
          label={t('kpi.overdue')}
          value={formatInteger(kpis.overdue, locale)}
          icon={AlarmClockIcon}
          tone={kpis.overdue > 0 ? 'danger' : 'success'}
          hint={kpis.overdue > 0 ? t('kpi.overdueHint') : t('kpi.overdueNone')}
          href="/requests?sla=overdue"
        />
        <StatCard
          label={t('kpi.completedMonth')}
          value={formatInteger(kpis.completedThisMonth, locale)}
          icon={CheckCheckIcon}
          tone="success"
          hint={t('kpi.completedMonthHint')}
          href="/requests?tab=completed"
        />
      </KpiGrid>

      <div className="flex min-w-0 flex-col gap-3">
        <LinkTabs items={tabs} aria-label={t('tabs.label')} />
        <RequestsTable
          rows={list.rows}
          total={list.total}
          tab={tab}
          access={access}
          showEmployee={seesOthers}
          exportable={can(ctx, 'requests.export')}
          canCreate={canCreate}
          options={{
            types: types.map((x) => ({ key: x.key, name_ar: x.name_ar, name_en: x.name_en })),
            departments,
            employees,
            handlers,
          }}
        />
      </div>
    </PageStack>
  );
}

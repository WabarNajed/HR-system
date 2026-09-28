import { AlarmClockIcon, CheckCheckIcon, HourglassIcon, InboxIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { ApprovalsTable, type ApprovalsTab } from '@/features/approvals/components/approvals-table';
import {
  countMyDecisions,
  getRequestAccess,
  listMyDecisions,
  listRequests,
  loadDepartments,
  loadEmployeeFilterOptions,
  loadRequestTypes,
  monthStartIso,
  requestCenterCounts,
  subtypeMap,
} from '@/features/requests/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatInteger } from '@/lib/format';
import { mergeSearchParams, parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('approvals.title');

const TABS: ApprovalsTab[] = ['pending', 'approved', 'rejected'];

/** Approvals: the viewer's decision queue (manager steps, HR queue, role queues) and past decisions. */
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/approvals']);
  const sp = await searchParams;
  const t = await getTranslations('approvals');
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: ApprovalsTab = TABS.includes(rawTab as ApprovalsTab) ? (rawTab as ApprovalsTab) : 'pending';
  const params = parseListParams(sp, {
    defaultSort: tab === 'pending' ? 'due_at' : 'decided_at',
    defaultDir: tab === 'pending' ? 'asc' : 'desc',
    allowedSorts: tab === 'pending' ? ['due_at', 'submitted_at', 'request_number'] : ['decided_at'],
    filterKeys: ['type', 'employee', 'department', 'sla'],
  });

  const supabase = await createClient();
  const [access, types] = await Promise.all([getRequestAccess(supabase, ctx.user.id), loadRequestTypes(supabase, { withFields: false })]);
  const typeIdsByKey = new Map(types.map((x) => [x.key, x.id]));
  const subtypes = subtypeMap(types);
  const now = new Date();

  const [list, { queue }, approvedCount, rejectedCount, decidedMonth, departments, employees] = await Promise.all([
    tab === 'pending'
      ? listRequests(supabase, params, { tab: 'pending', access, typeIdsByKey, pendingForMe: true, subtypes, locale: ctx.locale })
      : listMyDecisions(supabase, params, {
          decisions: tab === 'approved' ? ['approved'] : ['rejected', 'returned'],
          access,
          typeIdsByKey,
          subtypes,
          locale: ctx.locale,
        }),
    requestCenterCounts(supabase, now),
    countMyDecisions(supabase, ctx.user.id, ['approved']),
    countMyDecisions(supabase, ctx.user.id, ['rejected', 'returned']),
    countMyDecisions(supabase, ctx.user.id, ['approved', 'rejected', 'returned'], monthStartIso(now)),
    loadDepartments(supabase),
    loadEmployeeFilterOptions(supabase, params.filters.employee ?? [], ctx.locale),
  ]);
  const { pending: pendingCount, overdue: overdueCount, dueSoon: dueSoonCount } = queue;

  // Stale `?page=` past the last page (e.g. the queue shrank after decisions): go to the last page.
  const lastPage = Math.max(1, Math.ceil(list.total / params.pageSize));
  if (!list.rows.length && list.total > 0 && params.page > lastPage) {
    redirect(`/approvals?${mergeSearchParams(sp, { page: lastPage > 1 ? lastPage : null }).toString()}`);
  }

  const locale = ctx.locale;
  return (
    <PageStack>
      <PageHeader title={t('title')} description={access.orgApprove ? t('descriptionHr') : t('descriptionManager')} />

      <KpiGrid>
        <StatCard label={t('kpi.pending')} value={formatInteger(pendingCount, locale)} icon={InboxIcon} tone={pendingCount ? 'warning' : 'neutral'} hint={t('kpi.pendingHint')} href="/approvals" />
        <StatCard
          label={t('kpi.overdue')}
          value={formatInteger(overdueCount, locale)}
          icon={AlarmClockIcon}
          tone={overdueCount ? 'danger' : 'success'}
          hint={overdueCount ? t('kpi.overdueHint') : t('kpi.overdueNone')}
          href="/approvals?sla=overdue"
        />
        <StatCard label={t('kpi.dueSoon')} value={formatInteger(dueSoonCount, locale)} icon={HourglassIcon} tone={dueSoonCount ? 'warning' : 'neutral'} hint={t('kpi.dueSoonHint')} href="/approvals?sla=due_soon" />
        <StatCard label={t('kpi.decidedMonth')} value={formatInteger(decidedMonth, locale)} icon={CheckCheckIcon} tone="success" hint={t('kpi.decidedMonthHint')} href="/approvals?tab=approved" />
      </KpiGrid>

      <div className="flex min-w-0 flex-col gap-3">
        <LinkTabs
          aria-label={t('tabs.label')}
          items={[
            { value: 'pending', label: t('tabs.pending'), count: pendingCount },
            { value: 'approved', label: t('tabs.approved'), count: approvedCount },
            { value: 'rejected', label: t('tabs.rejected'), count: rejectedCount },
          ]}
        />
        <ApprovalsTable
          key={tab}
          tab={tab}
          rows={list.rows}
          total={list.total}
          access={access}
          options={{
            types: types.map((x) => ({ key: x.key, name_ar: x.name_ar, name_en: x.name_en })),
            departments,
            employees: employees.options,
          }}
        />
      </div>
    </PageStack>
  );
}

import { CalendarRangeIcon, InboxIcon, PartyPopperIcon, TagsIcon, WalletCardsIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DataTableSkeleton } from '@/components/data-table';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/shared/responsive-grid';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { LeaveSummaryCards } from '@/features/leave/components/leave-summary-cards';
import { BalancesTab, CalendarTab, HolidaysTab, RequestsTab, TypesTab, type TabProps } from '@/features/leave/components/leave-tabs';
import { RequestLeaveButton } from '@/features/leave/components/leave-requests-table';
import { getLeaveAccess, getLeaveOrgSettings, getLeaveSummary } from '@/features/leave/queries';
import { requireAccess } from '@/lib/auth/guards';
import { resolveLocale } from '@/lib/i18n/config';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('leave.title');

const TABS = ['requests', 'balances', 'calendar', 'types', 'holidays'] as const;
type Tab = (typeof TABS)[number];

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/leave']);
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as Tab) : 'requests';

  const [access, settings, t] = await Promise.all([getLeaveAccess(ctx), getLeaveOrgSettings(), getTranslations('leave')]);
  const summary = await getLeaveSummary(access, settings);
  const locale = resolveLocale(ctx.locale);
  const props: TabProps = { sp, ctx, access, settings, locale };

  const content = {
    requests: <RequestsTab {...props} />,
    balances: <BalancesTab {...props} />,
    calendar: <CalendarTab {...props} />,
    types: <TypesTab {...props} />,
    holidays: <HolidaysTab {...props} />,
  }[tab];

  return (
    <PageStack>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<RequestLeaveButton canRequest={access.canRequest} reason={t('actions.requestLeaveDisabled')} />}
      />
      <LeaveSummaryCards summary={summary} year={settings.year} />
      <div className="flex flex-col gap-4">
        <LinkTabs
          aria-label={t('title')}
          value={tab}
          items={[
            { value: 'requests', label: t('tabs.requests'), icon: <InboxIcon />, count: summary.pending || null },
            { value: 'balances', label: t('tabs.balances'), icon: <WalletCardsIcon /> },
            { value: 'calendar', label: t('tabs.calendar'), icon: <CalendarRangeIcon /> },
            { value: 'types', label: t('tabs.types'), icon: <TagsIcon /> },
            { value: 'holidays', label: t('tabs.holidays'), icon: <PartyPopperIcon /> },
          ]}
        />
        <Suspense key={tab} fallback={<TabSkeleton tab={tab} />}>
          {content}
        </Suspense>
      </div>
    </PageStack>
  );
}

function TabSkeleton({ tab }: { tab: Tab }) {
  if (tab === 'calendar') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="grid h-[34rem] grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="bg-card p-2">
              <div className="size-5 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return <DataTableSkeleton columns={tab === 'balances' ? 8 : 6} rows={8} avatar={tab === 'requests' || tab === 'balances'} />;
}

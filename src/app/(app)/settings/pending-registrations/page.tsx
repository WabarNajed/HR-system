import { ClockIcon, HourglassIcon, MessageCircleQuestionIcon, UserCheckIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { RegistrationsView } from '@/features/users/components/registrations-view';
import { getRegistration, getRegistrationStats, listRegistrations, listRoles, REJECTED_WINDOW_DAYS, userAbilities } from '@/features/users/queries';
import { REGISTRATION_TABS, type RegistrationTab } from '@/features/users/types';
import { requireAccess } from '@/lib/auth/guards';
import { daysBetween } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.pendingRegistrations');

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Settings › Pending registrations: review self-registrations (approve / reject / request info). */
export default async function PendingRegistrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/pending-registrations']);
  const sp = await searchParams;
  const rawTab = first(sp.tab);
  const tab: RegistrationTab = REGISTRATION_TABS.includes(rawTab as RegistrationTab) ? (rawTab as RegistrationTab) : 'pending';
  const reviewId = first(sp.review);
  const validReview = reviewId && /^[0-9a-f-]{36}$/i.test(reviewId) ? reviewId : null;

  const [t, list, stats, roles, review] = await Promise.all([
    getTranslations('users.registrations'),
    listRegistrations(tab, sp),
    getRegistrationStats(),
    listRoles(),
    validReview ? getRegistration(validReview) : Promise.resolve(null),
  ]);
  const abilities = userAbilities(ctx);
  const n = (v: number) => formatInteger(v, ctx.locale);
  const oldestDays = stats.oldestPendingAt ? Math.max(0, daysBetween(stats.oldestPendingAt.slice(0, 10), new Date().toISOString().slice(0, 10)) ?? 0) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('title')} description={t('description')} />
      <KpiGrid>
        <StatCard label={t('stats.pending')} value={n(stats.pending)} icon={HourglassIcon} tone={stats.pending ? 'warning' : 'neutral'} hint={t('stats.pendingHint')} />
        <StatCard
          label={t('stats.infoRequested')}
          value={n(stats.infoRequested)}
          icon={MessageCircleQuestionIcon}
          tone="secondary"
          hint={t('stats.infoRequestedHint')}
        />
        <StatCard
          label={t('stats.oldest')}
          value={oldestDays === null ? '—' : t('stats.days', { count: oldestDays })}
          icon={ClockIcon}
          tone={oldestDays !== null && oldestDays >= 3 ? 'danger' : 'info'}
          hint={oldestDays === null ? t('stats.oldestNone') : t('stats.oldestHint')}
        />
        <StatCard label={t('stats.approved30d')} value={n(stats.approved30d)} icon={UserCheckIcon} tone="success" hint={t('stats.rejected30d', { count: stats.rejected30d })} />
      </KpiGrid>
      <div className="flex flex-col gap-4">
        <LinkTabs
          aria-label={t('title')}
          value={tab}
          items={[
            { value: 'pending', label: t('tabs.pending'), count: stats.pending },
            { value: 'info_requested', label: t('tabs.info_requested'), count: stats.infoRequested },
            { value: 'rejected', label: t('tabs.rejected', { days: REJECTED_WINDOW_DAYS }), count: null },
          ]}
        />
        <RegistrationsView
          key={tab}
          tab={tab}
          rows={list.rows}
          total={list.total}
          roles={roles}
          canApprove={abilities.canApprove}
          canAdminister={abilities.canAdminister}
          isSuperAdmin={abilities.isSuperAdmin}
          initialReview={review}
        />
      </div>
    </div>
  );
}

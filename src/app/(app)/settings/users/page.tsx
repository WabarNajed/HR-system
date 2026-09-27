import { MailPlusIcon, UserCheckIcon, UserRoundXIcon, UsersIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { InviteUserButton } from '@/features/users/components/invite-user-button';
import { UsersTable } from '@/features/users/components/users-table';
import { getUserStats, listRoles, listUsers, userAbilities } from '@/features/users/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatInteger } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.users');

/** Settings › Users: portal accounts, roles, employee links, invitations and sign-in access. */
export default async function SettingsUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/users']);
  const sp = await searchParams;
  const [t, list, stats, roles] = await Promise.all([getTranslations('users'), listUsers(sp, ctx), getUserStats(), listRoles()]);
  const abilities = userAbilities(ctx);
  const n = (v: number) => formatInteger(v, ctx.locale);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('title')}
        description={t('pageDescription')}
        actions={
          <InviteUserButton roles={roles} isSuperAdmin={abilities.isSuperAdmin} disabledReason={abilities.canInvite ? null : t('reasons.cannotInvite')} />
        }
      />
      <KpiGrid>
        <StatCard label={t('stats.total')} value={n(stats.total)} icon={UsersIcon} tone="primary" hint={t('stats.totalHint', { active: n(stats.active) })} />
        <StatCard
          label={t('stats.invited')}
          value={n(stats.invited)}
          icon={MailPlusIcon}
          tone="info"
          hint={t('stats.invitedHint')}
          href={stats.invited ? '/settings/users?status=invited' : undefined}
        />
        <StatCard
          label={t('stats.pendingRegistrations')}
          value={n(stats.pendingRegistrations)}
          icon={UserCheckIcon}
          tone={stats.pendingRegistrations ? 'warning' : 'neutral'}
          hint={t('stats.pendingHint')}
          href="/settings/pending-registrations"
        />
        <StatCard
          label={t('stats.disabled')}
          value={n(stats.disabled)}
          icon={UserRoundXIcon}
          tone="neutral"
          hint={t('stats.disabledHint')}
          href={stats.disabled ? '/settings/users?status=disabled' : undefined}
        />
      </KpiGrid>
      <UsersTable rows={list.rows} total={list.total} roles={roles} abilities={abilities} />
    </div>
  );
}

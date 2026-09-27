import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { NewRoleButton } from '@/features/roles/components/new-role-button';
import { RolesConsole } from '@/features/roles/components/roles-console';
import { listRoleMembers, listRolesWithPermissions } from '@/features/roles/queries';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.roles');

/** Settings › Roles & permissions: roles list + permission matrix for the selected role. */
export default async function SettingsRolesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/roles']);
  const sp = await searchParams;
  const [t, roles] = await Promise.all([getTranslations('roles'), listRolesWithPermissions()]);
  const requested = typeof sp.role === 'string' ? sp.role : null;
  const selected = roles.find((r) => r.key === requested) ?? roles.find((r) => r.key === 'hr_admin') ?? roles[0];
  const members = selected ? await listRoleMembers(selected.id) : [];
  const canAdminister = can(ctx, 'users.administer');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('title')}
        description={t('pageDescription')}
        actions={<NewRoleButton roles={roles} isSuperAdmin={ctx.isSuperAdmin} disabledReason={canAdminister ? null : t('create.noPermission')} />}
      />
      {selected ? (
        <RolesConsole
          key={selected.key}
          roles={roles}
          selectedKey={selected.key}
          members={members}
          canAdminister={canAdminister}
          isSuperAdmin={ctx.isSuperAdmin}
        />
      ) : null}
    </div>
  );
}

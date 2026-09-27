import type { ReactNode } from 'react';
import { SETTINGS_NAV } from '@/components/shell/nav-config';
import { SettingsNav, type VisibleSettingsGroup } from '@/components/shell/settings-nav';
import { requireActiveUser } from '@/lib/auth/guards';
import { checkAccess } from '@/lib/permissions';

/**
 * Settings console: grouped section nav on the logical start side (desktop) / section picker
 * (mobile) + content. Each page still guards itself with `requireAccess(ROUTE_ACCESS[...])`.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireActiveUser();
  const groups: VisibleSettingsGroup[] = SETTINGS_NAV.map((g) => ({
    key: g.key,
    items: g.items.filter((i) => checkAccess(ctx, i.access)).map((i) => i.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
      <SettingsNav groups={groups} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

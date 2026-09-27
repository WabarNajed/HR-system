import type { ReactNode } from 'react';
import { SETTINGS_NAV, type SettingsItemKey } from '@/components/shell/nav-config';
import { SettingsNav, type VisibleSettingsGroup } from '@/components/shell/settings-nav';
import { countPendingRegistrations } from '@/features/settings/overview';
import { requireActiveUser } from '@/lib/auth/guards';
import { checkAccess, hasAny } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

/**
 * Settings console: grouped section nav on the logical start side (desktop) / section picker
 * (mobile) + content. Items the user can't open are hidden; each page still guards itself with
 * `requireAccess(ROUTE_ACCESS[...])`. Count badges: pending self-registrations.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireActiveUser();
  const groups: VisibleSettingsGroup[] = SETTINGS_NAV.map((g) => ({
    key: g.key,
    items: g.items.filter((i) => checkAccess(ctx, i.access)).map((i) => i.key),
  })).filter((g) => g.items.length > 0);

  const badges: Partial<Record<SettingsItemKey, number>> = {};
  if (groups.some((g) => g.items.includes('pendingRegistrations')) && hasAny(ctx, ['users.view', 'users.approve'])) {
    const pending = await countPendingRegistrations(await createClient({ timeoutMs: 3000 })).catch(() => null);
    if (pending) badges.pendingRegistrations = pending;
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <SettingsNav groups={groups} badges={badges} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

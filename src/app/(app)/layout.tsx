import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ConfigurationRequired } from '@/components/shared/configuration-required';
import { PermissionsProvider } from '@/components/shared/permission-gate';
import { AppShell } from '@/components/shell/app-shell';
import { NAV_GROUPS } from '@/components/shell/nav-config';
import { SIDEBAR_COOKIE, type ShellUser } from '@/components/shell/types';
import { getSessionState, type SessionContext } from '@/lib/auth/session';
import { requireActiveUser } from '@/lib/auth/guards';
import { brandingPortalName, getPublicBranding } from '@/lib/branding';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { can, checkAccess } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

async function unreadCount(): Promise<number | null> {
  try {
    const supabase = await createClient({ timeoutMs: 3000 });
    const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

function roleLabel(ctx: SessionContext, fallback: (key: string) => string | null): string | null {
  if (!ctx.primaryRole) return null;
  const detail = ctx.roleDetails.find((r) => r.key === ctx.primaryRole);
  const name = detail ? localized({ name_ar: detail.nameAr, name_en: detail.nameEn }, 'name', ctx.locale) : '';
  return name || fallback(ctx.primaryRole);
}

/** Authenticated shell. Redirects signed-out → /login, pending → /pending-approval, disabled → /account-disabled. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const state = await getSessionState();
  if (state.status === 'unavailable') return <ConfigurationRequired reason={state.reason} />;

  const ctx = await requireActiveUser();
  const [branding, unread, cookieStore, t] = await Promise.all([
    getPublicBranding(),
    unreadCount(),
    cookies(),
    getTranslations('common'),
  ]);

  const visibleNavIds = NAV_GROUPS.flatMap((g) => g.items.filter((i) => checkAccess(ctx, i.access)).map((i) => i.id));
  const tt = t as unknown as { has: (k: string) => boolean; (k: string): string };
  const name = employeeDisplayName(ctx.employee, ctx.locale) || ctx.profile.fullName || ctx.user.email || '';
  const user: ShellUser = {
    id: ctx.user.id,
    name,
    email: ctx.user.email,
    avatarUrl: ctx.employee?.avatar ?? null,
    seed: ctx.employee?.id ?? ctx.user.id,
    roleLabel: roleLabel(ctx, (key) => (tt.has(`roleNames.${key}`) ? tt(`roleNames.${key}`) : null)),
    jobTitle: ctx.employee?.job_title ? localized(ctx.employee.job_title, 'name', ctx.locale) || null : null,
  };

  return (
    <PermissionsProvider permissions={Array.from(ctx.permissions)} roles={ctx.roles}>
      <AppShell
        branding={{ portalName: brandingPortalName(branding, ctx.locale, t('appName')), logoUrl: branding.logoUrl }}
        user={user}
        permissions={{ canAddEmployee: can(ctx, 'employees.create') }}
        visibleNavIds={visibleNavIds}
        initialCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === '1'}
        initialUnread={unread}
      >
        {children}
      </AppShell>
    </PermissionsProvider>
  );
}

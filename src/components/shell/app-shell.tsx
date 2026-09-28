'use client';

import { FilePlus2Icon, MenuIcon, UserPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { BreadcrumbProvider } from './breadcrumb-context';
import { GlobalSearch } from './global-search';
import { HeaderBreadcrumbs } from './header-breadcrumbs';
import { LanguageSwitch } from './language-switch';
import { NotificationBell } from './notification-bell';
import { SidebarContent } from './sidebar';
import { ThemeToggle } from './theme-toggle';
import { SIDEBAR_COOKIE, type ShellBranding, type ShellPermissions, type ShellUser } from './types';
import { UserMenu } from './user-menu';

export type AppShellProps = {
  branding: ShellBranding;
  user: ShellUser;
  permissions: ShellPermissions;
  visibleNavIds: string[];
  /** From the `sidebar_collapsed` cookie (read on the server → no layout shift). */
  initialCollapsed: boolean;
  initialUnread: number | null;
  children: ReactNode;
};

function persistCollapsed(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Authenticated shell: sidebar (256px / 68px collapsed, logical start side), sticky 56px header
 * (menu · breadcrumbs · search · New request · Add employee · notifications · language · theme ·
 * user) and the content area (24px / 16px page padding, full width).
 */
export function AppShell({ branding, user, permissions, visibleNavIds, initialCollapsed, initialUnread, children }: AppShellProps) {
  const t = useTranslations('nav.header');
  const tCommon = useTranslations('common');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile sheet on navigation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      persistCollapsed(!c);
      return !c;
    });

  const style = { '--shell-sidebar': collapsed ? 'var(--spacing-sidebar-collapsed)' : 'var(--spacing-sidebar)' } as CSSProperties;

  return (
    <BreadcrumbProvider>
      <div className="min-h-dvh bg-background" style={style} data-sidebar={collapsed ? 'collapsed' : 'expanded'}>
        <a
          href="#main"
          className="sr-only z-[60] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          {tCommon('skipToContent')}
        </a>

        {/* Desktop sidebar */}
        <aside
          className="fixed inset-y-0 start-0 z-40 hidden w-(--shell-sidebar) border-e border-sidebar-border transition-[width] duration-200 ease-out lg:block"
          aria-label={t('mainNavigation')}
        >
          <SidebarContent
            branding={branding}
            user={user}
            visibleNavIds={visibleNavIds}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
          />
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="start" showCloseButton={false} className="w-[18rem] max-w-[85vw] border-sidebar-border bg-sidebar p-0 sm:max-w-[18rem]">
            <SheetTitle className="sr-only">{t('mainNavigation')}</SheetTitle>
            <SheetDescription className="sr-only">{branding.portalName}</SheetDescription>
            <SidebarContent
              branding={branding}
              user={user}
              visibleNavIds={visibleNavIds}
              variant="sheet"
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-h-dvh flex-col transition-[padding] duration-200 ease-out lg:ps-(--shell-sidebar)">
          {/* Header */}
          <header data-slot="app-header" className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="-ms-1 text-muted-foreground hover:text-foreground lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t('openNavigation')}
              aria-expanded={mobileOpen}
            >
              <MenuIcon />
            </Button>

            <HeaderBreadcrumbs className="min-w-0 flex-1" />

            <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
              <GlobalSearch visibleNavIds={visibleNavIds} />

              <SimpleTooltip content={t('newRequest')}>
                <Button asChild size="sm" className="ms-1 max-md:size-9 max-md:px-0 md:ms-1.5">
                  <Link href="/requests/new" aria-label={t('newRequest')}>
                    <FilePlus2Icon className="size-4" />
                    <span className="hidden md:inline">{t('newRequest')}</span>
                  </Link>
                </Button>
              </SimpleTooltip>

              {permissions.canAddEmployee ? (
                <Button asChild size="sm" variant="outline" className="hidden xl:inline-flex">
                  <Link href="/employees/new">
                    <UserPlusIcon />
                    {t('addEmployee')}
                  </Link>
                </Button>
              ) : null}

              <div className="mx-0.5 hidden h-6 w-px bg-border md:block" aria-hidden />

              <NotificationBell initialUnread={initialUnread} />
              <LanguageSwitch className="hidden sm:inline-flex" />
              <ThemeToggle className="hidden sm:inline-flex" />
              <div className="ms-0.5">
                <UserMenu user={user} />
              </div>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="page-padding min-w-0 flex-1 outline-none">
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}

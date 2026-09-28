'use client';

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { dir } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand-mark';
import { NAV_GROUPS, type NavItem } from './nav-config';
import type { ShellBranding, ShellUser } from './types';
import { SidebarUserBlock } from './user-menu';

export function isNavItemActive(pathname: string, item: Pick<NavItem, 'href' | 'match'>): boolean {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type SidebarContentProps = {
  branding: ShellBranding;
  user: ShellUser;
  visibleNavIds: readonly string[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Called after a link is chosen (closes the mobile sheet). */
  onNavigate?: () => void;
  /** Mobile sheet variant: no collapse control. */
  variant?: 'desktop' | 'sheet';
};

/** Sidebar body shared by the desktop rail and the mobile sheet. */
export function SidebarContent({
  branding,
  user,
  visibleNavIds,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  variant = 'desktop',
}: SidebarContentProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const locale = useLocale();
  const tooltipSide = dir(locale) === 'rtl' ? 'left' : 'right';
  const visible = new Set(visibleNavIds);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => visible.has(i.id)) })).filter((g) => g.items.length);

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'px-4')}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <BrandMark name={branding.portalName} logoUrl={branding.logoUrl} size="sm" tone="onDark" />
          {!collapsed ? (
            <span className="truncate text-[0.9375rem] font-semibold tracking-tight text-sidebar-accent-foreground">{branding.portalName}</span>
          ) : null}
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label={t('nav.header.mainNavigation')} className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group, gi) => (
          <Fragment key={group.id}>
            {collapsed ? (
              gi > 0 ? <div aria-hidden className="mx-2 my-2.5 h-px bg-sidebar-border" /> : null
            ) : (
              <div className={cn('px-2.5 pb-1.5 text-2xs font-semibold tracking-wide text-sidebar-muted-foreground uppercase', gi > 0 && 'pt-4')}>
                {t(group.labelKey)}
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isNavItemActive(pathname, item);
                const Icon = item.icon;
                const label = t(item.labelKey);
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    data-nav-id={item.id}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex h-9 items-center gap-3 rounded-md text-[0.875rem] font-medium outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                      collapsed ? 'justify-center px-0' : 'px-2.5',
                      active
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    {active ? (
                      <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-sidebar-indicator" />
                    ) : null}
                    <Icon
                      className={cn('size-[1.125rem] shrink-0', active ? 'text-sidebar-indicator' : 'text-sidebar-muted-foreground group-hover:text-sidebar-accent-foreground')}
                      strokeWidth={1.85}
                      aria-hidden
                    />
                    {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
                  </Link>
                );
                return (
                  <li key={item.id}>
                    {collapsed ? (
                      <SimpleTooltip content={label} side={tooltipSide}>
                        {link}
                      </SimpleTooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </Fragment>
        ))}
      </nav>

      {/* Footer: user + collapse */}
      <div className={cn('shrink-0 border-t border-sidebar-border p-2', collapsed ? 'flex flex-col items-center gap-1' : 'flex flex-col gap-1')}>
        <SidebarUserBlock user={user} collapsed={collapsed} />
        {variant === 'desktop' && onToggleCollapsed ? (
          <SimpleTooltip content={collapsed ? t('nav.header.expandSidebar') : undefined} side={tooltipSide}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? t('nav.header.expandSidebar') : t('nav.header.collapseSidebar')}
              aria-expanded={!collapsed}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md text-xs font-medium text-sidebar-muted-foreground outline-none transition-colors',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                collapsed ? 'w-9 justify-center' : 'w-full px-2.5',
              )}
            >
              {collapsed ? (
                <PanelLeftOpenIcon className="size-4 rtl:-scale-x-100" aria-hidden />
              ) : (
                <PanelLeftCloseIcon className="size-4 rtl:-scale-x-100" aria-hidden />
              )}
              {!collapsed ? <span>{t('nav.header.collapseSidebar')}</span> : null}
            </button>
          </SimpleTooltip>
        ) : null}
      </div>
    </div>
  );
}

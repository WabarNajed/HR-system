'use client';

import { ChevronsUpDownIcon, KeyRoundIcon, LanguagesIcon, Loader2Icon, LogOutIcon, UserRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useTransition, type ReactNode } from 'react';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/features/auth/actions';
import { cn } from '@/lib/utils';
import { useLanguageSwitch } from './language-switch';
import { THEME_OPTIONS } from './theme-toggle';
import type { ShellUser } from './types';

function UserMenuContent({ user, compactExtras, align }: { user: ShellUser; compactExtras?: boolean; align: 'start' | 'end' }) {
  const t = useTranslations('nav.header');
  const tAuth = useTranslations('auth');
  const [signingOut, startSignOut] = useTransition();
  const { pending: switching, switchLanguage, targetName, target } = useLanguageSwitch();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenuContent align={align} className="w-72">
      <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
        <EmployeeAvatar name={user.name} seed={user.seed} src={user.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
          {user.email ? (
            <div className="truncate text-xs text-muted-foreground" dir="ltr">
              <bdi>{user.email}</bdi>
            </div>
          ) : null}
          {user.roleLabel ? (
            <Badge variant="secondary" size="sm" className="mt-1.5">
              {user.roleLabel}
            </Badge>
          ) : null}
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRoundIcon />
            {t('myProfile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile?tab=security">
            <KeyRoundIcon />
            {t('changePassword')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {compactExtras ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              switchLanguage();
            }}
            disabled={switching}
          >
            {switching ? <Loader2Icon className="animate-spin" /> : <LanguagesIcon />}
            <span className="flex-1">{t('language')}</span>
            <span lang={target} className="text-xs text-muted-foreground">
              {targetName}
            </span>
          </DropdownMenuItem>
          <DropdownMenuLabel className="pt-2 pb-1 text-xs font-medium text-muted-foreground">{t('theme')}</DropdownMenuLabel>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {THEME_OPTIONS.map(({ value, icon: Icon, key }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn(
                  'flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-1 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  theme === value && 'border-primary/40 bg-primary-soft text-primary-soft-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {t(key)}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        data-testid="logout"
        disabled={signingOut}
        onSelect={(e) => {
          e.preventDefault();
          startSignOut(async () => {
            await signOut();
          });
        }}
      >
        {signingOut ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
        {signingOut ? tAuth('signingOut') : t('logout')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** Header avatar button → account menu (profile, password, language/theme on mobile, sign out). */
export function UserMenu({ user }: { user: ShellUser }) {
  const t = useTranslations('nav.header');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full p-0 active:scale-100" aria-label={t('userMenu')} data-testid="user-menu">
          <EmployeeAvatar name={user.name} seed={user.seed} src={user.avatarUrl} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <UserMenuContent user={user} compactExtras align="end" />
    </DropdownMenu>
  );
}

/** Sidebar footer user block (same menu). `collapsed` shows the avatar only. */
export function SidebarUserBlock({ user, collapsed, trailing }: { user: ShellUser; collapsed?: boolean; trailing?: ReactNode }) {
  const t = useTranslations('nav.header');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('userMenu')}
          className={cn(
            'group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-start text-sidebar-foreground outline-none transition-colors',
            'hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent',
            collapsed && 'justify-center',
          )}
        >
          <EmployeeAvatar name={user.name} seed={user.seed} src={user.avatarUrl} size="sm" className="ring-1 ring-white/10" />
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-sidebar-accent-foreground">{user.name}</span>
                <span className="block truncate text-xs text-sidebar-muted-foreground">{user.roleLabel ?? user.email}</span>
              </span>
              {trailing ?? <ChevronsUpDownIcon className="size-4 shrink-0 text-sidebar-muted-foreground" />}
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <UserMenuContent user={user} align="start" />
    </DropdownMenu>
  );
}


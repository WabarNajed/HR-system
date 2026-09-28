'use client';

import { LayoutGridIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SETTINGS_ITEMS_BY_KEY, type SettingsItemKey, type SettingsNavGroup } from './nav-config';

export type VisibleSettingsGroup = { key: SettingsNavGroup['key']; items: SettingsItemKey[] };

const HOME = '__home';

function useActiveKey(groups: VisibleSettingsGroup[]): SettingsItemKey | null {
  const pathname = usePathname();
  for (const g of groups) {
    for (const key of g.items) {
      const href = SETTINGS_ITEMS_BY_KEY[key].href;
      if (pathname === href || pathname.startsWith(`${href}/`)) return key;
    }
  }
  return null;
}

function CountBadge({ count, active }: { count: number; active?: boolean }) {
  return (
    <span
      className={cn(
        'ms-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-semibold numeric',
        active ? 'bg-primary text-primary-foreground' : 'bg-warning-soft text-warning-soft-foreground',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Settings console navigation: grouped vertical nav on the logical start side (sticky) when there is
 * room for it next to the page, and a section picker otherwise. Hidden on the console home
 * (`/settings`), whose cards navigate.
 *
 * "Room" = viewport ≥ 90rem, or ≥ xl with the app sidebar collapsed (`data-sidebar` on the shell).
 * Below that (tablets, small laptops with the 256px app sidebar) a 208px nav would squeeze pages
 * such as roles / form builder to ~480px, so the picker is used instead. The console wrapper in
 * `app/(app)/settings/layout.tsx` switches to a row at the same breakpoints; keep them in sync.
 */
export function SettingsNav({ groups, badges = {} }: { groups: VisibleSettingsGroup[]; badges?: Partial<Record<SettingsItemKey, number>> }) {
  const t = useTranslations('nav.settings');
  const pathname = usePathname();
  const router = useRouter();
  const active = useActiveKey(groups);
  if (pathname === '/settings') return null;

  return (
    <>
      {/* Narrow content area (mobile, tablet, small laptop): section picker */}
      <div className="min-[90rem]:hidden sm:max-w-sm xl:in-data-[sidebar=collapsed]:hidden">
        <Select
          value={active ?? undefined}
          onValueChange={(key) => router.push(key === HOME ? '/settings' : SETTINGS_ITEMS_BY_KEY[key as SettingsItemKey].href)}
        >
          <SelectTrigger className="h-10 w-full bg-card" aria-label={t('jumpTo')}>
            <SelectValue placeholder={t('jumpTo')} />
          </SelectTrigger>
          <SelectContent className="max-h-[70dvh]">
            <SelectItem value={HOME}>
              <LayoutGridIcon aria-hidden />
              {t('title')}
            </SelectItem>
            <SelectSeparator />
            {groups.map((g) => (
              <SelectGroup key={g.key}>
                <SelectLabel>{t(`groups.${g.key}`)}</SelectLabel>
                {g.items.map((key) => {
                  const Icon = SETTINGS_ITEMS_BY_KEY[key].icon;
                  const count = badges[key];
                  return (
                    <SelectItem key={key} value={key}>
                      <Icon aria-hidden />
                      {t(`items.${key}`)}
                      {count ? <span className="text-xs font-semibold text-warning numeric">({count})</span> : null}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Wide content area: grouped vertical nav. Sticks below the header at the page padding and
          ends at the bottom padding (header + 2 × 1.5rem), so short pages don't scroll. */}
      <nav
        aria-label={t('sections')}
        className="sticky top-[calc(var(--spacing-header)+1.5rem)] hidden max-h-[calc(100dvh-var(--spacing-header)-3rem)] w-52 shrink-0 overflow-y-auto pe-1 pb-4 min-[90rem]:block xl:in-data-[sidebar=collapsed]:block 2xl:w-60"
      >
        <Link
          href="/settings"
          className="mb-3 flex items-center gap-2 rounded-md px-2.5 py-1 text-card-title text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <LayoutGridIcon className="size-4 text-faint-foreground" aria-hidden />
          {t('title')}
        </Link>
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="px-2.5 pb-1 text-[0.6875rem] font-semibold tracking-wide text-faint-foreground uppercase">{t(`groups.${g.key}`)}</div>
              <ul className="flex flex-col gap-0.5">
                {g.items.map((key) => {
                  const item = SETTINGS_ITEMS_BY_KEY[key];
                  const Icon = item.icon;
                  const isActive = key === active;
                  const count = badges[key];
                  return (
                    <li key={key}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                          isActive ? 'bg-primary-soft text-primary-soft-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {isActive ? <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-e-full bg-primary" /> : null}
                        <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : 'text-faint-foreground')} strokeWidth={1.85} aria-hidden />
                        <span className="truncate">{t(`items.${key}`)}</span>
                        {count ? <CountBadge count={count} active={isActive} /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

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
 * Settings console navigation: grouped vertical nav on the logical start side (desktop, sticky)
 * and a section picker on mobile. Hidden on the console home (`/settings`), whose cards navigate.
 */
export function SettingsNav({ groups, badges = {} }: { groups: VisibleSettingsGroup[]; badges?: Partial<Record<SettingsItemKey, number>> }) {
  const t = useTranslations('nav.settings');
  const pathname = usePathname();
  const router = useRouter();
  const active = useActiveKey(groups);
  if (pathname === '/settings') return null;

  return (
    <>
      {/* Mobile / tablet: section picker */}
      <div className="lg:hidden">
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

      {/* Desktop: grouped vertical nav */}
      <nav aria-label={t('sections')} className="sticky top-[4.75rem] hidden max-h-[calc(100dvh-6rem)] w-52 shrink-0 overflow-y-auto pe-1 pb-4 lg:block 2xl:w-60">
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

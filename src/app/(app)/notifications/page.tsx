import { BellIcon, InfoIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { NOTIFICATION_TONE_CLASS, NOTIFICATION_VISUALS } from '@/components/shell/notification-visuals';
import { CATEGORY_TYPES, isNotificationCategory, NOTIFICATION_CATEGORIES } from '@/features/notifications/categories';
import { NotificationsCenter } from '@/features/notifications/components/notifications-center';
import { loadNotifications } from '@/features/notifications/queries';
import { requireAccess } from '@/lib/auth/guards';
import { addDays } from '@/lib/dates';
import { todayIso } from '@/lib/i18n/date-format';
import { formatInteger } from '@/lib/format';
import { pageMetadata } from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('notifications.title');

const PAGE_SIZES = [10, 20, 50];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Notifications center (every active user; RLS: own notifications only). */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/notifications']);
  const sp = await searchParams;
  const t = await getTranslations('notifications');
  const tab = first(sp.tab) === 'unread' ? 'unread' : 'all';
  const typeParam = first(sp.type);
  const category = isNotificationCategory(typeParam) ? typeParam : null;
  const pageSizeRaw = Number(first(sp.pageSize));
  const pageSize = PAGE_SIZES.includes(pageSizeRaw) ? pageSizeRaw : 20;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(first(sp.page) ?? '1', 10) || 1));
  const today = todayIso();
  const yesterday = addDays(today, -1) ?? today;

  let data;
  try {
    const supabase = await createClient({ timeoutMs: 8000 });
    data = await loadNotifications(supabase, { tab, category, page, pageSize });
  } catch (error) {
    console.error('[notifications] load failed', error);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t('title')} description={t('description')} />
        <ErrorState variant="page" />
      </div>
    );
  }

  const n = (v: number) => formatInteger(v, ctx.locale);
  const hrefFor = (c: string | null) => {
    const next = new URLSearchParams();
    if (tab === 'unread') next.set('tab', 'unread');
    if (c) next.set('type', c);
    const qs = next.toString();
    return qs ? `/notifications?${qs}` : '/notifications';
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-5 2xl:grid-cols-[minmax(0,1fr)_21rem]">
        <NotificationsCenter
          items={data.items}
          total={data.total}
          page={page}
          pageSize={pageSize}
          tab={tab}
          category={category}
          counts={data.counts}
          todayIso={today}
          yesterdayIso={yesterday}
          nowIso={new Date().toISOString()}
        />
        <aside className="hidden flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+1rem)] lg:flex">
          <SectionCard title={t('summary.title')} icon={<BellIcon />} dense flush>
            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <div className="px-4 py-3">
                <div className="numeric text-2xl leading-8 font-semibold text-foreground">{n(data.counts.unread)}</div>
                <div className="text-xs text-muted-foreground">{t('summary.unread')}</div>
              </div>
              <div className="px-4 py-3">
                <div className="numeric text-2xl leading-8 font-semibold text-foreground">{n(data.counts.all)}</div>
                <div className="text-xs text-muted-foreground">{t('summary.total')}</div>
              </div>
            </div>
            <div className="px-2 py-2">
              <p className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">{t('summary.byType')}</p>
              <ul className="flex flex-col">
                <li>
                  <Link
                    href={hrefFor(null)}
                    aria-current={!category ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[0.8125rem] outline-none hover:bg-accent focus-visible:bg-accent',
                      !category && 'bg-accent font-medium',
                    )}
                  >
                    <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <BellIcon className="size-3.5" aria-hidden />
                    </span>
                    <span className="flex-1 text-foreground">{t('filters.allTypes')}</span>
                    <span className="numeric text-xs text-muted-foreground">{n(tab === 'unread' ? data.counts.unread : data.counts.all)}</span>
                  </Link>
                </li>
                {NOTIFICATION_CATEGORIES.map((c) => {
                  const counts = data.counts.byCategory[c];
                  const visual = NOTIFICATION_VISUALS[CATEGORY_TYPES[c][0]!]!;
                  const Icon = visual.icon;
                  const count = tab === 'unread' ? counts.unread : counts.total;
                  if (counts.total === 0 && c !== category) return null;
                  return (
                    <li key={c}>
                      <Link
                        href={hrefFor(c)}
                        aria-current={category === c ? 'true' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[0.8125rem] outline-none hover:bg-accent focus-visible:bg-accent',
                          category === c && 'bg-accent font-medium',
                        )}
                      >
                        <span className={cn('flex size-6 items-center justify-center rounded-md', NOTIFICATION_TONE_CLASS[visual.tone])}>
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        <span className="flex-1 truncate text-foreground">{t(`filters.categories.${c}`)}</span>
                        {counts.unread > 0 ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
                        <span className="numeric text-xs text-muted-foreground">{n(count)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </SectionCard>
          <p className="flex gap-2 px-1 text-xs leading-5 text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t('summary.hint')}
          </p>
        </aside>
      </div>
    </div>
  );
}

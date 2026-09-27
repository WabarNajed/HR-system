'use client';

import { BellOffIcon, CheckCheckIcon, CheckIcon, FilterIcon, MailIcon, MailOpenIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTablePagination } from '@/components/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { LinkTabs } from '@/components/shared/link-tabs';
import type { NotificationRecord } from '@/components/shell/notification-text';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { toIsoDate } from '@/lib/dates';
import { mergeSearchParams } from '@/lib/list-params';
import { cn } from '@/lib/utils';
import { markAllNotificationsRead, markNotificationsRead, markNotificationsUnread } from '../actions';
import { emitNotificationsChanged, NOTIFICATION_CATEGORIES, type NotificationCategory } from '../categories';
import { NotificationItem } from './notification-item';
import { useOpenNotification } from './use-open-notification';

type Props = {
  items: NotificationRecord[];
  total: number;
  page: number;
  pageSize: number;
  tab: 'all' | 'unread';
  category: NotificationCategory | null;
  counts: { all: number; unread: number; byCategory: Record<NotificationCategory, { total: number; unread: number }> };
  /** Organization-day ISO dates for grouping (Asia/Riyadh). */
  todayIso: string;
  yesterdayIso: string;
  nowIso: string;
};

type Group = { key: 'today' | 'yesterday' | 'earlier'; items: NotificationRecord[] };

/** Notifications center: All / Unread tabs, type filter, date groups, read-state actions, pagination. */
export function NotificationsCenter({ items, total, page, pageSize, tab, category, counts, todayIso, yesterdayIso, nowIso }: Props) {
  const t = useTranslations('notifications');
  const tErrors = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [markingAll, startMarkAll] = useTransition();
  const [navigating, startNav] = useTransition();

  // Server data changed (refresh / navigation) → drop optimistic overrides.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverrides({});
  }, [items]);

  const view = useMemo(
    () => items.map((n) => (n.id in overrides ? { ...n, read_at: overrides[n.id] ?? null } : n)),
    [items, overrides],
  );
  const unreadOnPage = view.filter((n) => !n.read_at).length;
  const unreadInScope = category ? counts.byCategory[category].unread : counts.unread;

  const groups = useMemo<Group[]>(() => {
    const out: Record<Group['key'], NotificationRecord[]> = { today: [], yesterday: [], earlier: [] };
    for (const n of view) {
      const d = toIsoDate(new Date(n.created_at));
      out[d === todayIso ? 'today' : d === yesterdayIso ? 'yesterday' : 'earlier'].push(n);
    }
    return (['today', 'yesterday', 'earlier'] as const).filter((k) => out[k].length).map((k) => ({ key: k, items: out[k] }));
  }, [view, todayIso, yesterdayIso]);

  const navigate = useCallback(
    (patch: Record<string, string | number | null>) => {
      const next = mergeSearchParams(searchParams, patch);
      const qs = next.toString();
      startNav(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const setRead = useCallback(
    async (n: NotificationRecord, read: boolean) => {
      setPendingIds((prev) => new Set(prev).add(n.id));
      setOverrides((prev) => ({ ...prev, [n.id]: read ? nowIso : null }));
      const result = read ? await markNotificationsRead({ ids: [n.id] }) : await markNotificationsUnread({ ids: [n.id] });
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      if (!result.ok) {
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[n.id];
          return next;
        });
        toast.error(tErrors(result.error as never));
        return;
      }
      toast.success(read ? t('toast.markedRead') : t('toast.markedUnread'));
      emitNotificationsChanged();
      router.refresh();
    },
    [nowIso, router, t, tErrors],
  );

  const markLocal = useCallback((id: string) => setOverrides((prev) => ({ ...prev, [id]: nowIso })), [nowIso]);
  const open = useOpenNotification(markLocal);

  const markAll = () =>
    startMarkAll(async () => {
      const result = await markAllNotificationsRead({ category });
      if (!result.ok) {
        toast.error(tErrors(result.error as never));
        return;
      }
      if (!result.data?.count) toast.info(t('toast.nothingToMark'));
      else toast.success(t('toast.markedAllRead'));
      emitNotificationsChanged();
      router.refresh();
    });

  const emptyTitle = category ? t('empty.filteredTitle') : tab === 'unread' ? t('empty.unreadTitle') : t('empty.allTitle');
  const emptyDescription = category ? t('empty.filteredDescription') : tab === 'unread' ? t('empty.unreadDescription') : t('empty.allDescription');

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card" aria-busy={navigating}>
      <div className="flex flex-col gap-3 border-b border-border px-4 pt-2 sm:px-5 md:flex-row md:items-end md:justify-between">
        <LinkTabs
          preserveParams
          value={tab}
          className="border-b-0"
          aria-label={t('title')}
          items={[
            { value: 'all', label: t('tabs.all'), count: counts.all },
            { value: 'unread', label: t('tabs.unread'), count: counts.unread },
          ]}
        />
        <div className="flex items-center gap-2 pb-2.5">
          <Select value={category ?? 'all'} onValueChange={(v) => navigate({ type: v === 'all' ? null : v, page: null })}>
            <SelectTrigger size="sm" className="h-8 w-full min-w-44 md:w-52" aria-label={t('filters.type')}>
              <FilterIcon className="size-3.5 text-muted-foreground" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
              <SelectSeparator />
              {NOTIFICATION_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} disabled={counts.byCategory[c].total === 0 && c !== category}>
                  {t(`filters.categories.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SimpleTooltip content={unreadInScope === 0 ? t('toast.nothingToMark') : undefined}>
            <span>
              <Button variant="outline" size="sm" onClick={markAll} loading={markingAll} disabled={unreadInScope === 0 || markingAll} className="h-8 whitespace-nowrap">
                {!markingAll ? <CheckCheckIcon /> : null}
                <span className="hidden sm:inline">{category ? t('actions.markAllReadCategory') : t('actions.markAllRead')}</span>
              </Button>
            </span>
          </SimpleTooltip>
        </div>
      </div>

      <div className={cn('transition-opacity', navigating && 'opacity-60')}>
        {view.length === 0 ? (
          <EmptyState
            icon={BellOffIcon}
            tone={tab === 'unread' && !category ? 'primary' : 'neutral'}
            title={emptyTitle}
            description={emptyDescription}
            action={
              category ? (
                <Button variant="outline" size="sm" onClick={() => navigate({ type: null, page: null })}>
                  {t('empty.clearFilter')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          groups.map((g) => (
            <div key={g.key} role="group" aria-labelledby={`notif-group-${g.key}`}>
              <h3
                id={`notif-group-${g.key}`}
                className="sticky top-14 z-10 border-b border-border bg-subtle/95 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur sm:px-5"
              >
                {t(`groups.${g.key}`)}
              </h3>
              <ul className="divide-y divide-border">
                {g.items.map((n) => {
                  const unread = !n.read_at;
                  const busy = pendingIds.has(n.id);
                  return (
                    <li key={n.id}>
                      <NotificationItem
                        notification={n}
                        onOpen={open}
                        now={now}
                        trailing={
                          <SimpleTooltip content={unread ? t('actions.markRead') : t('actions.markUnread')}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busy}
                              onClick={() => void setRead(n, unread)}
                              aria-label={unread ? t('actions.markRead') : t('actions.markUnread')}
                              className={cn('text-muted-foreground hover:text-foreground', !unread && 'opacity-0 group-hover/notif:opacity-100 focus-visible:opacity-100 max-md:opacity-100')}
                            >
                              {unread ? <CheckIcon /> : <MailIcon />}
                            </Button>
                          </SimpleTooltip>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {total > pageSize ? (
        <div className="border-t border-border">
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            pageSizes={[10, 20, 50]}
            disabled={navigating}
            onPageChange={(p) => navigate({ page: p > 1 ? p : null })}
            onPageSizeChange={(s) => navigate({ pageSize: s === 20 ? null : s, page: null })}
          />
        </div>
      ) : view.length ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          <span className="inline-flex items-center gap-1.5">
            <MailOpenIcon className="size-3.5" aria-hidden />
            {t('summary.unreadOfTotal', { unread: unreadOnPage, total: view.length })}
          </span>
        </div>
      ) : null}
    </section>
  );
}

'use client';

import { BellIcon, BellOffIcon, CheckCheckIcon, RotateCwIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { NOTIFICATIONS_CHANGED_EVENT, safeNotificationLink } from '@/features/notifications/categories';
import { NotificationItem } from '@/features/notifications/components/notification-item';
import { createClient } from '@/lib/supabase/client';
import type { NotificationRecord } from './notification-visuals';

const POLL_MS = 60_000;
const TIMEOUT_MS = 8_000;
const LIMIT = 8;

type ListState = { status: 'idle' | 'loading' | 'ready' | 'error'; items: NotificationRecord[] };
type Filter = 'all' | 'unread';

/** Routes whose server-rendered content shows read state (refreshed after a bell mutation). */
const REFRESH_PATHS = ['/notifications', '/dashboard'];

/**
 * Header notification bell: unread badge (server-rendered initial value, polled every 60 s, on window
 * focus and on `hr:notifications-changed`), popover with All / Unread tabs and the latest items
 * (fetched on open, 8 s timeout, retry on error), mark all read, open → mark read + navigate.
 * Reads/writes go through the browser Supabase client (RLS: own rows only; only `read_at` updatable).
 */
export function NotificationBell({ initialUnread }: { initialUnread: number | null }) {
  const t = useTranslations('notifications.bell');
  const tHeader = useTranslations('nav.header');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [unread, setUnread] = useState<number>(initialUnread ?? 0);
  const [list, setList] = useState<ListState>({ status: 'idle', items: [] });
  const [markingAll, startMarkAll] = useTransition();
  const loadSeq = useRef(0);

  // The layout re-renders with a fresh server count after router.refresh() — adopt it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof initialUnread === 'number') setUnread(initialUnread);
  }, [initialUnread]);

  const refreshCount = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
      if (!error && typeof count === 'number') setUnread(count);
    } catch {
      // Network/timeout: keep the last known count; the next poll retries.
    }
  }, []);

  const loadList = useCallback(
    async (which: Filter) => {
      const seq = ++loadSeq.current;
      setList((prev) => ({ status: 'loading', items: prev.items }));
      const supabase = createClient();
      if (!supabase) {
        setList({ status: 'error', items: [] });
        return;
      }
      try {
        let query = supabase
          .from('notifications')
          .select('id, type, params, link, read_at, created_at')
          .order('created_at', { ascending: false })
          .limit(LIMIT);
        if (which === 'unread') query = query.is('read_at', null);
        const { data, error } = await query.abortSignal(AbortSignal.timeout(TIMEOUT_MS));
        if (seq !== loadSeq.current) return;
        if (error) {
          setList({ status: 'error', items: [] });
          return;
        }
        setList({ status: 'ready', items: (data ?? []) as NotificationRecord[] });
        void refreshCount();
      } catch {
        if (seq === loadSeq.current) setList({ status: 'error', items: [] });
      }
    },
    [refreshCount],
  );

  // Poll the unread count, refresh on focus and when another view changes read state.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshCount();
    }, POLL_MS);
    const onFocus = () => void refreshCount();
    const onChanged = () => void refreshCount();
    window.addEventListener('focus', onFocus);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, [refreshCount]);

  const refreshPageIfNeeded = useCallback(() => {
    if (REFRESH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) router.refresh();
  }, [pathname, router]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadList(filter);
  };

  const onFilterChange = (value: string) => {
    const next = value === 'unread' ? 'unread' : 'all';
    setFilter(next);
    void loadList(next);
  };

  const openItem = async (n: NotificationRecord) => {
    setOpen(false);
    if (!n.read_at) {
      const readAt = new Date().toISOString();
      setList((prev) => ({ ...prev, items: prev.items.map((i) => (i.id === n.id ? { ...i, read_at: readAt } : i)) }));
      setUnread((c) => Math.max(0, c - 1));
      const supabase = createClient();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('notifications')
            .update({ read_at: readAt })
            .eq('id', n.id)
            .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
          if (error) void refreshCount();
        } catch {
          void refreshCount();
        }
      }
    }
    const href = safeNotificationLink(n.link);
    if (href) router.push(href);
  };

  const markAllRead = () =>
    startMarkAll(async () => {
      const supabase = createClient();
      if (!supabase) return;
      try {
        const readAt = new Date().toISOString();
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: readAt })
          .is('read_at', null)
          .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
        if (error) throw error;
        setUnread(0);
        setList((prev) => ({
          ...prev,
          items: filter === 'unread' ? [] : prev.items.map((i) => ({ ...i, read_at: i.read_at ?? readAt })),
        }));
        toast.success(t('markedAllRead'));
        refreshPageIfNeeded();
      } catch {
        toast.error(tErrors('generic'));
      }
    });

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <SimpleTooltip content={tHeader('notifications')}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground"
            aria-label={`${tHeader('notifications')} · ${tHeader('unreadNotifications', { count: unread })}`}
          >
            <BellIcon />
            {unread > 0 ? (
              <span
                aria-hidden
                className="numeric absolute -top-0.5 -end-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-none font-semibold text-danger-foreground ring-2 ring-background"
              >
                {badge}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent align="end" className="w-[min(25rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-card-title">{t('title')}</h2>
            {unread > 0 ? (
              <span className="numeric rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-foreground">
                {t('unreadCount', { count: unread })}
              </span>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={markAllRead} loading={markingAll} disabled={unread === 0 || markingAll} className="-me-2 h-7 px-2">
            {!markingAll ? <CheckCheckIcon /> : null}
            {t('markAllRead')}
          </Button>
        </div>
        <div className="border-b border-border px-4 pb-2.5">
          <SegmentedTabs
            size="sm"
            value={filter}
            onValueChange={onFilterChange}
            aria-label={t('title')}
            className="w-full [&>*]:flex-1"
            items={[
              { value: 'all', label: t('tabAll') },
              { value: 'unread', label: t('tabUnread'), count: unread || null },
            ]}
          />
        </div>

        <div className="max-h-[min(26rem,62dvh)] overflow-y-auto" aria-busy={list.status === 'loading'}>
          {list.status === 'loading' && !list.items.length ? (
            <div className="flex flex-col" aria-label={t('loading')}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2 pt-0.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.status === 'error' ? (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t('error')}</p>
              <Button variant="outline" size="sm" onClick={() => void loadList(filter)}>
                <RotateCwIcon />
                {tCommon('tryAgain')}
              </Button>
            </div>
          ) : list.items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-9 text-center">
              <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <BellOffIcon className="size-5" strokeWidth={1.75} />
              </span>
              <p className="text-sm font-semibold">{filter === 'unread' ? t('unreadEmptyTitle') : t('emptyTitle')}</p>
              <p className="mt-1 max-w-64 text-meta text-muted-foreground">
                {filter === 'unread' ? t('unreadEmptyDescription') : t('emptyDescription')}
              </p>
            </div>
          ) : (
            <ul className={`divide-y divide-border transition-opacity ${list.status === 'loading' ? 'opacity-60' : ''}`}>
              {list.items.map((n) => (
                <li key={n.id}>
                  <NotificationItem notification={n} onOpen={(item) => void openItem(item)} density="compact" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center text-primary hover:text-primary">
            <Link href={filter === 'unread' ? '/notifications?tab=unread' : '/notifications'} onClick={() => setOpen(false)}>
              {t('viewAll')}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
